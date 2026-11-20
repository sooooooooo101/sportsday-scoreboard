// Local development only: mutate emulator data to watch the display react.
// usage: node scripts/dev-poke.mjs score C 1 blue 40 | hide | reveal
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, updateDoc } from 'firebase/firestore'
const [cmd, id, match, team, value] = process.argv.slice(2)
const env = await initializeTestEnvironment({ projectId: 'demo-sportsday', firestore: { host: '127.0.0.1', port: 8080 } })
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore()
  if (cmd === 'score') await updateDoc(doc(db, 'competitions', id), { [`scores.${match}.${team}`]: Number(value) })
  if (cmd === 'hide') await updateDoc(doc(db, 'settings', 'app'), { hidden: true })
  if (cmd === 'reveal') await updateDoc(doc(db, 'settings', 'app'), { hidden: false })
})
await env.cleanup()
