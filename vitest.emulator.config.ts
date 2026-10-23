import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.emulator.test.ts'],
    restoreMocks: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
