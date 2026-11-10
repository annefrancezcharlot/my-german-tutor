import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { SENTENCE_DRILLS, SENTENCE_TOPICS } from './lessonPracticeData';
import type { SentenceDrill } from './lessonPracticeData';

const CASE_LABEL = { N: 'Nominativ', A: 'Akkusativ', D: 'Dativ', G: 'Genitiv' } as const;

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const SentenceDrills: React.FC = () => {
  const [topic, setTopic] = useState<string>('all');
  const [round, setRound] = useState(0);
  const items = useMemo<SentenceDrill[]>(
    () => shuffle(SENTENCE_DRILLS.filter(d => topic === 'all' || d.topic === topic)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topic, round],
  );
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'right' | 'wrong'>('idle');
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const reset = () => { setIndex(0); setValue(''); setState('idle'); setScore({ correct: 0, total: 0 }); };
  const changeTopic = (next: string) => { setTopic(next); reset(); };

  const item = items[index];
  const finished = index >= items.length;
  const [before, after] = item ? item.text.split('___') : ['', ''];

  const check = (event: React.FormEvent) => {
    event.preventDefault();
    if (!item || state !== 'idle' || !value.trim()) return;
    const ok = item.answers.some(a => norm(a) === norm(value));
    setState(ok ? 'right' : 'wrong');
    setScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
  };

  const giveUp = () => {
    if (state !== 'idle') return;
    setState('wrong');
    setScore(s => ({ ...s, total: s.total + 1 }));
  };

  const next = () => { setIndex(i => i + 1); setValue(''); setState('idle'); };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="space-y-2">
        <label htmlFor="sentence-topic" className="block text-sm font-medium text-slate-300">Topic</label>
        <select
          id="sentence-topic"
          value={topic}
          onChange={event => changeTopic(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-white focus:border-blue-400 focus:outline-none"
        >
          <option value="all">All topics</option>
          {SENTENCE_TOPICS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      <div className="flex justify-between text-sm text-slate-400" aria-live="polite">
        <span>{score.correct} / {score.total} correct</span>
        <span>{Math.min(index + 1, items.length)} of {items.length}</span>
      </div>

      {finished ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center">
          <p className="text-2xl font-bold">{score.correct} / {score.total} correct</p>
          <p className="mt-2 text-slate-400">Round complete.</p>
          <button onClick={() => { setRound(r => r + 1); reset(); }} className="mt-4 min-h-11 rounded-xl bg-blue-600 px-6 font-medium hover:bg-blue-500">Play again</button>
        </div>
      ) : (
        <form onSubmit={check} className="rounded-2xl border border-slate-700 bg-slate-800 p-5 sm:p-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Fill in the article · {CASE_LABEL[item.case]}</p>
          <p className="text-lg leading-loose sm:text-xl">
            {before}
            <input
              aria-label="Your answer"
              value={value}
              onChange={event => setValue(event.target.value)}
              disabled={state !== 'idle'}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={clsx(
                item.answers.some(a => a.length > 6) ? 'mx-1 w-52' : 'mx-1 w-24',
                'rounded-md border-b-2 bg-slate-900 px-2 py-0.5 text-center font-semibold focus:outline-none',
                state === 'idle' && 'border-blue-400 text-white',
                state === 'right' && 'border-emerald-400 text-emerald-300',
                state === 'wrong' && 'border-red-400 text-red-300',
              )}
            />
            {after}
          </p>
          {state === 'idle' ? (
            <div className="mt-5 flex gap-3">
              <button type="submit" disabled={!value.trim()} className="min-h-11 flex-1 rounded-xl bg-blue-600 font-medium hover:bg-blue-500 disabled:opacity-50">Check</button>
              <button type="button" onClick={giveUp} className="min-h-11 rounded-xl bg-slate-700 px-4 text-sm hover:bg-slate-600">Show answer</button>
            </div>
          ) : (
            <div className="mt-5 space-y-3" role="status">
              <p className={clsx('font-semibold', state === 'right' ? 'text-emerald-300' : 'text-red-300')}>
                {state === 'right' ? '✓ Correct!' : `✗ Answer: ${item.answers.join(' / ')}`}
              </p>
              <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-300">{item.hint}</p>
              <button type="button" onClick={next} autoFocus className="min-h-11 w-full rounded-xl bg-blue-600 py-2 font-medium hover:bg-blue-500">Next →</button>
            </div>
          )}
        </form>
      )}
      <p className="text-center text-xs text-slate-500">Type the article form that fits the case, e.g. der, die, das, dem, den, des – or im / am for contractions.</p>
    </div>
  );
};
