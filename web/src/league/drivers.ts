import type { FantasyData } from '../types'
import type { TeamOutlook } from '../engine/lineup'
import { remainingGames } from '../engine/sim'

/**
 * The per-team numbers `simulate()` draws from, read off the same outlooks and the same
 * game list. These are inputs, not a breakdown of why the title odds came out as they did.
 */
export interface SimDrivers {
  /** Regular-season games the sim still plays for this team (this week included). */
  gamesLeft: number
  /** Mean projected lineup points in those games: the center of each simulated score. */
  projPerWeek: number
  /** Mean weekly spread (sd) on those scores. */
  sdPerWeek: number
  /** Mean projected points of the opponents in those same games. */
  oppPerWeek: number
  /** Mean projected points in the playoff weeks the sim plays if the team gets in. */
  playoffPerWeek: number
  /** Wins the sim starts from: wins plus half a tie. */
  startWins: number
  /** Points for the sim starts from. */
  startPf: number
  /** Decided games before this week. The sim does not replay them. */
  lockedGames: number
}

/** Shown next to the title, playoff, and bye percents. */
export const SIM_ODDS_NOTE =
  'Title, playoff, and bye percents are whole numbers from this run of simulate(). They move about ±2 points between runs.'

/** What the driver columns are, and what they are not. */
export const DRIVER_NOTE =
  'Lineup, spread, and opponents are the weekly scores simulate() draws for games left (this week through the last regular week). Seed now is the standings place. The sim starts from the current record and points for and does not re-score finished games. Points against is the league total; the sim does not read it.'

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0)

function isLocked(winner: string): boolean {
  return winner !== 'UNDECIDED' && winner !== ''
}

export function simDrivers(d: FantasyData, outlooks: Map<number, TeamOutlook>): Map<number, SimDrivers> {
  const games = remainingGames(d)
  const playoffWeeks: number[] = []
  for (let w = d.meta.regularWeeks + 1; w <= d.meta.lastWeek; w++) playoffWeeks.push(w)
  const out = new Map<number, SimDrivers>()
  for (const t of d.teams) {
    const own = outlooks.get(t.id)
    if (!own) continue
    const mine = games.filter((g) => g.home === t.id || g.away === t.id)
    const pts: number[] = []
    const sds: number[] = []
    const opp: number[] = []
    for (const g of mine) {
      const o = own.weekly[g.week]
      const other = outlooks.get(g.home === t.id ? g.away : g.home)?.weekly[g.week]
      if (o) {
        pts.push(o.points)
        sds.push(o.sd)
      }
      if (other) opp.push(other.points)
    }
    const lockedGames = d.games.filter(
      (g) => g.week < d.meta.week && isLocked(g.winner) && (g.home === t.id || g.away === t.id),
    ).length
    out.set(t.id, {
      gamesLeft: mine.length,
      projPerWeek: mean(pts),
      sdPerWeek: mean(sds),
      oppPerWeek: mean(opp),
      playoffPerWeek: mean(playoffWeeks.flatMap((w) => (own.weekly[w] ? [own.weekly[w]!.points] : []))),
      startWins: t.wins + 0.5 * t.ties,
      startPf: t.pf,
      lockedGames,
    })
  }
  return out
}
