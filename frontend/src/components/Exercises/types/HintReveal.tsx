import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props {
  label: string;
  children: React.ReactNode;
}

export const HintReveal: React.FC<Props> = ({ label, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-3">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 transition-colors hover:text-white"
      >
        {isOpen ? <EyeOff size={13} /> : <Eye size={13} />}
        {isOpen ? `${label} verbergen` : `${label} anzeigen`}
      </button>

      {isOpen && (
        <div className="mt-2 text-xs leading-relaxed text-slate-300">
          {children}
        </div>
      )}
    </div>
  );
};
