import { useMemo, useState } from 'react'
import type { Pos } from '../types'
import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import { sortWaivers, type WaiverSort } from '../engine/waivers'
import { Avatar, InjuryTag, Meter, RankDelta, fmt, signed } from '../components/bits'
import { EmptyState, GlassCard, StatGroup } from '../components/glass'
import { PlayerLink, TeamLink } from '../components/links'

const suffix = new Set(['Jr', 'Jr.', 'Sr', 'Sr.', 'II', 'III', 'IV', 'V'])
const shortName = (name: string) => {
  const parts = name.split(' ').filter((part) => !suffix.has(part))
  return parts[parts.length - 1] || name
}

const SORTS: { id: WaiverSort; label: string }[] = [
  { id: 'position', label: 'Position' },
  { id: 'delta', label: 'Lineup Δ' },
  { id: 'hype', label: 'Hype' },
  { id: 'fit', label: 'Fit' },
  { id: 'role', label: 'Role' },
]

export function Waivers() {
  const { d, waivers, ranks } = useEngineCtx()
  const [pos, setPos] = useState<Pos | 'ALL'>('ALL')
  const [sort, setSort] = useState<WaiverSort>('position')
  const me = d.teams.find((t) => t.id === d.meta.myTeamId)!
  const list = useMemo(
    () => sortWaivers(waivers, sort).filter((w) => pos === 'ALL' || w.player.pos === pos).slice(0, 15),
    [waivers, sort, pos],
  )
  useNumbered(list.map((w) => w.player))
  const weak = (['QB', 'RB', 'WR', 'TE'] as Pos[]).filter((k) => ranks[d.meta.myTeamId][k].rank >= 7)
  return (
    <div className="screen" id="waivers">
      <GlassCard featured lean>
        <div className="panel-head">
          <h2>Waiver wire</h2>
          <div className="seg" role="group" aria-label="Filter by position">
            {(['ALL', 'QB', 'RB', 'WR', 'TE'] as const).map((k) => (
              <button key={k} className={pos === k ? 'on' : ''} onClick={() => setPos(k)} aria-pressed={pos === k}>
                {k === 'ALL' ? 'All' : k}
              </button>
            ))}
          </div>
        </div>
        <div className="seg seg-wrap" role="group" aria-label="Sort the board">
          {SORTS.map((s) => (
            <button key={s.id} className={sort === s.id ? 'on' : ''} onClick={() => setSort(s.id)} aria-pressed={sort === s.id}>
              {s.label}
            </button>
          ))}
        </div>
        <StatGroup
          label="Your waiver budget"
          items={[
            { key: 'faab', label: 'FAAB left', value: `$${me.faabLeft}`, className: 'hero' },
            { key: 'budget', label: 'Budget', value: `$${d.meta.faabBudget}` },
            { key: 'prio', label: 'Priority', value: String(me.waiverRank) },
          ]}
        />
        <p className="muted small">
          Points per week is the change in your best lineup at that slot: the added player minus the starter who would leave.
          Position ranks each spot on its own, then shows one board. Lineup Δ, hype, fit, and role re-sort that board.
          Fit, hype, and role are still on the meters. The old 40/35/15/10 mix with raw value is arbitrary and does not set this order.
          FAAB is a share of the ${me.faabLeft} left, by lineup-delta rank. Those shares are arbitrary.
          Weakest groups: {weak.map((k) => `${k} (${ranks[d.meta.myTeamId][k].rank} of 12)`).join(', ') || 'none'}.
        </p>
      </GlassCard>
      {list.length === 0 ? (
        <EmptyState title="No one at this spot" body="The wire is quiet for this position. Try All, or open Waiver pulse to see who the rest of the world is adding.">
          <p className="news-next"><a className="dest" href="#pulse">Waiver pulse</a></p>
        </EmptyState>
      ) : (
        <div className="wlist">
          {list.map((w) => (
            <article key={w.player.id} className="wrow lift">
              <Avatar p={w.player} />
              <div className="wid">
                <div className="pname">
                  <PlayerLink id={w.player.id} name={w.player.name} /> <InjuryTag p={w.player} />
                  {w.player.status === 'WAIVERS' && <span className="tag">On waivers</span>}
                </div>
                <div className="pmeta">
                  <span>{w.player.pos} #{w.posRank}</span><TeamLink abbr={w.player.nfl} /><span>{w.player.own}% rostered</span><RankDelta p={w.player} />
                </div>
                <p className="why">{w.why.length ? w.why.join('; ') : 'Depth with little upside right now'}</p>
              </div>
              <StatGroup
                className="wstats"
                label={`${w.player.name} waiver value`}
                items={[
                  {
                    key: 'gain',
                    label: w.leaves ? `vs ${shortName(w.leaves.name)}` : 'Lineup Δ',
                    value: signed(w.gain),
                    className: 'hero',
                    tone: w.gain > 0 ? 'up' : w.gain < 0 ? 'down' : 'neutral',
                    title: w.leaves
                      ? `${signed(w.gain)} weighted pts/week at ${w.slot} over ${w.leaves.name}. Playoff weeks count 1.5×.`
                      : 'Does not enter the best lineup.',
                  },
                  { key: 'ros', label: 'ROS/wk', value: fmt(w.value) },
                  {
                    key: 'bid',
                    label: w.drop ? `Drop ${shortName(w.drop.name)}` : 'Bid',
                    value: `$${w.bid}`,
                    tone: 'accent',
                    title: w.drop ? `Drop ${w.drop.name} to make the claim` : 'Suggested bid',
                  },
                ]}
              />
              <div className="wmeters">
                <Meter value={Math.min(1, Math.max(0, w.gain / 3))} label="Fit" />
                <Meter value={w.hype} label="Hype" />
                <Meter value={w.trend} label="Role" />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
