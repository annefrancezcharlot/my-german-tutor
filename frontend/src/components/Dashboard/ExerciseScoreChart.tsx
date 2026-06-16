import React from 'react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { ExerciseTimelineEntry } from '../../types';
import { ERROR_CATEGORY_COLORS, ERROR_CATEGORY_LABELS } from '../../types';

interface Props { entries: ExerciseTimelineEntry[]; }

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <div className="mb-1 font-semibold text-white">{label}</div>
      {payload
        .filter((p: any) => p.value != null)
        .map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{p.name}</span>
            <span className="font-bold">{Math.round(p.value)} pts</span>
          </div>
        ))}
    </div>
  );
};

export const ExerciseScoreChart: React.FC<Props> = ({ entries }) => {
  const categories = Array.from(new Set(entries.map(entry => entry.category)));
  const grouped = new Map<string, Record<string, number | string>>();

  entries.forEach(entry => {
    const day = formatDay(entry.date);
    const countKey = `${entry.category}_count`;
    const row = grouped.get(day) ?? { day };
    row[entry.category] = Number(row[entry.category] ?? 0) + entry.score;
    row[countKey] = Number(row[countKey] ?? 0) + 1;
    grouped.set(day, row);
  });

  const data = Array.from(grouped.values()).map(row => {
    const averaged = { ...row };
    categories.forEach(category => {
      const count = Number(row[`${category}_count`] ?? 0);
      if (count > 0) {
        averaged[category] = Math.round(Number(row[category]) / count);
      }
      delete averaged[`${category}_count`];
    });
    return averaged;
  });

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
          domain={[0, 100]}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend formatter={value => <span className="text-xs text-slate-300">{ERROR_CATEGORY_LABELS[String(value)] ?? value}</span>} />
        {categories.map(category => (
          <Line
            key={category}
            type="monotone"
            dataKey={category}
            name={ERROR_CATEGORY_LABELS[category] ?? category}
            stroke={ERROR_CATEGORY_COLORS[category] ?? '#94a3b8'}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};
