import { describe, expect, it } from 'vitest';
import { PROJECT_NAV_ITEMS, projectNavHref } from './projectNav';

describe('project navigation', () => {
  it('places Summary immediately after Optimize', () => {
    const labels = PROJECT_NAV_ITEMS.map((item) => item.label);
    const optimizeIndex = labels.indexOf('Optimize');

    expect(labels[optimizeIndex + 1]).toBe('Summary');
  });

  it('builds the summary route from the project id', () => {
    expect(projectNavHref('project-1', 'summary')).toBe('/projects/project-1/summary');
  });
});
