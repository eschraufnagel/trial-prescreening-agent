import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Worker threads rather than the default child processes. Startup, not the
    // tests themselves, is most of the one-second budget: forks measured
    // 1.00-1.05 s, threads 0.71-0.75 s, with the same 489 tests (slice 0005).
    pool: "threads",
    // Files in a worker share one module cache instead of each loading its own
    // (slice 0006). Startup was most of the budget: eight small test files took
    // the suite from 0.80 s to 1.00 s, and this brings all 645 tests to 0.41 s.
    // Safe here because no test mocks a module or stubs a global; the suite
    // passed shuffled under five seeds before this was turned on.
    isolate: false,
  },
});
