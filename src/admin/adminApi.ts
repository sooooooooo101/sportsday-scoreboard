import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../shared/firebase'
import { auth } from './auth'
import { SEED_COMPETITIONS, SEED_SETTINGS } from '../shared/seed'
import type { Competition, CompetitionId, Settings, Team } from '../shared/types'

/** The shared passcode is the password of the single scorer account. */
export async function signInWithPasscode(passcode: string): Promise<void> {
  await signInWithEmailAndPassword(auth, import.meta.env.VITE_SCORER_EMAIL, passcode)
}

export type ScorerState = 'scorer' | 'signedOut' | 'notScorer'

/**
 * Only the configured scorer account gets the input UI. Writes are denied by the
 * rules anyway; this keeps other accounts from seeing a screen that cannot save.
 */
export function onScorerChange(cb: (state: ScorerState) => void): () => void {
  return onAuthStateChanged(auth, user => {
    if (!user) return cb('signedOut')
    if (user.email?.toLowerCase() === String(import.meta.env.VITE_SCORER_EMAIL ?? '').toLowerCase()) return cb('scorer')
    void signOut(auth)
    cb('notScorer')
  })
}

export async function signOutScorer(): Promise<void> {
  await signOut(auth)
}

/**
 * Batched (not transactional) so Firestore applies it to the local cache at once,
 * queues it while offline, and sends it in order on reconnect. `prev` comes from
 * the caller's live snapshot and is returned for undo.
 */
export async function setScore(id: CompetitionId, match: number, team: Team, value: number, prev: number): Promise<number> {
  const batch = writeBatch(db)
  // Field-path update so concurrent edits to other matches are not overwritten.
  batch.update(doc(db, 'competitions', id), { [`scores.${match}.${team}`]: value })
  batch.set(doc(collection(db, 'log')), { kind: 'score', id, match, team, from: prev, to: value, at: serverTimestamp() })
  await batch.commit()
  return prev
}

// Settings changes are logged in the same batch so disputes can be traced (server time).
export async function updateCompetition(
  id: CompetitionId,
  patch: Partial<Pick<Competition, 'name' | 'order' | 'matchCount' | 'max' | 'presets'>>,
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'competitions', id), patch)
  batch.set(doc(collection(db, 'log')), { kind: 'competition', id, patch, at: serverTimestamp() })
  await batch.commit()
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'settings', 'app'), patch)
  batch.set(doc(collection(db, 'log')), { kind: 'settings', patch, at: serverTimestamp() })
  await batch.commit()
}

/**
 * Hide or reveal in one batch: the settings flag plus a per-competition flag, which is
 * what the rules check on public reads (RED-006: no extra get() per read).
 */
export async function setResultsHidden(
  hidden: boolean,
  hideFromOrder: number,
  competitions: Pick<Competition, 'id' | 'order'>[],
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'settings', 'app'), { hidden })
  for (const c of competitions)
    batch.update(doc(db, 'competitions', c.id), { hidden: hidden && c.order >= hideFromOrder })
  batch.set(doc(collection(db, 'log')), { kind: 'settings', patch: { hidden }, at: serverTimestamp() })
  await batch.commit()
}

/** Creates whatever is missing (settings and/or competitions) without touching existing data. */
export async function seedIfEmpty(): Promise<boolean> {
  const [existing, settings] = await Promise.all([getDocs(collection(db, 'competitions')), getDoc(doc(db, 'settings', 'app'))])
  const have = new Set(existing.docs.map(d => d.id))
  const missing = SEED_COMPETITIONS.filter(c => !have.has(c.id))
  if (missing.length === 0 && settings.exists()) return false
  const batch = writeBatch(db)
  for (const c of missing) batch.set(doc(db, 'competitions', c.id), c)
  if (!settings.exists()) batch.set(doc(db, 'settings', 'app'), SEED_SETTINGS)
  await batch.commit()
  return true
}
