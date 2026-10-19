import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      include: ['src/lib/**/*.ts'],
      provider: 'v8',
      thresholds: {
        100: true,
      },
    },
  },
});
