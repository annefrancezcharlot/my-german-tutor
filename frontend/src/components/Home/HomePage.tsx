import React, { useState } from 'react';
import axios from 'axios';
import { BarChart2, BookOpen, Languages, MessageSquare, Sparkles, Wand2 } from 'lucide-react';
import type { SignUpProfile } from '../../api';

interface Props {
  onLogin: (
    email: string,
    password: string,
    mode: 'sign-in' | 'sign-up',
    profile?: SignUpProfile,
  ) => Promise<void>;
}

export const HomePage: React.FC<Props> = ({ onLogin }) => {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [level, setLevel] = useState<SignUpProfile['level']>('B2');
  const [germanVariant, setGermanVariant] = useState<SignUpProfile['german_variant']>('de-DE');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (mode === 'sign-up' && !username.trim()) return;

    setLoading(true);
    setError('');

    try {
      await onLogin(
        email.trim(),
        password,
        mode,
        mode === 'sign-up'
          ? {
            username: username.trim(),
            level,
            german_variant: germanVariant,
          }
          : undefined,
      );
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === 'string' ? detail : 'Sign in failed.');
      } else {
        setError(err instanceof Error ? err.message : 'Sign in failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const signupDisabled = mode === 'sign-up' && !username.trim();

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col items-center justify-center gap-8">
        <section>
          <div className="mb-8 inline-flex items-center gap-2 rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-sm font-semibold text-blue-200">
            <Languages size={16} />
            My German Tutor
          </div>
          <h1 className="max-w-3xl text-5xl font-bold leading-tight text-white">
            My German Tutor
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-300">
            Practice German with real conversations, personal feedback, and exercises built from your own mistakes.
          </p>

          <div className="mt-10 grid gap-3 md:grid-cols-5">
            {[
              {
                icon: <MessageSquare size={20} />,
                title: 'Real conversations',
              },
              {
                icon: <BookOpen size={20} />,
                title: 'Mistake-based exercises',
              },
              {
                icon: <Wand2 size={20} />,
                title: 'Style Change',
              },
              {
                icon: <Sparkles size={20} />,
                title: 'Thematic words',
              },
              {
                icon: <BarChart2 size={20} />,
                title: 'Statistics',
              },
            ].map(f => (
              <div key={f.title} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 p-3 md:block">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white md:mb-3">
                  {f.icon}
                </div>
                <div className="text-sm font-semibold leading-snug text-white">{f.title}</div>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="mb-6 text-center text-xl font-bold text-white">
              {mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </h2>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('sign-in')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  mode === 'sign-in'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setMode('sign-up')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  mode === 'sign-up'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Sign up
              </button>
            </div>
            {mode === 'sign-up' && (
              <>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Username"
                  className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-white outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
                  required
                />
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Level</span>
                    <select
                      value={level}
                      onChange={e => setLevel(e.target.value as SignUpProfile['level'])}
                      className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-3 text-white outline-none transition-colors focus:border-blue-500"
                    >
                      <option value="B1">B1</option>
                      <option value="B2">B2</option>
                      <option value="C1">C1</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold uppercase text-slate-400">Dialect</span>
                    <select
                      value={germanVariant}
                      onChange={e => setGermanVariant(e.target.value as SignUpProfile['german_variant'])}
                      className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-3 text-white outline-none transition-colors focus:border-blue-500"
                    >
                      <option value="de-DE">Germany</option>
                      <option value="de-CH">Switzerland</option>
                      <option value="de-AT">Austria</option>
                    </select>
                  </label>
                </div>
              </>
            )}
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-white outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
              required
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="mb-4 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-white outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500"
              minLength={6}
              required
            />
            {error && (
              <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password || signupDisabled}
              className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:bg-slate-600"
            >
              {loading ? 'Loading…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
