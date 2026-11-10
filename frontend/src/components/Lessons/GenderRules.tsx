import React, { useState } from 'react';
import { clsx } from 'clsx';
import { ARTICLE_COLORS, ARTICLE_RULES, RULE_GROUPS, splitExample } from './articleLessonData';
import type { RuleGroupId } from './articleLessonData';

const GROUP_STYLES: Record<RuleGroupId, { tab: string; badge: string }> = {
  masculine: { tab: 'bg-blue-600 text-white', badge: 'bg-blue-500/20 text-blue-200' },
  feminine: { tab: 'bg-rose-600 text-white', badge: 'bg-rose-500/20 text-rose-200' },
  neuter: { tab: 'bg-emerald-600 text-white', badge: 'bg-emerald-500/20 text-emerald-200' },
  tricky: { tab: 'bg-amber-600 text-white', badge: 'bg-amber-500/20 text-amber-200' },
};

const NEUTRAL_CHIP = 'border-slate-600 bg-slate-900 text-slate-200 hover:border-slate-400';

export const GenderRules: React.FC = () => {
  const [group, setGroup] = useState<RuleGroupId>('masculine');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [revealAll, setRevealAll] = useState(true);

  const rules = ARTICLE_RULES.filter(rule => rule.group === group);
  const groupInfo = RULE_GROUPS.find(g => g.id === group)!;

  const toggle = (key: string) => setRevealed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Gender" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RULE_GROUPS.map(g => (
          <button
            key={g.id}
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={clsx(
              'min-h-11 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
              group === g.id ? GROUP_STYLES[g.id].tab : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
            )}
          >
            <span className="block">{g.label}</span>
            <span className="block text-xs font-normal opacity-80">{g.article}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-slate-400">{groupInfo.blurb} · {rules.length} rules</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={revealAll}
            onChange={event => { setRevealAll(event.target.checked); setRevealed(new Set()); }}
            className="h-4 w-4 accent-blue-500"
          />
          Show articles
        </label>
      </div>
      {!revealAll && <p className="-mt-3 text-sm text-slate-400">Self-test mode: guess the article, then tap a word to check it.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {rules.map(rule => (
          <article key={rule.id} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <div className="flex items-start gap-3">
              <span className={clsx('mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-xs font-bold', GROUP_STYLES[rule.group].badge)}>{rule.number}</span>
              <h3 className="font-semibold leading-snug">{rule.title}</h3>
            </div>
            <div className="mt-3 space-y-3">
              {rule.sections.map((section, sectionIndex) => (
                <div key={sectionIndex}>
                  {section.label && <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{section.label}</p>}
                  <div className="flex flex-wrap gap-2">
                    {section.examples.map(example => {
                      const { article, noun } = splitExample(example);
                      const key = `${rule.id}:${example}`;
                      const shown = revealAll || revealed.has(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => !revealAll && toggle(key)}
                          aria-label={shown ? example : `${noun} – tap to reveal article`}
                          className={clsx(
                            'rounded-lg border px-2.5 py-1 text-sm transition-colors',
                            shown ? ARTICLE_COLORS[article].chip : NEUTRAL_CHIP,
                            revealAll && 'cursor-default',
                          )}
                        >
                          {shown ? <><span className="font-bold">{article}</span> {noun}</> : <><span className="text-slate-500">?</span> {noun}</>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {rule.exceptions && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-amber-300">But (exceptions)</p>
                <div className="flex flex-wrap gap-2">
                  {rule.exceptions.map(example => {
                    const { article, noun } = splitExample(example);
                    const key = `${rule.id}:exc:${example}`;
                    const shown = revealAll || revealed.has(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => !revealAll && toggle(key)}
                        aria-label={shown ? `Exception: ${example}` : `Exception: ${noun} – tap to reveal article`}
                        className={clsx('rounded-lg border border-dashed px-2.5 py-1 text-sm transition-colors', shown ? ARTICLE_COLORS[article].chip : NEUTRAL_CHIP, revealAll && 'cursor-default')}
                      >
                        {shown ? <><span className="font-bold">{article}</span> {noun}</> : <><span className="text-slate-500">?</span> {noun}</>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {rule.note && <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200">⚠ {rule.note}</p>}
          </article>
        ))}
      </div>
    </div>
  );
};
