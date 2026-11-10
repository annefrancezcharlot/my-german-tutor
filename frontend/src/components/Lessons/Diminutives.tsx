import React, { useState } from 'react';
import { clsx } from 'clsx';
import { DIMINUTIVES } from './lessonPracticeData';

const fold = (value: string) => value.trim().toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/^das\s+/, '');

const RULES = [
  { title: 'Always das', body: 'Every diminutive is neuter – even for people and animals: das Mädchen, das Fräulein, das Kätzchen.' },
  { title: 'Endings -chen and -lein', body: '-chen is the everyday ending; -lein is more poetic or old-fashioned and often follows -ch, -g, -ng (Bächlein, Tüchlein).' },
  { title: 'a, o, u → ä, ö, ü', body: 'The vowel usually gets an umlaut: Hut → Hütchen, Haus → Häuschen, Katze → Kätzchen.' },
  { title: 'Final -e / -en drops', body: 'Tasche → Täschchen, Wolke → Wölkchen, Faden → Fädchen, Tropfen → Tröpfchen.' },
];

const WATCH_OUT = [
  ['das Hähnchen', 'A Hähnchen is a roast chicken on the plate – not a small Hahn.'],
  ['das Brötchen', 'A Brötchen is a bread roll – not the same as a kleines Brot.'],
  ['ein Wörtchen mit jdm. reden', 'Means to scold someone, not to say a little word.'],
];

export const Diminutives: React.FC = () => {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * DIMINUTIVES.length));
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'right' | 'wrong'>('idle');
  const [score, setScore] = useState({ correct: 0, total: 0 });

  const item = DIMINUTIVES[index];

  const check = (event: React.FormEvent) => {
    event.preventDefault();
    if (state !== 'idle' || !value.trim()) return;
    const ok = item.answers.some(a => fold(a) === fold(value));
    setState(ok ? 'right' : 'wrong');
    setScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1 }));
  };

  const next = () => {
    let nextIndex = index;
    while (DIMINUTIVES.length > 1 && nextIndex === index) nextIndex = Math.floor(Math.random() * DIMINUTIVES.length);
    setIndex(nextIndex); setValue(''); setState('idle');
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Diminutive (Verkleinerungsformen)</h2>
          <p className="mt-1 text-slate-400">The diminutive endings <b className="text-yellow-200">-chen</b> and <b className="text-yellow-200">-lein</b> turn any noun into a neuter noun.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {RULES.map(rule => (
            <div key={rule.title} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h3 className="font-semibold text-emerald-300">{rule.title}</h3>
              <p className="mt-1 text-sm text-slate-300">{rule.body}</p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="font-semibold">The article changes, the adjective follows the new gender</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm sm:text-base">
              <tbody>
                <tr className="border-b border-slate-700/60"><td className="py-2 pr-3 text-rose-300">die schwarze Katze</td><td className="text-emerald-300">das schwarze Kätzchen</td><td className="text-slate-300">ein schwarzes Kätzchen</td></tr>
                <tr className="border-b border-slate-700/60"><td className="py-2 pr-3 text-blue-300">der kleine Hund</td><td className="text-emerald-300">das kleine Hündchen</td><td className="text-slate-300">ein kleines Hündchen</td></tr>
                <tr><td className="py-2 pr-3 text-blue-300">der rote Apfel</td><td className="text-emerald-300">das rote Äpfelchen</td><td className="text-slate-300">ein rotes Äpfelchen</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h3 className="font-semibold text-amber-200">Watch out</h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-100">
            {WATCH_OUT.map(([term, text]) => <li key={term}><b>{term}</b> – {text}</li>)}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-xl space-y-4">
        <h2 className="text-xl font-bold">Make it small</h2>
        <div className="flex justify-between text-sm text-slate-400" aria-live="polite"><span>{score.correct} / {score.total} correct</span></div>
        <form onSubmit={check} className="rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center">
          <p className="text-sm text-slate-400">Form the diminutive (umlauts optional: ae = ä)</p>
          <p className="my-4 text-3xl font-bold">{item.base}</p>
          <p className="text-slate-500">→ das</p>
          <input
            aria-label="Diminutive"
            value={value}
            onChange={event => setValue(event.target.value)}
            disabled={state !== 'idle'}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={clsx(
              'mt-2 w-full max-w-xs rounded-lg border bg-slate-900 px-4 py-3 text-center text-xl focus:outline-none focus:ring-2',
              state === 'idle' && 'border-slate-600 focus:ring-blue-400',
              state === 'right' && 'border-emerald-400 text-emerald-300',
              state === 'wrong' && 'border-red-400 text-red-300',
            )}
          />
          {state === 'idle' ? (
            <button type="submit" disabled={!value.trim()} className="mt-4 block min-h-11 w-full rounded-xl bg-blue-600 font-medium hover:bg-blue-500 disabled:opacity-50">Check</button>
          ) : (
            <div className="mt-4 space-y-3" role="status">
              <p className={clsx('font-semibold', state === 'right' ? 'text-emerald-300' : 'text-red-300')}>
                {state === 'right' ? '✓ Correct!' : '✗ '}{state === 'wrong' || item.answers.length > 1 ? `das ${item.answers.join(' / das ')}` : ''}
              </p>
              <button type="button" onClick={next} autoFocus className="min-h-11 w-full rounded-xl bg-blue-600 py-2 font-medium hover:bg-blue-500">Next →</button>
            </div>
          )}
        </form>
      </section>
    </div>
  );
};
