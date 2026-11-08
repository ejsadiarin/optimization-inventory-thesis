import { describe, expect, it } from 'vitest';
import { PROJECT_NAV_ITEMS, projectNavHref } from './projectNav';

describe('project navigation', () => {
  it('shows the five project sections in order', () => {
    expect(PROJECT_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Members',
      'Inventory',
      'Planner',
      'Review & commit',
      'Settings',
    ]);
  });

  it('builds the planner route from the project id', () => {
    expect(projectNavHref('project-1', 'planner')).toBe('/projects/project-1/planner');
  });
});
