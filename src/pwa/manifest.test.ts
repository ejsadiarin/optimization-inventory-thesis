import { describe, expect, it } from 'vitest';
import { PWA_MANIFEST } from './manifest';

describe('PWA manifest', () => {
  it('declares installable app metadata', () => {
    expect(PWA_MANIFEST).toMatchObject({
      name: 'Formwork Cutting Optimizer',
      short_name: 'Formwork',
      display: 'standalone',
      start_url: '/',
      theme_color: '#1c1917',
      background_color: '#faf8f5',
    });
    expect(PWA_MANIFEST.description.length).toBeGreaterThan(20);
  });

  it('includes 192, 512, and maskable icons', () => {
    const sizes = PWA_MANIFEST.icons.map((icon) => `${icon.sizes}:${icon.purpose}`);

    expect(sizes).toContain('192x192:any');
    expect(sizes).toContain('512x512:any');
    expect(sizes).toContain('512x512:maskable');
    for (const icon of PWA_MANIFEST.icons) {
      expect(icon.src).toMatch(/^\/icons\/.+\.png$/);
    }
  });
});
