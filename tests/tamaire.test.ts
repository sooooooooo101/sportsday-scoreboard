import { SEED_COMPETITIONS } from '../src/shared/seed'
import { validateScore } from '../src/shared/scoring'
import { bonusPoints, matchLabel, tamaireMatchMax } from '../src/shared/tamaire'

const B = SEED_COMPETITIONS.find(c => c.id === 'B')!
const C = SEED_COMPETITIONS.find(c => c.id === 'C')!

test('ボーナスは入った数 0〜3 個で 0 / 3 / 8 / 18 点', () => {
  expect([0, 1, 2, 3].map(bonusPoints)).toEqual([0, 3, 8, 18])
})

test('玉入れの試合名はラウンド1 / ラウンド2 / ボーナス、ほかの競技は第n試合', () => {
  expect([1, 2, 3].map(n => matchLabel(B, n))).toEqual(['ラウンド1', 'ラウンド2', 'ボーナス'])
  expect(matchLabel(C, 2)).toBe('第2試合')
})

test('玉入れの 1 試合の上限はラウンド 80 点・ボーナス 18 点', () => {
  expect(tamaireMatchMax(1)).toBe(80)
  expect(tamaireMatchMax(3)).toBe(18)
  expect(validateScore(B, 1, 'blue', 81, 'shared').ok).toBe(false)
  expect(validateScore(B, 1, 'blue', 80, 'shared').ok).toBe(true)
  const bad = validateScore(B, 3, 'blue', 19, 'shared')
  expect(bad.ok).toBe(false)
  if (!bad.ok) expect(bad.reason).toContain('18')
})

test('借り人競争の順位点ボタンは 7 / 5 / 4 / 3 / 1', () =>
  expect(SEED_COMPETITIONS.find(c => c.id === 'A')!.presets).toEqual([7, 5, 4, 3, 1]))
