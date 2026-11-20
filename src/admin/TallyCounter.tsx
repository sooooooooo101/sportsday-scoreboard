import { useEffect, useState } from 'react'
import { BONUS_BALLS, MINUS_BALLS, PLUS_BALLS, bonusPoints } from '../shared/tamaire'
import { TEAM_LABEL, type Team } from '../shared/types'

type Counts = { plus: number; minus: number }
const ZERO: Counts = { plus: 0, minus: 0 }
/** Counts older than this are from another session (e.g. a rehearsal) and are dropped. */
export const TALLY_TTL_MS = 3 * 60 * 60 * 1000

// Running counts live on this phone only, so a reload or sleep never loses a count in progress.
function load(key: string): Counts {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null')
    const valid = v && Number.isInteger(v.plus) && Number.isInteger(v.minus) && v.plus >= 0 && v.minus >= 0
    if (valid && typeof v.at === 'number' && Date.now() - v.at < TALLY_TTL_MS) return { plus: v.plus, minus: v.minus }
    localStorage.removeItem(key)
  } catch { /* storage unavailable or corrupt: start from zero */ }
  return ZERO
}
function store(key: string, c: Counts) {
  try {
    if (c.plus === 0 && c.minus === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify({ ...c, at: Date.now() }))
  } catch { /* private mode etc.: counting still works in memory */ }
}

type Props = {
  storageKey: string
  team: Team
  /** round: plus − minus balls. bonus: balls in (0–3) → 0/3/8/18 points. */
  mode: 'round' | 'bonus'
  /** Resolves true once the score is saved; counts reset only then. */
  onDecide: (value: number) => Promise<boolean>
}

/** 玉入れ: count balls without saving; 点数決定 saves the computed points. */
export function TallyCounter({ storageKey, team, mode, onDecide }: Props) {
  const [c, setC] = useState<Counts>(() => load(storageKey))
  const [busy, setBusy] = useState(false)
  useEffect(() => { store(storageKey, c) }, [storageKey, c])

  const limits: Counts = mode === 'bonus' ? { plus: BONUS_BALLS, minus: 0 } : { plus: PLUS_BALLS, minus: MINUS_BALLS }
  const result = mode === 'bonus' ? bonusPoints(c.plus) : Math.max(0, c.plus - c.minus)
  const bump = (k: keyof Counts, d: number) =>
    setC(prev => ({ ...prev, [k]: Math.min(limits[k], Math.max(0, prev[k] + d)) }))
  const decide = async () => {
    setBusy(true)
    try { if (await onDecide(result)) setC(ZERO) } finally { setBusy(false) }
  }

  const row = (k: keyof Counts, phase: string, what: string, sign: string) => (
    <div className="tally__row">
      <span className="tally__label">{phase}<small>{what}（{limits[k]}まで）</small></span>
      <button className="tally__undo" type="button" aria-label={`${what}を1つ戻す`} disabled={c[k] === 0} onClick={() => bump(k, -1)}>戻す</button>
      <span className="tally__count" aria-live="polite">{c[k]}</span>
      <button className="tally__add" type="button" aria-label={`${what}を1つ増やす`} disabled={c[k] >= limits[k]} onClick={() => bump(k, 1)}>{sign}1</button>
    </div>
  )

  return (
    <div className={`tally tally--${team}`} role="group" aria-label={`${TEAM_LABEL[team]}の途中計算`}>
      {mode === 'bonus' ? (
        <>
          {row('plus', 'ボーナス', '入ったボーナス玉', '＋')}
          <p className="tally__hint">1球目 +3 / 2球目 +5 / 3球目 +10</p>
          <p className="tally__result" data-testid="tally-result">{c.plus}個 = {result}点</p>
        </>
      ) : (
        <>
          {row('plus', '第1フェーズ', '入った玉', '＋')}
          {row('minus', '第2フェーズ', 'マイナス玉', '−')}
          <p className="tally__result" data-testid="tally-result">{c.plus} − {c.minus} = {result}点</p>
        </>
      )}
      <div className="tally__actions">
        <button className="btn tally__reset" type="button" disabled={busy || (c.plus === 0 && c.minus === 0)} onClick={() => setC(ZERO)}>リセット</button>
        <button className="btn btn--primary tally__decide" type="button" disabled={busy} onClick={() => void decide()}>点数決定</button>
      </div>
    </div>
  )
}
