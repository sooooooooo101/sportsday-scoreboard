// Writes .deploy/firestore.rules with the real scorer UID, so the tracked
// firestore.rules keeps its SCORER_UID marker (the emulator tests rely on it).
// usage: node scripts/build-rules.ts   (reads SCORER_UID from env or .env.local)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const MARKER = 'SCORER_UID'
// Firebase Auth UIDs are alphanumeric; anything else could break out of the rules string.
const UID_PATTERN = /^[A-Za-z0-9]{20,128}$/

export function injectUid(template: string, uid: string): string {
  if (!UID_PATTERN.test(uid) || uid === MARKER) throw new Error('SCORER_UID が正しくありません（Firebase の UID を入れてください）')
  if (!template.includes(`'${MARKER}'`)) throw new Error(`firestore.rules に '${MARKER}' がありません`)
  return template.replaceAll(`'${MARKER}'`, `'${uid}'`)
}

export function readEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fileEnv = existsSync('.env.local') ? readEnvFile(readFileSync('.env.local', 'utf8')) : {}
  const uid = process.env.SCORER_UID ?? fileEnv.SCORER_UID ?? ''
  const rules = injectUid(readFileSync('firestore.rules', 'utf8'), uid)
  mkdirSync('.deploy', { recursive: true })
  writeFileSync('.deploy/firestore.rules', rules)
  console.log('wrote .deploy/firestore.rules')
}
