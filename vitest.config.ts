import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

const emulatorTests = ['tests/rules.test.ts', 'tests/data.emulator.test.ts']

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 20000,
    // Emulator-backed suites run only via `npm run test:emu` (needs Java + emulators)
    // Each emulator suite installs its own rules, so they must not run concurrently
    fileParallelism: !process.env.EMU,
    exclude: process.env.EMU ? [...configDefaults.exclude] : [...configDefaults.exclude, ...emulatorTests],
  },
})
