import type { Player, FantasyData, Pos } from '../types'
import { useEngineCtx } from '../dataContext'
import { playoffSos, sosLabel } from '../engine/advice'
import { Avatar, InjuryTag, RankDelta, fmt, pct, signed, weekStatItems } from './bits'
import { GlassCard, StatGroup } from './glass'
import { BackButton, TeamLink } from './links'
import { WeeklyChart } from './WeeklyChart'
import { weekRange } from './RangeChart'
import { finalScore, rosterChips } from '../engine/played'

/** How soft a defense is against a position, as a rank (1 = gives up the most points) among teams with data. */
function defenseRank(d: FantasyData, team: string, pos: Pos): { factor: number; rank: number; of: number } | null {
  const f = d.defense[team]?.[pos]
  if (f === undefined) return null
  const all = Object.values(d.defense).map((x) => x[pos]).filter((x): x is number => x !== undefined)
  return { factor: f, rank: all.filter((x) => x > f).length + 1, of: all.length }
}

const matchupWord = (f: number) => (f >= 1.08 ? 'soft' : f <= 0.92 ? 'tough' : 'average')

function stdev(xs: number[]) {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

/** Everything about one player on one page: scoring, this week's matchup, ownership, health and how the projection was built. */
export function PlayerProfile({ p, week, onBack, page = false }: { p: Player; week: number; onBack?: () => void; page?: boolean }) {
  const { d, lab, tradeOf } = useEngineCtx()
  const tv = tradeOf(p)
  const wk = String(week)
  const r = weekRange(p, week)
  const opp = d.nflOpp[p.nfl]?.[wk]
  const dr = opp ? defenseRank(d, opp, p.pos) : null
  const played = Object.entries(p.actual)
    .filter(([w]) => Number(w) < d.meta.week || p.locked)
    .map(([w, v]) => ({ w: Number(w), v }))
  const vals = played.map((x) => x.v)
  const best = played.length ? played.reduce((a, b) => (b.v > a.v ? b : a)) : null
  const worst = played.length ? played.reduce((a, b) => (b.v < a.v ? b : a)) : null
  const swing = stdev(vals)
  const beat = vals.filter((v) => v >= p.ppg).length
  const upcoming = Array.from({ length: d.meta.lastWeek - d.meta.week + 1 }, (_, i) => d.meta.week + i)
  const sleeperRow = (() => {
    const s = d.trends?.sleeper
    if (!s) return null
    for (const k of Object.keys(s)) {
      const hit = s[k].add.find((x) => x.id === p.id)
      if (hit) return { kind: 'add', rank: hit.rank, count: hit.count ?? 0, win: k }
      const drop = s[k].drop.find((x) => x.id === p.id)
      if (drop) return { kind: 'drop', rank: drop.rank, count: drop.count ?? 0, win: k }
    }
    return null
  })()
  const edge = p.espnWeek !== null && p.espnWeek > 0 ? (p.proj[wk] ?? 0) - p.espnWeek : null
  const parts = p.rateParts
  const playoffPts = upcoming.filter((w) => w > d.meta.regularWeeks).reduce((a, w) => a + (p.proj[String(w)] ?? 0), 0)
  const u = p.usage
  const playP = p.playP != null && p.playP < 0.9 && p.playP > 0 ? p.playP : null
  const scored = finalScore(p, Number(week))
  const chips = rosterChips(p, Number(week), d.meta.week)
  const chipLine = chips.map((chip) => ('value' in chip ? `${fmt(chip.value)} ${chip.label}` : chip.label)).join('. ')
  const appShown = chips.some((chip) => chip.label === 'Projected (this app)')

  return (
    <div className="profile">
      <header className="profile-head">
        <Avatar p={p} size={72} numbered={false} />
        <div className="profile-id">
          <h3>{p.name}</h3>
          <p className="pmeta">
            <span>{p.pos}</span><TeamLink abbr={p.nfl} /><span>Bye {p.bye ?? '–'}</span><InjuryTag p={p} />
          </p>
          <RankDelta p={p} />
          {!page && <a className="dest" href={`#player/${encodeURIComponent(p.id)}`}>Open page</a>}
        </div>
        {page ? <BackButton fallback="#team" /> : <button className="ghost" type="button" onClick={() => onBack?.()}>Back to chart</button>}
      </header>

      <StatGroup
        label="Season snapshot"
        items={[
          ...weekStatItems(chips),
          { label: 'fPPG', value: fmt(p.ppg), title: `${p.gp} games` },
          { label: 'Last 3', value: p.last3 != null ? fmt(p.last3) : '–', tone: p.last3 != null && p.last3 >= p.ppg * 1.15 ? 'up' : p.last3 != null && p.last3 <= p.ppg * 0.85 ? 'down' : 'neutral', title: p.last3 != null && p.ppg ? `${p.last3 >= p.ppg ? '+' : ''}${fmt(p.last3 - p.ppg)} vs average` : undefined },
          { label: 'ROS/wk', value: fmt(lab.v(p)), title: 'Points per week, byes and injuries counted' },
        ]}
      />
      {r && <p className="muted small">{scored != null ? `Pregame projection runs ${fmt(r.floor)} to ${fmt(r.ceil)}. He scored ${fmt(scored)}.` : `This week runs ${fmt(r.floor)} to ${fmt(r.ceil)}.`} Last 3 versus his average: {p.last3 != null && p.ppg ? `${p.last3 >= p.ppg ? '+' : ''}${fmt(p.last3 - p.ppg)}` : 'not enough games'}.</p>}

      <WeeklyChart p={p} />

      <div className="pgrid">
        <GlassCard lean as="article">
          <h3>This week's matchup</h3>
          {opp && dr ? (
            <>
              <StatGroup
                items={[
                  { label: `vs ${opp}`, value: matchupWord(dr.factor), className: 'hero', tone: dr.factor >= 1.08 ? 'up' : dr.factor <= 0.92 ? 'down' : 'neutral' },
                  { label: 'vs average', value: `${dr.factor >= 1 ? '+' : ''}${((dr.factor - 1) * 100).toFixed(0)}%` },
                  { label: 'Def rank', value: `${dr.rank}/${dr.of}`, title: '1 is the defense that gives up the most points to this position' },
                ]}
              />
              <p className="muted small"><TeamLink abbr={opp} /> is a {matchupWord(dr.factor)} defense against {p.pos}s. Playoff draw: {sosLabel(playoffSos(d, p))} vs average defense, Weeks {d.meta.regularWeeks + 1} to {d.meta.lastWeek}.</p>
            </>
          ) : (
            <p className="muted small">{p.bye === Number(wk) ? 'Bye week.' : 'No opponent data for this week.'}</p>
          )}
          <div className="sched" aria-label="Upcoming schedule">
            {upcoming.slice(0, 8).map((w) => {
              const o = d.nflOpp[p.nfl]?.[String(w)]
              const f = o ? d.defense[o]?.[p.pos] ?? 1 : null
              const cls = `sched-c ${f === null ? '' : f >= 1.08 ? 'soft' : f <= 0.92 ? 'tough' : ''} ${w === week ? 'now' : ''}`
              const body = (
                <>
                  <span>Wk {w}</span>
                  <b>{o ?? 'Bye'}</b>
                  <span>{fmt(p.proj[String(w)] ?? 0)}</span>
                </>
              )
              return o ? <a key={w} className={cls} href={`#team/${o}`}>{body}</a> : <div key={w} className={cls}>{body}</div>
            })}
          </div>
          <p className="muted small">A yellow edge is a soft matchup, a gray edge a tough one. The number under each opponent is his expected points.</p>
        </GlassCard>

        <GlassCard lean as="article">
          <h3>Owned and started</h3>
          <StatGroup
            items={[
              { label: 'Rostered', value: `${fmt(p.own, 0)}%`, className: 'hero', tone: (p.ownChg ?? 0) > 0 ? 'up' : 'neutral', title: p.ownChg ? `${p.ownChg > 0 ? '+' : ''}${fmt(p.ownChg)} pts this week` : 'ESPN percent rostered' },
              { label: 'Started', value: `${fmt(p.started, 0)}%` },
              { label: 'Adds 24h', value: (p.adds || p.drops) ? p.adds.toLocaleString() : '–' },
            ]}
          />
          <p className="muted small">
            {fmt(p.started, 0)}% of ESPN leagues start him.
            {p.ownChg ? ` Rostered moved ${p.ownChg > 0 ? '+' : ''}${fmt(p.ownChg)} points this week.` : ''}
            {' '}
            {p.adds || p.drops ? `${p.adds.toLocaleString()} adds and ${p.drops.toLocaleString()} drops in 24h` : 'Not trending on Sleeper'}
            {sleeperRow ? `, #${sleeperRow.rank} most ${sleeperRow.kind === 'add' ? 'added' : 'dropped'} in ${sleeperRow.win}` : ''}.
            Sleeper does not publish percent owned or started in its public feed.
          </p>
          <h3>Health and news</h3>
          <p>
            {p.inj ? <>{p.inj}{playP ? `, about ${Math.round(playP * 100)}% to play` : ''}</> : 'Healthy, no report'}
            {p.injNote ? `. ${p.injNote}` : ''}
          </p>
          {p.jev?.headline ? (
            <p>
              {p.jev.url
                ? <a href={p.jev.url} target="_blank" rel="noreferrer">{p.jev.headline}</a>
                : <a href="#news">{p.jev.headline}</a>}
              {p.jev.role !== 'none' && <> Role {p.jev.role}.</>}
              {p.jev.timeline && p.jev.timeline !== 'not_stated' && <> Timeline: {p.jev.timeline.replaceAll('_', ' ')}.</>}
              {' '}<a className="dest" href="#news">News desk</a>
            </p>
          ) : !p.inj && !p.injNote ? <p className="muted small">Nothing flagged.</p> : null}
        </GlassCard>

        <GlassCard lean as="article">
          <h3>How the projection is built</h3>
          <StatGroup
            items={[
              ...weekStatItems(chips),
              { label: 'Pace', value: fmt(p.rate) },
              { label: 'Trade', value: signed(tv.surplus), tone: tv.surplus > 0 ? 'up' : tv.surplus < 0 ? 'down' : 'neutral' },
              { label: 'Playoffs', value: playoffPts > 0 ? fmt(playoffPts) : '–' },
            ]}
          />
          <p className="muted small">
            {fmt(p.rate)} pts/g rest of season: {fmt(parts.season)} scored, blended with ESPN's {fmt(parts.espn)} per game{parts.k != null ? ` (${parts.k} games of ESPN prior for a ${p.pos})` : ''}, trend ×{parts.trend.toFixed(2)}{parts.jev !== 1 ? `, news ×${parts.jev.toFixed(2)}` : ''}. This week's matchup is not carried into later weeks.
          </p>
          <p className="muted small">
            {chipLine}. {appShown && p.projIf && p.projIf[wk] !== p.proj[wk] ? `${fmt(p.projIf[wk] ?? 0)} if he plays. ` : ''}{parts.week != null ? `The week prior inside the blend is ${fmt(parts.week)}. ` : ''}{p.espnWeek != null && p.espnWeek > 0.3 ? 'ESPN already priced the opponent, so the defense factor is applied once, on their number.' : ''}
          </p>
          <p className="muted small">
            Trade value {signed(tv.surplus)} pts/wk above a replacement {p.pos} ({fmt(tv.replacement)}). His own pace is {fmt(tv.production)}, from next week through week {d.meta.lastWeek}, playoff weeks ×1.5. {fmt(lab.v(p))} is that pace before subtracting replacement.
            {p.espnWeek !== null && Number(week) === d.meta.week ? <> ESPN projection {fmt(p.espnWeek)}{edge !== null ? `, this app is ${edge >= 0 ? '+' : ''}${fmt(edge)}` : ''}.</> : Number(week) === d.meta.week ? ' No ESPN weekly number.' : ''}
            {' '}
            {playoffPts > 0 ? `${fmt(playoffPts)} projected points across Weeks ${d.meta.regularWeeks + 1} to ${d.meta.lastWeek}.` : 'No playoff weeks left to project.'}
          </p>
        </GlassCard>

        <GlassCard lean as="article">
          <h3>Consistency and role</h3>
          <StatGroup
            items={[
              { label: 'Best week', value: best ? fmt(best.v) : '–', className: 'hero', title: best ? `Week ${best.w}` : undefined },
              { label: 'Worst', value: worst ? fmt(worst.v) : '–', title: worst ? `Week ${worst.w}` : undefined },
              { label: 'Swing', value: vals.length >= 2 ? `±${fmt(swing)}` : '–' },
              { label: 'Beat avg', value: vals.length ? `${beat}/${vals.length}` : '–' },
            ]}
          />
          <p className="muted small">
            {best && worst ? `Best ${fmt(best.v)} in Week ${best.w}, worst ${fmt(worst.v)} in Week ${worst.w}. ` : ''}
            {vals.length >= 2 ? `Week-to-week swing is ±${fmt(swing)} points (${pct(p.ppg ? swing / p.ppg : 0)} of average). ` : 'Needs two games to measure the swing. '}
            {vals.length ? `He beat his average in ${beat} of ${vals.length} games. ` : ''}
            {!u ? 'No snap or target data yet.' : p.pos === 'QB'
              ? `${fmt(u.passYdsPg, 0)} pass yards per game, ${fmt(u.rushYdsPg, 0)} rush yards per game, ${u.tdTotal} touchdowns.`
              : `${p.pos === 'RB' ? `${fmt(u.carPg)} carries, ` : ''}${fmt(u.tgtPg)} targets per game${u.tgtShare ? `, ${fmt(u.tgtShare * 100, 0)}% target share` : ''}${u.snapPct ? `, ${fmt(u.snapPct * 100, 0)}% snaps` : ''}, ${u.tdTotal} touchdowns.`}
          </p>
        </GlassCard>
      </div>
    </div>
  )
}
