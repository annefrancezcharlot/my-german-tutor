import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, BarChart2, BookOpen, LogOut, Wand2, BookMarked, Library, GraduationCap, Menu, X } from 'lucide-react';
import type { User } from '../../types';
import { clsx } from 'clsx';
import { GlobalTranslator } from './GlobalTranslator';

interface Props {
  user: User;
  onLogout: () => void;
}

export const Navbar: React.FC<Props> = ({ user, onLogout }) => {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { to: '/topics',    label: 'Conversation', icon: <MessageSquare size={18} /> },
    { to: '/exercises', label: 'Exercises',    icon: <BookOpen size={18} />     },
    { to: '/style',     label: 'Style',        icon: <Wand2 size={18} />        },
    { to: '/flashcards', label: 'Flashcards',   icon: <BookMarked size={18} />   },
    { to: '/resources', label: 'Resources',     icon: <Library size={18} />      },
    { to: '/teacher',   label: 'Ask teacher',   icon: <GraduationCap size={18} /> },
    { to: '/dashboard', label: 'Dashboard',     icon: <BarChart2 size={18} />    },
  ];

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const linkClass = (to: string) => clsx(
    'flex items-center gap-2 rounded-lg text-sm font-medium transition-colors',
    location.pathname.startsWith(to)
      ? 'bg-blue-600 text-white'
      : 'text-slate-300 hover:bg-slate-700 hover:text-white',
  );

  return (
    <nav className="sticky top-0 z-50 border-b border-slate-700 bg-slate-800">
      <div className="mx-auto max-w-6xl px-3 sm:px-4">
        <div className="flex h-14 items-center justify-between gap-3 md:h-auto md:py-3">
          <Link to="/topics" className="flex items-center gap-2">
            <GraduationCap size={22} className="shrink-0 text-blue-300 sm:h-6 sm:w-6" />
            <span className="truncate text-base font-bold text-white sm:text-xl">My German Tutor</span>
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <Link to="/profile" className="hidden rounded-lg px-2 py-1 text-right transition-colors hover:bg-slate-700 sm:block">
              <div className="text-sm font-medium text-white">{user.username}</div>
              <div className="text-xs text-blue-400 font-bold">{user.level}</div>
            </Link>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(open => !open)}
            className="rounded-lg p-2 text-slate-200 hover:bg-slate-700 md:hidden"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        <div className="hidden flex-wrap items-center gap-1 pb-3 md:flex">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={clsx(linkClass(link.to), 'px-4 py-2')}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
          <GlobalTranslator />
        </div>
      </div>

      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 top-14 z-40 bg-slate-950/65 md:hidden"
          />
          <div
            id="mobile-navigation"
            className="absolute left-0 right-0 top-14 z-50 max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-b border-slate-700 bg-slate-800 p-3 shadow-2xl md:hidden"
          >
            <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-900 px-3 py-2.5">
              <Link to="/profile" className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{user.username}</div>
                <div className="text-xs font-bold text-blue-400">Level {user.level} · Profile</div>
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <LogOut size={17} /> Log out
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {navLinks.map(link => (
                <Link key={link.to} to={link.to} className={clsx(linkClass(link.to), 'min-h-11 px-3 py-2.5')}>
                  {link.icon}
                  <span className="truncate">{link.label}</span>
                </Link>
              ))}
              <GlobalTranslator fullWidth />
            </div>
          </div>
        </>
      )}
    </nav>
  );
};
