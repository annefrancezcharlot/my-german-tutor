import React, { useState } from 'react';
import { lookupNoun } from '../../api';
import type { NounResult } from '../../api';

export const ArticleLookupPage: React.FC = () => {
  const [word, setWord] = useState('');
  const [searchedWord, setSearchedWord] = useState('');
  const [results, setResults] = useState<NounResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const query = word.trim();
    if (!query || loading) return;
    setLoading(true);
    setError('');
    setResults(null);
    setSearchedWord(query);
    try {
      setResults(await lookupNoun(query));
    } catch {
      setError('Could not look up this word. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Der Die Das</h1>
        <p className="mt-2 text-slate-400">Find the article for a German noun from the dictionary. No AI involved.</p>
      </div>
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <label htmlFor="noun-word" className="mb-2 block font-medium">German noun</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="noun-word"
            value={word}
            onChange={event => setWord(event.target.value)}
            placeholder="e.g. Haus, Schule, Tisch"
            maxLength={200}
            disabled={loading}
            className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-4 py-3 text-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button type="submit" disabled={!word.trim() || loading} className="rounded-lg bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? 'Looking up…' : 'Find article'}
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-400">Enter the singular form without an article. Capitalization doesn’t matter.</p>
      </form>
      {error && <p role="alert" className="text-red-300">{error}</p>}
      <div aria-live="polite" aria-busy={loading} className="space-y-3">
        {results?.length === 0 && (
          <p className="rounded-xl border border-slate-700 bg-slate-800 p-5 text-slate-300">
            No entry found for “{searchedWord}”. Check the spelling and use the singular form. Some words may be missing from the dictionary.
          </p>
        )}
        {results && results.length > 1 && <p className="text-slate-300">This noun has multiple articles in the dictionary. Usage can depend on meaning or region.</p>}
        {results?.map(result => (
          <div key={`${result.singular}-${result.article}`} className="rounded-xl border border-slate-700 bg-slate-800 p-5">
            <p className="text-3xl font-bold"><span className="text-blue-300">{result.article}</span> {result.singular}</p>
            {result.plural && <p className="mt-2 text-slate-400">Plural: {result.plural}</p>}
          </div>
        ))}
      </div>
    </div>
  );
};
