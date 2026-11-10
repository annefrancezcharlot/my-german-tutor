import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const LESSONS = [
  {
    to: '/lessons/articles',
    title: 'Articles & declension',
    description: 'Rules for guessing der / die / das, a practice quiz, and the adjective declension tables including the N-Deklination.',
    tags: ['Gender rules', 'Practice', 'Declension'],
  },
];

export const LessonsPage: React.FC = () => (
  <div className="mx-auto max-w-2xl space-y-6">
    <div>
      <h1 className="text-3xl font-bold">Lessons</h1>
      <p className="mt-2 text-slate-400">Interactive grammar lessons.</p>
    </div>
    <div className="space-y-3">
      {LESSONS.map(lesson => (
        <Link key={lesson.to} to={lesson.to} className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800 p-5 transition-colors hover:border-blue-400">
          <div>
            <h2 className="text-lg font-semibold">{lesson.title}</h2>
            <p className="mt-1 text-sm text-slate-400">{lesson.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {lesson.tags.map(tag => <span key={tag} className="rounded-full bg-slate-700 px-2.5 py-0.5 text-xs text-slate-300">{tag}</span>)}
            </div>
          </div>
          <ChevronRight className="shrink-0 text-slate-500" />
        </Link>
      ))}
    </div>
  </div>
);
