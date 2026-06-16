import React from 'react';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { TimelineEntry } from '../../types';

interface Props { timeline: TimelineEntry[]; }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-white mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-bold">
            {p.value != null ? p.value : '—'}
            {p.dataKey === 'score' && p.value != null ? ' pts' : ''}
            {p.dataKey === 'words' && p.value != null ? ' words' : ''}
          </span>
        </div>
      ))}
    </div>
  );
};

export const ProgressChart: React.FC<Props> = ({ timeline }) => {
  const data = timeline.map((t, i) => ({
    name: `G${i + 1}`,
    topic: t.topic.length > 22 ? t.topic.slice(0, 22) + '…' : t.topic,
    words: t.learner_word_count,
    score:  t.score != null ? Math.round(t.score) : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis
          dataKey="name"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={{ stroke: '#475569' }}
          tickLine={false}
        />
        <YAxis
          yAxisId="length"
          orientation="left"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="score"
          orientation="right"
          domain={[0, 100]}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(v) => (
            <span className="text-xs text-slate-300">{v}</span>
          )}
        />
        <Bar
          yAxisId="length"
          dataKey="words"
          name="Words"
          fill="#14b8a6"
          opacity={0.7}
          radius={[3, 3, 0, 0]}
          maxBarSize={32}
        />
        <Line
          yAxisId="score"
          dataKey="score"
          name="Score"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', r: 4 }}
          activeDot={{ r: 6 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};
