import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { KeyRound, Loader2, Ruler } from 'lucide-react';
import { FIREBASE_NOT_CONFIGURED_MESSAGE, useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { auth, firebaseConfigured } from '@/lib/firebase';

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'demo1234';

interface LoginLocationState {
  from?: {
    pathname?: string;
    search?: string;
    hash?: string;
  };
}

function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/user-disabled':
      return 'Incorrect email or password. Please try again.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/network-request-failed':
      return 'Could not reach the authentication server. Check your connection or make sure the Firebase emulator is running.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait a moment and try again.';
    default:
      return 'Sign in failed. Please try again.';
  }
}

export default function LoginScreen() {
  const { user, loading, error: authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const message = error || (!firebaseConfigured ? FIREBASE_NOT_CONFIGURED_MESSAGE : authError);

  const state = location.state as LoginLocationState | null;
  const from = state?.from;
  const target = from?.pathname
    ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
    : '/';

  if (!loading && user) {
    return <Navigate to={target} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) {
      setError('Firebase is not configured.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate(target, { replace: true });
    } catch (signInError) {
      setError(authErrorMessage(signInError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Ruler className="h-5 w-5" />
          </div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Sign in to browse the Project Marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {message && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {message}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !firebaseConfigured}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="mt-5 rounded-md border bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">
              Demo account: <span className="font-mono text-foreground">{DEMO_EMAIL}</span> /{' '}
              <span className="font-mono text-foreground">{DEMO_PASSWORD}</span>
            </p>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-sm"
              onClick={() => {
                setEmail(DEMO_EMAIL);
                setPassword(DEMO_PASSWORD);
              }}
            >
              Use demo account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
