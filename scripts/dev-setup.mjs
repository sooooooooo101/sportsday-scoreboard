// Local development only: creates the scorer account in the Auth emulator,
// installs the rules with its uid, and seeds Firestore. Never touches production.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { readFileSync } from 'node:fs'
import { doc, setDoc } from 'firebase/firestore'

const PROJECT = 'demo-sportsday'
const EMAIL = process.env.VITE_SCORER_EMAIL ?? 'scorer@sportsday.test'
const PASS = process.env.DEV_PASSCODE ?? 'dev-passcode-1234'

await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' })
const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }),
})
const { localId } = await res.json()

const env = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8').replaceAll('SCORER_UID', localId) },
})
if (process.argv.includes('--seed')) {
  const seed = await import('./dev-seed-data.mjs')
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore()
    for (const c of seed.competitions) await setDoc(doc(db, 'competitions', c.id), c)
    await setDoc(doc(db, 'settings', 'app'), seed.settings)
  })
}
await env.cleanup()
console.log(`dev scorer ready: ${EMAIL} (uid ${localId})`)
