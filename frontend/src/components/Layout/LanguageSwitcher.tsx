import React from 'react';
import { Languages } from 'lucide-react';
import { clsx } from 'clsx';
import { LANGUAGES, useI18n } from '../../i18n';

interface Props {
  className?: string;
}

/** Segmented EN / FR toggle for the interface language. */
export const LanguageSwitcher: React.FC<Props> = ({ className }) => {
  const { language, setLanguage, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t('Interface language')}
      className={clsx('inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-900/60 p-0.5', className)}
    >
      <Languages size={15} aria-hidden="true" className="ml-1.5 mr-0.5 text-slate-400" />
      {LANGUAGES.map(option => (
        <button
          key={option.code}
          type="button"
          lang={option.code}
          onClick={() => setLanguage(option.code)}
          aria-pressed={language === option.code}
          title={option.name}
          className={clsx(
            'rounded-md px-2 py-1 text-xs font-bold transition-colors',
            language === option.code
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-slate-700 hover:text-white',
          )}
        >
          <span aria-hidden="true">{option.label}</span>
          <span className="sr-only">{option.name}</span>
        </button>
      ))}
    </div>
  );
};
