import { Link, Outlet } from 'react-router-dom';
import { Ruler } from 'lucide-react';

export default function AppLayout() {
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
        </div>
      </header>
      <main className="container flex-1 py-5">
        <Outlet />
      </main>
    </div>
  );
}
