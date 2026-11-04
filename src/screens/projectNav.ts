export interface ProjectNavItem {
  path: string;
  label: string;
  shortLabel?: string;
  end?: boolean;
  separatorBefore?: boolean;
}

export const PROJECT_NAV_ITEMS: ProjectNavItem[] = [
  { path: '', label: 'Overview', end: true },
  { path: 'members', label: 'Members' },
  { path: 'inventory', label: 'Inventory' },
  { path: 'optimize', label: 'Optimize' },
  { path: 'settings', label: 'Settings' },
  { path: 'focus', label: 'Member planner', shortLabel: 'Planner', separatorBefore: true },
];

export function projectBasePath(projectId: string): string {
  return `/projects/${projectId}`;
}

export function projectNavHref(projectId: string, path: string): string {
  return path ? `${projectBasePath(projectId)}/${path}` : projectBasePath(projectId);
}
