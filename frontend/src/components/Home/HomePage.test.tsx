import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('submits sign-in credentials', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<HomePage onLogin={onLogin} />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'learner@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(
        'learner@example.com',
        'secret123',
        'sign-in',
        undefined,
      );
    });
  });

  it('submits sign-up profile details', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<HomePage onLogin={onLogin} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    fireEvent.change(screen.getByPlaceholderText('Username'), {
      target: { value: 'learner' },
    });
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'learner@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'secret123' },
    });
    fireEvent.change(screen.getByLabelText('Level'), {
      target: { value: 'C1' },
    });
    fireEvent.change(screen.getByLabelText('Dialect'), {
      target: { value: 'de-CH' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith(
        'learner@example.com',
        'secret123',
        'sign-up',
        {
          username: 'learner',
          level: 'C1',
          german_variant: 'de-CH',
        },
      );
    });
  });

  it('shows backend auth errors', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('Invalid login'));
    render(<HomePage onLogin={onLogin} />);

    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'learner@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Password'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid login')).toBeInTheDocument();
  });
});
