import { describe, expect, it } from 'vitest';
import { PROJECT_NAV_ITEMS, projectNavHref } from './projectNav';

describe('project navigation', () => {
  it('places Settings immediately after Optimize and omits Summary', () => {
    const labels = PROJECT_NAV_ITEMS.map((item) => item.label);
    const optimizeIndex = labels.indexOf('Optimize');

    expect(labels[optimizeIndex + 1]).toBe('Settings');
    expect(labels).not.toContain('Summary');
  });

  it('builds the settings route from the project id', () => {
    expect(projectNavHref('project-1', 'settings')).toBe('/projects/project-1/settings');
  });
});
