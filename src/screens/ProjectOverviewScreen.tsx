import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle, Ruler } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoHint } from '@/components/ui/info-hint';
import { ErrorState } from '@/components/ui/error-state';
import { PageHeader } from '@/components/ui/page-header';
import type { Project } from '@/db/types';
import { getNextProjectAction } from '@/lib/projectProgress';
import { formatMeters } from '@/lib/format';
import { useProjectProgress } from '@/lib/useProjectProgress';
import { projectNavHref } from '@/screens/projectNav';

export default function ProjectOverviewScreen() {
  const project = useOutletContext<Project>();
  const { loading, error, counts, checklist, reload } = useProjectProgress();
  const nextAction = loading || error ? null : getNextProjectAction(counts);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title={project.name}
        description="Project overview, setup checklist, and configuration."
        actions={
          nextAction ? (
            <Button asChild>
              <Link to={projectNavHref(project.id, nextAction.path)}>
                {nextAction.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : undefined
        }
      />

      {error && (
        <ErrorState
          title="Could not load project progress"
          message="Check your connection and try again."
          onRetry={reload}
        />
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-1">
            <CardTitle className="text-base">Project checklist</CardTitle>
            <InfoHint label="Project checklist">
              Work through the required steps. Lumber and inventory are optional.
            </InfoHint>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-2 text-sm text-muted-foreground">Loading project progress…</p>
          ) : (
            <ul className="divide-y">
              {checklist.map((item) => (
                <li key={item.id}>
                  <Link
                    to={projectNavHref(project.id, item.path)}
                    className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    {item.complete ? (
                      <CheckCircle2
                        className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                        aria-label={`${item.label} complete`}
                      />
                    ) : (
                      <Circle
                        className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                        {item.label}
                        {item.optional && <Badge variant="outline">Optional</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    {!item.optional && (
                      <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                        {item.complete ? 'Complete' : 'To do'}
                      </span>
                    )}
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-4 w-4 text-primary" /> Stock sizes
              <InfoHint label="Stock sizes">
                Purchased dimensions used in cutting plans.
              </InfoHint>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phenolic sheet</span>
              <span className="font-medium">
                {formatMeters(project.stock.phenolic.length)} × {formatMeters(project.stock.phenolic.width)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Lumber lengths</span>
              <span className="text-right font-medium">
                {project.stock.lumberLengths.map((length) => formatMeters(length)).join(', ')}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
