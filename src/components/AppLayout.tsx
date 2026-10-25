import { Link, Outlet } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { LogOut, Ruler } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import SyncStatusChip from '@/components/SyncStatusChip';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';

export default function AppLayout() {
  const { user } = useAuth();

  async function handleSignOut() {
    if (!auth) return;
    await signOut(auth);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center gap-2">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Ruler className="h-4 w-4" />
            </span>
            <span className="text-sm sm:text-base">Formwork Cutting Optimizer</span>
          </Link>

          {user && (
            <div className="ml-auto flex items-center gap-2">
              <SyncStatusChip />
              <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">
                {user.displayName || user.email}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Sign out"
                onClick={() => void handleSignOut()}
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="container flex-1 py-5">
        <Outlet />
      </main>
      <PWAInstallPrompt />
    </div>
  );
}
