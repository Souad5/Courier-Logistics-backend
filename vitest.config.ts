import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/**/*.test.ts"],
    // Integration tests share one live Postgres connection pool and create/
    // clean up their own rows — run everything in a single worker/thread so
    // they reuse the one cached PrismaClient (see src/config) instead of
    // several files each opening a fresh pool against the Neon pooler, which
    // free-tier Neon can refuse under a connection burst right after a
    // cold start.
    fileParallelism: false,
    isolate: false,
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
    globalSetup: ["./tests/helpers/globalSetup.ts"],
    // The dev DB is a remote Neon branch; generous timeouts absorb its
    // cold-start/connection-burst latency rather than failing tests spuriously.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    retry: 1,
  },
});
