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
  AlertTriangle,
  ArrowLeft,
  Bell,
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
  const { nav, notifications, reload } = useProjectProgress();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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
              <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={
                    notifications.length > 0
                      ? `Notifications (${notifications.length})`
                      : 'Notifications'
                  }
                  onClick={() => {
                    setNotificationsOpen(true);
                    reload();
                  }}
                  type="button"
                  className="relative"
                >
                  <Bell className="h-5 w-5" />
                  {notifications.length > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
                    >
                      {notifications.length}
                    </span>
                  )}
                </Button>
                <DialogContent className="left-auto right-0 top-0 flex h-dvh w-[min(26rem,100vw)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-l p-0">
                  <div className="space-y-1 border-b p-4 pr-12">
                    <DialogTitle className="text-base">Notifications</DialogTitle>
                    <p className="text-sm text-muted-foreground">
                      Plan warnings that need attention.
                    </p>
                  </div>
                  <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No plan warnings. Oversized panels and lumber will appear here.
                      </p>
                    ) : (
                      notifications.map((notification) => (
                        <article
                          key={notification.id}
                          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900"
                        >
                          <p className="flex gap-2 text-sm font-medium">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            {notification.title}
                          </p>
                          <p className="mt-1 text-sm text-amber-800">
                            {notification.description}
                          </p>
                          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                            {notification.items.map((item, index) => (
                              <li key={`${notification.id}-${index}`}>{item}</li>
                            ))}
                          </ul>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="mt-3 border-amber-400 bg-white/70 text-amber-900 hover:bg-white"
                          >
                            <Link
                              to={`/projects/${projectId}/${notification.href}`}
                              aria-label={`Review ${notification.title}`}
                              onClick={() => setNotificationsOpen(false)}
                            >
                              Review
                            </Link>
                          </Button>
                        </article>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
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
