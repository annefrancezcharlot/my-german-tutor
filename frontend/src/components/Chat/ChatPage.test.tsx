import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, Route, RouterProvider, Routes, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '../../api';
import { ChatPage } from './ChatPage';

vi.mock('../../api', () => ({
  createOpeningMessage: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  endSession: vi.fn().mockResolvedValue(undefined),
  getFreeConversationTopics: vi.fn().mockResolvedValue([]),
  getSessionMessages: vi.fn(),
  getTopics: vi.fn().mockResolvedValue([]),
  streamMessage: vi.fn(),
  transcribeAudio: vi.fn(),
}));

const user = { id: 'user-1', username: 'Learner', level: 'B2' as const, created_at: '2026-08-20T00:00:00Z' };

function renderChat() {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <>
            <Link to="/exercises">Exercises link</Link>
            <Routes>
              <Route path="/chat/:sessionId" element={<ChatPage user={user} />} />
              <Route path="*" element={<div>Other page</div>} />
            </Routes>
          </>
        ),
      },
    ],
    { initialEntries: ['/chat/5'] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

// Messages are loaded once the mode buttons become enabled.
const waitForLoaded = () =>
  waitFor(() => expect(screen.getByRole('button', { name: /^Controlled/ })).toBeEnabled());

describe('ChatPage leave confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lets an empty conversation be left without asking', async () => {
    vi.mocked(api.getSessionMessages).mockResolvedValue([]);
    const router = renderChat();
    await waitForLoaded();

    fireEvent.click(screen.getByText('Exercises link'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/exercises'));
    expect(screen.queryByText('Save this conversation before leaving?')).not.toBeInTheDocument();
  });

  it('asks before leaving an unsaved conversation and can stay, save or discard', async () => {
    vi.mocked(api.getSessionMessages).mockResolvedValue([
      { role: 'assistant', content: 'Hallo!' },
      { role: 'user', content: 'Hallo, wie geht es?' },
    ]);
    const router = renderChat();
    await waitForLoaded();

    // Stay: the dialog closes and the learner remains in the chat.
    fireEvent.click(screen.getByText('Exercises link'));
    expect(await screen.findByText('Save this conversation before leaving?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.queryByText('Save this conversation before leaving?')).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/chat/5');

    // Save: the session is ended, then navigation continues to the chosen page.
    fireEvent.click(screen.getByText('Exercises link'));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/exercises'));
    expect(api.endSession).toHaveBeenCalledWith(5, undefined);
    expect(api.deleteSession).not.toHaveBeenCalled();
  });

  it('deletes the conversation when the learner discards it while leaving', async () => {
    vi.mocked(api.getSessionMessages).mockResolvedValue([{ role: 'user', content: 'Hallo' }]);
    const router = renderChat();
    await waitForLoaded();

    fireEvent.click(screen.getByText('Exercises link'));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/exercises'));
    expect(api.deleteSession).toHaveBeenCalledWith(5);
    expect(api.endSession).not.toHaveBeenCalled();
  });
});
