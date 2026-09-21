import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookupNoun } from '../../api';
import { ArticleLookupPage } from './ArticleLookupPage';

vi.mock('../../api', () => ({ lookupNoun: vi.fn() }));

const submit = (word: string) => {
  fireEvent.change(screen.getByLabelText('German noun'), { target: { value: word } });
  fireEvent.click(screen.getByRole('button', { name: 'Find article' }));
};

describe('article lookup', () => {
  beforeEach(() => vi.resetAllMocks());

  it('looks up the word and shows every matching article and plural', async () => {
    vi.mocked(lookupNoun).mockResolvedValue([
      { singular: 'Band', article: 'das', plural: 'Bänder' },
      { singular: 'Band', article: 'der', plural: 'Bände' },
    ]);
    render(<ArticleLookupPage />);
    expect(screen.getByRole('button', { name: 'Find article' })).toBeDisabled();
    submit(' Band ');
    expect(await screen.findByText('das')).toBeInTheDocument();
    expect(screen.getByText('der')).toBeInTheDocument();
    expect(screen.getByText('Plural: Bänder')).toBeInTheDocument();
    expect(lookupNoun).toHaveBeenCalledWith('Band');
  });

  it('shows missing words and allows retrying after errors', async () => {
    vi.mocked(lookupNoun).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    render(<ArticleLookupPage />);
    submit('Haus');
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again');
    submit('unknown');
    expect(await screen.findByText(/No entry found/)).toHaveTextContent('unknown');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
