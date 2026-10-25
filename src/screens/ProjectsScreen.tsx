import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, FolderPlus, KeyRound, Plus, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/auth/AuthProvider';
import { createProject, listProjects } from '@/db/projects';
import { seedDemoProject } from '@/db/seed';
import { importLegacyData } from '@/migration/importLegacyData';
import type { CreatedProject, Project } from '@/db/types';
import { formatDate } from '@/lib/format';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

export default function ProjectsScreen() {
  const { user } = useAuth();
  const refreshSignal = useRefreshSignal();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [createError, setCreateError] = useState('');
  const [createdProject, setCreatedProject] = useState<CreatedProject | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState('');
  const [importing, setImporting] = useState(
    () => localStorage.getItem('formwork.firestore-migration.v1') !== 'done',
  );
  const [importError, setImportError] = useState('');

  async function refresh() {
    try {
      setProjects(await listProjects());
      setLoadError('');
    } catch {
      setLoadError('Could not load projects. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    if (localStorage.getItem('formwork.firestore-migration.v1') === 'done') {
      setImporting(false);
      void refresh();
      return;
    }
    setImporting(true);
    setImportError('');
    void importLegacyData({ uid: user.uid, name: user.displayName })
      .then(() => {
        setImporting(false);
        void refresh();
      })
      .catch(() => {
        setImportError('Could not import local projects. Please try again.');
        setImporting(false);
      });
  }, [user, refreshSignal]);

  function retryImport() {
    if (!user) return;
    setImportError('');
    setImporting(true);
    void importLegacyData({ uid: user.uid, name: user.displayName })
      .then(() => {
        setImporting(false);
        void refresh();
      })
      .catch(() => {
        setImportError('Could not import local projects. Please try again.');
        setImporting(false);
      });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setNameError('Project name is required.');
      return;
    }
    if (!user) {
      setNameError('Sign in to create a project.');
      return;
    }

    try {
      const created = await createProject(
        { name },
        { uid: user.uid, name: user.displayName },
      );
      setCreateOpen(false);
      setName('');
      setNameError('');
      setCreateError('');
      setCreatedProject(created);
      await refresh();
    } catch {
      setCreateError('Could not create the project. Please try again.');
    }
  }

  async function handleSeedDemo() {
    if (!user) return;
    setSeeding(true);
    setSeedError('');
    try {
      const result = await seedDemoProject({ uid: user.uid, name: user.displayName });
      setCreatedProject({ project: result.project, accessCode: result.accessCode });
      await refresh();
    } catch {
      setSeedError('Could not load demo data. Please try again.');
    } finally {
      setSeeding(false);
    }
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    setCreateError('');
  }

  function closeCodeDialog() {
    setCreatedProject(null);
    void refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">Shared with every signed-in account.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSeedDemo} disabled={seeding}>
            {seeding ? 'Loading…' : 'Load demo data'}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {loadError}
        </p>
      )}

      {seedError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {seedError}
        </p>
      )}

      {importing && (
        <p className="text-sm text-muted-foreground">Importing local projects…</p>
      )}

      {importError && (
        <div role="alert" className="space-y-2">
          <p className="text-sm font-medium text-destructive">{importError}</p>
          <Button type="button" variant="outline" size="sm" onClick={retryImport}>
            Retry import
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <FolderPlus className="h-6 w-6" />
            </span>
            <div>
              <p className="font-medium">No projects yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first project to start planning cuts.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link to={`/projects/${project.id}`} className="block">
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate">{project.name}</CardTitle>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {project.ownerId === user?.uid && <Badge>Mine</Badge>}
                        <Badge variant="secondary">Locked</Badge>
                      </div>
                    </div>
                    <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(project.createdAt)}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <UserRound className="h-3.5 w-3.5" />
                        <span className="truncate">{project.ownerName}</span>
                      </span>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateError('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>
              A one-time access code will be generated to protect this project.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="space-y-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={name}
                placeholder="e.g. Two-Storey Residence — Phase 1"
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError('');
                  if (createError) setCreateError('');
                }}
              />
              {nameError && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {nameError}
                </p>
              )}
              {createError && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {createError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeCreateDialog}>
                Cancel
              </Button>
              <Button type="submit">Create Project</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createdProject !== null}
        onOpenChange={(open) => {
          if (!open) closeCodeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <DialogTitle>Save this access code</DialogTitle>
            <DialogDescription>
              This code is shown only once. Everyone, including you, needs it to open{' '}
              {createdProject?.project.name ?? 'this project'}.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/50 py-5 text-center">
            <p data-testid="access-code" className="font-mono text-3xl font-bold tracking-[0.4em]">
              {createdProject?.accessCode}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" className="w-full" onClick={closeCodeDialog}>
              I&apos;ve saved the code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
