import { motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { TEAM_LABEL, type Team } from '../shared/types'
import { useSpringNumber } from './useSpringNumber'

/** partial: some competitions are hidden, so the total covers only the ones before them. */
export function TeamPanel({ team, total, partial }: { team: Team; total: number; partial: boolean }) {
  const shown = useSpringNumber(total)
  const flash = useAnimationControls()
  const reduce = useReducedMotion()
  const prev = useRef(total)

  useEffect(() => {
    // One soft highlight when this team gains points, so viewers see who scored.
    if (total > prev.current)
      void flash.start({ opacity: [0, reduce ? 0.15 : 0.35, 0], transition: { duration: reduce ? 0.3 : 0.9, ease: 'easeOut' } })
    prev.current = total
  }, [total, flash, reduce])

  const label = `${TEAM_LABEL[team]} ${total}点${partial ? '（最後の競技を除く）' : ''}`
  return (
    <section className={`team team--${team}`} aria-label={label}>
      <motion.div className="team__flash" initial={{ opacity: 0 }} animate={flash} aria-hidden />
      <h2 className="team__name">{TEAM_LABEL[team]}</h2>
      {/* The animated number changes every frame; screen readers get only the settled value. */}
      <p className="visually-hidden" role="status">{label}</p>
      <p className="team__total" data-testid={`total-${team}`} aria-hidden="true">
        <motion.span>{shown}</motion.span>
      </p>
      {partial && <p className="team__note" aria-hidden="true">最後の競技を除く</p>}
    </section>
  )
}
