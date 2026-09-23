// ---------------------------------------------------------------------------
// AuthContext: login is phone-number + password only (spec section 1 --
// "no self-signup, Admin creates every account, login ID is phone number").
// Now backed by the real backend's POST /api/auth/login, which issues a JWT
// the app attaches to every other request (see ../data/api.js). The session
// (token + user) is cached in AsyncStorage so the app doesn't force a fresh
// sign-in every restart -- a real deployment would want the token to expire
// (it does, after 12h server-side) and to handle a 401 by logging out.
// ---------------------------------------------------------------------------
import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiPost, setAuthToken } from '../data/api';

const SESSION_KEY = 'maitri-lsp-session-v1';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  // Restore a previous session on app start.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (raw) {
          const { token, user } = JSON.parse(raw);
          setAuthToken(token);
          setCurrentUser(user);
        }
      } catch (e) {
        console.warn('Failed to restore session', e);
      } finally {
        setAuthReady(true);
      }
    })();
  }, []);

  async function login(phone, password) {
    try {
      const { user, token } = await apiPost('/api/auth/login', { phone, password });
      setAuthToken(token);
      setCurrentUser(user);
      await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
      return { ok: true, user };
    } catch (e) {
      return { ok: false, error: e.message || 'Sign in failed.' };
    }
  }

  async function logout() {
    setAuthToken(null);
    setCurrentUser(null);
    await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  }

  return (
    <AuthContext.Provider value={{ currentUser, authReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
