import type { ProjectCosts, ProjectStock } from '@/db/types';

export interface LegacyProject {
  id: string;
  name: string;
  accessCode: string;
  createdAt: string;
  costs: ProjectCosts;
  stock: ProjectStock;
}
