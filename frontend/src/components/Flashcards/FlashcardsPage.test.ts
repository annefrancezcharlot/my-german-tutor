import { describe, expect, it } from 'vitest';

import {
  flashcardGenerationErrorMessage,
  flashcardRequestErrorMessage,
  parseFlashcardTerms,
} from './flashcardUtils';

describe('flashcard term parsing', () => {
  it('does not silently discard terms beyond the generation limit', () => {
    const input = Array.from({ length: 31 }, (_, index) => `Wort ${index + 1}`).join('\n');

    expect(parseFlashcardTerms(input)).toHaveLength(31);
  });

  it('removes duplicate terms case-insensitively while preserving the first spelling', () => {
    expect(parseFlashcardTerms('Haus, haus, HAUS\nWohnung')).toEqual(['Haus', 'Wohnung']);
  });

  it('shows the same ordered terms produced by every supported separator', () => {
    expect(parseFlashcardTerms(' Haus,die Wohnung; sich erinnern an\nder Baum ')).toEqual([
      'Haus',
      'die Wohnung',
      'sich erinnern an',
      'der Baum',
    ]);
  });
});

describe('flashcard generation errors', () => {
  it('shows the backend error detail when available', () => {
    const error = {
      isAxiosError: true,
      response: {
        data: {
          detail: 'Claude reached the output limit before completing the flashcard set',
        },
      },
    };

    expect(flashcardGenerationErrorMessage(error)).toBe(
      'Claude reached the output limit before completing the flashcard set',
    );
  });

  it('uses a safe fallback for errors without backend detail', () => {
    expect(flashcardGenerationErrorMessage(new Error('network details'))).toBe(
      'Flashcard set could not be generated.',
    );
  });

  it('uses the operation-specific fallback supplied by the caller', () => {
    expect(flashcardRequestErrorMessage(new Error('network details'), 'Words could not be added.')).toBe(
      'Words could not be added.',
    );
  });
});
