import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/__tests__/database.integration.test.ts'], fileParallelism: false, testTimeout: 15_000, hookTimeout: 30_000 } });
