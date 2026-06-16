import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare, BarChart2, BookOpen, LogOut, Wand2, BookMarked, Library, GraduationCap } from 'lucide-react';
import type { User } from '../../types';
import { clsx } from 'clsx';
import { GlobalTranslator } from './GlobalTranslator';

interface Props {
  user: User;
  onLogout: () => void;
}

export const Navbar: React.FC<Props> = ({ user, onLogout }) => {
  const location = useLocation();

  const navLinks = [
    { to: '/topics',    label: 'Conversation', icon: <MessageSquare size={18} /> },
    { to: '/exercises', label: 'Exercises',    icon: <BookOpen size={18} />     },
    { to: '/style',     label: 'Style',        icon: <Wand2 size={18} />        },
    { to: '/flashcards', label: 'Flashcards',   icon: <BookMarked size={18} />   },
    { to: '/resources', label: 'Resources',     icon: <Library size={18} />      },
    { to: '/teacher',   label: 'Ask teacher',   icon: <GraduationCap size={18} /> },
    { to: '/dashboard', label: 'Dashboard',     icon: <BarChart2 size={18} />    },
  ];

  return (
    <nav className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="mb-3 flex items-center justify-between gap-4">
          <Link to="/topics" className="flex items-center gap-2">
            <GraduationCap size={24} className="text-blue-300" />
            <span className="font-bold text-xl text-white">My German Tutor</span>
          </Link>

          <div className="flex items-center gap-3">
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
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                location.pathname.startsWith(link.to)
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              )}
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
          <GlobalTranslator />
        </div>
      </div>
    </nav>
  );
};
