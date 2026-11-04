import { createContext } from 'react';
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
  reload: () => void;
}

export const ProjectProgressContext = createContext<ProjectProgressValue | null>(null);
