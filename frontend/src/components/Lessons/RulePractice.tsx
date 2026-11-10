import React, { useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ARTICLE_COLORS, ARTICLE_RULES, RULE_GROUPS, splitExample } from './articleLessonData';
import type { Article, RuleGroupId } from './articleLessonData';
import { WORD_SETS } from './lessonPracticeData';

interface Question { noun: string; article: Article; hint: string }

const ARTICLES: Article[] = ['der', 'die', 'das'];

type Source = 'all' | RuleGroupId | `set:${string}`;

function buildPool(source: Source): Question[] {
  if (source.startsWith('set:')) {
    const set = WORD_SETS.find(w => w.id === source.slice(4));
    return (set?.words ?? []).map(word => ({ ...splitExample(word), hint: set!.hint }));
  }
  return ARTICLE_RULES
    .filter(rule => source === 'all' || rule.group === source)
    .flatMap(rule => [
      ...rule.sections.flatMap(section => section.examples),
      ...(rule.exceptions ?? []),
    ].map(example => ({ ...splitExample(example), hint: `Rule ${rule.number}: ${rule.title}` })))
    .filter(q => !/\d/.test(q.noun) && !q.noun.includes(' von '));
}

function pick(pool: Question[], avoid?: Question): Question {
  if (pool.length === 1) return pool[0];
  let next: Question;
  do { next = pool[Math.floor(Math.random() * pool.length)]; } while (avoid && next.noun === avoid.noun);
  return next;
}

export const RulePractice: React.FC = () => {
  const [source, setSource] = useState<Source>('all');
  const pool = useMemo(() => buildPool(source), [source]);
  const [question, setQuestion] = useState<Question>(() => pick(buildPool('all')));
  const [answer, setAnswer] = useState<Article | null>(null);
  const [score, setScore] = useState({ correct: 0, total: 0, streak: 0 });

  const correct = answer === question.article;

  const changeSource = (next: Source) => {
    setSource(next);
    setAnswer(null);
    setQuestion(pick(buildPool(next)));
  };

  const choose = (article: Article) => {
    if (answer) return;
    setAnswer(article);
    const ok = article === question.article;
    setScore(s => ({ correct: s.correct + (ok ? 1 : 0), total: s.total + 1, streak: ok ? s.streak + 1 : 0 }));
  };

  const next = () => { setAnswer(null); setQuestion(pick(pool, question)); };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="space-y-2">
        <label htmlFor="practice-source" className="block text-sm font-medium text-slate-300">What do you want to practise?</label>
        <select
          id="practice-source"
          value={source}
          onChange={event => changeSource(event.target.value as Source)}
          className="min-h-11 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 text-white focus:border-blue-400 focus:outline-none"
        >
          <option value="all">All rules</option>
          <optgroup label="By gender rules">
            {RULE_GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </optgroup>
          <optgroup label="By topic">
            {WORD_SETS.map(w => <option key={w.id} value={`set:${w.id}`}>{w.label}</option>)}
          </optgroup>
        </select>
      </div>

      <div className="flex justify-between text-sm text-slate-400" aria-live="polite">
        <span>{score.correct} / {score.total} correct</span>
        <span>Streak: {score.streak} 🔥</span>
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center">
        <p className="text-sm text-slate-400">Which article?</p>
        <p className="my-4 text-4xl font-bold">
          <span className={clsx('inline-block min-w-[2.5ch]', answer ? ARTICLE_COLORS[question.article].text : 'text-slate-500')}>{answer ? question.article : '?'}</span>{' '}
          {question.noun}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {ARTICLES.map(article => (
            <button
              key={article}
              onClick={() => choose(article)}
              disabled={!!answer}
              className={clsx(
                'min-h-12 rounded-xl py-3 text-lg font-bold transition-colors',
                !answer && 'bg-slate-700 hover:bg-slate-600',
                answer && article === question.article && ARTICLE_COLORS[article].solid,
                answer && article !== question.article && article === answer && 'bg-red-700',
                answer && article !== question.article && article !== answer && 'bg-slate-700 opacity-40',
              )}
            >{article}</button>
          ))}
        </div>

        {answer && (
          <div className="mt-5 space-y-3 text-left" role="status">
            <p className={clsx('font-semibold', correct ? 'text-emerald-300' : 'text-red-300')}>
              {correct ? '✓ Correct!' : `✗ It's ${question.article} ${question.noun}.`}
            </p>
            <p className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-slate-300">{question.hint}</p>
            <button onClick={next} className="min-h-11 w-full rounded-xl bg-blue-600 py-2 font-medium hover:bg-blue-500">Next word →</button>
          </div>
        )}
      </div>
      <p className="text-center text-xs text-slate-500">Rules have exceptions – always learn the article with the noun.</p>
    </div>
  );
};
