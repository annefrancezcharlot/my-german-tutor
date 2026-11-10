import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { GenderRules } from './GenderRules';
import { RulePractice } from './RulePractice';
import { Declension } from './Declension';
import { SentenceDrills } from './SentenceDrills';
import { Diminutives } from './Diminutives';
import { Extras } from './Extras';

const TABS = [
  { id: 'rules', label: 'Gender rules' },
  { id: 'practice', label: 'Practice' },
  { id: 'sentences', label: 'Sentences' },
  { id: 'diminutives', label: 'Diminutives' },
  { id: 'declension', label: 'Declension' },
  { id: 'extras', label: 'Extras' },
] as const;

export const ArticleLessonPage: React.FC = () => {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('rules');

  return (
    <div className="space-y-6">
      <div>
        <Link to="/lessons" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16} /> All lessons</Link>
        <h1 className="text-3xl font-bold">Articles &amp; declension</h1>
        <p className="mt-2 text-slate-400">
          Hilfen für die Artikelbestimmung: the article is rarely visible from the noun itself, so always learn it together with the noun.
          These rules help, but there are many exceptions.
        </p>
      </div>
      <div role="tablist" aria-label="Lesson sections" className="flex gap-1 overflow-x-auto rounded-xl bg-slate-800 p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={clsx('min-h-11 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors', tab === t.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700')}
          >{t.label}</button>
        ))}
      </div>
      {tab === 'rules' && <GenderRules />}
      {tab === 'practice' && <RulePractice />}
      {tab === 'sentences' && <SentenceDrills />}
      {tab === 'diminutives' && <Diminutives />}
      {tab === 'declension' && <Declension />}
      {tab === 'extras' && <Extras />}
    </div>
  );
};
