import { describe, expect, it } from 'vitest';
import { crossSectionLabel, shortId } from './format';

describe('shortId', () => {
  it('shows the first eight characters in uppercase', () => {
    expect(shortId('abcdef12-3456-7890')).toBe('ABCDEF12');
  });
});

describe('crossSectionLabel', () => {
  it('renders a multiplication sign between lumber dimensions', () => {
    expect(crossSectionLabel('2x3')).toBe('2×3');
    expect(crossSectionLabel('2x4')).toBe('2×4');
  });
});
