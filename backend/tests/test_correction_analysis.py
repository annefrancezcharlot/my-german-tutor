import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DATABASE_URL', 'sqlite:////tmp/german_correction_tests.db')
os.environ.setdefault('ANTHROPIC_API_KEY', 'test-key')
from services import claude_service as service


def edit(original, corrected, category='grammar'):
    return dict(original=original, corrected=corrected, category=category,
                severity='medium', explanation='Explanation of this edit.')


def test_sentence_built_from_edits_not_model_rewrite():
    result = service._validate_message_edits('Ich habe ein Hund. Er ist nett.', {
        'corrected_user_message': 'A contradictory rewrite',
        'corrections': [edit('ein Hund', 'einen Hund')]})
    assert result['corrected_user_message'] == 'Ich habe einen Hund. Er ist nett.'


def test_laut_optional_and_not_scored():
    original = 'Was war genau laut?'
    result = service._validate_message_edits(original, {
        'corrections': [edit(original, 'Was war genau so laut?', 'style')]})
    assert result['corrected_user_message'] == original
    assert result['has_errors'] is False
    assert result['corrections'] == []
    assert len(result['suggestions']) == 1
    prompt = service._build_message_analysis_prompt([], 'B2')
    assert "'Was' is the subject" in prompt
    assert 'ordinary typos' in prompt


@pytest.mark.parametrize('original,edits', [
    ('Ich bin hier.', [edit('nicht vorhanden', 'da')]),
    ('gut gut', [edit('gut', 'besser')]),
    ('Ich habe ein Hund.', [edit('ein Hund', 'einen Hund'), edit('Hund', 'Hund!')]),
])
def test_invalid_spans_rejected(original, edits):
    with pytest.raises(ValueError):
        service._validate_message_edits(original, {'corrections': edits})


def test_multiple_edits_and_ignored_capitalization_swiss_spelling():
    result = service._validate_message_edits('guten Morgen Herr X. Ich habe ein Hund auf der Strasse.', {
        'corrections': [edit('Morgen Herr', 'Morgen, Herr', 'punctuation'),
                        edit('ein Hund', 'einen Hund'), edit('guten', 'Guten'),
                        edit('Strasse', 'Straße')]})
    assert result['corrected_user_message'] == 'guten Morgen, Herr X. Ich habe einen Hund auf der Strasse.'
    assert len(result['corrections']) == 2


def test_retry_then_success(monkeypatch):
    calls = []
    responses = [ {'messages': []}, {'messages': [{'message_id': 1, 'corrections': []}]} ]
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(text=json.dumps(responses.pop(0)))])
    monkeypatch.setattr(service.client.messages, 'create', create)
    assert service.analyze_message_batch([{'message_id': 1, 'content': 'Hallo!'}])[0]['has_errors'] is False
    assert len(calls) == 2
    assert 'failed validation' in calls[1]['messages'][0]['content']


def test_invalid_batch_fails_after_one_retry(monkeypatch):
    calls = []
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(text='{"messages": []}')])
    monkeypatch.setattr(service.client.messages, 'create', create)
    with pytest.raises(ValueError, match='after retry'):
        service.analyze_message_batch([{'message_id': 1, 'content': 'Hallo!'}])
    assert len(calls) == 2


def test_optional_overlap_does_not_block_corrections():
    result = service._validate_message_edits('Ich habe ein Hund.', {
        'corrections': [edit('Ich habe ein Hund.', 'Ich besitze einen Hund.', 'style'),
                        edit('ein Hund', 'einen Hund')],
        'suggestions': [edit('ein Hund', 'einen lieben Hund')],
    })
    assert result['corrected_user_message'] == 'Ich habe einen Hund.'
    assert len(result['corrections']) == 1
    assert result['suggestions'] == []


def test_duplicate_edit_is_counted_once():
    result = service._validate_message_edits('ein Hund', {
        'corrections': [edit('ein Hund', 'einen Hund'), edit('ein Hund', 'einen Hund', 'case')],
    })
    assert result['corrected_user_message'] == 'einen Hund'
    assert len(result['corrections']) == 1


def test_conflicting_corrections_retry_keeps_independent_errors_separate(monkeypatch):
    original = 'Ich habe ein Hund. Ich spreche mit meine Nachbarn.'
    corrections = [
        edit('ein Hund', 'einen Hund', 'case'),
        edit('mit meine Nachbarn', 'mit meinen Nachbarn', 'preposition'),
    ]
    corrections[0]['explanation'] = 'Haben takes an accusative object.'
    corrections[1]['explanation'] = 'Mit takes the dative case.'
    responses = [
        {'messages': [{'message_id': 1, 'corrections': [*corrections, edit('Hund', 'Hund!')]}]},
        {'messages': [{'message_id': 1, 'corrections': corrections}]},
    ]
    calls = []
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(text=json.dumps(responses.pop(0)))])
    monkeypatch.setattr(service.client.messages, 'create', create)
    result = service.analyze_message_batch([{'message_id': 1, 'content': original}])
    assert result[0]['corrected_user_message'] == 'Ich habe einen Hund. Ich spreche mit meinen Nachbarn.'
    assert result[0]['corrections'] == corrections
    assert len(calls) == 2
    for call in calls:
        prompt = call['messages'][0]['content']
        assert 'one correction per independent error' in prompt
        assert 'exactly ONE correction' not in prompt
        assert 'one full-message edit' not in prompt
    assert 'smallest shared phrase' in calls[1]['messages'][0]['content']


def test_summary_retries_missing_level(monkeypatch):
    responses = [{'summary': 'Good work'}, {'summary': 'Good work', 'estimated_level': 'B2'}]
    def create(**kwargs):
        return SimpleNamespace(content=[SimpleNamespace(text=json.dumps(responses.pop(0)))])
    monkeypatch.setattr(service.client.messages, 'create', create)
    assert service.generate_session_summary([], [], 'Test', 'B2')['estimated_level'] == 'B2'
    assert responses == []


def test_summary_rejects_incomplete_assessment(monkeypatch):
    monkeypatch.setattr(service.client.messages, 'create', lambda **kwargs:
        SimpleNamespace(content=[SimpleNamespace(text='{"summary":"Good work"}')]))
    with pytest.raises(ValueError, match='after retry'):
        service.generate_session_summary([], [], 'Test', 'B2')
