import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ARTICLE_FORMS, CASES, CONTRACTIONS, DECLENSION, DEMONSTRATIVE, GENDERS, N_DECLENSION } from './articleLessonData';

const GENDER_HEAD = ['text-blue-300', 'text-rose-300', 'text-emerald-300'];

/** Renders "d[em] jung[en] Mann", hiding/revealing the bracketed endings. */
const Phrase: React.FC<{ text: string; hidden: boolean }> = ({ text, hidden }) => {
  const [open, setOpen] = useState(false);
  const covered = hidden && !open;
  return (
    <button
      type="button"
      disabled={!hidden}
      onClick={() => setOpen(o => !o)}
      className={clsx('rounded px-1 text-left', hidden && 'hover:bg-slate-700')}
      aria-label={covered ? 'Tap to reveal endings' : undefined}
    >
      {text.split(/(\[[^\]]+\])/).map((part, index) => {
        if (part.startsWith('[')) {
          const ending = part.slice(1, -1);
          return covered
            ? <span key={index} className="mx-px inline-block min-w-[1.4ch] rounded bg-slate-600 text-center text-transparent">{ending}</span>
            : <span key={index} className="rounded bg-yellow-400/25 font-bold text-yellow-200">{ending}</span>;
        }
        return <span key={index}>{part}</span>;
      })}
    </button>
  );
};

const Toggle: React.FC<{ hidden: boolean; onChange: (v: boolean) => void }> = ({ hidden, onChange }) => (
  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
    <input type="checkbox" checked={hidden} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-blue-500" />
    Hide endings (tap a cell to reveal)
  </label>
);

export const Declension: React.FC = () => {
  const [tableId, setTableId] = useState(DECLENSION[0].id);
  const [hidden, setHidden] = useState(false);
  const [nHidden, setNHidden] = useState(false);
  const tables = [...DECLENSION, { id: 'demonstrative', label: 'dieser / jener / jeder / mancher', table: DEMONSTRATIVE }];
  const table = tables.find(t => t.id === tableId)!.table;

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Deklinationsformen im Singular</h2>
          <p className="mt-1 text-slate-400">Article + adjective + noun. The <span className="rounded bg-yellow-400/25 px-1 font-bold text-yellow-200">highlighted</span> endings are the ones that change.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Article type" className="flex flex-wrap gap-2">
            {tables.map(t => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tableId === t.id}
                onClick={() => setTableId(t.id)}
                className={clsx('min-h-11 rounded-full px-4 text-sm font-medium', tableId === t.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')}
              >{t.label}</button>
            ))}
          </div>
          <Toggle hidden={hidden} onChange={setHidden} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
          <table className="w-full min-w-[34rem] text-sm sm:text-base">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="p-3 font-medium text-slate-400">Kasus</th>
                {GENDERS.map((g, i) => <th key={g} className={clsx('p-3 font-semibold', GENDER_HEAD[i])}>{g}</th>)}
              </tr>
            </thead>
            <tbody>
              {CASES.map(c => (
                <tr key={`${tableId}-${c}`} className="border-b border-slate-700/60 last:border-0">
                  <th scope="row" className="p-3 text-left font-medium text-slate-300">{c}</th>
                  {table[c].map((cell, i) => (
                    <td key={i} className="p-2"><Phrase key={`${tableId}-${hidden}`} text={cell} hidden={hidden} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
          <li>With <b className="text-slate-200">der/die/das</b> the article shows the case, so the adjective mostly ends in <b className="text-yellow-200">-e</b> or <b className="text-yellow-200">-en</b>.</li>
          <li>With <b className="text-slate-200">ein-</b> there is no ending in masculine nominative and neuter nominative/accusative, so the adjective shows it (<i>ein junger Mann, ein kleines Kind</i>).</li>
          <li>With <b className="text-slate-200">no article</b> the adjective carries the endings of der/die/das (<i>jung<b>er</b> Mann</i>) – except masculine/neuter genitive, which takes <b className="text-yellow-200">-en</b>.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Der bestimmte Artikel in allen Fällen</h2>
          <p className="mt-1 text-slate-400">Masculine and neuter nouns usually add <b className="text-yellow-200">-(e)s</b> in the genitive: <i>des Mannes, des Kindes, des Museums</i>.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
            <table className="w-full min-w-[22rem] text-sm sm:text-base">
              <thead>
                <tr className="border-b border-slate-700 text-left">
                  <th className="p-3 font-medium text-slate-400">Kasus</th>
                  {GENDERS.map((g, i) => <th key={g} className={clsx('p-3 font-semibold', GENDER_HEAD[i])}>{g}</th>)}
                </tr>
              </thead>
              <tbody>
                {CASES.map(c => (
                  <tr key={c} className="border-b border-slate-700/60 last:border-0">
                    <th scope="row" className="p-3 text-left font-medium text-slate-300">{c}</th>
                    {ARTICLE_FORMS[c].map((cell, i) => <td key={i} className="p-3">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h3 className="mb-2 font-semibold">Kontraktionen</h3>
            <ul className="space-y-1 text-sm text-slate-300">
              {CONTRACTIONS.map(([full, short]) => <li key={full}>{full} = <b className="text-yellow-200">{short}</b></li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">N-Deklination</h2>
          <p className="mt-1 text-slate-400">All nouns of the N-declension are masculine. Except in the nominative singular, they get the ending <b className="text-yellow-200">-en</b> in every case. Some nouns also add an <b className="text-yellow-200">-s</b> in the genitive (<i>das Herz – des Herzens</i>).</p>
        </div>
        <Toggle hidden={nHidden} onChange={setNHidden} />
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-800">
          <table className="w-full min-w-[28rem] text-sm sm:text-base">
            <thead>
              <tr className="border-b border-slate-700 text-left">
                <th className="p-3 font-medium text-slate-400">Kasus</th>
                {N_DECLENSION.map(t => <th key={t.id} className="p-3 font-semibold text-blue-300">{t.label} · maskulin</th>)}
              </tr>
            </thead>
            <tbody>
              {CASES.map(c => (
                <tr key={c} className="border-b border-slate-700/60 last:border-0">
                  <th scope="row" className="p-3 text-left font-medium text-slate-300">{c}</th>
                  {N_DECLENSION.map(t => <td key={t.id} className="p-2"><Phrase key={String(nHidden)} text={t.cells[c]} hidden={nHidden} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
