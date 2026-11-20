import { competitionTotals, sortByOrder } from '../shared/scoring'
import type { Competition, CompetitionId } from '../shared/types'

type Row = { id: CompetitionId; name: string; order: number; hidden: boolean; blue: number; white: number }

export function Breakdown({ competitions, hiddenIds }: { competitions: Competition[]; hiddenIds: CompetitionId[] }) {
  const rows: Row[] = [
    ...sortByOrder(competitions).map(c => ({ id: c.id, name: c.name, order: c.order, hidden: false, ...competitionTotals(c) })),
    // Hidden competitions are unreadable, so they only appear as placeholders after the rest.
    ...hiddenIds.map(id => ({ id, name: '', order: Number.MAX_SAFE_INTEGER, hidden: true, blue: 0, white: 0 })),
  ]

  return (
    <div className="breakdown">
    <div className="breakdown__head" aria-hidden>
      <span>競技</span><span className="breakdown__score--blue">青</span><span>白</span>
    </div>
    <ol className="breakdown__list" aria-label="競技ごとの得点">
      {rows.map(r => (
        <li key={r.id} data-id={r.id} className="breakdown__row">
          <span className="breakdown__id" aria-hidden>{r.id}</span>
          <span className="breakdown__name">{r.hidden ? '最後の競技' : r.name}</span>
          <span className="breakdown__score breakdown__score--blue" data-testid="sub-blue" aria-label={`青 ${r.hidden ? '非公開' : r.blue}`}>
            {r.hidden ? '?' : r.blue}
          </span>
          <span className="breakdown__score breakdown__score--white" data-testid="sub-white" aria-label={`白 ${r.hidden ? '非公開' : r.white}`}>
            {r.hidden ? '?' : r.white}
          </span>
        </li>
      ))}
    </ol>
    </div>
  )
}
