import { SEED_COMPETITIONS, SEED_SETTINGS } from '../src/shared/seed'
import type { BoardState } from '../src/shared/subscribe'

type L = { next: (s: unknown) => void; error: (e: unknown) => void }
const listeners = new Map<string, L>()

vi.mock('../src/shared/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  onSnapshot: vi.fn((ref: { path: string }, a: unknown, b: unknown, c: unknown) => {
    const [next, error] = (typeof a === 'function' ? [a, b] : [b, c]) as [L['next'], L['error']]
    // Like the SDK, a listener is terminated once it reports an error.
    const entry: L = { next, error: e => { listeners.delete(ref.path); error(e) } }
    listeners.set(ref.path, entry)
    return () => { if (listeners.get(ref.path) === entry) listeners.delete(ref.path) }
  }),
}))

const { subscribeBoard } = await import('../src/shared/subscribe')

const snap = (data: unknown, fromCache = false) => ({ exists: () => data !== null, data: () => data, metadata: { fromCache } })
const comp = (id: string) => SEED_COMPETITIONS.find(c => c.id === id)!
const settings = (p = {}) => listeners.get('settings/app')!.next(snap({ ...SEED_SETTINGS, ...p }))
const deliver = (id: string) => listeners.get(`competitions/${id}`)!.next(snap(comp(id)))
const deny = (id: string) => listeners.get(`competitions/${id}`)!.error({ code: 'permission-denied' })

let last: BoardState
let off: () => void
beforeEach(() => { listeners.clear(); off = subscribeBoard(b => { last = b }) })
afterEach(() => off())

test('settings と 5 競技すべての結果が出るまで ready=false', () => {
  settings()
  expect(last.ready).toBe(false)
  for (const id of ['A', 'B', 'C', 'D']) deliver(id)
  expect(last.ready).toBe(false)
  deliver('E')
  expect(last.ready).toBe(true)
})

test('拒否された競技も「結果が出た」として ready に数える', () => {
  settings({ hidden: true })
  for (const id of ['A', 'B', 'C', 'D']) deliver(id)
  deny('E')
  expect(last.ready).toBe(true)
  expect(last.hiddenIds).toEqual(['E'])
})

test('隠している間に settings が変わっても、読めていない E は hiddenIds に残る', () => {
  settings({ hidden: true })
  for (const id of ['A', 'B', 'C', 'D']) deliver(id)
  deny('E')
  settings({ hidden: true, capMode: 'perTeam' })
  expect(last.hiddenIds).toEqual(['E'])
  expect(last.competitions.map(c => c.id)).not.toContain('E')
})

test('発表後、E のデータが届くまでは hiddenIds に残し、届いたら表示に戻す', () => {
  settings({ hidden: true })
  for (const id of ['A', 'B', 'C', 'D']) deliver(id)
  deny('E')
  settings({ hidden: false })
  expect(last.hiddenIds).toEqual(['E'])
  deliver('E')
  expect(last.hiddenIds).toEqual([])
  expect(last.competitions.map(c => c.id)).toContain('E')
})

test('permission-denied 以外のエラーでは、最後のデータを残し、connected=false にして再購読する', () => {
  vi.useFakeTimers()
  try {
    settings()
    for (const id of ['A', 'B', 'C', 'D', 'E']) deliver(id)
    listeners.get('competitions/C')!.error({ code: 'resource-exhausted' })
    expect(last.competitions.map(c => c.id)).toContain('C')
    expect(last.hiddenIds).toEqual([])
    expect(last.connected).toBe(false)
    expect(listeners.has('competitions/C')).toBe(false)
    vi.advanceTimersByTime(30_000)
    expect(listeners.has('competitions/C')).toBe(true)
  } finally { vi.useRealTimers() }
})

test('競技の一時エラーから再購読に成功したら connected を true に戻す', () => {
  vi.useFakeTimers()
  try {
    settings()
    for (const id of ['A', 'B', 'C', 'D', 'E']) deliver(id)
    listeners.get('competitions/C')!.error({ code: 'unavailable' })
    expect(last.connected).toBe(false)
    vi.advanceTimersByTime(30_000)
    deliver('C')
    expect(last.connected).toBe(true)
  } finally { vi.useRealTimers() }
})

test('settings のエラーでも再購読する', () => {
  vi.useFakeTimers()
  try {
    settings()
    listeners.get('settings/app')!.error({ code: 'unavailable' })
    expect(last.connected).toBe(false)
    vi.advanceTimersByTime(30_000)
    expect(listeners.has('settings/app')).toBe(true)
  } finally { vi.useRealTimers() }
})

test('connected は settings のメタデータだけで決まり、offline イベントでは変えない', () => {
  settings()
  expect(last.connected).toBe(true)
  window.dispatchEvent(new Event('offline'))
  expect(last.connected).toBe(true)
  listeners.get('settings/app')!.next(snap(SEED_SETTINGS, true))
  expect(last.connected).toBe(false)
  listeners.get('settings/app')!.next(snap(SEED_SETTINGS, false))
  expect(last.connected).toBe(true)
})
