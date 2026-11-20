// Moves the built admin page from dist/admin to dist/<ADMIN_PATH>, so it is
// not reachable at a guessable URL. The passcode and the Firestore rules remain
// the real protection; this only keeps the login page out of sight.
// usage: node scripts/move-admin.ts   (reads ADMIN_PATH from env or .env.local)
import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { readEnvFile } from './build-rules.ts'

const PATTERN = /^[a-z0-9]{24,64}$/

export function validateAdminPath(p: string): string {
  if (!PATTERN.test(p)) throw new Error('ADMIN_PATH は小文字英数字 24〜64 文字にしてください（例: openssl rand -hex 16）')
  return p
}

export function moveAdmin(distDir: string, adminPath: string): void {
  const from = join(distDir, 'admin')
  if (!existsSync(from)) throw new Error(`${from} がありません。先に npm run build を実行してください`)
  renameSync(from, join(distDir, validateAdminPath(adminPath)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fileEnv = existsSync('.env.local') ? readEnvFile(readFileSync('.env.local', 'utf8')) : {}
  const adminPath = validateAdminPath(process.env.ADMIN_PATH ?? fileEnv.ADMIN_PATH ?? '')
  moveAdmin('dist', adminPath)
  console.log('admin page moved to its secret path')
}
