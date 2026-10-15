import type { FantasyData, Player, Pos } from '../types'
import type { TradeEval, TradeLab } from './trade'

const f1 = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(1)
const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function verdict(grade: string): { word: string; tone: 'good' | 'mid' | 'bad' } {
  if (grade.startsWith('A')) return { word: 'Make this trade', tone: 'good' }
  if (grade === 'B+' || grade === 'B') return { word: 'Worth doing', tone: 'good' }
  if (grade === 'B-' || grade === 'C+') return { word: 'Small upgrade: ask for a little more', tone: 'mid' }
  if (grade === 'C') return { word: 'A wash', tone: 'mid' }
  return { word: 'Pass', tone: 'bad' }
}

export function playerLine(p: Player): string {
  const u = p.usage
  const bits = [`${p.ppg.toFixed(1)} pts/game over ${p.gp} games`]
  if (u && (p.pos === 'WR' || p.pos === 'TE') && u.tgtShare) bits.push(`${(u.tgtShare * 100).toFixed(0)}% target share`)
  if (u && p.pos === 'RB') bits.push(`${(u.carPg + u.tgtPg).toFixed(1)} touches+targets/game`)
  if (u && p.pos === 'QB' && u.passYdsPg) bits.push(`${u.passYdsPg.toFixed(0)} pass yds/game`)
  if (p.inj && p.inj !== 'ACTIVE') bits.push(p.injNote ?? p.inj.toLowerCase())
  return `${p.name}: ${bits.join(', ')}`
}

/** Plain-language case for or against a trade, built only from computed numbers. */
export function tradeSummary(ev: TradeEval, d: FantasyData, lab: TradeLab): string[] {
  const partner = d.teams.find((t) => t.id === ev.trade.partnerId)!
  const v = verdict(ev.grade)
  const out: string[] = []
  out.push(
    `${v.word}. Your best lineup changes by ${f1(ev.me.regDelta)} points a week for the rest of the regular season and ${f1(ev.me.poDelta)} in the Week 15–17 playoffs.`,
  )
  if (ev.title && ev.playoff) {
    out.push(`Title odds go from ${pct(ev.title.before)} to ${pct(ev.title.after)}; playoff odds from ${pct(ev.playoff.before)} to ${pct(ev.playoff.after)}.`)
  }
  if (ev.ranks) {
    const moves: string[] = []
    for (const k of ['QB', 'RB', 'WR', 'TE', 'FLEX'] as (Pos | 'FLEX')[]) {
      const b = ev.ranks.before[k].rank
      const a = ev.ranks.after[k].rank
      if (a !== b) moves.push(`${k} ${ordinal(b)} to ${ordinal(a)}`)
    }
    if (moves.length) out.push(`Your league ranks move: ${moves.join(', ')}.`)
  }
  const gets = ev.trade.get.map((p) => lab.v(p)).reduce((a, b) => a + b, 0)
  const gives = ev.trade.give.map((p) => lab.v(p)).reduce((a, b) => a + b, 0)
  if (ev.trade.give.length > ev.trade.get.length) {
    out.push(
      `You give more total points (${gives.toFixed(1)} vs ${gets.toFixed(1)} a week, ours) but only starters score. The open roster spot is valued as a typical pickup like ${ev.addsMe[0]?.name ?? 'a waiver claim'}.`,
    )
  }
  if (ev.simpler) {
    out.push(`You may not need every piece: ${ev.simpler.trade.give.map((p) => p.name).join(' + ')} alone gets about the same gain with about the same chance of a yes. Offer that first.`)
  }
  if (ev.trade.give.length >= 3) {
    out.push(`They'd have to cut ${ev.dropsPartner.map((p) => p.name).join(' and ') || 'two players'} to make room, which managers often resist.`)
  }
  const acc = ev.acceptance
  const accWord = acc >= 0.6 ? 'likely says yes' : acc >= 0.35 ? 'might say yes' : 'probably says no'
  out.push(
    `${partner.name} ${accWord} (${(acc * 100).toFixed(0)}% estimate): their lineup changes by ${f1(ev.partner.delta)} points a week and the deal looks ${ev.perceived >= 0 ? 'good' : 'bad'} for them on ESPN's numbers.`,
  )
  return out
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
