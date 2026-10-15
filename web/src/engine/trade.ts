import type { FantasyData, Player, Pos } from '../types'
import { ACTIVE_ROSTER, leagueRanks, outlook, playerValue, rosters as buildRosters, type Ranks, type TeamOutlook } from './lineup'
import { simulate, type Noise, type SimResult } from './sim'

export interface Trade {
  partnerId: number
  give: Player[] // from me
  get: Player[] // from partner
}

export interface TradeEval {
  trade: Trade
  me: { before: TeamOutlook; after: TeamOutlook; delta: number; regDelta: number; poDelta: number }
  partner: { before: TeamOutlook; after: TeamOutlook; delta: number }
  dropsMe: Player[]
  addsMe: Player[]
  dropsPartner: Player[]
  addsPartner: Player[]
  acceptance: number
  perceived: number
  title?: { before: number; after: number }
  playoff?: { before: number; after: number }
  ranks?: { before: Ranks[number]; after: Ranks[number]; partnerBefore: Ranks[number]; partnerAfter: Ranks[number] }
  score: number
  grade: string
  /** A smaller version of this package that does about as well (you may not need every piece). */
  simpler?: TradeEval
}

export const GRADES: [number, string][] = [
  [4, 'A+'], [3, 'A'], [2.2, 'A-'], [1.5, 'B+'], [1.0, 'B'], [0.6, 'B-'],
  [0.25, 'C+'], [-0.25, 'C'], [-0.6, 'C-'], [-1.0, 'D+'], [-1.5, 'D'], [-2.2, 'D-'],
]

export function gradeFor(score: number): string {
  for (const [min, g] of GRADES) if (score >= min) return g
  return 'F'
}

/** Grade score: weekly starting-point gain, plus a nudge for title-odds change (percentage points). */
export function tradeScore(deltaPpw: number, titleDeltaPp?: number): number {
  return deltaPpw + 0.2 * (titleDeltaPp ?? 0)
}

export class TradeLab {
  d: FantasyData
  from: number
  rosters: Map<number, Player[]>
  value: Map<string, number>
  freeAgents: Player[]
  baseOutlook: Map<number, TeamOutlook>
  myId: number
  replacement: Map<string, number>
  searched = 0

  constructor(d: FantasyData) {
    this.d = d
    this.from = d.meta.week + 1
    this.myId = d.meta.myTeamId
    this.rosters = buildRosters(d)
    this.value = new Map(d.players.map((p) => [p.id, playerValue(p, this.from, d.meta.regularWeeks, d.meta.lastWeek)]))
    this.freeAgents = d.players.filter((p) => !p.teamId).sort((a, b) => this.v(b) - this.v(a))
    this.baseOutlook = new Map([...this.rosters.entries()].map(([id, r]) => [id, this.outlookOf(r)]))
    const depth: Record<string, number> = { QB: 13, RB: 30, WR: 30, TE: 13 }
    this.replacement = new Map(
      Object.entries(depth).map(([pos, n]) => {
        const seen = d.players.filter((p) => p.pos === pos).map((p) => this.seen(p)).sort((a, b) => b - a)
        return [pos, seen[n - 1] ?? 0]
      }),
    )
  }

  v(p: Player) {
    return this.value.get(p.id) ?? 0
  }

  outlookOf(r: Player[]) {
    return outlook(r, this.d.meta.week, this.d.meta.regularWeeks, this.d.meta.lastWeek, this.from)
  }

  active(r: Player[]) {
    return r.filter((p) => p.slot !== 'IR')
  }

  /** Keep the roster legal: drop the least valuable bench players, or fill with the best free agents. */
  fit(r: Player[], exclude: Set<string>): { roster: Player[]; drops: Player[]; adds: Player[] } {
    const roster = [...r]
    const drops: Player[] = []
    const adds: Player[] = []
    let over = this.active(roster).length - ACTIVE_ROSTER
    while (over > 0) {
      const cand = this.active(roster).sort((a, b) => this.v(a) - this.v(b))[0]
      roster.splice(roster.indexOf(cand), 1)
      drops.push(cand)
      over--
    }
    let under = ACTIVE_ROSTER - this.active(roster).length
    // An open spot is valued as a typical pickup (the 5th-best free agent), not the one claim everybody wants.
    for (const fa of this.freeAgents.slice(4)) {
      if (under <= 0) break
      if (exclude.has(fa.id)) continue
      roster.push({ ...fa, slot: 'BE' })
      adds.push(fa)
      exclude.add(fa.id)
      under--
    }
    return { roster, drops, adds }
  }

  /** What another manager sees: ESPN projection and season scoring per game. */
  seen(p: Player) {
    return 0.5 * (p.espnSeason / 17) + 0.5 * (p.ppg || p.espnSeason / 17)
  }

  /** Seen value above the last startable player at the position (QB13, RB/WR30, TE13), top-heavy for packages. */
  perceivedValue(ps: Player[]) {
    const vals = ps.map((p) => Math.max(0, this.seen(p) - (this.replacement.get(p.pos) ?? 0))).sort((a, b) => b - a)
    return vals.reduce((s, v, i) => s + v * (i === 0 ? 1 : 0.55), 0)
  }

  evaluate(t: Trade): TradeEval {
    const mine = this.rosters.get(this.myId)!
    const theirs = this.rosters.get(t.partnerId)!
    const giveIds = new Set(t.give.map((p) => p.id))
    const getIds = new Set(t.get.map((p) => p.id))
    const used = new Set<string>()
    const meFit = this.fit([...mine.filter((p) => !giveIds.has(p.id)), ...t.get.map((p) => ({ ...p, slot: 'BE' }))], used)
    const thFit = this.fit([...theirs.filter((p) => !getIds.has(p.id)), ...t.give.map((p) => ({ ...p, slot: 'BE' }))], used)
    const meBefore = this.baseOutlook.get(this.myId)!
    const meAfter = this.outlookOf(meFit.roster)
    const thBefore = this.baseOutlook.get(t.partnerId)!
    const thAfter = this.outlookOf(thFit.roster)
    const partnerDelta = thAfter.weighted - thBefore.weighted
    // What they get minus what they give, on ESPN-style numbers, with a premium on what they already own.
    const perceived = this.perceivedValue(t.give) - ENDOWMENT * this.perceivedValue(t.get)
    // Acceptance estimate: their real lineup change plus how the deal looks on ESPN. Untested on real trades.
    const logit = -0.8 + 1.0 * partnerDelta + 0.3 * perceived
    const acceptance = Math.min(0.95, Math.max(0.03, 1 / (1 + Math.exp(-logit))))
    const delta = meAfter.weighted - meBefore.weighted
    const score = tradeScore(delta)
    return {
      trade: t,
      me: { before: meBefore, after: meAfter, delta, regDelta: meAfter.regular - meBefore.regular, poDelta: meAfter.playoff - meBefore.playoff },
      partner: { before: thBefore, after: thAfter, delta: partnerDelta },
      dropsMe: meFit.drops,
      addsMe: meFit.adds,
      dropsPartner: thFit.drops,
      addsPartner: thFit.adds,
      acceptance,
      perceived,
      score,
      grade: gradeFor(score),
    }
  }

  /** Rosters after a trade, for simulation and rank comparisons. */
  rostersAfter(ev: TradeEval): Map<number, Player[]> {
    const m = new Map(this.rosters)
    const giveIds = new Set(ev.trade.give.map((p) => p.id))
    const getIds = new Set(ev.trade.get.map((p) => p.id))
    const dropMe = new Set(ev.dropsMe.map((p) => p.id))
    const dropTh = new Set(ev.dropsPartner.map((p) => p.id))
    const mine = this.rosters.get(this.myId)!
    const theirs = this.rosters.get(ev.trade.partnerId)!
    m.set(this.myId, [
      ...mine.filter((p) => !giveIds.has(p.id)),
      ...ev.trade.get.map((p) => ({ ...p, teamId: this.myId, slot: 'BE' })),
      ...ev.addsMe.map((p) => ({ ...p, teamId: this.myId, slot: 'BE' })),
    ].filter((p) => !dropMe.has(p.id)))
    m.set(ev.trade.partnerId, [
      ...theirs.filter((p) => !getIds.has(p.id)),
      ...ev.trade.give.map((p) => ({ ...p, teamId: ev.trade.partnerId, slot: 'BE' })),
      ...ev.addsPartner.map((p) => ({ ...p, teamId: ev.trade.partnerId, slot: 'BE' })),
    ].filter((p) => !dropTh.has(p.id)))
    return m
  }

  /** Full evaluation: title and playoff odds on shared simulated seasons, plus position ranks. */
  deepen(ev: TradeEval, noise: Noise, baseline: SimResult, baseRanks: Ranks): TradeEval {
    const after = this.rostersAfter(ev)
    const ol = new Map(this.baseOutlook)
    ol.set(this.myId, ev.me.after)
    ol.set(ev.trade.partnerId, ev.partner.after)
    const sim = simulate(this.d, after, noise, ol)
    const ranksAfter = leagueRanks({ ...this.d, players: [...after.values()].flat() }, after)
    const title = { before: baseline.title[this.myId], after: sim.title[this.myId] }
    const score = tradeScore(ev.me.delta, (title.after - title.before) * 100)
    return {
      ...ev,
      title,
      playoff: { before: baseline.playoff[this.myId], after: sim.playoff[this.myId] },
      ranks: {
        before: baseRanks[this.myId], after: ranksAfter[this.myId],
        partnerBefore: baseRanks[ev.trade.partnerId], partnerAfter: ranksAfter[ev.trade.partnerId],
      },
      score,
      grade: gradeFor(score),
    }
  }

  /** A trade must leave me a QB and a TE of my own, not a free-agent stopgap. */
  keepsCore(give: Player[]) {
    const mine = this.active(this.rosters.get(this.myId)!)
    const ids = new Set(give.map((p) => p.id))
    return (['QB', 'TE'] as Pos[]).every((pos) => mine.some((p) => p.pos === pos && !ids.has(p.id) && this.v(p) > 3))
  }

  /**
   * The nearest deals the other manager might actually take: same partner, only players from the
   * original ask, any package of mine (up to 3 real players) that still helps me.
   * Used when a deal grades well but the acceptance estimate is low.
   */
  counterOffers(ev: TradeEval, limit = 4): TradeEval[] {
    const mine = this.active(this.rosters.get(this.myId)!).filter((p) => !p.tradeLocked && this.v(p) >= MIN_PIECE)
    const asks: Player[][] = []
    const n = ev.trade.get.length
    for (let mask = 1; mask < 1 << n; mask++) asks.push(ev.trade.get.filter((_, i) => mask & (1 << i)))
    const gives: Player[][] = []
    const go = (i: number, cur: Player[]) => {
      if (cur.length) gives.push([...cur])
      if (cur.length === 3) return
      for (let j = i; j < mine.length; j++) {
        cur.push(mine[j])
        go(j + 1, cur)
        cur.pop()
      }
    }
    go(0, [])
    const sameAs = (a: Player[], b: Player[]) => a.length === b.length && a.every((p) => b.some((q) => q.id === p.id))
    const bestPerAsk: TradeEval[] = []
    for (const get of asks) {
      let best: TradeEval | null = null
      for (const give of gives) {
        if (!this.keepsCore(give)) continue
        if (sameAs(give, ev.trade.give) && sameAs(get, ev.trade.get)) continue
        const c = this.cached({ partnerId: ev.trade.partnerId, give, get })
        if (c.me.delta < COUNTER_MIN_GAIN || c.acceptance < COUNTER_MIN_ACCEPT) continue
        const worth = (x: TradeEval) => x.me.delta * x.acceptance - 0.001 * x.trade.give.length
        if (!best || worth(c) > worth(best)) best = c
      }
      if (best) bestPerAsk.push(best)
    }
    return bestPerAsk.sort((a, b) => b.me.delta * b.acceptance - a.me.delta * a.acceptance).slice(0, limit)
  }

  /**
   * Every deal shape worth checking: 1-for-1, and 2-for-1 / 3-for-1 consolidations where the player
   * coming back beats each player going out. Cheap filters run before the full evaluation:
   * a 3-for-1 only targets players worth 9+ points a week, and a package that looks far too small
   * on ESPN's numbers is skipped because no manager would take it.
   */
  *candidates(kinds: TradeKind[] = ['1for1', '2for1', '3for1']): Generator<Trade> {
    const mine = this.active(this.rosters.get(this.myId)!).filter((p) => !p.tradeLocked && this.v(p) > 1).sort((a, b) => this.v(b) - this.v(a))
    const want = new Set(kinds)
    for (const [pid, roster] of this.rosters) {
      if (pid === this.myId) continue
      for (const tgt of roster.filter((p) => !p.tradeLocked && p.slot !== 'IR' && this.v(p) > 4)) {
        const tv = this.v(tgt)
        const seenTgt = ENDOWMENT * this.perceivedValue([tgt])
        const pool = mine.filter((p) => this.v(p) < tv)
        if (want.has('1for1')) for (const a of mine) if (this.keepsCore([a])) yield { partnerId: pid, give: [a], get: [tgt] }
        if (want.has('2for1')) {
          for (let i = 0; i < pool.length; i++)
            for (let j = i + 1; j < pool.length; j++) {
              const give = [pool[i], pool[j]]
              if (this.perceivedValue(give) < 0.6 * seenTgt || !this.keepsCore(give)) continue
              yield { partnerId: pid, give, get: [tgt] }
            }
        }
        if (want.has('3for1') && tv >= 9) {
          for (let i = 0; i < pool.length; i++)
            for (let j = i + 1; j < pool.length; j++)
              for (let k = j + 1; k < pool.length; k++) {
                const give = [pool[i], pool[j], pool[k]]
                if (this.perceivedValue(give) < 0.7 * seenTgt || !this.keepsCore(give)) continue
                yield { partnerId: pid, give, get: [tgt] }
              }
        }
      }
    }
  }

  /**
   * Keep a deal if it helps me and has a real chance. Packages must be all real pieces:
   * every player is worth 3.5+ points a week and the other team keeps everyone it receives.
   * If a smaller version of the package does about as well, it's noted so you don't overpay.
   */
  keep(ev: TradeEval): boolean {
    if (ev.me.delta <= 0.3 || ev.acceptance <= 0.1) return false
    return this.realPackage(ev)
  }

  realPackage(ev: TradeEval): boolean {
    if (ev.trade.give.length === 1) return true
    const given = new Set(ev.trade.give.map((p) => p.id))
    if (ev.dropsPartner.some((p) => given.has(p.id))) return false
    if (ev.trade.give.some((p) => this.v(p) < MIN_PIECE)) return false
    // "Simpler" = a smaller package that is about as good on both counts: your gain and their yes.
    let best: TradeEval | undefined
    for (const sub of subsets(ev.trade.give)) {
      const s = this.cached({ partnerId: ev.trade.partnerId, give: sub, get: ev.trade.get })
      if (s.me.delta >= 0.9 * ev.me.delta && s.acceptance >= 0.9 * ev.acceptance && (!best || s.trade.give.length < best.trade.give.length)) best = s
    }
    ev.simpler = best
    return true
  }

  private cache = new Map<string, TradeEval>()
  cached(t: Trade): TradeEval {
    const key = `${t.partnerId}|${t.give.map((p) => p.id).sort().join(',')}|${t.get.map((p) => p.id).join(',')}`
    let ev = this.cache.get(key)
    if (!ev) {
      ev = this.evaluate(t)
      this.cache.set(key, ev)
    }
    return ev
  }

  /** Best deals of one shape: expected gain (my gain x acceptance), one deal per target player. */
  pick(found: TradeEval[], limit: number): TradeEval[] {
    const worth = (e: TradeEval) => e.me.delta * e.acceptance * (e.simpler ? 0.75 : 1)
    const sorted = [...found].sort((x, y) => worth(y) - worth(x))
    const seen = new Set<string>()
    const out: TradeEval[] = []
    for (const ev of sorted) {
      const key = ev.trade.get.map((p) => p.id).join('+')
      if (seen.has(key)) continue
      seen.add(key)
      out.push(ev)
      if (out.length >= limit) break
    }
    return out
  }

  /** Synchronous search (scripts and tests). Returns the best `limit` deals of each shape. */
  search(limit = 12, kinds: TradeKind[] = ['1for1', '2for1', '3for1']): TradeBoard {
    const found = emptyBoard()
    this.searched = 0
    for (const t of this.candidates(kinds)) this.consider(this.cached(t), found)
    return this.finish(found, limit)
  }

  /** Sort one candidate into its list: a realistic deal, or a long-shot consolidation for a much better player. */
  consider(ev: TradeEval, found: TradeBoard) {
    this.searched++
    if (this.keep(ev)) found[kindOf(ev.trade)].push(ev)
    else if (ev.trade.give.length > 1 && ev.me.delta >= REACH_GAIN && ev.acceptance > 0.02 && this.realPackage(ev)) found.reach.push(ev)
  }

  finish(found: TradeBoard, limit: number): TradeBoard {
    const reach = [...found.reach].sort((a, b) => b.me.delta - a.me.delta)
    const seen = new Set<string>()
    return {
      '1for1': this.pick(found['1for1'], limit),
      '2for1': this.pick(found['2for1'], limit),
      '3for1': this.pick(found['3for1'], limit),
      reach: reach.filter((e) => (seen.has(e.trade.get[0].id) ? false : (seen.add(e.trade.get[0].id), true))).slice(0, 8).map((e) => ({ ...e, simpler: undefined })),
    }
  }

  /** Same search, yielding to the browser every ~30 ms so the page stays responsive. */
  async searchAsync(limit = 12, onProgress?: (n: number) => void): Promise<TradeBoard> {
    const found = emptyBoard()
    this.searched = 0
    let t0 = performance.now()
    for (const t of this.candidates()) {
      this.consider(this.cached(t), found)
      if (performance.now() - t0 > 30) {
        onProgress?.(this.searched)
        await new Promise((r) => setTimeout(r, 0))
        t0 = performance.now()
      }
    }
    return this.finish(found, limit)
  }
}

/** Smallest player worth including in a package (weighted pts/week); anything less is filler they'd cut. */
export const MIN_PIECE = 3.5

/** All proper, non-empty sub-packages of a give list (sizes 1 to n-1). */
function subsets(ps: Player[]): Player[][] {
  const out: Player[][] = []
  const n = ps.length
  for (let mask = 1; mask < (1 << n) - 1; mask++) out.push(ps.filter((_, i) => mask & (1 << i)))
  return out
}

export type TradeKind = '1for1' | '2for1' | '3for1'
export type TradeBoard = Record<TradeKind | 'reach', TradeEval[]>
const emptyBoard = (): TradeBoard => ({ '1for1': [], '2for1': [], '3for1': [], reach: [] })
/** A consolidation that adds this many starting points a week is worth pitching even when acceptance looks low. */
export const REACH_GAIN = 1.5
export const kindOf = (t: Trade): TradeKind => (t.give.length >= 3 ? '3for1' : t.give.length === 2 ? '2for1' : '1for1')
export const KIND_LABEL: Record<TradeKind, string> = { '1for1': '1-for-1', '2for1': '2-for-1', '3for1': '3-for-1' }
/** A counteroffer must still add this many starting points a week and clear this acceptance estimate. */
export const COUNTER_MIN_GAIN = 0.5
export const COUNTER_MIN_ACCEPT = 0.3
/** Below this acceptance estimate a deal is flagged as one they'd probably decline. */
export const DECLINE_BELOW = 0.1
/** Managers overvalue what they already own (endowment effect); their best outgoing player gets a 15% premium. */
export const ENDOWMENT = 1.15

export const posLabel = (pos: Pos | 'FLEX' | 'BENCH') => (pos === 'BENCH' ? 'Bench' : pos === 'FLEX' ? 'Flex' : pos)
