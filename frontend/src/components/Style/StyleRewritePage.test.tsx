import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { StyleRewritePage } from './StyleRewritePage';
import { getSavedStyleRewrites, getSessionMessages, getUserSessions, rewriteSessionStyle } from '../../api';

vi.mock('../../api', () => ({
  getSavedStyleRewrites: vi.fn(), getSessionMessages: vi.fn(),
  getUserSessions: vi.fn(), rewriteSessionStyle: vi.fn(),
}));
vi.mock('../../utils/audio', () => ({ playSpeech: vi.fn() }));

const user = { id: 'user', username: 'Learner', level: 'B2' as const, created_at: '' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getUserSessions).mockResolvedValue([{
    id: 1, user_id: 'user', topic: 'A trip to Bern', topic_category: 'Travel',
    started_at: '2026-09-21T12:00:00Z', message_count: 2, error_count: 0,
  }]);
  vi.mocked(getSessionMessages).mockResolvedValue([
    { id: 10, role: 'assistant', content: 'Wohin reist du?' },
    { id: 11, role: 'user', content: 'Ich fahre nach Bern.' },
  ]);
  vi.mocked(getSavedStyleRewrites).mockResolvedValue({ session_id: 1, rewrite_mode: 'natural', rewrites: [] });
  vi.mocked(rewriteSessionStyle).mockResolvedValue({ session_id: 1, rewrite_mode: 'swiss_german', rewrites: [{
    message_id: 11, original: 'Ich fahre nach Bern.', rewritten: 'I fahre uf Bärn.',
    rewrite_mode: 'swiss_german', style_notes: '',
  }] });
});

it('waits for selection and displays the whole conversation below the controls', async () => {
  render(<StyleRewritePage user={user} />);
  const session = await screen.findByRole('button', { name: /A trip to Bern/ });
  expect(screen.queryByRole('region', { name: 'Selected conversation' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change style' })).toBeDisabled();
  expect(getSessionMessages).not.toHaveBeenCalled();
  fireEvent.click(session);
  expect(await screen.findByText('Wohin reist du?')).toBeInTheDocument();
  const conversation = screen.getByRole('region', { name: 'Selected conversation' });
  expect(within(conversation).getByRole('heading', { name: 'A trip to Bern' })).toBeInTheDocument();
  expect(within(conversation).getByText('Ich fahre nach Bern.')).toBeInTheDocument();
  expect(within(conversation).queryByRole('group', { name: 'Style' })).not.toBeInTheDocument();
});

it('changes to the selected Swiss dialect while retaining the tutor messages', async () => {
  render(<StyleRewritePage user={user} />);
  fireEvent.click(await screen.findByRole('button', { name: /A trip to Bern/ }));
  await screen.findByText('Wohin reist du?');
  fireEvent.click(screen.getByRole('button', { name: 'Zürich' }));
  expect(screen.getByRole('button', { name: 'Zürich' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Natural' })).toHaveAttribute('aria-pressed', 'false');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Change style' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Change style' }));
  expect(await screen.findByText('I fahre uf Bärn.')).toBeInTheDocument();
  expect(rewriteSessionStyle).toHaveBeenCalledWith(1, 'swiss_german', 'Zürich');
  expect(screen.getByText('Wohin reist du?')).toBeInTheDocument();
});
