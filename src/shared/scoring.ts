import { isTamaire, tamaireMatchMax, BONUS_MATCH } from './tamaire'
import { MAX_MATCHES, MAX_SCORE, type CapMode, type Competition, type Settings, type Team, type Totals } from './types'

type Result = { ok: true } | { ok: false; reason: string }

const matchNumbers = (c: Competition) => Array.from({ length: c.matchCount }, (_, i) => String(i + 1))

export function competitionTotals(c: Competition): Totals {
  return matchNumbers(c).reduce<Totals>(
    (t, m) => ({ blue: t.blue + (c.scores[m]?.blue ?? 0), white: t.white + (c.scores[m]?.white ?? 0) }),
    { blue: 0, white: 0 },
  )
}

export function boardTotals(cs: Competition[]): Totals {
  return cs.reduce<Totals>((t, c) => {
    const s = competitionTotals(c)
    return { blue: t.blue + s.blue, white: t.white + s.white }
  }, { blue: 0, white: 0 })
}

/** Japanese IME often yields full-width digits, so normalize before parsing. */
export function parseScoreInput(raw: string): { ok: true; value: number } | { ok: false; reason: string } {
  const s = raw.trim().replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
  if (s === '') return { ok: false, reason: '点数を入力してください' }
  if (!/^\d+$/.test(s)) return { ok: false, reason: '0 以上の整数で入力してください' }
  return { ok: true, value: Number(s) }
}

export function validateScore(c: Competition, match: number, team: Team, value: number, capMode: CapMode): Result {
  if (!Number.isInteger(match) || match < 1 || match > c.matchCount)
    return { ok: false, reason: `この競技の試合は第${c.matchCount}試合までです` }
  if (!Number.isInteger(value) || value < 0) return { ok: false, reason: '0 以上の整数で入力してください' }
  if (isTamaire(c) && value > tamaireMatchMax(match))
    return { ok: false, reason: match === BONUS_MATCH ? 'ボーナスは 18 点までです' : `ラウンドは ${tamaireMatchMax(match)} 点までです` }
  if (!c.capped) {
    if (value > MAX_SCORE) return { ok: false, reason: `1 試合 ${MAX_SCORE} 点までです` }
    return { ok: true }
  }

  const t = competitionTotals(c)
  const current = c.scores[String(match)]?.[team] ?? 0
  const nextTeam = t[team] - current + value
  if (capMode === 'perTeam') {
    if (nextTeam > c.max)
      return { ok: false, reason: `1チーム ${c.max} 点までです（あと ${Math.max(0, c.max - (t[team] - current))} 点）` }
  } else {
    const other = team === 'blue' ? t.white : t.blue
    if (nextTeam + other > c.max)
      return { ok: false, reason: `この競技は青と白の合計 ${c.max} 点までです（あと ${Math.max(0, c.max - (t[team] - current) - other)} 点）` }
  }
  return { ok: true }
}

export function canSetMatchCount(c: Competition, next: number): Result {
  if (!Number.isInteger(next) || next < 1 || next > MAX_MATCHES)
    return { ok: false, reason: `試合数は 1〜${MAX_MATCHES} で設定してください` }
  for (let m = next + 1; m <= Math.max(c.matchCount, MAX_MATCHES); m++) {
    const s = c.scores[String(m)]
    if (s && (s.blue > 0 || s.white > 0))
      return { ok: false, reason: `第${m}試合に点数が入っているため減らせません。先に 0 に戻してください` }
  }
  return { ok: true }
}

export const isHidden = (c: Competition, s: Settings) => s.hidden && c.order >= s.hideFromOrder

export const sortByOrder = (cs: Competition[]) => [...cs].sort((a, b) => a.order - b.order)
