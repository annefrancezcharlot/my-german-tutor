import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fr } from './fr';

/**
 * Lightweight interface translation.
 *
 * Source strings are written in English and used as keys: `t('Log out')`.
 * French translations live in `fr.ts`; a missing entry falls back to English.
 * Placeholders use braces: `t('Level {level}', { level: 'B2' })`.
 */

export type Language = 'en' | 'fr';

export const LANGUAGES: { code: Language; label: string; name: string }[] = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'fr', label: 'FR', name: 'Français' },
];

const STORAGE_KEY = 'german_ui_language';

type Params = Record<string, string | number>;

const dictionaries: Record<Language, Record<string, string>> = { en: {}, fr };

function readStoredLanguage(): Language | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'fr' ? stored : null;
  } catch {
    return null;
  }
}

function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const lang of preferred) {
    const code = lang?.toLowerCase().slice(0, 2);
    if (code === 'fr') return 'fr';
    if (code === 'en') return 'en';
  }
  return 'en';
}

export function getInitialLanguage(): Language {
  return readStoredLanguage() ?? detectBrowserLanguage();
}

// Module-level copy so non-React code (the API client) can read the current language.
let currentLanguage: Language = getInitialLanguage();

export function getCurrentLanguage(): Language {
  return currentLanguage;
}

export function translate(language: Language, key: string, params?: Params): string {
  const template = dictionaries[language][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translate with the current language outside React components. */
export function tr(key: string, params?: Params): string {
  return translate(currentLanguage, key, params);
}

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: Params) => string;
  /** BCP 47 locale for dates and numbers. */
  locale: string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => undefined,
  t: (key, params) => translate('en', key, params),
  locale: 'en-GB',
});

export const LanguageProvider: React.FC<{ children: React.ReactNode; initialLanguage?: Language }> = ({
  children,
  initialLanguage,
}) => {
  const [language, setLanguageState] = useState<Language>(initialLanguage ?? currentLanguage);
  currentLanguage = language;

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    currentLanguage = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this visit.
    }
    setLanguageState(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key, params) => translate(language, key, params),
    locale: language === 'fr' ? 'fr-CH' : 'en-GB',
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
