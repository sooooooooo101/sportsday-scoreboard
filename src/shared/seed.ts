import type { Competition, Settings } from './types'

// From docs/reference/競技部門A-E_抽出.md (order = timetable order).
// 玉入れ is uncapped: its 企画書 scores raw ball points and the user allowed it to exceed 100.
export const SEED_COMPETITIONS: Competition[] = [
  { id: 'A', name: '借り人競走', order: 1, matchCount: 4, max: 100, capped: true, presets: [7, 5, 4, 3, 1], scores: {} },
  { id: 'B', name: '玉入れ改', order: 2, matchCount: 3, max: 100, capped: false, presets: [], scores: {} },
  { id: 'D', name: '障害物リレー', order: 3, matchCount: 1, max: 100, capped: true, presets: [40, 30, 20, 10], scores: {} },
  { id: 'C', name: 'ドッジボール', order: 4, matchCount: 2, max: 100, capped: true, presets: [40, 25, 10], scores: {} },
  { id: 'E', name: 'メンターリレー', order: 5, matchCount: 2, max: 100, capped: true, presets: [50, 30], scores: {} },
]

export const SEED_SETTINGS: Settings = { capMode: 'shared', hideFromOrder: 5, hidden: false }
