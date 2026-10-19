import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.spec.ts'],
          globalSetup: ['test/global-setup.ts'],
          setupFiles: ['test/setup-env.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
