import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { boardTotals } from '../shared/scoring'
import type { BoardState } from '../shared/subscribe'
import { Breakdown } from './Breakdown'
import { TeamPanel } from './TeamPanel'

export function Display({ board }: { board: BoardState }) {
  // Per viewer, closed on every load: the totals are the headline.
  const [showBreakdown, setShowBreakdown] = useState(false)
  const reduce = useReducedMotion()

  if (!board.settings || !board.ready) {
    return (
      <main className="display display--loading">
        <p className="loading">読み込み中</p>
      </main>
    )
  }

  // Hide on the settings flag too, so totals never show while a denied competition is still in flight.
  const hidden = board.settings.hidden || board.hiddenIds.length > 0
  // While hidden, the springs keep the pre-hidden totals so the reveal counts up from there.
  const totals = boardTotals(board.competitions)

  return (
    <main className="display">
      <h1 className="visually-hidden">体育祭 2026 得点ボード</h1>
      <div className="teams">
        <TeamPanel team="blue" total={totals.blue} hidden={hidden} />
        <TeamPanel team="white" total={totals.white} hidden={hidden} />
      </div>
      {hidden && <p className="reveal-note">結果は閉会式で発表</p>}
      <button
        type="button"
        className="breakdown-toggle"
        aria-expanded={showBreakdown}
        aria-controls="breakdown"
        onClick={() => setShowBreakdown(v => !v)}
      >
        <span>{showBreakdown ? '内訳を隠す' : '内訳を見る'}</span>
        <span className="breakdown-toggle__chevron" aria-hidden>⌄</span>
      </button>
      <AnimatePresence initial={false}>
        {showBreakdown && (
          <motion.div
            id="breakdown"
            key="breakdown"
            initial={{ opacity: 0, y: reduce ? 0 : -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : -8 }}
            transition={reduce ? { duration: 0.15 } : { type: 'spring', bounce: 0, visualDuration: 0.3 }}
            // The breakdown opens below the fold, so bring it into view.
            onAnimationStart={() => document.getElementById('breakdown')?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })}
          >
            <Breakdown competitions={board.competitions} hiddenIds={board.hiddenIds} />
          </motion.div>
        )}
      </AnimatePresence>
      {!board.connected && <p className="offline" role="status">再接続中…</p>}
    </main>
  )
}
