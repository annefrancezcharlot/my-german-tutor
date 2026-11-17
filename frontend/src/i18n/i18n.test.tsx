import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { Navbar } from '../components/Layout/Navbar';
import { fr } from './fr';
import { LanguageProvider, getCurrentLanguage, translate } from './index';

const user = {
  id: 'user-1',
  username: 'Learner',
  level: 'B2' as const,
  created_at: '2026-08-20T00:00:00Z',
};

afterEach(() => {
  localStorage.clear();
});

describe('translate', () => {
  it('returns French text and fills placeholders', () => {
    expect(translate('fr', 'Log out')).toBe('Se déconnecter');
    expect(translate('fr', 'Level {level} · Profile', { level: 'C1' })).toBe('Niveau C1 · Profil');
  });

  it('falls back to the English key when no translation exists', () => {
    expect(translate('fr', 'Some untranslated text')).toBe('Some untranslated text');
    expect(translate('en', 'Level {level} · Profile', { level: 'B1' })).toBe('Level B1 · Profile');
  });

  it('keeps the same placeholders in every French entry', () => {
    const placeholders = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const [english, french] of Object.entries(fr)) {
      expect(placeholders(french), english).toBe(placeholders(english));
    }
  });
});

describe('language switcher', () => {
  it('switches the navbar to French and remembers the choice', () => {
    render(
      <LanguageProvider initialLanguage="en">
        <MemoryRouter>
          <Navbar user={user} onLogout={() => undefined} />
        </MemoryRouter>
      </LanguageProvider>,
    );

    expect(screen.getByText('Exercises')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Français' }));

    expect(screen.getByText('Exercices')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('german_ui_language')).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
    expect(getCurrentLanguage()).toBe('fr');

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText('Exercises')).toBeInTheDocument();
    expect(getCurrentLanguage()).toBe('en');
  });
});
