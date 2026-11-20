import { doc, onSnapshot, type FirestoreError, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'
import { isHidden } from './scoring'
import type { Competition, CompetitionId, Settings } from './types'

export type BoardState = {
  settings: Settings | null
  competitions: Competition[]
  hiddenIds: CompetitionId[]
  connected: boolean
  /** True once settings and every competition have a known outcome (data, missing, or denied). */
  ready: boolean
}

const IDS: CompetitionId[] = ['A', 'B', 'C', 'D', 'E']
const retryDelay = (attempt: number) => Math.min(30_000, 2_000 * 2 ** attempt)

/**
 * Subscribes to settings plus each competition document individually.
 * Hidden competitions are unreadable to the public, so per-document listeners
 * keep one denied document from breaking the rest of the board.
 */
export function subscribeBoard(
  onChange: (b: BoardState) => void,
  opts: { includeHidden?: boolean } = {},
): () => void {
  let settings: Settings | null = null
  let settingsResolved = false
  let connected = false
  let stopped = false
  const comps = new Map<CompetitionId, Competition>()
  const lastOrder = new Map<CompetitionId, number>()
  const hidden = new Set<CompetitionId>()
  const resolved = new Set<CompetitionId>()
  const listeners = new Map<CompetitionId, Unsubscribe>()
  const retries = new Map<string, ReturnType<typeof setTimeout>>()
  const attempts = new Map<string, number>()
  let offSettings: Unsubscribe | null = null

  const emit = () => {
    if (stopped) return
    onChange({
      settings,
      competitions: [...comps.values()].filter(c => !hidden.has(c.id)),
      hiddenIds: IDS.filter(id => hidden.has(id)),
      connected,
      ready: settingsResolved && IDS.every(id => resolved.has(id)),
    })
  }

  // Transient failures (quota, network) keep the last known data and retry,
  // so a competition never silently drops out of the totals.
  const scheduleRetry = (key: string, fn: () => void) => {
    if (stopped || retries.has(key)) return
    const n = attempts.get(key) ?? 0
    attempts.set(key, n + 1)
    retries.set(key, setTimeout(() => { retries.delete(key); if (!stopped) fn() }, retryDelay(n)))
  }

  const hiddenByOrder = (id: CompetitionId) => {
    if (opts.includeHidden || !settings) return false
    const order = lastOrder.get(id)
    return order !== undefined && isHidden({ order } as Competition, settings)
  }

  const unlisten = (id: CompetitionId) => { listeners.get(id)?.(); listeners.delete(id) }

  const markHidden = (id: CompetitionId) => {
    unlisten(id)
    hidden.add(id)
    comps.delete(id)
    resolved.add(id)
  }

  const listen = (id: CompetitionId) => {
    listeners.set(id, onSnapshot(
      doc(db, 'competitions', id),
      snap => {
        attempts.delete(id)
        resolved.add(id)
        if (!snap.exists()) { comps.delete(id); hidden.delete(id); emit(); return }
        const c = snap.data() as Competition
        lastOrder.set(id, c.order)
        if (hiddenByOrder(id)) markHidden(id)
        else { hidden.delete(id); comps.set(id, c) }
        emit()
      },
      (err: FirestoreError) => {
        listeners.delete(id)
        if (err.code === 'permission-denied') {
          // The rules are hiding this competition right now.
          markHidden(id)
        } else {
          connected = false
          scheduleRetry(id, () => listen(id))
        }
        emit()
      },
    ))
  }

  const resync = () => {
    for (const id of IDS) {
      if (hiddenByOrder(id)) markHidden(id)
      // Stay hidden until a successful snapshot proves the data is readable again.
      else if (!listeners.has(id) && !retries.has(id)) listen(id)
    }
  }

  const listenSettings = () => {
    offSettings = onSnapshot(
      doc(db, 'settings', 'app'),
      { includeMetadataChanges: true },
      snap => {
        attempts.delete('settings')
        connected = !snap.metadata.fromCache
        const next = snap.exists() ? (snap.data() as Settings) : null
        const changed = !settingsResolved || JSON.stringify(next) !== JSON.stringify(settings)
        settings = next
        settingsResolved = true
        if (changed) resync()
        emit()
      },
      () => {
        offSettings = null
        connected = false
        scheduleRetry('settings', listenSettings)
        emit()
      },
    )
  }

  listenSettings()

  return () => {
    stopped = true
    offSettings?.()
    for (const off of listeners.values()) off()
    listeners.clear()
    for (const t of retries.values()) clearTimeout(t)
    retries.clear()
  }
}
