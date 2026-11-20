import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { subscribeBoard, type BoardState } from '../shared/subscribe'
import '../styles/base.css'
import { Display } from './Display'
import './display.css'

const initial: BoardState = { settings: null, competitions: [], hiddenIds: [], connected: false, ready: false }

function App() {
  const [board, setBoard] = useState(initial)
  useEffect(() => subscribeBoard(setBoard), [])
  return <Display board={board} />
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
