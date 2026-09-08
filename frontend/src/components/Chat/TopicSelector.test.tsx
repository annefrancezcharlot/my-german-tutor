import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TopicSelector } from './TopicSelector';

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
    const heading = await screen.findByRole('heading', { name: 'PH SRK' });
    expect(screen.getAllByRole('heading', { name: 'PH SRK' })).toHaveLength(1);
    const card = heading.parentElement!;
    expect(within(card).getByText('2 saved prompts')).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Choose specific prompt' }));
    expect(within(card).getByRole('button', { name: 'Visit a client' })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole('button', { name: 'Morning care' }));
    const selection = JSON.parse(screen.getByTestId('location').textContent!).topic;
    expect(selection.title).toBe('Morning care');
    expect(selection.category).toBe('PH SRK');
    fireEvent.click(screen.getByRole('button', { name: 'PH SRK' }));
    expect(screen.queryByRole('heading', { name: 'Animals' })).not.toBeInTheDocument();
  });
});
