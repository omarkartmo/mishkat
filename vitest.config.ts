import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    globals: true,
    fileParallelism: false,
    maxWorkers: 1,
    isolate: false,
    include: ['tests/**/*.test.ts'],
    env: {
      JWT_SECRET: 'mishkat_jwt_secret_test_key_at_least_32_characters_123456',
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
