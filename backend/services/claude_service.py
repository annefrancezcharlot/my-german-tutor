import json
import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import anthropic
from dotenv import load_dotenv

from services.gradio_swiss_service import rewrite_messages_to_swiss_german

env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
MODEL = "claude-sonnet-4-6"
CEFR_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
logger = logging.getLogger(__name__)

# ── System prompts ──────────────────────────────────────────────────────────

def _build_conversation_system_prompt(topic: str, level: str) -> str:
    return f"""You are an expert German language tutor in Switzerland having a conversation with an advanced learner (level {level}).

**Topic:** {topic}

**Your dual role:**
1. **Conversation partner** – Engage naturally and enthusiastically on the topic. Ask follow-up questions, share perspectives, keep the dialogue flowing, but keep your
answers short.
2. **Language corrector** – After every user message, identify ALL German mistakes, except the use of ss for ß, typos and capitalization. Make sure the corrected user message, the correction and the explanation are consistent.
Classify the mistakes as light, medium and severe based on the following criteria:
- SEVERE: Errors that significantly impair understanding or completely change meaning (e.g., major vocabulary mistakes, missing essential sentence elements)
- MEDIUM: Errors that are noticeable and somewhat unnatural but don't prevent understanding (e.g., word order issues, case errors, missing articles)
- LIGHT: Minor errors that native speakers might overlook and don't affect comprehension (e.g., gender errors)
- DO NOT correct typos and capitalization

**Response format (ALWAYS return valid JSON):**
```json
{{
  "reply": "<your natural conversational reply in German>",
  "has_errors": true/false,
  "corrected_user_message": "<full corrected version of the user's message, or null if no errors>",
  "corrections": [
    {{
      "category": "<one of: grammar|vocabulary|word_order|case|gender|verb_conjugation|preposition|tense|spelling|punctuation|style|other>",
      "subcategory": "<specific detail, e.g. 'Dativ', 'Plusquamperfekt', 'Genitivobjekt'>",
      "severity": "<one of: light|medium|severe>",
      "original": "<exact wrong phrase>",
      "corrected": "<correct version>",
      "explanation": "<clear explanation in English, referencing the German grammar rule>"
    }}
  ]
}}

Correction guidelines:
- Never flag ss vs ß as an error. Swiss German orthography commonly uses ss, and this app accepts ss everywhere.
- Do not change ss to ß in corrected_user_message unless there is another non-ß correction in the same word.
- If the only difference between original and corrected text would be ss vs ß, set has_errors to false, corrected_user_message to null, and corrections to [].

Be thorough but encouraging – praise good structures too in your reply.
For advanced learners: flag subtle style issues, register mismatches, and unnatural phrasing.
Always reply in German. Corrections/explanations are in English.
If the user writes in English, gently remind them to write in German."""


def _build_opening_message_prompt(topic: str, level: str) -> str:
    return f"""You are starting a German conversation practice session with a learner at level {level}.

Topic context:
{topic}

Write one very short opening message in German.
Rules:
- One or two sentences only.
- Mention something specific from the topic.
- Ask one concrete question that gives the learner something to discuss.
- Do not correct language yet.
- Do not include JSON, markdown, translations, or explanations."""


def _build_conversation_reply_prompt(topic: str, level: str) -> str:
    return f"""You are a warm, concise German conversation partner for a learner at CEFR level {level}.

Topic: {topic}

Keep the conversation natural and moving. Reply only in German, normally in one to three short
sentences, and ask at most one useful follow-up question. Do not correct, score, explain, or mention
the learner's mistakes: teaching analysis is handled separately after the conversation."""


def _build_message_analysis_prompt(messages: List[Dict[str, Any]], level: str) -> str:
    payload = json.dumps(messages, ensure_ascii=False, indent=2)
    return f"""You are an expert German teacher analysing learner messages at CEFR level {level}.
Analyse every message independently. Ignore capitalization, ordinary typos, and ss versus ß.
Return ONLY valid JSON with this exact shape:
{{
  "messages": [
    {{
      "message_id": 123,
      "has_errors": true,
      "corrected_user_message": "the complete corrected sentence",
      "corrections": [
        {{
          "category": "grammar|vocabulary|word_order|case|gender|verb_conjugation|preposition|tense|spelling|punctuation|style|other",
          "subcategory": "specific detail or null",
          "severity": "light|medium|severe",
          "original": "exact wrong phrase",
          "corrected": "correct phrase",
          "explanation": "clear English explanation"
        }}
      ]
    }}
  ]
}}
If a message has no qualifying error, set has_errors to false, return the original sentence as
corrected_user_message, and use an empty corrections array. Preserve each numeric message_id.

MESSAGES:
{payload}"""

EXERCISE_SYSTEM_PROMPT = """You are an expert German language exercise creator for advanced learners (B2-C2).
Generate exercises that target specific error patterns. Always return valid JSON matching the requested structure exactly.
- If the only difference between original and corrected text would be ss vs ß, set has_errors to false, corrected_user_message to null, and corrections to [].
Always use ss instead of ß, and use ä, ö, ü instead of ae, oe, ue."""

STYLE_MODE_INSTRUCTIONS = {
    "minimal": (
        "Make only minimal changes. If a sentence is already natural, keep it very close "
        "to the original and only smooth small grammar, word-order, or idiom issues."
    ),
    "natural": (
        "Make the sentence sound natural and idiomatic in neutral contemporary German."
    ),
    "casual": (
        "Make the sentence sound more casual and conversational while preserving meaning."
    ),
    "elevated": (
        "Make the sentence sound more polished, precise, and elevated without becoming "
        "artificial or overly complex."
    )
}

EXERCISE_TYPE_INSTRUCTIONS = {
    "fill_blank": """Return JSON:
{
  "exercise_type": "fill_blank",
  "title": "...",
  "instructions": "...",
  "content": {
    "sentences": [
      {"id": 1, "text": "sentence with ___ blank", "hint": "optional hint"}
    ]
  },
  "answer_key": {"1": "correct answer", ...}
}

Rules for fill_blank:
- Each sentence item must contain exactly one ___ blank.
- Do not put two or more blanks in the same sentence item.
- The answer_key must contain exactly one answer per sentence id.""",
    "correction": """Return JSON:
{
  "exercise_type": "correction",
  "title": "...",
  "instructions": "...",
  "content": {
    "sentences": [
      {"id": 1, "text": "sentence with error", "error_type": "brief label"}
    ]
  },
  "answer_key": {"1": "corrected sentence with explanation"}
}""",
    "multiple_choice": """Return JSON:
{
  "exercise_type": "multiple_choice",
  "title": "...",
  "instructions": "...",
  "content": {
    "questions": [
      {
        "id": 1,
        "question": "...",
        "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
        "context": "optional context sentence"
      }
    ]
  },
  "answer_key": {"1": "A", ...}
}""",
    "translation": """Return JSON:
{
  "exercise_type": "translation",
  "title": "...",
  "instructions": "...",
  "content": {
    "sentences": [
      {"id": 1, "english": "...", "focus": "what to watch out for"}
    ]
  },
  "answer_key": {"1": "correct German translation"}
}""",
}

EXERCISE_CATEGORIES = [
    "grammar",
    "vocabulary",
    "word_order",
    "case",
    "gender",
    "verb_conjugation",
    "preposition",
    "tense",
    "spelling",
    "punctuation",
    "style",
    "other",
]


def _build_session_summary_prompt(
    messages: List[Dict[str, str]],
    errors: List[Dict[str, Any]],
    topic: str,
    level: str,
) -> str:
    error_summary = json.dumps(errors, ensure_ascii=False, indent=2)
    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content']}" for m in messages[-20:]
    )

    return f"""Review this German conversation practice session on "{topic}" (configured learner level: {level}).
LEARNER MESSAGES (last 20):
{history_text}

ERRORS DETECTED:
{error_summary}

Return ONLY valid JSON in this format:
{{
  "summary": "<concise encouraging English summary, max 150 words>",
  "estimated_level": "<one of A1, A2, B1, B2, C1, C2>"
}}

Estimate the level from the learner's actual conversational performance in this session only.
Base it on accuracy, range, naturalness, fluency, and how serious the mistakes are.
The summary must cover overall performance, 2-3 strengths, priority improvements, and one specific grammar tip."""


def _build_translation_prompt(
    text: str,
    source_language: str,
    target_language: str,
) -> str:
    return f"""You are a precise translation assistant inside a German learning app.
Translate the text below for a German learner.

Source language preference: {source_language}
Target language preference: {target_language}

If target_language is "auto":
- translate German text into English
- translate non-German text into natural German

Return ONLY valid JSON in this exact format:
{{
  "source_language": "<detected source language, e.g. German or English>",
  "target_language": "<target language>",
  "translation": "<best translation>",
  "alternatives": ["<optional alternative 1>", "<optional alternative 2>"],
  "notes": "<brief English note about register, case, gender, separable verb, or usage; empty string if not useful>"
}}

Rules:
- Keep the translation concise and natural.
- For a single German noun, include the article in the translation if useful.
- For German verbs with fixed prepositions, include the preposition and case in notes.
- Do not correct or rewrite beyond what is needed for translation.

Text:
{text}"""


def _build_teacher_rule_prompt(question: str, level: str) -> str:
    return f"""You are an expert German teacher for a learner at CEFR level {level}.
Answer the learner's question and save it as a small reusable rule/explanation.

Learner question:
{question}

Return ONLY valid JSON in this exact format:
{{
  "category": "<one of: grammar|vocabulary|word_order|case|gender|verb_conjugation|preposition|tense|spelling|punctuation|style|pronunciation|other>",
  "title": "<short rule title, max 70 characters>",
  "short_answer": "<direct answer in English, 1-2 sentences>",
  "explanation": "<clear reusable explanation in English, max 180 words>",
  "examples": [
    {{
      "german": "<natural German example>",
      "english": "<English meaning>",
      "note": "<short note about the rule>"
    }}
  ],
  "related_terms": ["<short German term or grammar label>"]
}}

Rules:
- Focus on German grammar, vocabulary precision, register, pronunciation, or usage.
- If the question contains a German word or phrase, explain its exact meaning and usage.
- Use Swiss-compatible German orthography: ss is acceptable; do not require ß.
- Give 1-2 examples.
- Keep the explanation short, practical and reusable.
- Do not include markdown, comments, or text outside the JSON."""


def _build_flashcard_prompt(
    topic: str,
    focus: str,
    level: str,
    count: int,
    translation_language: str = "en",
    supplied_terms: Optional[List[str]] = None,
) -> str:
    language_name = "French" if translation_language == "fr" else "English"
    supplied_terms_block = ""
    generation_rule = (
        f"- Generate exactly {count} cards.\n"
        "- Prefer useful B1-C1 vocabulary, chunks, collocations, and fixed preposition patterns."
    )
    if supplied_terms:
        supplied_terms_block = (
            "\nLearner-supplied German words and expressions:\n"
            f"{json.dumps(supplied_terms, ensure_ascii=False)}\n"
        )
        generation_rule = (
            f"- Create exactly one card for each of the {count} supplied terms, in the same order.\n"
            "- Do not omit terms, merge terms, or introduce unrelated vocabulary.\n"
            "- Correct obvious spelling, and add the correct article to nouns or reflexive pronoun to reflexive verbs."
        )

    return f"""You are an expert German vocabulary tutor.
Create a flashcard set for a learner at CEFR level {level}.

Theme: {topic}
Precise topic/focus: {focus}
Number of cards: {count}
Translation language: {language_name}
{supplied_terms_block}

Return ONLY valid JSON in this exact format:
{{
  "topic": "<short German or English theme label>",
  "level": "{level}",
  "title": "<short useful title>",
  "description": "<one sentence describing what the learner will practice>",
  "cards": [
    {{
      "front": "<German word, chunk, collocation, or short phrase>",
      "back": "<concise {language_name} meaning>",
      "example": "<natural German example sentence>",
      "case_examples": {{
        "<case or grammar label>": "<German sentence or pattern>"
      }},
      "tense_examples": {{
        "<tense label>": "<German sentence>"
      }},
      "tags": ["<part of speech or topic tag>"]
    }}
  ]
}}

Rules:
{generation_rule}
- The front must be German. The back must be {language_name}.
- Include articles for nouns.
- Include reflexive pronouns for reflexive verbs.
- Include case_examples when the card benefits from case/preposition practice.
- Include tense_examples for verbs when useful.
- Keep examples natural and relevant to the topic.
- Use Swiss-compatible German orthography: ss is acceptable; do not require ß.
- Do not include markdown, comments, or text outside the JSON."""


def _build_style_rewrite_prompt(
    messages: List[Dict[str, Any]],
    topic: str,
    level: str,
    rewrite_mode: str,
) -> str:
    message_text = json.dumps(messages, ensure_ascii=False, indent=2)
    mode_instruction = STYLE_MODE_INSTRUCTIONS.get(
        rewrite_mode,
        STYLE_MODE_INSTRUCTIONS["natural"],
    )

    return f"""You are an expert German style coach for a learner at level {level}.
Rewrite the learner's German messages from this conversation on "{topic}" so they sound more natural, idiomatic, and precise.

Rewrite mode: {rewrite_mode}
Mode instruction: {mode_instruction}

Rules:
- Preserve the learner's intended meaning.
- Improve style, flow, register, word choice, and concision.
- Do not introduce new ideas or make the sentence unnecessarily complex.
- If a message is already natural, still provide a "native speaker" version.
- For Swiss German rewrite modes, write the rewritten text in natural Swiss German dialect.
- Return one rewrite for every learner message.
- Keep message_id as the exact numeric ID from the input.
- Notes must be in English.
- Return ONLY valid JSON.

Learner messages:
{message_text}

Return JSON in this exact format:
{{
  "rewrites": [
    {{
      "message_id": 123,
      "original": "<original learner message>",
      "rewritten": "<more natural German version>",
      "style_notes": "<brief English note explaining what improved>",
      "register": "<neutral|formal|informal|academic|professional>"
    }}
  ]
}}"""


def _build_resource_questions_prompt(
    resource: Dict[str, Any],
    level: str,
    question_count: int,
) -> str:
    resource_text = json.dumps(resource, ensure_ascii=False, indent=2)

    return f"""You are an expert German tutor.
Create questions for a learner at level {level} based on this German learning resource.

Resource:
{resource_text}

Return ONLY valid JSON in this exact format:
{{
  "resource_id": "{resource.get('id', '')}",
  "questions": [
    {{
      "id": 1,
      "type": "<comprehension|vocabulary|opinion|grammar>",
      "question": "<question in German>",
      "hint": "<short English hint>",
      "model_answer": "<short model answer in German>"
    }}
  ]
}}

Rules:
- Generate exactly {question_count} questions.
- Questions must be in German.
- Hints may be in English.
- Include a mix of comprehension, vocabulary, and opinion questions.
- If the resource does not contain a full transcript, ask questions that can be answered after watching/listening/reading the linked resource and from the provided description/excerpt."""


def _build_exercise_prompt(
    error_category: str,
    subcategories: List[str],
    exercise_type: str,
    difficulty: str,
    example_errors: List[Dict[str, Any]],
    exercise_topic: Optional[str] = None,
) -> str:
    examples_text = json.dumps(example_errors[:5], ensure_ascii=False, indent=2)
    type_instruction = EXERCISE_TYPE_INSTRUCTIONS.get(
        exercise_type,
        EXERCISE_TYPE_INSTRUCTIONS["fill_blank"],
    )
    topic_instruction = (
        f"\nRequested learner topic/focus: {exercise_topic.strip()}\n"
        "Make every item directly practice this requested focus. If the wording is informal "
        "(for example, 'you plural'), translate it into the correct German grammar concept "
        "inside the exercise content and instructions."
        if exercise_topic and exercise_topic.strip()
        else ""
    )

    return f"""Create a {difficulty}-level German exercise targeting: **{error_category}** (subcategories: {', '.join(subcategories) or 'general'}).
{topic_instruction}
The learner made these real mistakes (use them for inspiration, not verbatim):
{examples_text}
Generate 5 items. {type_instruction}
Return ONLY the JSON object, no markdown fences."""


def _extract_json_object(raw_text: str) -> str:
    fenced_match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw_text, re.DOTALL)
    if fenced_match:
        return fenced_match.group(1)

    object_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
    return object_match.group(0) if object_match else raw_text


def _load_jsonish_object(raw_text: str) -> Dict[str, Any]:
    candidate = _extract_json_object(raw_text).strip()

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Claude occasionally adds trailing commas to otherwise valid JSON.
        sanitized = re.sub(r",(\s*[}\]])", r"\1", candidate)
        return json.loads(sanitized)


def _normalize_corrections(data: Dict[str, Any]) -> Dict[str, Any]:
    corrections = data.get("corrections")
    if not isinstance(corrections, list):
        data["corrections"] = []
        return data

    allowed_severities = {"light", "medium", "severe"}
    normalized_corrections = []
    for correction in corrections:
        if not isinstance(correction, dict):
            continue
        original = str(correction.get("original", ""))
        corrected = str(correction.get("corrected", ""))
        if original.replace("ss", "ß") == corrected.replace("ss", "ß"):
            continue
        severity = str(correction.get("severity", "")).lower()
        correction["severity"] = severity if severity in allowed_severities else "medium"
        normalized_corrections.append(correction)

    data["corrections"] = normalized_corrections
    if not normalized_corrections:
        data["has_errors"] = False
        data["corrected_user_message"] = None
    return data


def _extract_json_string_field(raw_text: str, field: str) -> Optional[str]:
    pattern = rf'"{re.escape(field)}"\s*:\s*"((?:\\.|[^"\\])*)"'
    match = re.search(pattern, raw_text, re.DOTALL)
    if not match:
        return None

    try:
        return json.loads(f'"{match.group(1)}"')
    except json.JSONDecodeError:
        return match.group(1).replace(r"\n", "\n").replace(r"\"", '"')


def _fallback_chat_data(raw_text: str) -> Dict[str, Any]:
    reply = _extract_json_string_field(raw_text, "reply")
    if not reply:
        logger.warning(
            "claude.chat.json_parse_failed_no_reply raw_chars=%s",
            len(raw_text),
        )
        reply = (
            "Entschuldige, ich hatte gerade ein technisches Problem mit meiner Antwort. "
            "Lass uns einfach weitermachen: Was moechtest du zu diesem Thema als Naechstes sagen?"
        )

    corrected = _extract_json_string_field(raw_text, "corrected_user_message")
    return {
        "reply": reply.strip(),
        "has_errors": False,
        "corrected_user_message": corrected.strip() if isinstance(corrected, str) and corrected.strip() else None,
        "corrections": [],
    }


def _normalize_chat_data(data: Dict[str, Any], raw_text: str) -> Dict[str, Any]:
    data = _normalize_corrections(data)

    reply = data.get("reply")
    if not isinstance(reply, str) or not reply.strip():
        return _fallback_chat_data(raw_text)

    nested_json_reply = reply.strip()
    if nested_json_reply.startswith("{") and '"reply"' in nested_json_reply:
        try:
            nested_data = _load_jsonish_object(nested_json_reply)
            nested_reply = nested_data.get("reply")
            if isinstance(nested_reply, str) and nested_reply.strip():
                data = _normalize_corrections(nested_data)
                reply = nested_reply
        except json.JSONDecodeError:
            extracted_reply = _extract_json_string_field(nested_json_reply, "reply")
            if extracted_reply:
                reply = extracted_reply

    data["reply"] = reply.strip()
    data["has_errors"] = bool(data.get("has_errors"))

    corrected = data.get("corrected_user_message")
    if not isinstance(corrected, str) or not corrected.strip():
        data["corrected_user_message"] = None

    return data


def _coerce_message_id(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.isdigit():
            return int(stripped)
    return None

#── Main chat function ──────────────────────────────────────────────────────

def get_chat_response(
    user_message: str,
    conversation_history: List[Dict[str, str]],
    topic: str,
    level: str = "C1",
    ) -> Dict[str, Any]:
    """Send user message to Claude and return structured response."""

    messages = conversation_history.copy()
    messages.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=_build_conversation_system_prompt(topic, level),
        messages=messages,
    )

    raw_text = response.content[0].text.strip()

    try:
        data = _load_jsonish_object(raw_text)
    except json.JSONDecodeError as exc:
        logger.warning(
            "claude.chat.json_parse_failed error=%s raw_chars=%s",
            exc,
            len(raw_text),
        )
        return _fallback_chat_data(raw_text)

    return _normalize_chat_data(data, raw_text)


def stream_chat_reply(
    user_message: str,
    conversation_history: List[Dict[str, str]],
    topic: str,
    level: str = "C1",
):
    """Yield a conversational Claude response without running teaching analysis."""
    messages = conversation_history.copy()
    messages.append({"role": "user", "content": user_message})
    with client.messages.stream(
        model=MODEL,
        max_tokens=512,
        system=_build_conversation_reply_prompt(topic, level),
        messages=messages,
    ) as stream:
        yield from stream.text_stream


def analyze_message_batch(
    messages: List[Dict[str, Any]],
    level: str = "C1",
) -> List[Dict[str, Any]]:
    """Analyse up to three learner messages and return normalized per-message results."""
    if not messages:
        return []
    response = client.messages.create(
        model=MODEL,
        max_tokens=2600,
        messages=[{
            "role": "user",
            "content": _build_message_analysis_prompt(messages, level),
        }],
    )
    raw_text = response.content[0].text.strip()
    data = _load_jsonish_object(raw_text)
    raw_results = data.get("messages", [])
    by_id = {
        message_id: item
        for item in raw_results
        if isinstance(item, dict)
        and (message_id := _coerce_message_id(item.get("message_id"))) is not None
    }
    results = []
    for message in messages:
        message_id = int(message["message_id"])
        original = str(message["content"])
        item = by_id.get(message_id, {})
        normalized = _normalize_corrections(item.copy())
        corrections = normalized.get("corrections", [])
        has_errors = bool(normalized.get("has_errors") and corrections)
        corrected = normalized.get("corrected_user_message") if has_errors else original
        if not isinstance(corrected, str) or not corrected.strip():
            corrected = original
        results.append({
            "message_id": message_id,
            "has_errors": has_errors,
            "corrected_user_message": corrected,
            "corrections": corrections if has_errors else [],
        })
    return results


def generate_opening_message(topic: str, level: str = "C1") -> str:
    """Generate a short assistant opener before the learner sends a message."""
    response = client.messages.create(
        model=MODEL,
        max_tokens=160,
        messages=[{"role": "user", "content": _build_opening_message_prompt(topic, level)}],
    )
    return response.content[0].text.strip()


#── Session summary ─────────────────────────────────────────────────────────

def generate_session_summary(
    messages: List[Dict[str, str]],
    errors: List[Dict[str, Any]],
    topic: str,
    level: str,
    ) -> Dict[str, Optional[str]]:
    """Generate a brief end-of-session assessment with Claude."""
    prompt = _build_session_summary_prompt(messages, errors, topic, level)
    response = client.messages.create(
        model=MODEL,
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text.strip()

    try:
        data = _load_jsonish_object(raw_text)
    except json.JSONDecodeError:
        return {
            "summary": raw_text,
            "estimated_level": None,
        }

    estimated_level = str(data.get("estimated_level", "")).upper()
    if estimated_level not in CEFR_LEVELS:
        estimated_level = None

    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = raw_text

    return {
        "summary": summary.strip(),
        "estimated_level": estimated_level,
    }


#── Translation ─────────────────────────────────────────────────────────────

def translate_text(
    text: str,
    target_language: str = "auto",
    source_language: str = "auto",
) -> Dict[str, Any]:
    """Translate short learner lookups and return concise structured help."""
    clean_text = text.strip()
    if not clean_text:
        return {
            "source_language": None,
            "target_language": None,
            "translation": "",
            "alternatives": [],
            "notes": "",
        }

    prompt = _build_translation_prompt(
        text=clean_text,
        source_language=source_language,
        target_language=target_language,
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text.strip()

    try:
        data = _load_jsonish_object(raw_text)
    except json.JSONDecodeError:
        return {
            "source_language": source_language if source_language != "auto" else None,
            "target_language": target_language if target_language != "auto" else None,
            "translation": raw_text,
            "alternatives": [],
            "notes": "",
        }

    alternatives = data.get("alternatives")
    if not isinstance(alternatives, list):
        alternatives = []

    translation = data.get("translation")
    return {
        "source_language": data.get("source_language") if isinstance(data.get("source_language"), str) else None,
        "target_language": data.get("target_language") if isinstance(data.get("target_language"), str) else None,
        "translation": translation.strip() if isinstance(translation, str) else raw_text,
        "alternatives": [item.strip() for item in alternatives if isinstance(item, str) and item.strip()][:3],
        "notes": data.get("notes").strip() if isinstance(data.get("notes"), str) else "",
    }


#── Ask the teacher ─────────────────────────────────────────────────────────

def generate_teacher_rule(
    question: str,
    level: str = "B2",
) -> Dict[str, Any]:
    """Turn a learner question into a compact reusable German rule."""
    clean_question = question.strip()
    allowed_categories = {
        "grammar",
        "vocabulary",
        "word_order",
        "case",
        "gender",
        "verb_conjugation",
        "preposition",
        "tense",
        "spelling",
        "punctuation",
        "style",
        "pronunciation",
        "other",
    }

    prompt = _build_teacher_rule_prompt(clean_question, level)

    response = client.messages.create(
        model=MODEL,
        max_tokens=1000,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text.strip()

    try:
        data = _load_jsonish_object(raw_text)
    except json.JSONDecodeError as exc:
        logger.warning(
            "claude.teacher_rule.json_parse_failed error=%s raw_chars=%s",
            exc,
            len(raw_text),
        )
        return {
            "category": "other",
            "title": clean_question[:70] or "Teacher question",
            "short_answer": raw_text[:500],
            "explanation": raw_text,
            "examples": [],
            "related_terms": [],
        }

    category = str(data.get("category", "other")).strip().lower()
    if category not in allowed_categories:
        category = "other"

    examples = data.get("examples")
    normalized_examples = []
    if isinstance(examples, list):
        for example in examples[:4]:
            if not isinstance(example, dict):
                continue
            german = example.get("german")
            english = example.get("english")
            note = example.get("note")
            if isinstance(german, str) and german.strip():
                normalized_examples.append({
                    "german": german.strip(),
                    "english": english.strip() if isinstance(english, str) else "",
                    "note": note.strip() if isinstance(note, str) else "",
                })

    related_terms = data.get("related_terms")
    if not isinstance(related_terms, list):
        related_terms = []

    title = data.get("title")
    short_answer = data.get("short_answer")
    explanation = data.get("explanation")

    return {
        "category": category,
        "title": title.strip()[:90] if isinstance(title, str) and title.strip() else clean_question[:70],
        "short_answer": short_answer.strip() if isinstance(short_answer, str) and short_answer.strip() else "",
        "explanation": explanation.strip() if isinstance(explanation, str) and explanation.strip() else "",
        "examples": normalized_examples,
        "related_terms": [term.strip() for term in related_terms if isinstance(term, str) and term.strip()][:8],
    }


#── Flashcards ──────────────────────────────────────────────────────────────

def generate_flashcard_set(
    topic: str,
    precise_topic: Optional[str] = None,
    level: str = "B2",
    count: int = 12,
    translation_language: str = "en",
    supplied_terms: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Generate a German flashcard set as structured JSON-ready data."""
    focus = precise_topic.strip() if isinstance(precise_topic, str) and precise_topic.strip() else topic
    prompt = _build_flashcard_prompt(
        topic,
        focus,
        level,
        count,
        translation_language=translation_language,
        supplied_terms=supplied_terms,
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=max(1800, min(6000, count * 450)),
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text.strip()

    try:
        data = _load_jsonish_object(raw_text)
    except json.JSONDecodeError as exc:
        logger.warning(
            "claude.flashcards.json_parse_failed error=%s raw_chars=%s",
            exc,
            len(raw_text),
        )
        raise

    cards = data.get("cards")
    if not isinstance(cards, list):
        cards = []

    normalized_cards = []
    for card in cards[:count]:
        if not isinstance(card, dict):
            continue
        front = card.get("front")
        back = card.get("back")
        if not isinstance(front, str) or not front.strip():
            continue
        if not isinstance(back, str) or not back.strip():
            continue

        case_examples = card.get("case_examples")
        tense_examples = card.get("tense_examples")
        tags = card.get("tags")
        normalized_cards.append({
            "front": front.strip(),
            "back": back.strip(),
            "example": card.get("example").strip() if isinstance(card.get("example"), str) else "",
            "case_examples": case_examples if isinstance(case_examples, dict) else {},
            "tense_examples": tense_examples if isinstance(tense_examples, dict) else {},
            "tags": [tag.strip() for tag in tags if isinstance(tag, str) and tag.strip()][:8] if isinstance(tags, list) else [],
        })

    return {
        "topic": data.get("topic").strip() if isinstance(data.get("topic"), str) and data.get("topic").strip() else topic,
        "level": level,
        "title": data.get("title").strip() if isinstance(data.get("title"), str) and data.get("title").strip() else f"{topic} Wortschatz",
        "description": data.get("description").strip() if isinstance(data.get("description"), str) else "",
        "cards": normalized_cards,
    }


#── Style rewrite ───────────────────────────────────────────────────────────

def _normalize_style_rewrites(
    data: Dict[str, Any],
    messages: List[Dict[str, Any]],
    rewrite_mode: str,
    session_id: Optional[int] = None,
    user_id: Optional[int] = None,
) -> Dict[str, Any]:
    rewrites = data.get("rewrites")
    if not isinstance(rewrites, list):
        logger.warning(
            "style_rewrite.invalid_shape session_id=%s user_id=%s keys=%s rewrites_type=%s",
            session_id,
            user_id,
            list(data.keys()),
            type(rewrites).__name__,
        )
        return {"rewrites": []}

    valid_message_ids = {message["message_id"] for message in messages}
    originals_by_id = {
        message["message_id"]: message["original"]
        for message in messages
    }
    normalized_rewrites = []
    skipped_counts = {
        "not_object": 0,
        "invalid_message_id": 0,
        "empty_rewritten": 0,
    }

    for rewrite in rewrites:
        if not isinstance(rewrite, dict):
            skipped_counts["not_object"] += 1
            continue

        message_id = _coerce_message_id(rewrite.get("message_id"))
        if message_id not in valid_message_ids:
            skipped_counts["invalid_message_id"] += 1
            logger.info(
                "style_rewrite.skip_invalid_message_id session_id=%s user_id=%s raw_message_id=%r valid_ids=%s",
                session_id,
                user_id,
                rewrite.get("message_id"),
                sorted(valid_message_ids),
            )
            continue

        original = rewrite.get("original")
        rewritten = rewrite.get("rewritten")
        style_notes = rewrite.get("style_notes")

        if not isinstance(rewritten, str) or not rewritten.strip():
            skipped_counts["empty_rewritten"] += 1
            continue

        normalized_rewrites.append({
            "message_id": message_id,
            "original": original if isinstance(original, str) else originals_by_id[message_id],
            "rewritten": rewritten.strip(),
            "style_notes": style_notes.strip() if isinstance(style_notes, str) else "",
            "register": rewrite.get("register") if isinstance(rewrite.get("register"), str) else None,
        })

    logger.info(
        "style_rewrite.normalized session_id=%s user_id=%s rewrite_mode=%s returned=%s accepted=%s skipped=%s",
        session_id,
        user_id,
        rewrite_mode,
        len(rewrites),
        len(normalized_rewrites),
        skipped_counts,
    )

    return {"rewrites": normalized_rewrites}


def rewrite_session_style(
    messages: List[Dict[str, Any]],
    topic: str,
    level: str,
    rewrite_mode: str = "natural",
    swiss_dialect: Optional[str] = None,
    session_id: Optional[int] = None,
    user_id: Optional[int] = None,
    ) -> Dict[str, Any]:
    """Rewrite learner messages in a more natural German style."""
    max_tokens = min(8192, max(2048, len(messages) * 500))
    if rewrite_mode == "swiss_german":
        logger.info(
            "style_rewrite.request session_id=%s user_id=%s rewrite_mode=%s provider=gradio message_count=%s",
            session_id,
            user_id,
            rewrite_mode,
            len(messages),
        )
        data = rewrite_messages_to_swiss_german(messages, dialect=swiss_dialect)
        return _normalize_style_rewrites(
            data=data,
            messages=messages,
            rewrite_mode=rewrite_mode,
            session_id=session_id,
            user_id=user_id,
        )
    selected_model = MODEL

    prompt = _build_style_rewrite_prompt(
        messages=messages,
        topic=topic,
        level=level,
        rewrite_mode=rewrite_mode,
    )

    logger.info(
        "style_rewrite.request session_id=%s user_id=%s rewrite_mode=%s provider=%s model=%s message_count=%s prompt_chars=%s max_tokens=%s",
        session_id,
        user_id,
        rewrite_mode,
        "anthropic",
        selected_model,
        len(messages),
        len(prompt),
        max_tokens,
    )

    response = client.messages.create(
        model=selected_model,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text.strip()
    stop_reason = getattr(response, "stop_reason", None)

    logger.info(
        "style_rewrite.raw_response session_id=%s user_id=%s provider=%s stop_reason=%s raw_chars=%s",
        session_id,
        user_id,
        "anthropic",
        stop_reason,
        len(raw_text),
    )
    if stop_reason == "max_tokens":
        logger.warning(
            "style_rewrite.truncated session_id=%s user_id=%s max_tokens=%s raw_chars=%s",
            session_id,
            user_id,
            max_tokens,
            len(raw_text),
        )

    try:
        data = _load_jsonish_object(raw_text)
    except json.JSONDecodeError as exc:
        logger.warning(
            "style_rewrite.json_parse_failed session_id=%s user_id=%s error=%s raw_chars=%s",
            session_id,
            user_id,
            exc,
            len(raw_text),
        )
        return {"rewrites": []}

    return _normalize_style_rewrites(
        data=data,
        messages=messages,
        rewrite_mode=rewrite_mode,
        session_id=session_id,
        user_id=user_id,
    )


#── Resource questions ─────────────────────────────────────────────────────

def generate_resource_questions(
    resource: Dict[str, Any],
    level: str = "B2",
    question_count: int = 5,
) -> Dict[str, Any]:
    """Generate comprehension and discussion questions for a learning resource."""
    prompt = _build_resource_questions_prompt(resource, level, question_count)

    response = client.messages.create(
        model=MODEL,
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    raw_text = response.content[0].text.strip()

    try:
        data = _load_jsonish_object(raw_text)
    except json.JSONDecodeError:
        logger.warning(
            "claude.resource_questions.json_parse_failed resource_id=%s raw_chars=%s",
            resource.get("id"),
            len(raw_text),
        )
        return {
            "resource_id": resource.get("id"),
            "questions": [],
        }

    questions = data.get("questions")
    if not isinstance(questions, list):
        questions = []

    normalized = []
    for idx, question in enumerate(questions[:question_count], start=1):
        if not isinstance(question, dict):
            continue
        text = question.get("question")
        if not isinstance(text, str) or not text.strip():
            continue
        normalized.append({
            "id": question.get("id") if isinstance(question.get("id"), int) else idx,
            "type": question.get("type") if isinstance(question.get("type"), str) else "comprehension",
            "question": text.strip(),
            "hint": question.get("hint") if isinstance(question.get("hint"), str) else "",
            "model_answer": question.get("model_answer") if isinstance(question.get("model_answer"), str) else "",
        })

    return {
        "resource_id": resource.get("id"),
        "questions": normalized,
    }

#── Exercise generation ─────────────────────────────────────────────────────

def classify_exercise_topic(topic: str) -> Dict[str, Any]:
    """Ask Claude which existing exercise category best matches a learner topic."""
    categories_text = ", ".join(EXERCISE_CATEGORIES)
    prompt = f"""Classify this requested German exercise focus into one existing category.

Requested focus:
{topic}

Existing categories:
{categories_text}

Return ONLY valid JSON in this exact format:
{{
  "category": "<one existing category>",
  "subcategory": "<short grammar/vocabulary label, or null>"
}}

Examples:
- "conjugation with you plural" -> {{"category": "verb_conjugation", "subcategory": "ihr conjugation"}}
- "dative after prepositions" -> {{"category": "preposition", "subcategory": "Dativprepositionen"}}
- "adjective endings in accusative" -> {{"category": "case", "subcategory": "Adjektivdeklination im Akkusativ"}}"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=300,
        system=EXERCISE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    data = _load_jsonish_object(response.content[0].text.strip())
    category = data.get("category")
    if category not in EXERCISE_CATEGORIES:
        category = "grammar"

    subcategory = data.get("subcategory")
    return {
        "category": category,
        "subcategory": subcategory.strip() if isinstance(subcategory, str) and subcategory.strip() else None,
    }

def generate_exercise(
    error_category: str,
    subcategories: List[str],
    exercise_type: str,
    difficulty: str,
    example_errors: List[Dict[str, Any]],
    exercise_topic: Optional[str] = None,
    ) -> Dict[str, Any]:
    """Ask Claude to create a targeted exercise."""
    prompt = _build_exercise_prompt(
        error_category=error_category,
        subcategories=subcategories,
        exercise_type=exercise_type,
        difficulty=difficulty,
        example_errors=example_errors,
        exercise_topic=exercise_topic,
    )
    response = client.messages.create(
        model=MODEL,
        max_tokens=1500,
        system=EXERCISE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text.strip()
    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if json_match:
        raw = json_match.group(0)

    exercise_data = json.loads(raw)

    if exercise_type == "fill_blank":
        sentences = exercise_data.get("content", {}).get("sentences", [])
        for sentence in sentences:
            text = str(sentence.get("text", ""))
            blank_count = text.count("___")
            if blank_count != 1:
                raise ValueError(
                    f"Generated fill_blank item {sentence.get('id')} has {blank_count} blanks; expected exactly one."
                )

    return exercise_data
