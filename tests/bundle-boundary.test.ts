import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap(n => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
  })

// Code reachable from the public display page must not pull in Auth or the scorer email (SEC-001).
const publicSide = [...filesUnder('src/shared'), ...filesUnder('src/display')]

test.each(publicSide)('%s は firebase/auth を読み込まない', f =>
  expect(readFileSync(f, 'utf8')).not.toMatch(/from 'firebase\/auth'/))

test.each(publicSide)('%s は VITE_SCORER_EMAIL を参照しない', f =>
  expect(readFileSync(f, 'utf8')).not.toContain('VITE_SCORER_EMAIL'))

// `import.meta.env` as a whole object makes Vite inline every VITE_* variable into the bundle.
test.each(filesUnder('src'))('%s は import.meta.env をオブジェクトごと使わない', f =>
  expect(readFileSync(f, 'utf8')).not.toMatch(/import\.meta\.env(?!\.)/))
