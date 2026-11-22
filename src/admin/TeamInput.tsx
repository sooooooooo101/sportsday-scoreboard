import { useRef, useState, type KeyboardEvent } from 'react'
import { TEAM_LABEL, type Team } from '../shared/types'

type Props = {
  team: Team
  value: number
  presets: number[]
  onCommit: (value: number) => void
  onRawCommit: (raw: string) => void
}

export function TeamInput({ team, value, presets, onCommit, onRawCommit }: Props) {
  const label = TEAM_LABEL[team]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // Enter unmounts the input, and some browsers then fire blur too; commit once per edit.
  const done = useRef(false)
  const startEdit = () => { done.current = false; setDraft(String(value)); setEditing(true) }
  const finish = () => {
    if (done.current) return
    done.current = true
    setEditing(false)
    if (draft !== String(value)) onRawCommit(draft)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); finish() }
    if (e.key === 'Escape') { done.current = true; setEditing(false) }
  }

  return (
    <div className={`pad pad--${team}`} role="group" aria-label={label}>
      <p className="pad__name"><span className="team-badge">{label}</span></p>
      <div className="pad__row">
        <button className="pad__step" type="button" aria-label="1点減らす" disabled={value <= 0} onClick={() => onCommit(value - 1)}>−</button>
        {editing ? (
          <input
            className="pad__input"
            type="text"
            inputMode="numeric"
            aria-label={`${label}の点数`}
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKey}
            onBlur={finish}
          />
        ) : (
          <button className="pad__value" type="button" aria-label={`${label}の点数 ${value}点、タップして入力`} onClick={startEdit}>
            {value}
          </button>
        )}
        <button className="pad__step" type="button" aria-label="1点増やす" onClick={() => onCommit(value + 1)}>＋</button>
      </div>
      {presets.length > 0 && (
        <div className="pad__presets">
          {presets.map(p => (
            // Presets add to the current score (5 → +10 → 15), per the scorers' workflow.
            <button key={p} className="chip" type="button" aria-label={`${p}点足す`} onClick={() => onCommit(value + p)}>+{p}</button>
          ))}
        </div>
      )}
    </div>
  )
}
