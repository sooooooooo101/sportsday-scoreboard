import type { BoardState } from '../src/shared/subscribe'
import { SEED_COMPETITIONS, SEED_SETTINGS } from '../src/shared/seed'
import type { Competition } from '../src/shared/types'

export function comps(scores: Partial<Record<Competition['id'], Competition['scores']>> = {}): Competition[] {
  return SEED_COMPETITIONS.map(c => ({ ...c, scores: scores[c.id] ?? {} }))
}

export function board(p: Partial<BoardState> = {}): BoardState {
  return { settings: SEED_SETTINGS, competitions: comps(), hiddenIds: [], connected: true, ready: true, ...p }
}
