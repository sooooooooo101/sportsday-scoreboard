import { useEffect, useMemo, useRef, useState } from 'react'
import { parseScoreInput, sortByOrder, validateScore } from '../shared/scoring'
import type { BoardState } from '../shared/subscribe'
import { TEAM_LABEL, type CompetitionId, type Team } from '../shared/types'
import { seedIfEmpty, setResultsHidden, setScore, signOutScorer } from './adminApi'
import { SavedPopup, type Saved } from './SavedPopup'
import { SettingsPanel } from './SettingsPanel'
import { tabId, Tabs } from './Tabs'
import { BONUS_MATCH, isTamaire, matchLabel } from '../shared/tamaire'
import { TallyCounter } from './TallyCounter'
import { TeamInput } from './TeamInput'
import { UndoToast } from './UndoToast'
import { useSave } from './useSave'

type Undo = { id: CompetitionId; match: number; team: Team; prev: number }

export function Scorer({ board }: { board: BoardState }) {
  const competitions = useMemo(() => sortByOrder(board.competitions), [board.competitions])
  const [selected, setSelected] = useState<CompetitionId | null>(null)
  const [match, setMatch] = useState(1)
  const [showSettings, setShowSettings] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [undo, setUndo] = useState<Undo | null>(null)
  const { status, errorKind, save, dismiss } = useSave()
  const [seedError, setSeedError] = useState<string | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [publicOk, setPublicOk] = useState<Set<CompetitionId>>(new Set())
  const popupTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const popupSeq = useRef(0)
  const showSaved = (text: string, sub: string) => {
    clearTimeout(popupTimer.current)
    setSaved({ id: ++popupSeq.current, text, sub })
    popupTimer.current = setTimeout(() => setSaved(null), 1500)
  }

  const comp = competitions.find(c => c.id === selected) ?? competitions[0]
  useEffect(() => { if (comp && match > comp.matchCount) setMatch(1) }, [comp, match])
  useEffect(() => () => { clearTimeout(undoTimer.current); clearTimeout(popupTimer.current) }, [])

  if (!board.ready || !board.settings || competitions.length === 0) {
    if (!board.ready || !board.connected) return <main className="admin"><p className="loading">読み込み中</p></main>
    return (
      <main className="admin admin--empty">
        <p>まだ競技のデータがありません。</p>
        {seedError && <p className="msg msg--error" role="alert">{seedError}</p>}
        <button className="btn btn--primary" type="button" onClick={() => {
          setSeedError(null)
          seedIfEmpty()
            .then(() => showSaved('初期データを作成しました', '競技 A〜E と設定'))
            .catch(() => setSeedError('作成できませんでした。通信を確認してもう一度押してください'))
        }}>初期データを作成</button>
        <SavedPopup saved={saved} />
      </main>
    )
  }
  const settings = board.settings
  // RED-004: entering a to-be-hidden competition before hiding would publish it instantly.
  const guarded = !settings.hidden && comp.order >= settings.hideFromOrder && !publicOk.has(comp.id)

  // Firestore applies local writes to the snapshot immediately, so the board is the single source of truth.
  const valueOf = (team: Team) => comp.scores[String(match)]?.[team] ?? 0
  const valueAt = (id: CompetitionId, m: number, team: Team) =>
    competitions.find(c => c.id === id)?.scores[String(m)]?.[team] ?? 0

  const commit = async (team: Team, value: number): Promise<boolean> => {
    setInvalid(null)
    const check = validateScore(comp, match, team, value, settings.capMode)
    if (!check.ok) { setInvalid(check.reason); return false }
    const target = { id: comp.id, match, team }
    const res = await save(() => setScore(target.id, target.match, target.team, value, valueOf(team)))
    if (res.ok) {
      showSaved(`${TEAM_LABEL[team]} ${value}点`, '保存しました')
      clearTimeout(undoTimer.current)
      setUndo({ ...target, prev: res.value })
      undoTimer.current = setTimeout(() => setUndo(null), 5000)
    }
    return res.ok
  }

  const commitRaw = (team: Team, raw: string) => {
    const parsed = parseScoreInput(raw)
    if (!parsed.ok) { setInvalid(parsed.reason); return }
    void commit(team, parsed.value)
  }

  const doUndo = () => {
    if (!undo) return
    const u = undo
    setUndo(null)
    setSelected(u.id); setMatch(u.match)
    void save(() => setScore(u.id, u.match, u.team, u.prev, valueAt(u.id, u.match, u.team))).then(res => {
      if (res.ok) showSaved(`${TEAM_LABEL[u.team]} ${u.prev}点に戻しました`, '取り消しました')
    })
  }

  return (
    <main className="admin">
      <header className="admin__bar">
        <Tabs
          label="競技"
          idPrefix="comp"
          panelId="score-panel"
          items={competitions.map(c => ({ key: c.id, label: c.id, ariaLabel: `${c.id} ${c.name}` }))}
          selected={comp.id}
          onSelect={k => { setSelected(k as CompetitionId); setMatch(1); setInvalid(null) }}
        />
        <div className="admin__actions">
          <button className="btn btn--ghost" type="button" aria-pressed={showSettings} onClick={() => setShowSettings(s => !s)}>設定</button>
          <button className="btn btn--ghost" type="button" onClick={() => void signOutScorer()}>ログアウト</button>
        </div>
      </header>

      <h1 className="admin__title">{comp.name}{settings.hidden && comp.order >= settings.hideFromOrder && <span className="badge">非公開中</span>}</h1>

      {showSettings ? (
        <div role="tabpanel" id="score-panel" aria-labelledby={tabId('comp', comp.id)} className="panel">
          <SettingsPanel competition={comp} competitions={competitions} settings={settings} onSaved={showSaved} />
        </div>
      ) : (
        <>
          <Tabs
            label="試合"
            idPrefix="match"
            panelId="score-panel"
            className="tabs tabs--matches"
            tabClassName="tab tab--match"
            items={Array.from({ length: comp.matchCount }, (_, i) => ({ key: String(i + 1), label: matchLabel(comp, i + 1) }))}
            selected={String(match)}
            onSelect={k => { setMatch(Number(k)); setInvalid(null) }}
          />
          <div role="tabpanel" id="score-panel" aria-labelledby={tabId('match', String(match))} className="panel">
          {guarded ? (
            <div className="msg msg--error guard" role="alert">
              <p>まだ結果を隠していません。このまま入れると、表示画面にすぐ点数が出ます。</p>
              <div className="confirm__actions">
                <button className="btn" type="button" onClick={() => setPublicOk(s => new Set(s).add(comp.id))}>公開のまま入力する</button>
                <button className="btn btn--primary" type="button" onClick={() => {
                  void setResultsHidden(true, settings.hideFromOrder, competitions)
                    .then(() => showSaved('結果を隠しました', '表示画面は「?」になります'))
                    .catch(() => setInvalid('隠せませんでした。通信を確認してもう一度押してください'))
                }}>先に隠す</button>
              </div>
            </div>
          ) : invalid && <p className="msg msg--error" role="alert">{invalid}</p>}
          <fieldset className="pads" disabled={guarded}>
            {(['blue', 'white'] as const).map(team => (
              <div key={`${comp.id}-${match}-${team}`} className="pad-stack">
                <TeamInput team={team} value={valueOf(team)} presets={comp.presets}
                  onCommit={v => void commit(team, v)} onRawCommit={raw => commitRaw(team, raw)} />
                {isTamaire(comp) && (
                  <TallyCounter storageKey={`tally:${comp.id}:${match}:${team}`} team={team}
                    mode={match === BONUS_MATCH ? 'bonus' : 'round'} onDecide={v => commit(team, v)} />
                )}
              </div>
            ))}
          </fieldset>
          </div>
        </>
      )}
      {!board.connected && <p className="offline-pill" role="status">再接続中…</p>}
      <SavedPopup saved={saved} />
      <UndoToast status={status} errorKind={errorKind} canUndo={undo !== null} onUndo={doUndo} onDismiss={dismiss} />
    </main>
  )
}
