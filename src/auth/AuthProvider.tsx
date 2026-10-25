import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Loader2 } from 'lucide-react';
import { auth, firebaseConfigured } from '@/lib/firebase';
import { startSyncStatus } from '@/lib/syncStatus';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

export const FIREBASE_NOT_CONFIGURED_MESSAGE =
  'Firebase is not configured. Copy .env.example to .env.local and add the VITE_FIREBASE_* values.';

export const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email ?? '',
    displayName: user.displayName || user.email || 'Engineer',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthContextValue>(() => ({
    user: null,
    loading: firebaseConfigured,
    error: firebaseConfigured ? null : FIREBASE_NOT_CONFIGURED_MESSAGE,
  }));

  useEffect(() => {
    startSyncStatus();
    if (!auth) return;

    return onAuthStateChanged(
      auth,
      (user) => {
        setState({ user: user ? toAuthUser(user) : null, loading: false, error: null });
      },
      (error) => {
        setState({ user: null, loading: false, error: error.message });
      },
    );
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground"
      >
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Checking sign-in…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
