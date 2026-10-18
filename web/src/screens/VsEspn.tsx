import { useState } from 'react'
import type { Player, Pos } from '../types'
import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import { Avatar, InjuryTag, fmt } from '../components/bits'
import { PlayerLink, TeamLink } from '../components/links'

function why(p: Player, higher: boolean): string {
  const bits: string[] = []
  const u = p.usage
  if (p.gp && p.espnSeason) {
    const espnPg = p.espnSeason / 17
    if (Math.abs(p.ppg - espnPg) > 2) bits.push(`scoring ${fmt(p.ppg)}/g vs ESPN's ${fmt(espnPg)}/g pace`)
  }
  if (u?.tgtShareTrend && Math.abs(u.tgtShareTrend) > 0.04) bits.push(`target share ${u.tgtShareTrend > 0 ? 'up' : 'down'} ${fmt(Math.abs(u.tgtShareTrend * 100), 0)} pts`)
  if (u?.snapTrend && Math.abs(u.snapTrend) > 0.08) bits.push(`snaps ${u.snapTrend > 0 ? 'up' : 'down'} ${fmt(Math.abs(u.snapTrend * 100), 0)} pts`)
  if (!higher && p.injNote) bits.push(p.injNote.toLowerCase())
  if (p.jev?.role === 'expands' && higher) bits.push('news says role is growing')
  return bits.join('; ') || (higher ? 'better schedule and recent form' : 'tougher schedule or slower start')
}

function Lane({ title, hint, items, higher }: { title: string; hint: string; items: Player[]; higher: boolean }) {
  const { d } = useEngineCtx()
  return (
    <section className="panel lane">
      <h2>{title}</h2>
      <p className="muted small">{hint}</p>
      {items.length === 0 && <p className="muted">No gaps of 4+ spots here.</p>}
      {items.map((p) => {
        const diff = (p.espnRank ?? 0) - p.ourRank
        const team = d.teams.find((t) => t.id === p.teamId)
        return (
          <div className="erow" key={p.id}>
            <Avatar p={p} size={48} />
            <div className="eid">
              <div className="pname"><PlayerLink id={p.id} name={p.name} /> <InjuryTag p={p} /></div>
              <div className="pmeta"><TeamLink abbr={p.nfl} /><span>{team ? (team.id === d.meta.myTeamId ? 'Your team' : team.name) : 'Free agent'}</span></div>
              <p className="why">{why(p, higher)}</p>
            </div>
            <div className="ebar" aria-label={`Ours ${p.pos}${p.ourRank}, ESPN ${p.pos}${p.espnRank}`}>
              <span className="ebar-nums"><b>{p.pos}{p.ourRank}</b> <span className="muted">ESPN {p.pos}{p.espnRank}</span></span>
              <span className="ebar-track"><span className={`ebar-fill ${higher ? 'up' : 'down'}`} style={{ width: `${Math.min(100, Math.abs(diff) * 3)}%` }} /></span>
            </div>
          </div>
        )
      })}
    </section>
  )
}

export function VsEspn() {
  const { d, lab } = useEngineCtx()
  const [pos, setPos] = useState<Pos>('WR')
  const [scope, setScope] = useState<'all' | 'mine' | 'fa'>('all')
  const pool = d.players.filter(
    (p) => p.pos === pos && p.espnRank && lab.v(p) > 3 && (scope === 'all' || (scope === 'mine' ? p.teamId === d.meta.myTeamId : !p.teamId)),
  )
  const depth = pos === 'QB' || pos === 'TE' ? 24 : 48
  const relevant = pool.filter((p) => p.ourRank <= depth || (p.espnRank ?? 99) <= depth)
  const higher = relevant.filter((p) => (p.espnRank ?? 0) - p.ourRank >= 4).sort((a, b) => (b.espnRank! - b.ourRank) - (a.espnRank! - a.ourRank)).slice(0, 8)
  const lower = relevant.filter((p) => p.ourRank - (p.espnRank ?? 0) >= 4).sort((a, b) => (b.ourRank - b.espnRank!) - (a.ourRank - a.espnRank!)).slice(0, 8)
  useNumbered([...higher, ...lower])
  return (
    <div className="screen">
      <section className="panel">
        <div className="panel-head">
          <h2>Where we disagree with ESPN</h2>
          <div className="seg" role="group" aria-label="Position">
            {(['QB', 'RB', 'WR', 'TE'] as Pos[]).map((k) => (
              <button key={k} className={pos === k ? 'on' : ''} aria-pressed={pos === k} onClick={() => setPos(k)}>{k}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Players">
            {([['all', 'Everyone'], ['mine', 'My team'], ['fa', 'Free agents']] as const).map(([k, l]) => (
              <button key={k} className={scope === k ? 'on' : ''} aria-pressed={scope === k} onClick={() => setScope(k)}>{l}</button>
            ))}
          </div>
        </div>
        <p className="muted small">
          Our rank uses rest-of-season projected points (playoff weeks 1.5×) from scoring so far, ESPN's projections, usage trends, schedule and injuries. ESPN's rank orders its season projection. Gaps of 4+ spots shown, top {depth} at the position.
        </p>
      </section>
      <div className="lanes">
        <Lane title="We rank higher than ESPN" hint="Buy targets: likely cheaper in trades than they should be." items={higher} higher />
        <Lane title="We rank lower than ESPN" hint="Sell candidates if you own them; managers still value them on ESPN's numbers." items={lower} higher={false} />
      </div>
    </div>
  )
}
