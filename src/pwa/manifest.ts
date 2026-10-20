import type { ManifestOptions } from 'vite-plugin-pwa';

export const PWA_MANIFEST = {
  name: 'Formwork Cutting Optimizer',
  short_name: 'Formwork',
  description:
    'Plan formwork cuts, reuse offcuts, and track phenolic board and lumber inventory offline.',
  theme_color: '#1c1917',
  background_color: '#faf8f5',
  display: 'standalone',
  scope: '/',
  start_url: '/',
  icons: [
    {
      src: '/icons/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: '/icons/maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
} satisfies Partial<ManifestOptions>;

export const PWA_MANIFEST_FILENAME = 'manifest.webmanifest';
