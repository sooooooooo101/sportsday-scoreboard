import type { Competition } from './types'

// 玉入れ(改) rules from 体育祭2026_3部門ルールまとめ.pdf / 玉入れルール.pdf:
// rounds 1–2: +1 per plus ball (80 balls), −1 per minus ball (20 balls);
// bonus round: 1st ball +3, 2nd +5, 3rd +10 (max 18). Max per team 98.
export const TAMAIRE_ID = 'B'
export const PLUS_BALLS = 80
export const MINUS_BALLS = 20
export const BONUS_MATCH = 3
export const BONUS_BALLS = 3
const BONUS_TABLE = [0, 3, 8, 18]

export const isTamaire = (c: Pick<Competition, 'id'>) => c.id === TAMAIRE_ID
export const bonusPoints = (balls: number) => BONUS_TABLE[Math.max(0, Math.min(BONUS_BALLS, balls))]
export const tamaireMatchMax = (match: number) => (match === BONUS_MATCH ? BONUS_TABLE[BONUS_BALLS] : PLUS_BALLS)

const TAMAIRE_LABELS = ['ラウンド1', 'ラウンド2', 'ボーナス']
export const matchLabel = (c: Pick<Competition, 'id'>, n: number) =>
  (isTamaire(c) && TAMAIRE_LABELS[n - 1]) || `第${n}試合`
