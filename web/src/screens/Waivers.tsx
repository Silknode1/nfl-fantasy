import { useState } from 'react'
import type { Pos } from '../types'
import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import { Avatar, InjuryTag, Meter, RankDelta, fmt, signed } from '../components/bits'

export function Waivers() {
  const { d, waivers, ranks } = useEngineCtx()
  const [pos, setPos] = useState<Pos | 'ALL'>('ALL')
  const me = d.teams.find((t) => t.id === d.meta.myTeamId)!
  const list = waivers.filter((w) => pos === 'ALL' || w.player.pos === pos).slice(0, 15)
  useNumbered(list.map((w) => w.player))
  return (
    <div className="screen">
      <section className="panel">
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
        <p className="muted small">
          ${me.faabLeft} of ${d.meta.faabBudget} FAAB left, waiver priority {me.waiverRank}. Ranked for your roster: fit (40%), hype from Sleeper adds and ESPN rostered change (35%), rising role (15%), raw value (10%). Your weakest groups:{' '}
          {(['QB', 'RB', 'WR', 'TE'] as Pos[]).filter((k) => ranks[d.meta.myTeamId][k].rank >= 7).map((k) => `${k} (${ranks[d.meta.myTeamId][k].rank} of 12)`).join(', ') || 'none'}.
        </p>
        <div className="wlist">
          {list.map((w) => (
            <article key={w.player.id} className="wrow">
              <Avatar p={w.player} />
              <div className="wid">
                <div className="pname">
                  {w.player.name} <InjuryTag p={w.player} />
                  {w.player.status === 'WAIVERS' && <span className="tag">On waivers</span>}
                </div>
                <div className="pmeta">
                  <span>{w.player.pos}</span><span>{w.player.nfl}</span><span>{w.player.own}% rostered</span><RankDelta p={w.player} />
                </div>
                <p className="why">{w.why.length ? w.why.join('; ') : 'Depth with little upside right now'}</p>
              </div>
              <div className="wmeters">
                <Meter value={Math.min(1, Math.max(0, w.gain / 3))} label="Fit" />
                <Meter value={w.hype} label="Hype" />
                <Meter value={w.trend} label="Role" />
              </div>
              <div className="wnums">
                <div className="num"><b>{signed(w.gain)}</b><small>your pts/wk</small></div>
                <div className="num"><b>{fmt(w.value)}</b><small>ROS/wk</small></div>
                <div className="num bid"><b>${w.bid}</b><small>{w.drop ? `drop ${w.drop.name.split(' ').slice(-1)[0]}` : 'bid'}</small></div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
