import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rendererSrcPath = fileURLToPath(new URL('./src/renderer/src', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': rendererSrcPath,
      '@renderer': rendererSrcPath
    }
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/*.test.*', 'src/main/index.ts', 'src/preload/index.ts']
    }
  }
})
