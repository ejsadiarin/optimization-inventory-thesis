import { createContext } from 'react';
import type { ProjectNotification } from '@/lib/projectNotifications';
import type {
  ProjectChecklistItem,
  ProjectNavAnnotation,
  ProjectProgressCounts,
} from '@/lib/projectProgress';

export interface ProjectProgressValue {
  loading: boolean;
  error: boolean;
  counts: ProjectProgressCounts;
  checklist: ProjectChecklistItem[];
  nav: Partial<Record<string, ProjectNavAnnotation>>;
  notifications: ProjectNotification[];
  reload: () => void;
}

export const ProjectProgressContext = createContext<ProjectProgressValue | null>(null);
