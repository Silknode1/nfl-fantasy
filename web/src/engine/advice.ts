import type { FantasyData, Player, Pos } from '../types'
import { POSITIONS, STARTERS, type Ranks } from './lineup'
import type { TradeEval, TradeLab } from './trade'
import type { WaiverPick } from './waivers'
import type { SimResult } from './sim'

const proj = (p: Player, w: number) => p.proj[String(w)] ?? 0

export interface Swap {
  out: Player
  in: Player
  slot: string
  gain: number
}

/**
 * This week's start/sit: locked players (game already played) stay where they are;
 * everyone else is re-slotted to maximise projected points.
 */
export function weekAdvice(roster: Player[], week: number): { swaps: Swap[]; current: number; best: number } {
  const starterSlots = ['QB', 'RB', 'WR', 'TE', 'FLEX']
  const isStarter = (p: Player) => !!p.slot && starterSlots.includes(p.slot)
  const lockedStarters = roster.filter((p) => p.locked && isStarter(p))
  const open: Record<string, number> = { QB: STARTERS.QB, RB: STARTERS.RB, WR: STARTERS.WR, TE: STARTERS.TE, FLEX: 2 }
  for (const p of lockedStarters) open[p.slot!]--
  const pool = roster.filter((p) => !p.locked && p.slot !== 'IR').sort((a, b) => proj(b, week) - proj(a, week))
  const chosen = new Map<string, string>()
  for (const pos of POSITIONS) {
    for (const p of pool.filter((x) => x.pos === pos && !chosen.has(x.id)).slice(0, Math.max(0, open[pos]))) chosen.set(p.id, pos)
  }
  for (const p of pool.filter((x) => x.pos !== 'QB' && !chosen.has(x.id)).slice(0, Math.max(0, open.FLEX))) chosen.set(p.id, 'FLEX')
  const current = roster.filter(isStarter).reduce((s, p) => s + proj(p, week), 0)
  const best = lockedStarters.reduce((s, p) => s + proj(p, week), 0) + [...chosen.keys()].reduce((s, id) => s + proj(roster.find((p) => p.id === id)!, week), 0)
  const benched = roster.filter((p) => isStarter(p) && !p.locked && !chosen.has(p.id))
  const promoted = roster.filter((p) => !isStarter(p) && chosen.has(p.id))
  const swaps: Swap[] = benched
    .sort((a, b) => proj(a, week) - proj(b, week))
    .map((out, i) => ({ out, in: promoted.sort((a, b) => proj(b, week) - proj(a, week))[i], slot: out.slot! }))
    .filter((s) => s.in)
    .map((s) => ({ ...s, gain: proj(s.in, week) - proj(s.out, week) }))
  return { swaps, current, best }
}

export interface PlanItem {
  title: string
  detail: string
  stat?: string
  tone?: 'act' | 'watch' | 'info'
}

export interface Plan {
  short: PlanItem[]
  medium: PlanItem[]
  long: PlanItem[]
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`

/** Average opponent factor (points allowed to the position vs league average) over Weeks 15-17. */
export function playoffSos(d: FantasyData, p: Player): number {
  const weeks = [d.meta.regularWeeks + 1, d.meta.regularWeeks + 2, d.meta.lastWeek]
  const f = weeks.map((w) => {
    const opp = d.nflOpp[p.nfl]?.[String(w)]
    return opp ? d.defense[opp]?.[p.pos] ?? 1 : 1
  })
  return f.reduce((a, b) => a + b, 0) / f.length
}

export const sosLabel = (x: number) => `${x >= 1 ? '+' : ''}${((x - 1) * 100).toFixed(0)}%`

export function buildPlan(d: FantasyData, lab: TradeLab, ranks: Ranks, sim: SimResult, trades: TradeEval[], waivers: WaiverPick[]): Plan {
  const me = lab.myId
  const week = d.meta.week
  const mine = lab.rosters.get(me)!
  const myRanks = ranks[me]
  const short: PlanItem[] = []
  const medium: PlanItem[] = []
  const long: PlanItem[] = []

  // ---- short term: this week
  const wa = weekAdvice(mine, week)
  for (const s of wa.swaps) {
    short.push({
      title: `Start ${s.in.name} over ${s.out.name}`,
      detail: `${s.slot} slot this week. ${s.in.name} projects ${proj(s.in, week).toFixed(1)} vs ${proj(s.out, week).toFixed(1)}.`,
      stat: `+${s.gain.toFixed(1)} pts`,
      tone: 'act',
    })
  }
  if (!wa.swaps.length) short.push({ title: 'Your lineup is already set', detail: `Projected ${wa.best.toFixed(1)} points from the players still to play.`, tone: 'info' })
  const deadIR = mine.filter((p) => p.slot === 'IR' && lab.v(p) < 0.5)
  const irEligibleOnBench = mine.filter((p) => p.slot !== 'IR' && p.inj === 'INJURY_RESERVE')
  if (deadIR.length && irEligibleOnBench.length) {
    short.push({
      title: `Drop ${deadIR[0].name}, move ${irEligibleOnBench[0].name} to IR`,
      detail: `${deadIR[0].name} has no projected points left this season. Moving ${irEligibleOnBench[0].name} into that IR slot frees a bench spot for a waiver claim.`,
      stat: '+1 roster spot',
      tone: 'act',
    })
  }
  const topW = waivers.slice(0, 2)
  for (const w of topW) {
    short.push({
      title: `Claim ${w.player.name} (${w.player.pos}, ${w.player.nfl})`,
      detail: `${w.why.slice(0, 2).join('; ')}.${w.drop ? ` Drop ${w.drop.name} if you need the spot.` : ''}`,
      stat: `bid $${w.bid}`,
      tone: 'act',
    })
  }
  for (const p of mine.filter((x) => x.inj === 'QUESTIONABLE' || x.inj === 'DOUBTFUL')) {
    short.push({ title: `Watch ${p.name}'s status`, detail: `Listed ${p.inj?.toLowerCase()}. Check the report before ${p.locked ? 'next week' : 'kickoff'}.`, tone: 'watch' })
  }

  // ---- medium term: the next four weeks
  for (let w = week + 1; w <= week + 4; w++) {
    const out = mine.filter((p) => p.bye === w && lab.v(p) > 6)
    if (out.length >= 2) {
      medium.push({
        title: `Week ${w} bye crunch`,
        detail: `${out.map((p) => p.name).join(', ')} are off. Line up a fill-in by the Wednesday before.`,
        stat: `${out.length} starters out`,
        tone: 'watch',
      })
    }
  }
  const best = trades[0]
  if (best) {
    const partner = d.teams.find((t) => t.id === best.trade.partnerId)!
    medium.push({
      title: `Pitch: ${best.trade.give.map((p) => p.name).join(' + ')} for ${best.trade.get.map((p) => p.name).join(' + ')}`,
      detail: `${partner.name} is the best fit right now. Grade ${best.grade}; their acceptance is estimated at ${pct(best.acceptance)}.`,
      stat: best.title ? `title ${pct(best.title.before)} to ${pct(best.title.after)}` : undefined,
      tone: 'act',
    })
  }
  const weak = (['QB', 'RB', 'WR', 'TE'] as Pos[]).filter((k) => myRanks[k].rank >= 7)
  const deepest = (['RB', 'WR', 'TE'] as Pos[]).sort((a, b) => myRanks[a].rank - myRanks[b].rank)[0]
  if (weak.length) {
    medium.push({
      title: `Upgrade ${weak.join(' and ')}`,
      detail: `Your ${weak.map((k) => `${k} group ranks ${myRanks[k].rank} of 12`).join(', ')}. Your deepest spot is ${deepest} (${myRanks[deepest].rank} of 12); trade from there.`,
      tone: 'watch',
    })
  }
  const returning = mine.filter((p) => p.injNote && /assumed back Week (\d+)/.test(p.injNote) && lab.v(p) > 4)
  for (const p of returning) {
    const wk = Number(p.injNote!.match(/Week (\d+)/)![1])
    if (wk <= week + 4) medium.push({ title: `${p.name} due back around Week ${wk}`, detail: `${p.injNote}. Hold him if the bench spot isn't needed.`, tone: 'info' })
  }

  // ---- long term: rest of season and playoffs
  const starters = mine.filter((p) => lab.v(p) > 7)
  const sched = starters.map((p) => ({ p, sos: playoffSos(d, p) }))
  const tough = sched.filter((s) => s.sos < 0.96)
  const soft = sched.filter((s) => s.sos > 1.04)
  long.push({
    title: `Title odds ${pct(sim.title[me])}, playoff odds ${pct(sim.playoff[me])}`,
    detail: `From ${(3000).toLocaleString()} simulated seasons. You earn a first-round bye in ${pct(sim.bye[me])} of them. Byes matter: seeds 1 and 2 skip Week ${d.meta.regularWeeks + 1}.`,
    tone: 'info',
  })
  if (tough.length) long.push({ title: 'Tough playoff draws', detail: `${tough.map((s) => `${s.p.name} (${sosLabel(s.sos)})`).join(', ')} face defenses that allow fewer points to their position in Weeks 15–17. Sell before the deadline if a fair offer comes.`, tone: 'watch' })
  if (soft.length) long.push({ title: 'Soft playoff draws', detail: `${soft.map((s) => `${s.p.name} (${sosLabel(s.sos)})`).join(', ')} get defenses that allow more points to their position in Weeks 15–17. Keep them.`, tone: 'info' })
  long.push({
    title: `Trade deadline ${new Date(d.meta.tradeDeadline + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    detail: 'Consolidate two bench pieces into one starter before then; bench depth is worth little once byes end after Week 14.',
    tone: 'act',
  })
  const stash = waivers.filter((w) => w.player.inj === 'INJURY_RESERVE' || (w.value > 6 && w.gain < 0.3)).slice(0, 2)
  if (stash.length) long.push({ title: 'Stash candidates', detail: `${stash.map((w) => `${w.player.name} (${w.player.pos})`).join(', ')} could matter by playoff time.`, tone: 'info' })
  return { short, medium, long }
}
