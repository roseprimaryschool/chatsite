import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User } from '../types';
import { api, getStoredToken, setStoredToken } from '../lib/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: { login: string; password: string }) => Promise<void>;
  signup: (data: { username: string; email: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<Pick<User, 'display_name' | 'avatar_url' | 'bio' | 'custom_status'>>) => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [loading, setLoading] = useState(true);

  // Validate session on boot
  useEffect(() => {
    async function loadSession() {
      const stored = getStoredToken();
      if (!stored) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.getMe();
        if (res.user) {
          setUser(res.user);
        } else {
          setStoredToken(null);
          setToken(null);
        }
      } catch (err) {
        console.warn('Session verification failed, clearing token:', err);
        setStoredToken(null);
        setToken(null);
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  const login = async (credentials: { login: string; password: string }) => {
    const res = await api.login(credentials);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const signup = async (data: { username: string; email: string; password: string; displayName?: string }) => {
    const res = await api.signup(data);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout network failure
    }
    setStoredToken(null);
    setToken(null);
    setUser(null);
  };

  const updateProfile = async (data: Partial<Pick<User, 'display_name' | 'avatar_url' | 'bio' | 'custom_status'>>) => {
    const res = await api.updateProfile(data);
    setUser(res.user);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        signup,
        logout,
        updateProfile,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
