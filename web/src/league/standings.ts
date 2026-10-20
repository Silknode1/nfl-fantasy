import type { Team } from '../types'

/** Ties count half a win, the same way the sim counts them. */
export function winPct(t: Pick<Team, 'wins' | 'losses' | 'ties'>): number {
  const gp = t.wins + t.losses + t.ties
  return gp ? (t.wins + 0.5 * t.ties) / gp : 0
}

/**
 * League standings: win % first, then points for (the league's seeding tiebreak, and the
 * order `simulate()` seeds by). Team id is a last resort so the order never flickers;
 * it is not a league rule. fantasy.json carries no playoff-seed field to read instead.
 */
export const STANDINGS_RULE =
  'Win percentage first, with a tie counting as half a win, then points for. The league file has no playoff-seed field. Team id is only a last resort so the rows stay put.'
export function standingsOrder<T extends Pick<Team, 'id' | 'wins' | 'losses' | 'ties' | 'pf'>>(teams: T[]): T[] {
  return [...teams].sort((a, b) => winPct(b) - winPct(a) || b.pf - a.pf || a.id - b.id)
}

/** Seed each team would hold if the season ended today, by the same rule. */
export function seedsNow<T extends Pick<Team, 'id' | 'wins' | 'losses' | 'ties' | 'pf'>>(teams: T[]): Map<number, number> {
  return new Map(standingsOrder(teams).map((t, i) => [t.id, i + 1]))
}
