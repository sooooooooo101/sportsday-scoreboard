import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'

export const PROJECT_ID = 'demo-sportsday'
export const TEST_SCORER_UID = 'test-scorer-uid'

/** Rules ship with a SCORER_UID marker; tests swap in a known uid. */
export function rulesWithUid(uid: string) {
  return readFileSync('firestore.rules', 'utf8').replaceAll('SCORER_UID', uid)
}

export function makeEnv(uid = TEST_SCORER_UID): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: rulesWithUid(uid), host: '127.0.0.1', port: 8080 },
  })
}

/** The previous emulator suite's closing streams can cancel the first clear; retry once. */
export async function clearFirestore(env: RulesTestEnvironment) {
  try { await env.clearFirestore() }
  catch (e) {
    if (!String((e as Error)?.message ?? e).includes('CANCELLED')) throw e
    await new Promise(r => setTimeout(r, 300))
    await env.clearFirestore()
  }
}
