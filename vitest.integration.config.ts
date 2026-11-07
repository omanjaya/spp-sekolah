import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Test integrasi dengan database Postgres sungguhan (DATABASE_URL wajib menunjuk DB kosong/sekali pakai).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
