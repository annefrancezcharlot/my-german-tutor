import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { Navbar } from './Navbar';

const user = {
  id: 'user-1',
  username: 'Learner',
  level: 'B2' as const,
  created_at: '2026-08-20T00:00:00Z',
};

describe('Navbar mobile menu', () => {
  it('opens from the hamburger and closes with Escape', () => {
    render(
      <MemoryRouter initialEntries={['/flashcards']}>
        <Navbar user={user} onLogout={vi.fn()} />
      </MemoryRouter>,
    );

    const menuButton = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(screen.queryByText('Level B2 · Profile')).not.toBeInTheDocument();

    fireEvent.click(menuButton);
    expect(screen.getByText('Level B2 · Profile')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Close navigation menu' })[0]).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Level B2 · Profile')).not.toBeInTheDocument();
  });

  it('provides logout inside the mobile drawer', () => {
    const onLogout = vi.fn();
    render(
      <MemoryRouter>
        <Navbar user={user} onLogout={onLogout} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    const logoutButtons = screen.getAllByRole('button', { name: 'Log out' });
    fireEvent.click(logoutButtons[logoutButtons.length - 1]);
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
