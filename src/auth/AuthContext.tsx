import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth, continueAsGuest, createEmailPasswordAccount, getAuthToken, sendPasswordReset, signInWithEmailPassword } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string;
  signIn: (email: string, password: string) => Promise<boolean>;
  createAccount: (email: string, password: string, geminiKey?: string) => Promise<boolean>;
  continueAsGuest: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      if (!active) return;
      setUser(nextUser);
      setLoading(false);
    }, (err) => {
      if (!active) return;
      setError(err.message || 'Could not check your sign-in status.');
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    error,
    signIn: async (email, password) => {
      setError('');
      try {
        await signInWithEmailPassword(email, password);
        return true;
      } catch (err: any) {
        setError(authErrorMessage(err, 'Could not sign in. Please try again.'));
        return false;
      }
    },
    createAccount: async (email, password, geminiKey) => {
      setError('');
      try {
        await createEmailPasswordAccount(email, password);
        if (geminiKey?.trim()) {
          const token = await getAuthToken();
          const response = await fetch('/api/account/gemini-key', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ key: geminiKey.trim() }),
          });
          if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            setError(result.error || 'Account created, but the Gemini key could not be saved. You can continue and add it after setup.');
          }
        }
        return true;
      } catch (err: any) {
        setError(authErrorMessage(err, 'Could not create your account. Please try again.'));
        return false;
      }
    },
    continueAsGuest: async () => {
      setError('');
      try {
        await continueAsGuest();
        return true;
      } catch (err: any) {
        setError(authErrorMessage(err, 'Could not start guest mode. Please try again.'));
        return false;
      }
    },
    resetPassword: async (email) => {
      setError('');
      try {
        await sendPasswordReset(email);
        return true;
      } catch (err: any) {
        setError(authErrorMessage(err, 'Could not send a password reset email.'));
        return false;
      }
    },
    signOutUser: async () => {
      setError('');
      await signOut(auth);
    },
    clearError: () => setError(''),
  }), [user, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function authErrorMessage(error: any, fallback: string): string {
  switch (error?.code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Sign in instead.';
    case 'auth/weak-password':
      return 'Choose a password with at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a little and try again.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in Firebase yet.';
    default:
      return fallback;
  }
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
