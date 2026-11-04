import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Lock, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/AuthProvider';
import type { Project } from '@/db/types';
import { lockProject } from '@/lib/projectSession';
import { useProjectProgress } from '@/lib/useProjectProgress';
import { PROJECT_NAV_ITEMS, projectNavHref } from '@/screens/projectNav';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import SyncStatusChip from '@/components/SyncStatusChip';
import { ProjectProgressProvider } from './ProjectProgressProvider';

export default function ProjectLayout() {
  const project = useOutletContext<Project>();

  return (
    <ProjectProgressProvider project={project}>
      <ProjectLayoutContent project={project} />
    </ProjectProgressProvider>
  );
}

function ProjectLayoutContent({ project }: { project: Project }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { nav } = useProjectProgress();

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button asChild size="icon" variant="ghost" aria-label="Back to projects">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <span className="truncate text-sm font-semibold sm:text-base">{project.name}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {user && (
              <span className="hidden max-w-32 truncate text-xs text-muted-foreground sm:inline">
                {user.displayName || user.email}
              </span>
            )}
            <SyncStatusChip />
            <Button
              size="sm"
              variant="ghost"
              aria-label="Sign out"
              onClick={() => void signOut()}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (!projectId) return;
                lockProject(projectId);
                navigate('/');
              }}
              type="button"
            >
              <Lock className="h-4 w-4" />
              <span className="hidden sm:inline">Lock</span>
            </Button>
          </div>
        </div>
        <nav className="container flex gap-1 overflow-x-auto pb-2">
          {PROJECT_NAV_ITEMS.map((item) => {
            const annotation = nav[item.path];
            return (
              <NavLink
                key={item.path}
                to={projectId ? projectNavHref(projectId, item.path) : '/'}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'flex items-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                  ].join(' ')
                }
              >
                {item.label}
                {annotation?.count !== undefined && (
                  <Badge
                    variant="secondary"
                    className="ml-1.5 px-1.5 py-0 text-[10px] leading-4"
                    aria-label={`${annotation.count} outstanding`}
                  >
                    {annotation.count}
                  </Badge>
                )}
                {annotation?.complete && (
                  <Check
                    className="ml-1 h-3 w-3"
                    aria-label={`${item.label} complete`}
                  />
                )}
              </NavLink>
            );
          })}
        </nav>
      </header>
      <main className="container flex-1 py-5">
        <Outlet context={project} />
      </main>
      <PWAInstallPrompt />
    </div>
  );
}
