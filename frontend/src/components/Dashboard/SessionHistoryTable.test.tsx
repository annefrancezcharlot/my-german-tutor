import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionHistoryTable } from './SessionHistoryTable';
import type { ConversationSession } from '../../types';

const session = { id: 66, topic: 'PH SRK', topic_category: 'Practice', started_at: '2026-09-08', message_count: 2, error_count: 0 } as ConversationSession;
afterEach(() => vi.restoreAllMocks());

it('only deletes after confirmation and reports deletion failures', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const onDelete = vi.fn().mockRejectedValue(new Error('Network error'));
  render(<MemoryRouter><SessionHistoryTable sessions={[session]} onDelete={onDelete} /></MemoryRouter>);
  const button = screen.getByRole('button', { name: 'Delete conversation: PH SRK' });
  fireEvent.click(button);
  expect(onDelete).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(button);
  await waitFor(() => expect(onDelete).toHaveBeenCalledWith(66));
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be deleted');
  expect(screen.getByText('PH SRK')).toBeInTheDocument();
  expect(button).toBeEnabled();
});
