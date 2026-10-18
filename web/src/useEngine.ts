import { useEffect, useMemo, useState } from 'react'
import type { FantasyData, Player } from './types'
import { TradeLab, type TradeBoard, type TradeEval } from './engine/trade'
import { leagueRanks, type Ranks } from './engine/lineup'
import { tradeTable, type TradeValue } from './engine/value'
import { makeNoise, simulate, type Noise, type SimResult } from './engine/sim'
import { rankWaivers, type WaiverPick } from './engine/waivers'
import { buildPlan, type Plan } from './engine/advice'

export interface Engine {
  d: FantasyData
  lab: TradeLab
  ranks: Ranks
  noise: Noise
  sim: SimResult
  waivers: WaiverPick[]
  trades: TradeEval[] | null // best deals of any shape; null while the search runs
  board: TradeBoard | null // best deals by shape, plus long shots
  progress: number // deals checked so far
  plan: Plan | null
  deepen: (ev: TradeEval) => TradeEval
  /** Rest-of-season points per week above the replacement player at his position. */
  tradeOf: (p: Player) => TradeValue
}

const keyOf = (ev: TradeEval) => `${ev.trade.partnerId}|${ev.trade.give.map((p) => p.id).join(',')}|${ev.trade.get.map((p) => p.id).join(',')}`
const worth = (ev: TradeEval) => ev.score * ev.acceptance * (ev.simpler ? 0.75 : 1)

export function useEngine(d: FantasyData | null): Engine | null {
  const core = useMemo(() => {
    if (!d) return null
    const lab = new TradeLab(d)
    const ranks = leagueRanks(d, lab.rosters)
    const weeks = Array.from({ length: d.meta.lastWeek - d.meta.week + 1 }, (_, i) => d.meta.week + i)
    const noise = makeNoise(d.teams.map((t) => t.id), weeks, 3000)
    const sim = simulate(d, lab.rosters, noise, lab.baseOutlook)
    const me = d.teams.find((t) => t.id === d.meta.myTeamId)!
    const waivers = rankWaivers(lab, ranks, me.faabLeft)
    const deepen = (ev: TradeEval) => ({ ...lab.deepen(ev, noise, sim, ranks), simpler: ev.simpler })
    const values = tradeTable(d.players, d.meta.week + 1, d.meta.regularWeeks, d.meta.lastWeek)
    const empty: TradeValue = { production: 0, replacement: 0, surplus: 0 }
    const tradeOf = (p: Player) => values.get(p.id) ?? empty
    return { d, lab, ranks, noise, sim, waivers, deepen, tradeOf }
  }, [d])

  const [board, setBoard] = useState<TradeBoard | null>(null)
  const [trades, setTrades] = useState<TradeEval[] | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!core) return
    let alive = true
    setBoard(null)
    setTrades(null)
    // Search in slices so the page stays responsive, then simulate title odds for the finalists.
    const run = async () => {
      await new Promise((r) => setTimeout(r, 60))
      const raw = await core.lab.searchAsync(12, (n) => alive && setProgress(n))
      if (!alive) return
      const deep: TradeBoard = { '1for1': [], '2for1': [], '3for1': [], reach: [] }
      for (const k of ['1for1', '2for1', '3for1', 'reach'] as const) {
        deep[k] = raw[k].slice(0, k === 'reach' ? 6 : 10).map(core.deepen)
        // Within a shape, packages where every piece earns its place come before ones a smaller offer matches.
        if (k !== 'reach') deep[k].sort((a, b) => Number(!!a.simpler) - Number(!!b.simpler) || worth(b) - worth(a))
        await new Promise((r) => setTimeout(r, 0))
      }
      const seen = new Set<string>()
      const best = [...deep['1for1'], ...deep['2for1'], ...deep['3for1']]
        .sort((a, b) => worth(b) - worth(a))
        .filter((ev) => (seen.has(keyOf(ev)) ? false : (seen.add(keyOf(ev)), true)))
        .slice(0, 12)
      if (!alive) return
      setProgress(core.lab.searched)
      setBoard(deep)
      setTrades(best)
      setPlan(buildPlan(core.d, core.lab, core.ranks, core.sim, best, core.waivers))
    }
    run()
    return () => {
      alive = false
    }
  }, [core])

  if (!core) return null
  return { ...core, trades, board, progress, plan }
}
