import React from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ActivityTimelineEntry } from '../../types';

interface Props { entries: ActivityTimelineEntry[]; series?: 'all' | 'conversations' | 'exercises' | 'flashcardSets'; }

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-semibold text-white">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export const ActivityChart: React.FC<Props> = ({ entries, series = 'all' }) => {
  const data = entries.map(entry => ({
    day: formatDay(entry.date),
    conversations: entry.conversations,
    exercises: entry.exercises,
    flashcardSets: entry.flashcard_sets,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="day"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={{ stroke: '#475569' }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />

        {(series === 'all' || series === 'conversations') && <Line
          type="monotone"
          dataKey="conversations"
          name="Conversations"
          stroke="#38bdf8"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />}
        {(series === 'all' || series === 'exercises') && <Line
          type="monotone"
          dataKey="exercises"
          name="Exercises"
          stroke="#a78bfa"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />}
        {(series === 'all' || series === 'flashcardSets') && <Line
          type="monotone"
          dataKey="flashcardSets"
          name="Card sets"
          stroke="#fb923c"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />}
      </LineChart>
    </ResponsiveContainer>
  );
};
