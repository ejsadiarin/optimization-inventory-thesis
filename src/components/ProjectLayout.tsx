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
  CircleUserRound,
  ClipboardCheck,
  Lock,
  LogOut,
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
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useProjectProgress } from '@/lib/useProjectProgress';
import type { ProjectNavAnnotation } from '@/lib/projectProgress';
import { PROJECT_NAV_ITEMS, projectNavHref, type ProjectNavItem } from '@/screens/projectNav';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import SyncStatusChip from '@/components/SyncStatusChip';
import { ProjectProgressProvider } from './ProjectProgressProvider';

const NAV_ICONS: Record<string, LucideIcon> = {
  members: Boxes,
  inventory: Package,
  planner: Calculator,
  review: ClipboardCheck,
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
  const isDesktop = useIsDesktop();
  const [accountOpen, setAccountOpen] = useState(false);
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
    <div className="min-h-dvh bg-muted/30 md:grid md:grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[16rem_minmax(0,1fr)]">
      {isDesktop && (
        <aside className="border-r bg-background md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
          <div className="flex items-center gap-2 border-b p-3 md:justify-center lg:justify-start">
            <Button asChild size="icon" variant="ghost" aria-label="Back to projects">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-semibold">{project.name}</p>
              <p className="text-xs text-muted-foreground">Formwork workspace</p>
            </div>
          </div>
          <nav aria-label="Project" className="flex-1 space-y-1 overflow-y-auto p-2 lg:p-3">
            <ProjectNavLinks projectId={projectId} nav={nav} />
          </nav>
          <div className="space-y-2 border-t p-2 lg:p-3">
            {user && (
              <p className="hidden truncate px-1 text-xs text-muted-foreground lg:block">
                {user.displayName || user.email}
              </p>
            )}
            <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2">
              <Button
                size="sm"
                variant="outline"
                onClick={lock}
                type="button"
                aria-label="Lock project"
                title="Lock project"
                className="w-full px-0 lg:px-3"
              >
                <Lock className="h-4 w-4" /> <span className="hidden lg:inline">Lock</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Sign out"
                title="Sign out"
                onClick={() => void signOut()}
                type="button"
                className="w-full px-0 lg:px-3"
              >
                <LogOut className="h-4 w-4" /> <span className="hidden lg:inline">Sign out</span>
              </Button>
            </div>
          </div>
        </aside>
      )}

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-2 px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-1">
              {isDesktop ? (
                <span className="text-sm font-medium text-muted-foreground">
                  {activeItem?.label ?? 'Planner'}
                </span>
              ) : (
                <>
                  <Button asChild size="icon" variant="ghost" aria-label="Back to projects">
                    <Link to="/">
                      <ArrowLeft className="h-5 w-5" />
                    </Link>
                  </Button>
                  <span className="truncate text-sm font-semibold">{project.name}</span>
                </>
              )}
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
              {!isDesktop && (
                <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Open account menu"
                    onClick={() => setAccountOpen(true)}
                    type="button"
                  >
                    <CircleUserRound className="h-5 w-5" />
                  </Button>
                  <DialogContent className="left-auto right-0 top-0 flex h-dvh w-[min(22rem,100vw)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-l p-0">
                    <div className="space-y-1 border-b p-4 pr-12">
                      <DialogTitle className="text-base">Project menu</DialogTitle>
                      <p className="truncate text-sm text-muted-foreground">{project.name}</p>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto p-4">
                      {user && (
                        <p className="truncate text-xs text-muted-foreground">
                          {user.displayName || user.email}
                        </p>
                      )}
                      <Button asChild variant="outline" className="w-full justify-start">
                        <Link to="/" onClick={() => setAccountOpen(false)}>
                          <ArrowLeft className="h-4 w-4" /> Projects
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          setAccountOpen(false);
                          lock();
                        }}
                        type="button"
                      >
                        <Lock className="h-4 w-4" /> Lock project
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => void signOut()}
                        type="button"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 sm:pt-6 md:pb-6">
          <Outlet context={project} />
        </main>
        <PWAInstallPrompt className={isDesktop ? undefined : 'bottom-20'} />
      </div>

      {!isDesktop && <ProjectBottomNav projectId={projectId} nav={nav} />}
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
  const Icon = NAV_ICONS[item.path] ?? Calculator;
  const accessibleName =
    annotation?.count !== undefined
      ? `${item.label} (${annotation.count} outstanding)`
      : annotation?.complete
        ? `${item.label} (complete)`
        : item.label;

  return (
    <NavLink
      to={projectId ? projectNavHref(projectId, item.path) : '/'}
      end={item.end}
      onClick={onNavigate}
      title={item.label}
      aria-label={accessibleName}
      className={({ isActive }) =>
        [
          'relative mx-auto flex h-10 w-10 items-center justify-center rounded-md text-sm font-medium transition-colors lg:mx-0 lg:h-auto lg:w-full lg:justify-start lg:gap-2.5 lg:px-3 lg:py-2',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        ].join(' ')
      }
    >
      <Icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" aria-hidden="true" />
      <span className="hidden min-w-0 flex-1 truncate lg:inline">{item.label}</span>
      {annotation?.count !== undefined && (
        <>
          <Badge
            variant="secondary"
            className="hidden px-1.5 py-0 text-[10px] leading-4 lg:inline-flex"
            aria-label={`${annotation.count} outstanding`}
          >
            {annotation.count}
          </Badge>
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary lg:hidden"
          />
        </>
      )}
      {annotation?.complete && (
        <Check
          className="hidden h-3.5 w-3.5 shrink-0 lg:block"
          aria-label={`${item.label} complete`}
        />
      )}
    </NavLink>
  );
}

function ProjectBottomNav({
  projectId,
  nav,
}: {
  projectId?: string;
  nav: Partial<Record<string, ProjectNavAnnotation>>;
}) {
  return (
    <nav
      aria-label="Project sections"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden"
    >
      <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {PROJECT_NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.path] ?? Calculator;
          const annotation = nav[item.path];
          const accessibleName =
            annotation?.count !== undefined
              ? `${item.label} (${annotation.count} outstanding)`
              : annotation?.complete
                ? `${item.label} (complete)`
                : item.label;

          return (
            <NavLink
              key={item.path}
              to={projectId ? projectNavHref(projectId, item.path) : '/'}
              end={item.end}
              aria-label={accessibleName}
              className={({ isActive }) =>
                [
                  'relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 pb-1.5 pt-2 text-[10px] font-medium leading-tight transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    className={[
                      'absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0',
                    ].join(' ')}
                  />
                  <span className="relative">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {annotation?.count !== undefined && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    )}
                  </span>
                  <span className="w-full truncate text-center">
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
