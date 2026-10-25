import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    'import.meta.env.VITE_USE_FIREBASE_EMULATOR': JSON.stringify('true'),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.emulator.test.ts'],
    restoreMocks: true,
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
