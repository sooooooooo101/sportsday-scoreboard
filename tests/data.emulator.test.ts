// @vitest-environment node
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, disableNetwork, doc, enableNetwork, getDocs, getFirestore, onSnapshot, terminate, updateDoc } from 'firebase/firestore'
import { initializeApp } from 'firebase/app'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { makeEnv } from './rules-helpers'
import { SEED_COMPETITIONS } from '../src/shared/seed'

const EMAIL = 'scorer@sportsday.test'
const PASS = 'test-passcode-1234'

vi.stubEnv('VITE_USE_EMULATOR', 'true')
vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'demo-sportsday')
vi.stubEnv('VITE_FIREBASE_API_KEY', 'fake-api-key')
vi.stubEnv('VITE_SCORER_EMAIL', EMAIL)

let env: RulesTestEnvironment
let api: typeof import('../src/admin/adminApi')
let sub: typeof import('../src/shared/subscribe')
let fb: typeof import('../src/shared/firebase')

async function createScorer(): Promise<string> {
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-sportsday/accounts', { method: 'DELETE' })
  const res = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }),
  })
  return (await res.json()).localId
}


function waitFor(pred: (b: import('../src/shared/subscribe').BoardState) => boolean, opts = {}) {
  return new Promise<import('../src/shared/subscribe').BoardState>((resolve, reject) => {
    let off = () => {}
    const timer = setTimeout(() => { off(); reject(new Error('timeout waiting for board')) }, 8000)
    off = sub.subscribeBoard(b => { if (pred(b)) { clearTimeout(timer); queueMicrotask(off); resolve(b) } }, opts)
  })
}


// What setResultsHidden does, done directly (the display tests run signed out).
const hideE = (hidden: boolean) => env.withSecurityRulesDisabled(async ctx => {
  await updateDoc(doc(ctx.firestore(), 'competitions', 'E'), { hidden })
  await updateDoc(doc(ctx.firestore(), 'settings', 'app'), { hidden })
})

beforeAll(async () => {
  const uid = await createScorer()
  env = await makeEnv(uid)
  fb = await import('../src/shared/firebase')
  api = await import('../src/admin/adminApi')
  sub = await import('../src/shared/subscribe')
})
afterAll(async () => { await api.signOutScorer(); await terminate(fb.db); await env.cleanup() })
beforeEach(async () => {
  await env.clearFirestore()
  await api.signInWithPasscode(PASS)
})

test('合言葉が違うとログインに失敗する', async () => {
  await api.signOutScorer()
  await expect(api.signInWithPasscode('wrong-passcode')).rejects.toThrow()
})

test('seedIfEmpty は 1 回目 true、2 回目 false', async () => {
  expect(await api.seedIfEmpty()).toBe(true)
  expect(await api.seedIfEmpty()).toBe(false)
  const snap = await getDocs(collection(fb.db, 'competitions'))
  expect(snap.size).toBe(5)
})

test('setScore は渡された変更前の値を返し、log が 1 件増える', async () => {
  await api.seedIfEmpty()
  expect(await api.setScore('C', 1, 'blue', 40, 0)).toBe(0)
  expect(await api.setScore('C', 1, 'blue', 25, 40)).toBe(40)
  const logs = await getDocs(collection(fb.db, 'log'))
  expect(logs.size).toBe(2)
  expect(logs.docs.map(d => d.data().to).sort()).toEqual([25, 40])
})

test('試合 1 の blue と試合 2 の white を同時に setScore しても、両方残る', async () => {
  await api.seedIfEmpty()
  await Promise.all([api.setScore('C', 1, 'blue', 40, 0), api.setScore('C', 2, 'white', 10, 0)])
  const b = await waitFor(b => {
    const c = b.competitions.find(x => x.id === 'C')
    return !!c?.scores['1']?.blue && !!c?.scores['2']?.white
  }, { includeHidden: true })
  const c = b.competitions.find(x => x.id === 'C')!
  expect(c.scores['1'].blue).toBe(40)
  expect(c.scores['2'].white).toBe(10)
})

test('オフライン中の入力はすぐ画面に反映され、再接続で送られる', async () => {
  await api.seedIfEmpty()
  await waitFor(b => b.competitions.length === 5, { includeHidden: true })
  await disableNetwork(fb.db)
  let sent = false
  const write = api.setScore('A', 1, 'blue', 7, 0).then(() => { sent = true })
  const local = await waitFor(b => b.competitions.find(c => c.id === 'A')?.scores['1']?.blue === 7, { includeHidden: true })
  expect(local.competitions.find(c => c.id === 'A')!.scores['1'].blue).toBe(7)
  await new Promise(r => setTimeout(r, 300))
  expect(sent).toBe(false)
  await enableNetwork(fb.db)
  await write
  expect(sent).toBe(true)
  let serverBlue: unknown
  await env.withSecurityRulesDisabled(async ctx => {
    serverBlue = (await getDocs(collection(ctx.firestore(), 'competitions'))).docs.find(d => d.id === 'A')!.data().scores['1'].blue
  })
  expect(serverBlue).toBe(7)
})

test('設定と競技設定の変更も、サーバー時刻つきで log に残る', async () => {
  await api.seedIfEmpty()
  await api.updateSettings({ hidden: true })
  await api.updateCompetition('D', { matchCount: 2 })
  await api.setScore('C', 1, 'blue', 40, 0)
  const logs = (await getDocs(collection(fb.db, 'log'))).docs.map(d => d.data())
  expect(logs.map(l => l.kind).sort()).toEqual(['competition', 'score', 'settings'])
  expect(logs.find(l => l.kind === 'settings')!.patch).toEqual({ hidden: true })
  expect(logs.find(l => l.kind === 'competition')).toMatchObject({ id: 'D', patch: { matchCount: 2 } })
  expect(logs.every(l => typeof l.at?.toMillis === 'function')).toBe(true)
})

test('settings だけ消えていても、seedIfEmpty が作り直す（競技は上書きしない）', async () => {
  await api.seedIfEmpty()
  await api.setScore('C', 1, 'blue', 40, 0)
  await env.withSecurityRulesDisabled(async ctx => { const { deleteDoc } = await import('firebase/firestore'); await deleteDoc(doc(ctx.firestore(), 'settings', 'app')) })
  expect(await api.seedIfEmpty()).toBe(true)
  const b = await waitFor(b => b.settings !== null && b.competitions.length === 5, { includeHidden: true })
  expect(b.competitions.find(c => c.id === 'C')!.scores['1'].blue).toBe(40)
})

test('setResultsHidden は settings と、hideFromOrder 以降の競技の hidden をまとめて切り替える', async () => {
  await api.seedIfEmpty()
  await api.setResultsHidden(true, 4, SEED_COMPETITIONS)
  const read = async () => {
    const snap = await getDocs(collection(fb.db, 'competitions'))
    return Object.fromEntries(snap.docs.map(d => [d.id, d.data().hidden ?? false]))
  }
  expect(await read()).toEqual({ A: false, B: false, C: true, D: false, E: true })
  await api.setResultsHidden(false, 4, SEED_COMPETITIONS)
  expect(await read()).toEqual({ A: false, B: false, C: false, D: false, E: false })
})

test('updateCompetition と updateSettings が反映される', async () => {
  await api.seedIfEmpty()
  await api.updateCompetition('D', { name: '新しい競技', matchCount: 3 })
  await api.updateSettings({ capMode: 'perTeam' })
  const b = await waitFor(b => b.settings?.capMode === 'perTeam' && b.competitions.some(c => c.name === '新しい競技'), { includeHidden: true })
  expect(b.competitions.find(c => c.id === 'D')!.matchCount).toBe(3)
})

describe('未ログインの表示画面', () => {
  beforeEach(async () => { await api.seedIfEmpty(); await api.setScore('E', 1, 'blue', 50, 0) })

  test('hidden=false なら E を含めて全競技が届く', async () => {
    await api.signOutScorer()
    const b = await waitFor(b => b.connected && b.competitions.length === 5)
    expect(b.hiddenIds).toEqual([])
  })

  test('hidden=true にすると E を competitions から外し、hiddenIds に E を入れる。戻すと再び含める', async () => {
    await api.signOutScorer()
    await waitFor(b => b.competitions.length === 5)
    await hideE(true)
    const hidden = await waitFor(b => b.settings?.hidden === true && b.hiddenIds.includes('E'))
    expect(hidden.competitions.map(c => c.id).sort()).toEqual(['A', 'B', 'C', 'D'])
    await hideE(false)
    const back = await waitFor(b => b.settings?.hidden === false && b.competitions.find(c => c.id === 'E')?.scores['1']?.blue === 50)
    expect(back.hiddenIds).toEqual([])
    expect(back.competitions.find(c => c.id === 'E')!.scores['1'].blue).toBe(50)
  })

  test('1 つの購読のまま 隠す → 発表 しても、隠している間に E のデータが出ることはなく、発表後に戻る', async () => {
    await api.signOutScorer()
    const seen: import('../src/shared/subscribe').BoardState[] = []
    let resolveBack!: () => void
    const back = new Promise<void>(r => { resolveBack = r })
    const off = sub.subscribeBoard(b => {
      seen.push(b)
      if (seen.some(x => x.settings?.hidden) && !b.settings?.hidden && b.competitions.find(c => c.id === 'E')?.scores['1']?.blue === 50) resolveBack()
    })
    try {
      await new Promise(r => setTimeout(r, 500))
      await hideE(true)
      await new Promise(r => setTimeout(r, 800))
      await hideE(false)
      await Promise.race([back, new Promise((_, rej) => setTimeout(() => rej(new Error('E did not come back')), 8000))])
    } finally { off() }
    expect(seen.some(b => b.settings?.hidden === true && b.hiddenIds.includes('E'))).toBe(true)
    expect(seen.filter(b => b.settings?.hidden).every(b => !b.competitions.some(c => c.id === 'E'))).toBe(true)
  })

  test('隠したあとに入れた E の点数は、隠す前から開いていた未ログインのリスナーにも届かない', async () => {
    // A raw listener that never unsubscribes models a modified client.
    const anonApp = initializeApp({ projectId: 'demo-sportsday', apiKey: 'fake-api-key' }, 'anon-leak-test')
    const anonDb = getFirestore(anonApp)
    connectFirestoreEmulator(anonDb, '127.0.0.1', 8080)
    const values: number[] = []
    let denied = false
    const off = onSnapshot(doc(anonDb, 'competitions', 'E'),
      s => { const v = s.data()?.scores?.['2']?.white; if (typeof v === 'number') values.push(v) },
      () => { denied = true })
    try {
      await new Promise(r => setTimeout(r, 500))
      await api.setResultsHidden(true, 5, SEED_COMPETITIONS)
      await new Promise(r => setTimeout(r, 500))
      await api.setScore('E', 2, 'white', 30, 0)
      await new Promise(r => setTimeout(r, 1000))
    } finally { off(); await terminate(anonDb) }
    expect(values).not.toContain(30)
    expect(denied).toBe(true)
  })

  test('最初から hidden=true でも、E は hiddenIds に入る', async () => {
    await api.setResultsHidden(true, 5, SEED_COMPETITIONS)
    await api.signOutScorer()
    const b = await waitFor(b => b.settings?.hidden === true && b.hiddenIds.includes('E') && b.competitions.length === 4)
    expect(b.competitions.some(c => c.id === 'E')).toBe(false)
  })
})
