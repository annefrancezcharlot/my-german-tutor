import React from 'react';
import type { ExerciseContent, ExerciseResult } from '../../types';
import { CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  result: ExerciseResult;
  exerciseType: string;
  answers: Record<string, string>;
  content: ExerciseContent;
}

const extractItemId = (feedback: string, index: number): string =>
  feedback.match(/Item\s+(\d+)/)?.[1] ?? String(index + 1);

const stripOptionLabel = (option: string): string =>
  option.replace(/^[A-Z]\)\s*/, '');

interface MultipleChoiceDisplay {
  label: string;
  before: string;
  choice: string;
  after: string;
}

const sentencePartsForBlank = (question: string, optionText: string): Omit<MultipleChoiceDisplay, 'label'> => {
  const blankMatch = question.match(/_{2,}/);
  if (!blankMatch || blankMatch.index === undefined) {
    return { before: '', choice: optionText.trim(), after: '' };
  }

  const beforeBlank = question.slice(0, blankMatch.index);
  const afterBlank = question.slice(blankMatch.index + blankMatch[0].length);
  const trimmedOption = optionText.trim();
  let dedupedAfter = afterBlank;

  for (let chars = afterBlank.trimStart().length; chars > 2; chars -= 1) {
    const afterPrefix = afterBlank.trimStart().slice(0, chars);
    if (trimmedOption.toLowerCase().endsWith(afterPrefix.toLowerCase())) {
      dedupedAfter = afterBlank.slice(afterBlank.indexOf(afterPrefix) + chars);
      break;
    }
  }

  return {
    before: beforeBlank,
    choice: trimmedOption,
    after: dedupedAfter.replace(/^\s+([,.;:!?])/, '$1'),
  };
};

const multipleChoiceDisplayForAnswer = (
  content: ExerciseContent,
  itemId: string,
  answer?: string,
): MultipleChoiceDisplay | undefined => {
  if (!answer) return undefined;

  const question = content.questions?.find(q => String(q.id) === itemId);
  const option = question?.options.find(opt => opt.trim().startsWith(`${answer})`));
  if (!question || !option) {
    return { label: answer, before: '', choice: answer, after: '' };
  }

  return {
    label: answer,
    ...sentencePartsForBlank(question.question, stripOptionLabel(option)),
  };
};

const renderMultipleChoiceAnswer = (display: MultipleChoiceDisplay | undefined): React.ReactNode => {
  if (!display) return '—';

  return (
    <>
      {display.label}) {display.before}
      <span className="rounded bg-blue-500/25 px-1 py-0.5 font-semibold text-white ring-1 ring-blue-300/30">
        {display.choice}
      </span>
      {display.after}
    </>
  );
};

const normalizeAnswer = (value: string | undefined): string =>
  (value ?? '').trim().toLowerCase();

const correctionSentenceOnly = (value: string | undefined): string | undefined => {
  if (value === undefined) return value;

  let sentence = value.trim().split(/\s*(?:\|\||\||—|–)\s*/, 1)[0].trim();
  sentence = sentence.replace(/\s+\[[^\]]+\]\s*$/, '').trim();
  sentence = sentence.replace(/([.!?])\s+-\s+.*$/, '$1').trim();
  return sentence;
};

const vocabularyAnswerVariants = (
  content: ExerciseContent,
  itemId: string,
  correctAnswer: string | string[] | undefined,
): string[] => {
  const variants = new Set<string>();
  const addVariant = (value: string | undefined) => {
    const normalized = normalizeAnswer(value);
    if (!normalized) return;

    variants.add(normalized);
    const parts = normalized.split(/\s+/);
    if (parts.length > 0) {
      variants.add(parts[parts.length - 1]);
    }
  };

  const gap = content.gaps?.find(item => String(item.id) === itemId);
  if (Array.isArray(correctAnswer)) {
    correctAnswer.forEach(addVariant);
  } else {
    addVariant(correctAnswer);
  }
  addVariant(gap?.lemma);

  return Array.from(variants);
};

export const ResultView: React.FC<Props> = ({ result, exerciseType, answers, content }) => {
  const score = Math.round(result.score);
  const isPerfect  = score === 100;
  const isGood     = score >= 70;
  const isGenderChoice = exerciseType === 'multiple_choice' && !!content.items?.length;

  const scoreColour =
    score >= 80 ? 'text-green-400' :
    score >= 60 ? 'text-yellow-400' : 'text-red-400';

  const emoji  = isPerfect ? '🎉' : isGood ? '👍' : '💪';
  const phrase = isPerfect
    ? 'Perfect! All answers are correct.'
    : isGood
    ? 'Good work! A few small mistakes.'
    : 'Keep practicing. You can do this.';

  const renderVocabularyResults = () => {
    const parts = (content.source_text ?? '').split(/(\[\d+\])/g);
    const gaps = content.gaps ?? [];

    const isAnswerCorrect = (itemId: string) =>
      vocabularyAnswerVariants(content, itemId, result.correct_answers[itemId])
        .includes(normalizeAnswer(answers[itemId]));

    const renderFilledTextPart = (part: string, index: number) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (!match) return <span key={`text-${index}`}>{part}</span>;

      const itemId = match[1];
      const userAnswer = answers[itemId]?.trim() || '—';
      const isCorrect = isAnswerCorrect(itemId);

      return (
        <span key={`gap-${itemId}`} className="inline-flex items-center gap-1 mx-1 my-1 align-middle">
          <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
            {itemId}
          </span>
          <span
            className={clsx(
              'rounded px-1.5 py-0.5 font-semibold ring-1',
              isCorrect
                ? 'bg-green-500/20 text-green-100 ring-green-400/40'
                : 'bg-red-500/20 text-red-100 ring-red-400/40'
            )}
          >
            {userAnswer}
          </span>
        </span>
      );
    };

    return (
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
          Correction
        </h3>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Filled text
            </div>
            <div className="text-base leading-8 text-slate-100">
              {parts.map(renderFilledTextPart)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Your answers
            </div>
            <div className="space-y-2">
              {gaps.map(gap => {
                const itemId = String(gap.id);
                const userAnswer = answers[itemId]?.trim() || '—';
              const correctAnswer = result.correct_answers[itemId];
              const correctAnswerText = Array.isArray(correctAnswer) ? correctAnswer[0] : correctAnswer;
              const isCorrect = isAnswerCorrect(itemId);

                return (
                  <div
                    key={itemId}
                    className={clsx(
                      'rounded-xl border px-3 py-3',
                      isCorrect
                        ? 'border-green-800/50 bg-green-900/25'
                        : 'border-red-800/50 bg-red-900/25'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {isCorrect
                        ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-400" />
                        : <XCircle size={15} className="mt-0.5 shrink-0 text-red-400" />}
                      <div className="min-w-0">
                        <div
                          className={clsx(
                            'text-sm font-semibold',
                            isCorrect ? 'text-green-100' : 'text-red-100'
                          )}
                        >
                          {itemId}. {userAnswer}
                        </div>
                        {!isCorrect && correctAnswer !== undefined && (
                          <div className="mt-1 text-xs text-slate-300">
                            Correct: <span className="font-medium text-white">{correctAnswerText}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Score header */}
      <div className="bg-slate-900 rounded-2xl p-6 text-center border border-slate-700">
        <div className="text-5xl mb-3">{emoji}</div>
        <div className={clsx('text-5xl font-bold mb-2', scoreColour)}>
          {score}%
        </div>
        <div className="text-slate-300 text-sm">{phrase}</div>
      </div>

      {exerciseType === 'vocabulary_cloze' ? renderVocabularyResults() : (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
            Detailed feedback
          </h3>
          <div className="space-y-2">
            {result.feedback.map((fb, idx) => {
              const isCorrect = fb.startsWith('✓');
              const isPartial = fb.startsWith('~');
              const itemId = extractItemId(fb, idx);
              const correctAnswer = result.correct_answers[itemId];
              const correctAnswerText = Array.isArray(correctAnswer) ? correctAnswer[0] : correctAnswer;
              const userAnswer = answers[itemId];
              const displayedGenderCorrectAnswer = Array.isArray(correctAnswer)
                ? correctAnswer.join(' / ')
                : correctAnswer;
              const displayedUserAnswer = exerciseType === 'multiple_choice' && !isGenderChoice
                ? renderMultipleChoiceAnswer(multipleChoiceDisplayForAnswer(content, itemId, userAnswer))
                : (userAnswer || '—');
              const displayedCorrectAnswer = exerciseType === 'multiple_choice' && !isGenderChoice
                ? renderMultipleChoiceAnswer(multipleChoiceDisplayForAnswer(content, itemId, correctAnswerText))
                : exerciseType === 'correction'
                ? correctionSentenceOnly(correctAnswerText)
                : displayedGenderCorrectAnswer;
              return (
                <div
                  key={idx}
                  className={clsx(
                    'flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm',
                    isCorrect
                      ? 'bg-green-900/30 border border-green-800/40'
                      : isPartial
                      ? 'bg-yellow-900/30 border border-yellow-800/40'
                      : 'bg-red-900/30 border border-red-800/40'
                  )}
                >
                  {isCorrect
                    ? <CheckCircle2 size={15} className="text-green-400 shrink-0 mt-0.5" />
                    : isPartial
                    ? <AlertCircle size={15} className="text-yellow-400 shrink-0 mt-0.5" />
                    : <XCircle size={15} className="text-red-400 shrink-0 mt-0.5" />}
                  <span className={clsx(
                    'leading-relaxed',
                    isCorrect ? 'text-green-200' :
                    isPartial ? 'text-yellow-200' : 'text-red-200'
                  )}>
                    <div>{fb.replace(/^[✓✗~]\s*/, '')}</div>
                    {correctAnswer !== undefined && (
                      <div className="mt-2 space-y-1 text-xs">
                        {userAnswer !== undefined && (
                          <div className="text-slate-300">
                            Your answer: <span className="font-medium text-white">{displayedUserAnswer}</span>
                          </div>
                        )}
                        <div className="text-slate-300">
                          Correct answer: <span className="font-medium text-white">{displayedCorrectAnswer}</span>
                        </div>
                      </div>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
