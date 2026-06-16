import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import {
  BookOpenCheck,
  Filter,
  GraduationCap,
  Loader2,
  MessageSquarePlus,
  Search,
  Sparkles,
} from 'lucide-react';
import { askTeacher, getTeacherRules } from '../../api';
import type { TeacherRule, User } from '../../types';
import { ERROR_CATEGORY_LABELS } from '../../types';

interface Props {
  user: User;
}

const categoryLabels: Record<string, string> = {
  ...ERROR_CATEGORY_LABELS,
  pronunciation: 'Pronunciation',
};

const categoryOptions = [
  'grammar',
  'vocabulary',
  'word_order',
  'case',
  'gender',
  'verb_conjugation',
  'preposition',
  'tense',
  'spelling',
  'punctuation',
  'style',
  'pronunciation',
  'other',
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const AskTeacherPage: React.FC<Props> = ({ user }) => {
  const [rules, setRules] = useState<TeacherRule[]>([]);
  const [question, setQuestion] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRules = async () => {
      setLoading(true);
      setError(null);
      try {
        setRules(await getTeacherRules());
      } catch {
        setError('Rules could not be loaded.');
      } finally {
        setLoading(false);
      }
    };

    loadRules();
  }, [user.id]);

  const ruleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rules.forEach(rule => {
      counts[rule.category] = (counts[rule.category] ?? 0) + 1;
    });
    return counts;
  }, [rules]);

  const filteredRules = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return rules.filter(rule => {
      const categoryMatches = activeCategory === 'all' || rule.category === activeCategory;
      if (!categoryMatches) return false;
      if (!normalizedSearch) return true;

      const searchable = [
        rule.title,
        rule.question,
        rule.short_answer,
        rule.explanation,
        ...(rule.related_terms ?? []),
      ].join(' ').toLowerCase();
      return searchable.includes(normalizedSearch);
    });
  }, [activeCategory, rules, searchTerm]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanQuestion = question.trim();
    if (!cleanQuestion || asking) return;

    setAsking(true);
    setError(null);
    try {
      const newRule = await askTeacher(cleanQuestion);
      setRules(currentRules => [newRule, ...currentRules]);
      setActiveCategory(newRule.category);
      setQuestion('');
    } catch {
      setError('The question could not be answered.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-3xl font-bold text-white">Ask the teacher</h1>
        <p className="text-sm text-slate-400">
          Ask a question about grammar, wording, style, or precision and save the answer as a rule.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <label htmlFor="teacher-question" className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
          <GraduationCap size={18} className="text-cyan-300" />
          Question for the teacher
        </label>
        <textarea
          id="teacher-question"
          value={question}
          onChange={event => setQuestion(event.target.value)}
          disabled={asking}
          rows={4}
          maxLength={1200}
          placeholder="e.g. When do I use trotzdem instead of obwohl? Or: What is the difference between sich gewöhnen an and sich angewöhnen?"
          className="w-full resize-none rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">{question.length}/1200</div>
          <button
            type="submit"
            disabled={!question.trim() || asking}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {asking ? <Loader2 size={16} className="animate-spin" /> : <MessageSquarePlus size={16} />}
            {asking ? 'Asking...' : 'Ask question'}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Filter size={17} className="text-orange-300" />
            Saved rules
          </div>

          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search rules"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              activeCategory === 'all'
                ? 'bg-orange-500 text-slate-950'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-700 hover:text-white',
            )}
          >
            All ({rules.length})
          </button>
          {categoryOptions.map(category => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveCategory(category)}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                activeCategory === category
                  ? 'bg-orange-500 text-slate-950'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-700 hover:text-white',
              )}
            >
              {categoryLabels[category] ?? category} ({ruleCounts[category] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-44 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800 text-slate-300">
          <Loader2 size={22} className="mr-2 animate-spin" />
          Loading rules...
        </div>
      ) : filteredRules.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 p-10 text-center">
          <BookOpenCheck size={32} className="mx-auto mb-3 text-slate-500" />
          <div className="mb-1 font-semibold text-white">No rules found</div>
          <p className="text-sm text-slate-400">
            Ask a question above or change the filter.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRules.map(rule => (
            <TeacherRuleCard key={rule.id} rule={rule} />
          ))}
        </div>
      )}
    </div>
  );
};

const TeacherRuleCard: React.FC<{ rule: TeacherRule }> = ({ rule }) => (
  <article className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800">
    <div className="border-b border-slate-700 bg-slate-900 px-5 py-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/15 px-2.5 py-1 text-xs font-semibold text-cyan-200">
              <Sparkles size={13} />
              {categoryLabels[rule.category] ?? rule.category}
            </span>
            <span className="text-xs text-slate-500">{formatDate(rule.created_at)}</span>
          </div>
          <h2 className="text-lg font-semibold text-white">{rule.title}</h2>
        </div>
      </div>
    </div>

    <div className="space-y-4 p-5">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Question</div>
        <p className="text-sm leading-relaxed text-slate-300">{rule.question}</p>
      </div>

      <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
        <div className="mb-1 text-xs font-semibold uppercase text-blue-200">Short answer</div>
        <p className="text-sm leading-relaxed text-white">{rule.short_answer}</p>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Rule</div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{rule.explanation}</p>
      </div>

      {rule.examples.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {rule.examples.map((example, index) => (
            <div key={`${rule.id}-${index}`} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3">
              <p className="text-sm font-medium leading-relaxed text-white">{example.german}</p>
              {example.english && (
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{example.english}</p>
              )}
              {example.note && (
                <p className="mt-2 text-xs leading-relaxed text-cyan-200">{example.note}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {rule.related_terms.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {rule.related_terms.map(term => (
            <span key={term} className="rounded-full bg-slate-900 px-2.5 py-1 text-xs text-slate-300">
              {term}
            </span>
          ))}
        </div>
      )}
    </div>
  </article>
);
