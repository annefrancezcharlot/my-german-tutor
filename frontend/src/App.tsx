import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Layout/Navbar';
import { HomePage } from './components/Home/HomePage';
import { TopicSelector } from './components/Chat/TopicSelector';
import { ChatPage } from './components/Chat/ChatPage';
import { Dashboard } from './components/Dashboard/Dashboard';
import { ExercisesPage } from './components/Exercises/ExercisesPage';
import { StyleRewritePage } from './components/Style/StyleRewritePage';
import { FlashcardsPage } from './components/Flashcards/FlashcardsPage';
import { ResourcesPage } from './components/Resources/ResourcesPage';
import { AskTeacherPage } from './components/Teacher/AskTeacherPage';
import { ProfilePage } from './components/Profile/ProfilePage';
import { createAuthProfile, getAuthMe, refreshAuthSession, setAuthTokenProvider, signIn, signUp } from './api';
import type { SignUpProfile } from './api';
import type { User } from './types';

const AUTH_TOKEN_KEY = 'german_auth_token';
const REFRESH_TOKEN_KEY = 'german_refresh_token';
const AUTH_EXPIRES_AT_KEY = 'german_auth_expires_at';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clearStoredSession = () => {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(AUTH_EXPIRES_AT_KEY);
    };

    const storeSession = (session: { access_token: string; refresh_token?: string | null; expires_at?: number | null }) => {
      localStorage.setItem(AUTH_TOKEN_KEY, session.access_token);
      if (session.refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
      }
      if (session.expires_at) {
        localStorage.setItem(AUTH_EXPIRES_AT_KEY, String(session.expires_at));
      }
    };

    setAuthTokenProvider(async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) return null;

      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      const expiresAt = Number(localStorage.getItem(AUTH_EXPIRES_AT_KEY) ?? 0);
      const shouldRefresh = refreshToken && (expiresAt <= 0 || Date.now() / 1000 > expiresAt - 60);
      if (!shouldRefresh) {
        return token;
      }

      try {
        const refreshed = await refreshAuthSession(refreshToken);
        storeSession(refreshed);
        return refreshed.access_token;
      } catch (err) {
        console.error('Failed to refresh auth session', err);
        clearStoredSession();
        setUser(null);
        return null;
      }
    });

    const loadBackendProfile = async () => {
      const authUser = await getAuthMe();
      const profile = authUser.profile ?? await createAuthProfile();
      setUser(profile);
    };

    const loadSession = async () => {
      if (!localStorage.getItem(AUTH_TOKEN_KEY)) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        await loadBackendProfile();
      } catch (err) {
        console.error('Failed to load authenticated user', err);
        clearStoredSession();
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, []);

  const handleLogin = async (
    email: string,
    password: string,
    mode: 'sign-in' | 'sign-up',
    profile?: SignUpProfile,
  ) => {
    try {
      const result = mode === 'sign-up'
        ? await signUp(email, password, profile ?? {
          username: email.split('@', 1)[0],
          level: 'B2',
          german_variant: 'de-DE',
        })
        : await signIn(email, password);

      localStorage.setItem(AUTH_TOKEN_KEY, result.access_token);
      if (result.refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, result.refresh_token);
      }
      if (result.expires_at) {
        localStorage.setItem(AUTH_EXPIRES_AT_KEY, String(result.expires_at));
      }

      const backendProfile = result.profile ?? await createAuthProfile();
      setUser(backendProfile);
    } catch (err) {
      console.error('Login failed', err);
      throw err;
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EXPIRES_AT_KEY);
    setUser(null);
  };

  const handleAccountDeleted = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_EXPIRES_AT_KEY);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {user ? (
        <div className="min-h-screen bg-slate-900 text-white">
          <Navbar user={user} onLogout={handleLogout} />
          <main className="max-w-6xl mx-auto px-4 py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/topics" replace />} />
              <Route path="/topics" element={<TopicSelector user={user} />} />
              <Route path="/chat" element={<ChatPage user={user} />} />
              <Route path="/chat/:sessionId" element={<ChatPage user={user} />} />
              <Route path="/dashboard" element={<Dashboard user={user} />} />
              <Route path="/exercises" element={<ExercisesPage user={user} />} />
              <Route path="/flashcards" element={<FlashcardsPage user={user} />} />
              <Route path="/resources" element={<ResourcesPage user={user} />} />
              <Route path="/teacher" element={<AskTeacherPage user={user} />} />
              <Route path="/style" element={<StyleRewritePage user={user} />} />
              <Route
                path="/profile"
                element={
                  <ProfilePage
                    user={user}
                    onUserUpdate={setUser}
                    onAccountDeleted={handleAccountDeleted}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/topics" replace />} />
            </Routes>
          </main>
        </div>
      ) : (
        <Routes>
          <Route path="/" element={<HomePage onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
