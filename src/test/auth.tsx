import type { ReactNode } from 'react';
import { AuthContext, signOutUser, type AuthContextValue, type AuthUser } from '@/auth/AuthProvider';

export const testUser: AuthUser = {
  uid: 'test-user',
  email: 'demo@example.com',
  displayName: 'Demo Engineer',
};

export function TestAuthProvider({
  user = null,
  loading = false,
  error = null,
  signOut = signOutUser,
  children,
}: {
  user?: AuthUser | null;
  loading?: boolean;
  error?: string | null;
  signOut?: () => Promise<void>;
  children: ReactNode;
}) {
  const value: AuthContextValue = { user, loading, error, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
