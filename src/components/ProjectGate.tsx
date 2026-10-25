import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getProject, verifyProjectAccess } from '@/db/projects';
import type { Project } from '@/db/types';
import { isProjectUnlocked, unlockProject } from '@/lib/projectSession';
import { useRefreshSignal } from '@/lib/useRefreshSignal';

type LoadState = 'loading' | 'ready' | 'missing';

export default function ProjectGate() {
  const { projectId } = useParams();
  const refreshSignal = useRefreshSignal();
  const loadedProjectId = useRef<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [unlocked, setUnlocked] = useState(() => (projectId ? isProjectUnlocked(projectId) : false));

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    const backgroundRefresh = loadedProjectId.current === projectId;
    if (!backgroundRefresh) setState('loading');
    setUnlocked(isProjectUnlocked(projectId));

    void getProject(projectId)
      .then((found) => {
        if (cancelled) return;
        loadedProjectId.current = projectId;
        setProject(found ?? null);
        setState(found ? 'ready' : 'missing');
      })
      .catch(() => {
        if (cancelled || backgroundRefresh) return;
        setProject(null);
        setState('missing');
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, refreshSignal]);

  if (!projectId) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Missing project. <Link className="text-primary underline" to="/">Back to projects</Link>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading project…
      </div>
    );
  }

  if (state === 'missing' || !project) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>Project not found</CardTitle>
            <CardDescription>This project is not available online.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/">Back to projects</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (unlocked) {
    return <Outlet context={project} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    const valid = await verifyProjectAccess(projectId, code);
    if (valid) {
      unlockProject(projectId);
      setError('');
      setUnlocked(true);
    } else {
      setError('Incorrect access code. Please try again.');
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <CardTitle>Enter access code</CardTitle>
          <CardDescription>
            “{project.name}” is protected. Enter the code shown when it was created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="access-code">Access code</Label>
              <Input
                id="access-code"
                value={code}
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={6}
                className="text-center font-mono text-lg tracking-[0.4em]"
                onChange={(event) => setCode(event.target.value)}
              />
              {error && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full">
              Unlock Project
            </Button>
            <Button asChild type="button" variant="ghost" className="w-full">
              <Link to="/">Back to projects</Link>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
