import { useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
  useOutletContext,
  useParams,
} from 'react-router-dom';
import {
  ArrowLeft,
  Boxes,
  Calculator,
  Check,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Package,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/auth/AuthProvider';
import type { Project } from '@/db/types';
import { lockProject } from '@/lib/projectSession';
import { useProjectProgress } from '@/lib/useProjectProgress';
import type { ProjectNavAnnotation } from '@/lib/projectProgress';
import { PROJECT_NAV_ITEMS, projectNavHref, type ProjectNavItem } from '@/screens/projectNav';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import SyncStatusChip from '@/components/SyncStatusChip';
import { ProjectProgressProvider } from './ProjectProgressProvider';

const NAV_ICONS: Record<string, LucideIcon> = {
  '': LayoutDashboard,
  members: Boxes,
  inventory: Package,
  optimize: Calculator,
  summary: FileText,
  settings: Settings,
};

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
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { nav } = useProjectProgress();
  const [menuOpen, setMenuOpen] = useState(false);

  const basePath = projectId ? `/projects/${projectId}` : '/';
  const activeItem = PROJECT_NAV_ITEMS.find((item) =>
    item.end
      ? location.pathname === basePath
      : location.pathname.startsWith(`${basePath}/${item.path}`),
  );

  function lock() {
    if (!projectId) return;
    lockProject(projectId);
    navigate('/');
  }

  return (
    <div className="min-h-dvh bg-muted/30 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden border-r bg-background lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center gap-2 border-b p-3">
          <Button asChild size="icon" variant="ghost" aria-label="Back to projects">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{project.name}</p>
            <p className="text-xs text-muted-foreground">Formwork workspace</p>
          </div>
        </div>
        <nav aria-label="Project" className="flex-1 space-y-1 overflow-y-auto p-3">
          <ProjectNavLinks projectId={projectId} nav={nav} />
        </nav>
        <div className="space-y-2 border-t p-3">
          {user && (
            <p className="truncate px-1 text-xs text-muted-foreground">
              {user.displayName || user.email}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={lock} type="button">
              <Lock className="h-4 w-4" /> Lock
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Sign out"
              onClick={() => void signOut()}
              type="button"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Open project menu"
                  onClick={() => setMenuOpen(true)}
                  type="button"
                  className="lg:hidden"
                >
                  <Menu className="h-5 w-5" />
                </Button>
                <DialogContent className="left-0 top-0 flex h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r p-0">
                  <DialogTitle className="sr-only">Project menu</DialogTitle>
                  <div className="flex items-center gap-2 border-b p-3">
                    <Button asChild size="icon" variant="ghost" aria-label="Back to projects">
                      <Link to="/" onClick={() => setMenuOpen(false)}>
                        <ArrowLeft className="h-5 w-5" />
                      </Link>
                    </Button>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{project.name}</p>
                      <p className="text-xs text-muted-foreground">Formwork workspace</p>
                    </div>
                  </div>
                  <nav aria-label="Project" className="flex-1 space-y-1 overflow-y-auto p-3">
                    <ProjectNavLinks
                      projectId={projectId}
                      nav={nav}
                      onNavigate={() => setMenuOpen(false)}
                    />
                  </nav>
                  <div className="space-y-2 border-t p-3">
                    {user && (
                      <p className="truncate px-1 text-xs text-muted-foreground">
                        {user.displayName || user.email}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" variant="outline" onClick={lock} type="button">
                        <Lock className="h-4 w-4" /> Lock
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Sign out"
                        onClick={() => void signOut()}
                        type="button"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <span className="truncate text-sm font-semibold lg:hidden">{project.name}</span>
              <span className="hidden text-sm font-medium text-muted-foreground lg:inline">
                {activeItem?.label ?? 'Overview'}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <SyncStatusChip />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <Outlet context={project} />
        </main>
        <PWAInstallPrompt />
      </div>
    </div>
  );
}

function ProjectNavLinks({
  projectId,
  nav,
  onNavigate,
}: {
  projectId?: string;
  nav: Partial<Record<string, ProjectNavAnnotation>>;
  onNavigate?: () => void;
}) {
  return (
    <>
      {PROJECT_NAV_ITEMS.map((item) => (
        <ProjectNavLink
          key={item.path}
          item={item}
          projectId={projectId}
          annotation={nav[item.path]}
          onNavigate={onNavigate}
        />
      ))}
    </>
  );
}

function ProjectNavLink({
  item,
  projectId,
  annotation,
  onNavigate,
}: {
  item: ProjectNavItem;
  projectId?: string;
  annotation: ProjectNavAnnotation | undefined;
  onNavigate?: () => void;
}) {
  const Icon = NAV_ICONS[item.path] ?? LayoutDashboard;

  return (
    <NavLink
      to={projectId ? projectNavHref(projectId, item.path) : '/'}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        ].join(' ')
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {annotation?.count !== undefined && (
        <Badge
          variant="secondary"
          className="px-1.5 py-0 text-[10px] leading-4"
          aria-label={`${annotation.count} outstanding`}
        >
          {annotation.count}
        </Badge>
      )}
      {annotation?.complete && (
        <Check className="h-3.5 w-3.5 shrink-0" aria-label={`${item.label} complete`} />
      )}
    </NavLink>
  );
}
