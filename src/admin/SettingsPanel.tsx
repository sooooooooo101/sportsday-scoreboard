import { useEffect, useRef, useState } from 'react'
import { canSetMatchCount, competitionTotals, parseScoreInput, sortByOrder } from '../shared/scoring'
import type { CapMode, Competition, Settings } from '../shared/types'
import { setResultsHidden, updateCompetition, updateSettings } from './adminApi'
import { errorKindOf } from './useSave'

type Props = {
  competition: Competition
  competitions: Competition[]
  settings: Settings
  /** Shows the centered save popup (same as score saves). */
  onSaved: (text: string, sub: string) => void
}

export function SettingsPanel({ competition: c, competitions, settings, onSaved }: Props) {
  const [name, setName] = useState(c.name)
  const [max, setMax] = useState(String(c.max))
  const [presets, setPresets] = useState(c.presets.join(', '))
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [confirmReveal, setConfirmReveal] = useState(false)
  // The reveal confirmation disarms itself, so a stray tap later can't publish (RED-004).
  const revealTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const armReveal = () => {
    setConfirmReveal(true)
    clearTimeout(revealTimer.current)
    revealTimer.current = setTimeout(() => setConfirmReveal(false), 5000)
  }
  const disarmReveal = () => { clearTimeout(revealTimer.current); setConfirmReveal(false) }
  useEffect(() => () => clearTimeout(revealTimer.current), [])

  useEffect(() => {
    setName(c.name); setMax(String(c.max)); setPresets(c.presets.join(', ')); setMessage(null)
  }, [c.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (text: string) => setMessage({ kind: 'error', text })
  const run = async (fn: () => Promise<void>, ok: string, sub = '保存しました') => {
    try { await fn(); setMessage(null); onSaved(ok, sub) }
    catch (e) {
      fail(errorKindOf(e) === 'rejected'
        ? '保存できませんでした。ほかの端末の入力と重なった可能性があります。最新の状態を確認してください'
        : '保存できませんでした。通信を確認してもう一度押してください')
    }
  }

  const changeMatches = (next: number) => {
    const check = canSetMatchCount(c, next)
    if (!check.ok) return fail(check.reason)
    void run(() => updateCompetition(c.id, { matchCount: next }), `試合数 ${next}`)
  }

  const saveCompetition = () => {
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > 30) return fail('競技名は 1〜30 文字で入力してください')
    const m = parseScoreInput(max)
    if (!m.ok || m.value < 1 || m.value > 1000) return fail('満点は 1〜1000 の整数で入力してください')
    if (c.capped) {
      const t = competitionTotals(c)
      const floor = settings.capMode === 'perTeam' ? Math.max(t.blue, t.white) : t.blue + t.white
      if (m.value < floor) return fail(`満点は今の合計（${floor} 点）より低くできません`)
    }
    const parts = presets.split(/[,、\s]+/).filter(Boolean).map(parseScoreInput)
    if (parts.some(p => !p.ok) || parts.length > 6) return fail('よく使う点数は 0 以上の整数を 6 個までカンマ区切りで入力してください')
    const values = parts.map(p => (p as { value: number }).value)
    if (values.some(v => v > m.value)) return fail('よく使う点数は満点以下にしてください')
    void run(() => updateCompetition(c.id, { name: trimmed, max: m.value, presets: values }), '競技の設定')
  }

  // Switching modes must not strand existing scores above the new cap (they could then
  // not even be lowered, since every write is checked against the cap).
  const changeCapMode = (mode: CapMode) => {
    const over = competitions.find(x => {
      if (!x.capped) return false
      const t = competitionTotals(x)
      return mode === 'shared' ? t.blue + t.white > x.max : Math.max(t.blue, t.white) > x.max
    })
    if (over) {
      const t = competitionTotals(over)
      return fail(`${over.name}が青 ${t.blue}・白 ${t.white} 点で、新しい数え方の満点 ${over.max} 点を超えているため切り替えられません。先に点数を直してください`)
    }
    void run(() => updateSettings({ capMode: mode }), '満点の数え方', mode === 'shared' ? '青と白の合計で満点まで' : 'チームごとに満点まで')
  }

  const hideTarget = sortByOrder(competitions).find(x => x.order === settings.hideFromOrder)

  return (
    <section className="settings" aria-label="設定">
      <h2 className="settings__title">{c.id} の設定</h2>
      {message && (
        <p className={`msg msg--${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>
      )}
      <label className="field">
        <span className="field__label">競技名</span>
        <input className="field__input" value={name} maxLength={30} onChange={e => setName(e.target.value)} />
      </label>
      <div className="field">
        <span className="field__label">試合数</span>
        <div className="stepper">
          <button className="pad__step" type="button" aria-label="試合数を減らす" onClick={() => changeMatches(c.matchCount - 1)} disabled={c.matchCount <= 1}>−</button>
          <span className="stepper__value" aria-live="polite">{c.matchCount}</span>
          <button className="pad__step" type="button" aria-label="試合数を増やす" onClick={() => changeMatches(c.matchCount + 1)} disabled={c.matchCount >= 10}>＋</button>
        </div>
      </div>
      <label className="field">
        <span className="field__label">満点</span>
        <input className="field__input" inputMode="numeric" value={max} onChange={e => setMax(e.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">よく使う点数（カンマ区切り）</span>
        {/* No numeric inputMode: iOS would then offer digits only and no comma. */}
        <input className="field__input" value={presets} onChange={e => setPresets(e.target.value)} />
      </label>
      <button className="btn btn--primary" type="button" onClick={saveCompetition}>競技の設定を保存</button>

      <fieldset className="field">
        <legend className="field__label">満点の数え方（全競技共通）</legend>
        <label className="radio">
          <input type="radio" name="capMode" checked={settings.capMode === 'shared'}
            onChange={() => changeCapMode('shared')} />
          青と白の合計で満点まで
        </label>
        <label className="radio">
          <input type="radio" name="capMode" checked={settings.capMode === 'perTeam'}
            onChange={() => changeCapMode('perTeam')} />
          チームごとに満点まで
        </label>
      </fieldset>

      <div className="field hide">
        <span className="field__label">結果を隠す（閉会式で発表）</span>
        <label className="field">
          <span className="field__label field__label--sub">どの競技から隠すか</span>
          <select className="field__input" value={settings.hideFromOrder} disabled={settings.hidden}
            onChange={e => void run(() => updateSettings({ hideFromOrder: Number(e.target.value) }), '隠す競技を変更')}>
            {sortByOrder(competitions).map(x => <option key={x.id} value={x.order}>{x.id} {x.name}</option>)}
          </select>
        </label>
        {settings.hidden ? (
          confirmReveal ? (
            <div className="confirm" role="group" aria-label="発表の確認">
              <p className="confirm__text">表示画面に合計点と隠した競技の点数が出ます。元には戻せません。</p>
              <div className="confirm__actions">
                <button className="btn" type="button" onClick={disarmReveal}>キャンセル</button>
                <button className="btn btn--danger" type="button"
                  onClick={() => { disarmReveal(); void run(() => setResultsHidden(false, settings.hideFromOrder, competitions), '結果を発表しました', '表示画面に合計が出ます') }}>
                  本当に発表する
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn--primary" type="button" onClick={armReveal}>発表する</button>
          )
        ) : (
          <button className="btn" type="button" onClick={() => void run(() => setResultsHidden(true, settings.hideFromOrder, competitions), '結果を隠しました', '表示画面は「?」になります')}>
            {hideTarget ? `${hideTarget.name}から隠す` : '隠す'}
          </button>
        )}
        <p className="field__hint">隠している間、表示画面では合計点と隠した競技の点数が「?」になります。</p>
      </div>
    </section>
  )
}
