import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./test/warmup.ts'],
    coverage: {
      provider: 'v8'
    },
    include: ['src/**/*.test.ts']
  }
})
