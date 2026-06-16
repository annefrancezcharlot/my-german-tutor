import React, { useState } from 'react';
import type { ErrorDetail } from '../../types';
import { ERROR_CATEGORY_COLORS, ERROR_CATEGORY_LABELS } from '../../types';
import { X, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  corrections: ErrorDetail[];
  onClose: () => void;
}

export const CorrectionPanel: React.FC<Props> = ({ corrections, onClose }) => {
  const [expanded, setExpanded] = useState<number | null>(0);

  if (corrections.length === 0) return null;

  return (
    <div className="w-80 flex flex-col bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-400" />
          <span className="font-semibold text-white text-sm">
            {corrections.length} mistakes found
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors p-1 rounded"
        >
          <X size={16} />
        </button>
      </div>

      {/* Correction list */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-700">
        {corrections.map((corr, idx) => {
          const color = ERROR_CATEGORY_COLORS[corr.category] || '#6b7280';
          const label = ERROR_CATEGORY_LABELS[corr.category] || corr.category;
          const isOpen = expanded === idx;

          return (
            <div key={idx} className="p-3">
              {/* Category badge */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: color + '33', color }}
                >
                  {label}
                  {corr.subcategory && ` · ${corr.subcategory}`}
                </span>
                <button
                  onClick={() => setExpanded(isOpen ? null : idx)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>

              {/* Original → Corrected */}
              <div className="space-y-1 mb-2">
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-red-400 font-mono shrink-0 mt-0.5">✗</span>
                  <span className="text-red-300 line-through leading-relaxed">
                    {corr.original}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-green-400 font-mono shrink-0 mt-0.5">✓</span>
                  <span className="text-green-300 font-semibold leading-relaxed">
                    {corr.corrected}
                  </span>
                </div>
              </div>

              {/* Explanation (expandable) */}
              {isOpen && (
                <div className="mt-2 p-2.5 bg-slate-900 rounded-lg text-xs text-slate-300 leading-relaxed border border-slate-600">
                  {corr.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="px-4 py-2 bg-slate-900 border-t border-slate-700">
        <div className="flex flex-wrap gap-1">
          {Array.from(new Set(corrections.map(c => c.category))).map(cat => (
            <span
              key={cat}
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: (ERROR_CATEGORY_COLORS[cat] || '#6b7280') + '22',
                color: ERROR_CATEGORY_COLORS[cat] || '#6b7280',
              }}
            >
              {ERROR_CATEGORY_LABELS[cat] || cat}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
