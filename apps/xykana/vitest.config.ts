import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    threads: true,
    isolate: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}']
  }
})
