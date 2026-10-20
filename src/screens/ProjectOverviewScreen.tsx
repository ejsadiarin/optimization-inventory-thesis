import { useOutletContext } from 'react-router-dom';
import { Coins, Ruler, Wrench } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Project } from '@/db/types';
import { formatMeters, formatPeso } from '@/lib/format';

const PROJECT_MODULES = [
  'Structural members — define columns, beams, and slabs',
  'Inventory — track phenolic boards and lumber pieces',
  'Optimization — match reuse and plan cuts',
  'Summary — review utilization, waste, reuse, and savings',
  'Settings — adjust material costs and stock sizes',
];

export default function ProjectOverviewScreen() {
  const project = useOutletContext<Project>();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-sm text-muted-foreground">Project overview and configuration.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="h-4 w-4 text-primary" /> Material costs
            </CardTitle>
            <CardDescription>Used to estimate procurement savings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phenolic board</span>
              <span className="font-medium">{formatPeso(project.costs.phenolicPerSheet)} / sheet</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lumber</span>
              <span className="font-medium">{formatPeso(project.costs.lumberPerPiece)} / piece</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-4 w-4 text-primary" /> Stock sizes
            </CardTitle>
            <CardDescription>Purchased dimensions used in cutting plans.</CardDescription>
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4 text-primary" /> Project modules
          </CardTitle>
          <CardDescription>Modules available in this project.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            {PROJECT_MODULES.map((module) => (
              <li key={module}>{module}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
