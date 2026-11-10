import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ArticleLessonPage } from './ArticleLessonPage';
import { ARTICLE_RULES, splitExample } from './articleLessonData';
import { DIMINUTIVES, SENTENCE_DRILLS, WORD_SETS } from './lessonPracticeData';

describe('lesson data', () => {
  it('writes every example with a valid article', () => {
    const examples = [
      ...ARTICLE_RULES.flatMap(rule => [...rule.sections.flatMap(s => s.examples), ...(rule.exceptions ?? [])]),
      ...WORD_SETS.flatMap(set => set.words),
    ];
    for (const example of examples) {
      expect(['der', 'die', 'das'], example).toContain(splitExample(example).article);
    }
  });

  it('gives every sentence exactly one blank and an answer', () => {
    for (const drill of SENTENCE_DRILLS) {
      expect(drill.text.split('___').length, drill.id).toBe(2);
      expect(drill.answers.length).toBeGreaterThan(0);
    }
  });

  it('only lists neuter diminutive bases ending properly', () => {
    for (const item of DIMINUTIVES) {
      for (const answer of item.answers) expect(answer).toMatch(/(chen|lein)$/);
    }
  });
});

describe('ArticleLessonPage', () => {
  it('switches between sections', () => {
    render(<MemoryRouter><ArticleLessonPage /></MemoryRouter>);
    expect(screen.getByText('Natural gender (male beings)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Sentences' }));
    expect(screen.getByText(/Fill in the article/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Diminutives' }));
    expect(screen.getByText('Make it small')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Extras' }));
    expect(screen.getByText('Compass directions')).toBeInTheDocument();
  });
});
