import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Project } from '@/db/types';
import { lockProject } from '@/lib/projectSession';
import { PROJECT_NAV_ITEMS, projectNavHref } from '@/screens/projectNav';

export default function ProjectLayout() {
  const project = useOutletContext<Project>();
  const { projectId } = useParams();
  const navigate = useNavigate();

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
        <nav className="container flex gap-1 overflow-x-auto pb-2">
          {PROJECT_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={projectId ? projectNavHref(projectId, item.path) : '/'}
              end={item.end}
              className={({ isActive }) =>
                [
                  'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="container flex-1 py-5">
        <Outlet context={project} />
      </main>
    </div>
  );
}
