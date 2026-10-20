export interface ProjectNavItem {
  path: string;
  label: string;
  end?: boolean;
}

export const PROJECT_NAV_ITEMS: ProjectNavItem[] = [
  { path: '', label: 'Overview', end: true },
  { path: 'members', label: 'Members' },
  { path: 'settings', label: 'Settings' },
];

export function projectBasePath(projectId: string): string {
  return `/projects/${projectId}`;
}

export function projectNavHref(projectId: string, path: string): string {
  return path ? `${projectBasePath(projectId)}/${path}` : projectBasePath(projectId);
}
