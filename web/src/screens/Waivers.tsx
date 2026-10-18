import { useState } from 'react'
import type { Pos } from '../types'
import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import { Avatar, InjuryTag, Meter, RankDelta, fmt, signed } from '../components/bits'
import { EmptyState, GlassCard, StatGroup } from '../components/glass'
import { PlayerLink, TeamLink } from '../components/links'

export function Waivers() {
  const { d, waivers, ranks } = useEngineCtx()
  const [pos, setPos] = useState<Pos | 'ALL'>('ALL')
  const me = d.teams.find((t) => t.id === d.meta.myTeamId)!
  const list = waivers.filter((w) => pos === 'ALL' || w.player.pos === pos).slice(0, 15)
  useNumbered(list.map((w) => w.player))
  const weak = (['QB', 'RB', 'WR', 'TE'] as Pos[]).filter((k) => ranks[d.meta.myTeamId][k].rank >= 7)
  return (
    <div className="screen">
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
        <StatGroup
          label="Your waiver budget"
          items={[
            { key: 'faab', label: 'FAAB left', value: `$${me.faabLeft}`, className: 'hero' },
            { key: 'budget', label: 'Budget', value: `$${d.meta.faabBudget}` },
            { key: 'prio', label: 'Priority', value: String(me.waiverRank) },
          ]}
        />
        <p className="muted small">
          Ranked for your roster: fit (40%), hype from Sleeper adds and ESPN rostered change (35%), rising role (15%), raw value (10%). Your weakest groups:{' '}
          {weak.map((k) => `${k} (${ranks[d.meta.myTeamId][k].rank} of 12)`).join(', ') || 'none'}.
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
                  <span>{w.player.pos}</span><TeamLink abbr={w.player.nfl} /><span>{w.player.own}% rostered</span><RankDelta p={w.player} />
                </div>
                <p className="why">{w.why.length ? w.why.join('; ') : 'Depth with little upside right now'}</p>
              </div>
              <StatGroup
                className="wstats"
                label={`${w.player.name} waiver value`}
                items={[
                  { key: 'gain', label: 'Your pts/wk', value: signed(w.gain), className: 'hero', tone: w.gain > 0 ? 'up' : w.gain < 0 ? 'down' : 'neutral' },
                  { key: 'ros', label: 'ROS/wk', value: fmt(w.value) },
                  { key: 'bid', label: 'Bid', value: `$${w.bid}`, tone: 'accent' },
                ]}
              />
              <div className="wmeters">
                <Meter value={Math.min(1, Math.max(0, w.gain / 3))} label="Fit" />
                <Meter value={w.hype} label="Hype" />
                <Meter value={w.trend} label="Role" />
              </div>
              {w.drop && (
                <p className="muted small drop-line">
                  Drop <PlayerLink id={w.drop.id} name={w.drop.name} /> to make the claim.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
