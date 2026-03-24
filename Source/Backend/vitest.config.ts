import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    setupFiles: [],
    alias: {
      '@shared': path.resolve(__dirname, '../Shared'),
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../Shared'),
    },
  },
});
