import { useEffect, useState } from 'react'
import { subscribeBoard, type BoardState } from '../shared/subscribe'
import { onScorerChange, type ScorerState } from './adminApi'
import { Login } from './Login'
import { Scorer } from './Scorer'

const empty: BoardState = { settings: null, competitions: [], hiddenIds: [], connected: false, ready: false }

export function AdminApp() {
  const [state, setState] = useState<ScorerState | null>(null)
  const [notScorer, setNotScorer] = useState(false)
  const [board, setBoard] = useState(empty)

  useEffect(() => onScorerChange(s => {
    // notScorer is followed by a sign-out event; keep the explanation visible.
    if (s === 'notScorer') setNotScorer(true)
    else if (s === 'scorer') setNotScorer(false)
    setState(s)
  }), [])
  useEffect(() => {
    if (state !== 'scorer') return
    return subscribeBoard(setBoard, { includeHidden: true })
  }, [state])

  if (state === null) return <main className="admin"><p className="loading">読み込み中</p></main>
  if (state !== 'scorer') return <Login notScorer={notScorer} />
  return <Scorer board={board} />
}
