import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { PWA_MANIFEST, PWA_MANIFEST_FILENAME } from './src/pwa/manifest';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifestFilename: PWA_MANIFEST_FILENAME,
      manifest: PWA_MANIFEST,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    exclude: [...configDefaults.exclude, '**/*.emulator.test.ts'],
  },
});
