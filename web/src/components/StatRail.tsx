import type { Player } from '../types'
import { useFocus } from '../focus'
import { useEngineCtx } from '../dataContext'
import { playoffSos, sosLabel } from '../engine/advice'
import { Avatar, InjuryTag, RankDelta, fmt, signed } from './bits'
import { EmptyState, StatGroup } from './glass'
import { PlayerLink, TeamLink } from './links'
import { WeeklyChart } from './WeeklyChart'

function usageLine(p: Player): string {
  const u = p.usage
  if (!u) return 'No snap or target data yet'
  if (p.pos === 'QB') return `${fmt(u.passYdsPg, 0)} pass yds/g, ${fmt(u.rushYdsPg, 0)} rush yds/g`
  if (p.pos === 'RB') return `${fmt(u.carPg)} carries, ${fmt(u.tgtPg)} targets/g${u.snapPct ? `, ${fmt(u.snapPct * 100, 0)}% snaps` : ''}`
  return `${u.tgtShare ? fmt(u.tgtShare * 100, 0) : '–'}% target share, ${fmt(u.tgtPg)} tgt/g${u.snapPct ? `, ${fmt(u.snapPct * 100, 0)}% snaps` : ''}`
}

function trendWord(p: Player): { text: string; cls: string } | null {
  const u = p.usage
  if (!u) return null
  const t = p.pos === 'RB' ? (u.oppTrend ?? 0) / Math.max(u.oppPg ?? 1, 4) : (u.tgtShareTrend ?? 0) * 4
  if (t > 0.12) return { text: 'Role rising', cls: 'up' }
  if (t < -0.12) return { text: 'Role shrinking', cls: 'down' }
  return null
}

export function StatRail() {
  const { list, hover, setHover, pinned, setPinned } = useFocus()
  const { d, lab, tradeOf } = useEngineCtx()
  const week = d.meta.week
  return (
    <aside className="rail" aria-label="Player stats">
      {pinned && (
        <section className="pin">
          <header className="pin-head">
            <Avatar p={pinned} size={64} numbered={false} />
            <div>
              <h3><PlayerLink id={pinned.id} name={pinned.name} /></h3>
              <p className="pmeta">
                <span>{pinned.pos}</span><TeamLink abbr={pinned.nfl} /><span>Bye {pinned.bye ?? '–'}</span><InjuryTag p={pinned} />
              </p>
              <RankDelta p={pinned} />
            </div>
            <button className="ghost" onClick={() => setPinned(null)} aria-label="Close details">Close</button>
          </header>
          <StatGroup
            label="Pinned snapshot"
            items={[
              { label: `Week ${week}`, value: fmt(pinned.proj[String(week)] ?? 0), className: 'hero' },
              { label: 'fPPG', value: fmt(pinned.ppg) },
              { label: 'Trade', value: signed(tradeOf(pinned).surplus), tone: tradeOf(pinned).surplus > 0 ? 'up' : tradeOf(pinned).surplus < 0 ? 'down' : 'neutral' },
            ]}
          />
          <WeeklyChart p={pinned} />
          <dl className="facts">
            <dt>Scored</dt><dd>{fmt(pinned.ppg)} pts/g over {pinned.gp} games (fPPG); last 3 games {pinned.last3 != null ? fmt(pinned.last3) : '–'}</dd>
            <dt>App projection</dt><dd>{fmt(pinned.proj[String(week)] ?? 0)} this week{pinned.playP != null && pinned.playP < 0.9 && pinned.playP > 0 ? ` (${Math.round(pinned.playP * 100)}% to play)` : ''}. {fmt(pinned.rate)} pts/g rest of season; {fmt(lab.v(pinned))} per week counting byes and injuries</dd>
            <dt>Trade value</dt><dd>{signed(tradeOf(pinned).surplus)} pts/wk above a replacement {pinned.pos} ({fmt(tradeOf(pinned).replacement)}). His own pace is {fmt(tradeOf(pinned).production)}.</dd>
            <dt>ESPN</dt><dd>{pinned.espnWeek !== null ? `${fmt(pinned.espnWeek)} this week, ` : ''}{fmt(pinned.espnSeason, 0)} season projection</dd>
            <dt>Usage</dt><dd>{usageLine(pinned)}</dd>
            <dt>Playoff draw</dt><dd>{sosLabel(playoffSos(d, pinned))} vs average defense, Weeks 15–17</dd>
            <dt>Interest</dt><dd>{pinned.own}% rostered on ESPN{pinned.adds ? `, ${pinned.adds.toLocaleString()} Sleeper adds in 24h` : ''}</dd>
            {pinned.injNote && (<><dt>Health</dt><dd>{pinned.injNote}</dd></>)}
          </dl>
          {pinned.jev?.headline && (
            <p className="jev">
              <span className="jev-mark" aria-hidden>▲</span> Jev read this news: “{pinned.jev.url ? <a href={pinned.jev.url} target="_blank" rel="noreferrer">{pinned.jev.headline}</a> : <a href="#news">{pinned.jev.headline}</a>}”
              {pinned.jev.role !== 'none' && <> Role {pinned.jev.role}.</>}
              {pinned.jev.timeline && pinned.jev.timeline !== 'not_stated' && <> Timeline: {pinned.jev.timeline.replaceAll('_', ' ')}.</>}
            </p>
          )}
        </section>
      )}
      {!pinned && list.length === 0 && (
        <EmptyState title="No one pinned yet" body="Open a player from the desk, or tap a numbered row once a screen lists one. His week, usage, and news land here.">
          <p className="news-next"><a className="dest" href="#team">My team</a><a className="dest" href="#waivers">Waivers</a></p>
        </EmptyState>
      )}
      <ol className="rail-list">
        {list.map((p, i) => {
          const tw = trendWord(p)
          const wk = p.proj[String(week)] ?? 0
          return (
            <li
              key={p.id}
              className={hover === p.id ? 'lit' : ''}
              tabIndex={0}
              onMouseEnter={() => setHover(p.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setPinned(p)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setPinned(p)
                }
              }}
            >
              <span className="badge static">{i + 1}</span>
              <div className="rail-body">
                <div className="rail-name">
                  <PlayerLink id={p.id} name={p.name} /> <InjuryTag p={p} />
                </div>
                <div className="rail-nums">
                  <span><b>{fmt(p.ppg)}</b> pts/g</span>
                  <span><b>{fmt(lab.v(p))}</b> ROS/wk</span>
                  <span><b>{signed(tradeOf(p).surplus)}</b> trade</span>
                  <span><b>{fmt(wk)}</b> wk {week}{p.locked ? ' final' : ''}</span>
                </div>
                <div className="rail-sub">
                  {usageLine(p)}
                  {tw && <span className={`trend ${tw.cls}`}>. {tw.text}</span>}
                  {p.jev?.headline && <span className="jev-mark" title={p.jev.headline}> ▲ news</span>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
