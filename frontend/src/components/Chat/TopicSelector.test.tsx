import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TopicSelector } from './TopicSelector';
import { getTopics } from '../../api';

vi.mock('../../api', () => ({
  getTopics: vi.fn().mockResolvedValue([]),
  getFreeConversationTopics: vi.fn().mockResolvedValue([
    { title: 'Visit a client', category: 'PH SRK', description: 'First roleplay' },
    { title: 'Morning care', category: 'PH SRK', description: 'Second roleplay' },
    { title: 'Cats', category: 'Animals', description: 'Animals' },
  ]),
}));

function Location() {
  const location = useLocation();
  return <output data-testid="location">{JSON.stringify(location.state)}</output>;
}

describe('saved topic groups', () => {
  it('shows one card per category and starts the selected prompt', async () => {
    render(<MemoryRouter><TopicSelector user={{ id: '1', username: 'test', level: 'B2', created_at: '' }} /><Location /></MemoryRouter>);
    const heading = await screen.findByRole('heading', { name: 'PH SRK 2 saved prompts' });
    expect(screen.getAllByRole('heading', { name: 'PH SRK 2 saved prompts' })).toHaveLength(1);
    const card = heading.parentElement!;
    expect(within(card).getByText('2 saved prompts')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'PH SRK 2 saved prompts' }));
    expect(within(card).getByRole('button', { name: 'Visit a client' })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Morning care' }));
    const selection = JSON.parse(screen.getByTestId('location').textContent!).topic;
    expect(selection.title).toBe('Morning care');
    expect(selection.category).toBe('PH SRK');
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'PH SRK' } });
    expect(screen.queryByRole('heading', { name: /Animals/ })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'PH SRK 2 saved prompts' })).toHaveAttribute('aria-expanded', 'false');
  });
});


it('expands a library topic and starts its selected prompt', async () => {
  vi.mocked(getTopics).mockResolvedValueOnce([{
    id: 'culture', category: 'Culture', title: 'Art and music', description: 'Discuss your favourite art.',
    conversation_starters: [{ id: 'music', title: 'Live music', prompt: 'What was your favourite concert?' }],
  }]);
  render(<MemoryRouter><TopicSelector user={{ id: '1', username: 'test', level: 'B2', created_at: '' }} /><Location /></MemoryRouter>);
  const card = await screen.findByRole('button', { name: 'Art and music 1 saved prompt' });
  expect(screen.queryByRole('button', { name: 'Live music' })).not.toBeInTheDocument();
  fireEvent.click(card);
  expect(card).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Random prompt' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Live music' }));
  const selection = JSON.parse(screen.getByTestId('location').textContent!).topic;
  expect(selection.starterId).toBe('music');
});
