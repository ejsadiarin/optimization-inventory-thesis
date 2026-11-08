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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff,woff2}'],
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase';
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router')
          ) {
            return 'react';
          }
        },
      },
    },
  },
  server: {
    watch: {
      ignored: [
        '**/meeting-screenshots/**',
        '**/docs/figures/**',
        '**/.playwright-mcp/**',
        '**/emulator-data/**',
        '**/coverage/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
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
