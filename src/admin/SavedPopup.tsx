import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

export type Saved = { id: number; text: string; sub: string }

/** Centered confirmation that never blocks taps (pointer-events: none) and dismisses itself. */
export function SavedPopup({ saved }: { saved: Saved | null }) {
  const reduce = useReducedMotion()
  return (
    <div className="saved-layer" aria-live="polite">
      <AnimatePresence>
        {saved && (
          <motion.div
            // One element: rapid saves update its text instead of stacking popups.
            key="saved"
            className="saved-popup"
            data-testid="saved-popup"
            role="status"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            transition={reduce ? { duration: 0.15 } : { type: 'spring', bounce: 0, visualDuration: 0.25 }}
          >
            <span className="saved-popup__check" aria-hidden>✓</span>
            <motion.span key={saved.id} className="saved-popup__text" initial={reduce ? false : { scale: 0.96 }} animate={{ scale: 1 }}>
              {saved.text}
            </motion.span>
            <span className="saved-popup__sub">{saved.sub}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
