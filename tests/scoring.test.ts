import { SEED_COMPETITIONS, SEED_SETTINGS } from '../src/shared/seed'
import {
  boardTotals,
  canSetMatchCount,
  competitionTotals,
  isHidden,
  parseScoreInput,
  sortByOrder,
  validateScore,
} from '../src/shared/scoring'
import type { Competition } from '../src/shared/types'

const byId = (id: Competition['id']) => SEED_COMPETITIONS.find(c => c.id === id)!
const seedC = byId('C')
const seedE = byId('E')

describe('seed', () => {
  test('seed は実施順 A,B,D,C,E', () =>
    expect(sortByOrder(SEED_COMPETITIONS).map(c => c.id)).toEqual(['A', 'B', 'D', 'C', 'E']))

  test('試合数とよく使う点数が企画書どおり', () => {
    expect(SEED_COMPETITIONS.map(c => [c.id, c.matchCount])).toEqual(
      expect.arrayContaining([['A', 4], ['B', 3], ['C', 2], ['D', 1], ['E', 2]]),
    )
    expect(byId('C').presets).toEqual([40, 25, 10])
    expect(byId('D').presets).toEqual([40, 30, 20, 10])
    expect(byId('E').presets).toEqual([50, 30])
    expect(SEED_COMPETITIONS.every(c => c.max === 100)).toBe(true)
    expect(SEED_COMPETITIONS.filter(c => !c.capped).map(c => c.id)).toEqual(['B'])
    expect(SEED_SETTINGS).toEqual({ capMode: 'shared', hideFromOrder: 5, hidden: false })
  })
})

describe('totals', () => {
  test('試合数より後ろの点数は合計に入れない', () => {
    const c = { ...seedC, matchCount: 1, scores: { '1': { blue: 40, white: 10 }, '2': { blue: 40, white: 10 } } }
    expect(competitionTotals(c)).toEqual({ blue: 40, white: 10 })
  })

  test('未入力の試合は 0 として扱う', () =>
    expect(competitionTotals({ ...seedC, scores: {} })).toEqual({ blue: 0, white: 0 }))

  test('boardTotals は全競技を合計する', () => {
    const a = { ...byId('A'), scores: { '1': { blue: 7, white: 5 } } }
    const c = { ...seedC, scores: { '1': { blue: 40, white: 10 } } }
    expect(boardTotals([a, c])).toEqual({ blue: 47, white: 15 })
  })
})

describe('parseScoreInput', () => {
  test('全角数字を半角に直す', () => expect(parseScoreInput('４０')).toEqual({ ok: true, value: 40 }))
  test('前後の空白は無視する', () => expect(parseScoreInput(' 25 ')).toEqual({ ok: true, value: 25 }))
  test.each(['', '-5', '12.5', 'abc', '１２．５'])('不正な入力 %s は拒否する', raw => {
    const r = parseScoreInput(raw)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).not.toBe('')
  })
})

describe('validateScore', () => {
  test('shared では青と白の合計が max を超える値を拒否する', () => {
    const c = { ...seedC, scores: { '1': { blue: 40, white: 10 } } }
    const bad = validateScore(c, 2, 'blue', 51, 'shared')
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toContain('100')
    expect(validateScore(c, 2, 'blue', 50, 'shared').ok).toBe(true)
  })

  test('perTeam ではチームごとに max まで', () => {
    const c = { ...seedC, scores: { '1': { blue: 60, white: 60 } } }
    expect(validateScore(c, 2, 'blue', 40, 'perTeam').ok).toBe(true)
    expect(validateScore(c, 2, 'blue', 41, 'perTeam').ok).toBe(false)
  })

  test('同じ試合の値の置き換えは、古い値を除いて判定する', () => {
    const c = { ...seedC, scores: { '1': { blue: 90, white: 10 } } }
    expect(validateScore(c, 1, 'blue', 90, 'shared').ok).toBe(true)
  })

  test('負の数・小数・試合番号の範囲外は拒否する', () => {
    expect(validateScore(seedC, 1, 'blue', -1, 'shared').ok).toBe(false)
    expect(validateScore(seedC, 1, 'blue', 1.5, 'shared').ok).toBe(false)
    expect(validateScore(seedC, 3, 'blue', 10, 'shared').ok).toBe(false)
  })
})

describe('満点で止めない競技（玉入れ）', () => {
  const seedB = byId('B')
  test('合計が max を超えても受け付ける', () => {
    const c = { ...seedB, scores: { '1': { blue: 90, white: 60 } } }
    expect(validateScore(c, 2, 'blue', 80, 'shared').ok).toBe(true)
    expect(validateScore(c, 2, 'blue', 80, 'perTeam').ok).toBe(true)
  })
  test('負の数・小数・1000 を超える値は拒否する', () => {
    expect(validateScore(seedB, 1, 'blue', -1, 'shared').ok).toBe(false)
    expect(validateScore(seedB, 1, 'blue', 2.5, 'shared').ok).toBe(false)
    expect(validateScore(seedB, 1, 'blue', 1001, 'shared').ok).toBe(false)
  })
})

describe('canSetMatchCount', () => {
  test('点数が入った試合を消す減らし方は止める', () => {
    const c = { ...seedC, matchCount: 2, scores: { '2': { blue: 40, white: 10 } } }
    expect(canSetMatchCount(c, 1).ok).toBe(false)
    expect(canSetMatchCount(c, 3).ok).toBe(true)
  })

  test('0 点だけの試合は消してよい', () => {
    const c = { ...seedC, matchCount: 2, scores: { '2': { blue: 0, white: 0 } } }
    expect(canSetMatchCount(c, 1).ok).toBe(true)
  })

  test('1〜10 以外の試合数は拒否する', () => {
    expect(canSetMatchCount(seedC, 0).ok).toBe(false)
    expect(canSetMatchCount(seedC, 11).ok).toBe(false)
  })
})

describe('isHidden', () => {
  test('hidden のときだけ hideFromOrder 以降を隠す', () => {
    expect(isHidden(seedE, { ...SEED_SETTINGS, hidden: true })).toBe(true)
    expect(isHidden(seedC, { ...SEED_SETTINGS, hidden: true })).toBe(false)
    expect(isHidden(seedE, SEED_SETTINGS)).toBe(false)
  })
})
