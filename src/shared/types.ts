export type Team = 'blue' | 'white'
export type CapMode = 'shared' | 'perTeam'
export type MatchScore = { blue: number; white: number }
export type CompetitionId = 'A' | 'B' | 'C' | 'D' | 'E'

export type Competition = {
  id: CompetitionId
  name: string
  order: number
  matchCount: number
  max: number
  /** false = totals may exceed max (玉入れ uses raw ball points). Each value is still ≤ MAX_SCORE. */
  capped: boolean
  presets: number[]
  /** Keyed by match number "1".."10". Missing matches count as 0. */
  scores: Record<string, MatchScore>
}

export type Settings = { capMode: CapMode; hideFromOrder: number; hidden: boolean }
export type Totals = { blue: number; white: number }

export const TEAM_LABEL: Record<Team, string> = { blue: '青組', white: '白組' }
export const MAX_MATCHES = 10
export const MAX_SCORE = 1000
