import axios from 'axios';

export const MAX_FLASHCARD_TERMS = 30;

export const parseFlashcardTerms = (value: string): string[] => {
  const terms = value
    .split(/[,;\n]+/)
    .map(term => term.trim())
    .filter(Boolean);
  const seen = new Set<string>();

  return terms.filter(term => {
    const key = term.toLocaleLowerCase('de-DE');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const flashcardRequestErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
};

export const flashcardGenerationErrorMessage = (error: unknown): string => (
  flashcardRequestErrorMessage(error, 'Flashcard set could not be generated.')
);
