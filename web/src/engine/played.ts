import type { FantasyData, Player, Pos } from '../types'

/**
 * Old builds copied a played week's actual into `proj` and `projIf` and left `playP` empty.
 * This puts the pregame projection back. It matches `schedule_projection` plus the current-week
 * branch of `availability()` in fantasy/engine.py. Practice status is not stored on the player,
 * so a questionable player uses the 63% default.
 *
 * Weekly points are floored at 0. The rest-of-season rate can stay slightly negative: that is
 * the blend for a backup whose scoring is negative and whose ESPN prior is about 0.
 */

const PRIOR: Record<Pos, number> = { QB: 10, RB: 4, WR: 6, TE: 10 }
const OPP_LO = 0.92
const OPP_HI = 1.08
const BACKUP_LIFT: Partial<Record<Pos, number>> = { RB: 1.4, WR: 1.4 }
const BACKUP_DEPTH = 2

function blend(pos: Pos, games: number, ppg: number, anchor: number): number {
  const k = PRIOR[pos] ?? 6
  if (games <= 0 && anchor <= 0) return 0
  return (games * ppg + k * anchor) / (games + k)
}

function clip(factor: number): number {
  return Math.min(OPP_HI, Math.max(OPP_LO, factor))
}

/** Current week only. Ahead is 0, so out and IR are off the field. */
function availability(p: Player): { play: number; cond: number } {
  const healthy = p.pos === 'RB' ? 0.96 : 0.97
  const status = p.inj
  if (status == null || status === 'ACTIVE' || status === 'NORMAL') return { play: healthy, cond: 1 }
  if (status === 'QUESTIONABLE' || status === 'DAY_TO_DAY') return { play: 0.63, cond: 0.88 }
  if (status === 'DOUBTFUL') return { play: 0.03, cond: 0.88 }
  if (status === 'OUT' || status === 'SUSPENSION' || status === 'INJURY_RESERVE') return { play: 0, cond: 1 }
  return { play: healthy, cond: 1 }
}

function pregame(p: Player, week: number, d: FantasyData): { proj: number; projIf: number } {
  const anchor = p.rateParts.week ?? p.rateParts.espn ?? 0
  const rate = blend(p.pos, p.gp, p.ppg, anchor) * p.rateParts.trend * p.rateParts.jev
  const espnPriced = (p.espnWeek ?? 0) > 0.3 && (p.inj == null || p.inj === 'ACTIVE' || p.inj === 'QUESTIONABLE' || p.inj === 'DAY_TO_DAY')
  const opp = d.nflOpp[p.nfl]?.[String(week)]
  if (p.bye === week || p.nfl === 'FA' || !opp) return { proj: 0, projIf: 0 }
  const factor = espnPriced ? 1 : clip(d.defense[opp]?.[p.pos] ?? 1)
  const { play, cond } = availability(p)
  const ifPlay = Math.max(0, rate * factor * cond)
  if (play <= 0) return { proj: 0, projIf: 0 }
  return { proj: Math.round(ifPlay * play * 100) / 100, projIf: Math.round(ifPlay * 100) / 100 }
}

function copiedActual(p: Player, week: string): boolean {
  if (!p.locked || p.playP != null) return false
  const actual = p.actual[week]
  const proj = p.proj[week]
  const projIf = p.projIf?.[week]
  if (actual == null || proj == null || projIf == null) return false
  return Math.abs(proj - actual) <= 0.011 && Math.abs(projIf - proj) <= 0.011
}

function liftRestored(players: Player[], week: number, restored: Set<string>) {
  const key = String(week)
  const groups = new Map<string, Player[]>()
  for (const p of players) {
    if (p.nfl === 'FA' || !(p.pos in BACKUP_LIFT) || p.rate < 2.5) continue
    const id = `${p.nfl}:${p.pos}`
    const list = groups.get(id) ?? []
    list.push(p)
    groups.set(id, list)
  }
  for (const grp of groups.values()) {
    grp.sort((a, b) => b.rate - a.rate)
    if (grp.length < 2) continue
    const starter = grp[0]
    if (starter.bye === week) continue
    const sIf = starter.projIf?.[key] ?? 0
    const sEx = starter.proj[key] ?? 0
    const miss = sIf <= 0 ? 1 : Math.max(0, 1 - sEx / sIf)
    const lift = BACKUP_LIFT[starter.pos]
    if (lift == null) continue
    const m = 1 + (lift - 1) * miss
    if (m <= 1.005) continue
    for (const q of grp.slice(1, 1 + BACKUP_DEPTH)) {
      if (!restored.has(q.id)) continue
      q.proj[key] = Math.round(Math.max(0, (q.proj[key] ?? 0) * m) * 100) / 100
      if (q.projIf) q.projIf[key] = Math.round(Math.max(0, (q.projIf[key] ?? 0) * m) * 100) / 100
    }
  }
}

function rerank(players: Player[]) {
  for (const pos of ['QB', 'RB', 'WR', 'TE'] as Pos[]) {
    const group = players.filter((p) => p.pos === pos)
    group.sort((a, b) => (b.ros + 1.5 * b.playoffs) - (a.ros + 1.5 * a.playoffs))
    group.forEach((p, i) => { p.ourRank = i + 1 })
  }
}

/** Actual points for a week whose game is already in the books. Null when the week is still a projection. */
export function finalScore(p: Player, week: number): number | null {
  if (!p.locked) return null
  const v = p.actual[String(week)]
  return v == null ? null : v
}

/** Restore pregame projections and floor weekly points at 0. Mutates the loaded file. */
export function separatePlayedProjections(d: FantasyData): FantasyData {
  const week = d.meta.week
  const key = String(week)
  const reg = d.meta.regularWeeks
  const restored = new Set<string>()
  for (const p of d.players) {
    if (!copiedActual(p, key)) continue
    const next = pregame(p, week, d)
    if (!p.projIf) p.projIf = {}
    if (p.proj[key] === next.proj && p.projIf[key] === next.projIf) continue
    p.proj[key] = next.proj
    p.projIf[key] = next.projIf
    restored.add(p.id)
  }
  liftRestored(d.players, week, restored)
  let rosChanged = false
  for (const p of d.players) {
    let touched = restored.has(p.id)
    for (const book of [p.proj, p.projIf]) {
      if (!book) continue
      for (const [w, value] of Object.entries(book)) {
        if (value < 0) {
          book[w] = 0
          touched = true
          rosChanged = true
        }
      }
    }
    if (p.sd < 0) p.sd = 0
    if (!touched) continue
    let ros = 0
    let playoffs = 0
    for (const [w, value] of Object.entries(p.proj)) {
      const n = Number(w)
      if (n > reg) playoffs += value
      else if (n > week) ros += value
    }
    p.ros = Math.round(ros * 10) / 10
    p.playoffs = Math.round(playoffs * 10) / 10
  }
  if (restored.size || rosChanged) rerank(d.players)
  return d
}
