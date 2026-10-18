import type { Player } from '../types'
import { useFocus, type ShelfPin } from '../focus'
import { ShelfClip } from './ClipStack'
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

function PlayerPin({ p }: { p: Player }) {
  const { d, lab, tradeOf } = useEngineCtx()
  const { unpin } = useFocus()
  const week = d.meta.week
  return (
    <section className="pin">
      <header className="pin-head">
        <Avatar p={p} size={64} numbered={false} />
        <div>
          <h3><PlayerLink id={p.id} name={p.name} /></h3>
          <p className="pmeta">
            <span>{p.pos}</span><TeamLink abbr={p.nfl} /><span>Bye {p.bye ?? '–'}</span><InjuryTag p={p} />
          </p>
          <RankDelta p={p} />
        </div>
        <button className="ghost" onClick={() => unpin(p.id)} aria-label={`Unpin ${p.name}`}>Unpin</button>
      </header>
      <StatGroup
        label="Pinned snapshot"
        items={[
          { label: `Week ${week}`, value: fmt(p.proj[String(week)] ?? 0), className: 'hero' },
          { label: 'fPPG', value: fmt(p.ppg) },
          { label: 'Trade', value: signed(tradeOf(p).surplus), tone: tradeOf(p).surplus > 0 ? 'up' : tradeOf(p).surplus < 0 ? 'down' : 'neutral' },
        ]}
      />
      <WeeklyChart p={p} />
      <dl className="facts">
        <dt>Scored</dt><dd>{fmt(p.ppg)} pts/g over {p.gp} games (fPPG); last 3 games {p.last3 != null ? fmt(p.last3) : '–'}</dd>
        <dt>App projection</dt><dd>{fmt(p.proj[String(week)] ?? 0)} this week{p.playP != null && p.playP < 0.9 && p.playP > 0 ? ` (${Math.round(p.playP * 100)}% to play)` : ''}. {fmt(p.rate)} pts/g rest of season; {fmt(lab.v(p))} per week counting byes and injuries</dd>
        <dt>Trade value</dt><dd>{signed(tradeOf(p).surplus)} pts/wk above a replacement {p.pos} ({fmt(tradeOf(p).replacement)}). His own pace is {fmt(tradeOf(p).production)}.</dd>
        <dt>ESPN</dt><dd>{p.espnWeek !== null ? `${fmt(p.espnWeek)} this week, ` : ''}{fmt(p.espnSeason, 0)} season projection</dd>
        <dt>Usage</dt><dd>{usageLine(p)}</dd>
        <dt>Playoff draw</dt><dd>{sosLabel(playoffSos(d, p))} vs average defense, Weeks 15–17</dd>
        <dt>Interest</dt><dd>{p.own}% rostered on ESPN{p.adds ? `, ${p.adds.toLocaleString()} Sleeper adds in 24h` : ''}</dd>
        {p.injNote && (<><dt>Health</dt><dd>{p.injNote}</dd></>)}
      </dl>
      {p.jev?.headline && (
        <p className="jev">
          <span className="jev-mark" aria-hidden>▲</span> Jev read this news: “{p.jev.url ? <a href={p.jev.url} target="_blank" rel="noreferrer">{p.jev.headline}</a> : <a href="#news">{p.jev.headline}</a>}”
          {p.jev.role !== 'none' && <> Role {p.jev.role}.</>}
          {p.jev.timeline && p.jev.timeline !== 'not_stated' && <> Timeline: {p.jev.timeline.replaceAll('_', ' ')}.</>}
        </p>
      )}
    </section>
  )
}

function PinRow({ pin, open }: { pin: ShelfPin; open: boolean }) {
  const { unpin, openPlayer } = useFocus()
  if (pin.kind === 'player') {
    return open ? <PlayerPin p={pin.player} /> : (
      <button type="button" className="pin-row" onClick={() => openPlayer(pin.id)}>
        <b>{pin.player.name}</b>
        <span>{pin.player.pos} · {pin.player.nfl}</span>
      </button>
    )
  }
  return (
    <section className="pin pin-slim">
      {pin.kind === 'video' && <ShelfClip videoId={pin.videoId} title={pin.title} />}
      {pin.kind === 'news' && (
        <p>{pin.href ? <a href={pin.href} target="_blank" rel="noreferrer">{pin.headline}</a> : pin.headline}</p>
      )}
      {pin.kind === 'team' && <p><TeamLink abbr={pin.abbr}>{pin.name}</TeamLink></p>}
      {pin.kind === 'article' && (
        <div>
          <h3>{pin.title}</h3>
          {pin.paragraphs.map((line) => <p key={line}>{line}</p>)}
        </div>
      )}
      <button type="button" className="ghost" onClick={() => unpin(pin.id)}>Unpin</button>
    </section>
  )
}

export function StatRail() {
  const { list, hover, setHover, pinned, pins, setPinned } = useFocus()
  const { d, lab, tradeOf } = useEngineCtx()
  const week = d.meta.week
  return (
    <aside className="rail" aria-label="Pinned stack">
      {pins.length > 0 && (
        <ol className="pin-stack">
          {pins.map((pin) => (
            <li key={`${pin.kind}:${pin.id}`}>
              <PinRow pin={pin} open={pin.kind === 'player' && pinned?.id === pin.id} />
            </li>
          ))}
        </ol>
      )}
      {pins.length === 0 && list.length === 0 && (
        <EmptyState title="Nothing pinned yet" body="Pin a player, a clip, a headline, a team, or the game article. The newest pin stays on top. A player still opens his week, usage, and news.">
          <p className="news-next"><a className="dest" href="#team">My team</a><a className="dest" href="#games">Games</a></p>
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
