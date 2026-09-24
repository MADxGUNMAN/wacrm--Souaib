import { defineConfig } from 'vitest/config';

// Separate from the repo root's vitest config on purpose. The root suite
// is scoped to `src/**/*.test.ts` (Next.js, TypeScript), while this one
// covers plain Apps Script files that share a global scope and have no
// module system. Keeping them apart means neither project's test run can
// be confused by the other's conventions.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
