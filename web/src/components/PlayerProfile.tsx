import type { Player, FantasyData, Pos } from '../types'
import { useEngineCtx } from '../dataContext'
import { playoffSos, sosLabel } from '../engine/advice'
import { Avatar, InjuryTag, RankDelta, fmt, pct } from './bits'
import { WeeklyChart } from './WeeklyChart'
import { weekRange } from './RangeChart'

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

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className={`ptile ${tone ?? ''}`}>
      <span className="ptile-l">{label}</span>
      <b>{value}</b>
      {sub && <span className="ptile-s">{sub}</span>}
    </div>
  )
}

/** Everything about one player on one page: scoring, this week's matchup, ownership, health and how the projection was built. */
export function PlayerProfile({ p, week, onBack }: { p: Player; week: number; onBack: () => void }) {
  const { d, lab } = useEngineCtx()
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

  return (
    <div className="profile">
      <header className="profile-head">
        <Avatar p={p} size={72} numbered={false} />
        <div className="profile-id">
          <h3>{p.name}</h3>
          <p className="pmeta">
            <span>{p.pos}</span><span>{p.nfl}</span><span>Bye {p.bye ?? '–'}</span><InjuryTag p={p} />
          </p>
          <RankDelta p={p} />
        </div>
        <button className="ghost" onClick={onBack}>Back to chart</button>
      </header>

      <div className="ptiles">
        <Tile label={`Week ${week} expected`} value={r ? fmt(r.exp) : p.bye === Number(wk) ? 'Bye' : 'Out'} sub={r ? `${fmt(r.floor)} to ${fmt(r.ceil)} range` : undefined} tone="amber" />
        <Tile label="Average (fPPG)" value={fmt(p.ppg)} sub={`${p.gp} games`} />
        <Tile label="Last 3 games" value={p.last3 != null ? fmt(p.last3) : '–'} sub={p.last3 != null && p.ppg ? `${p.last3 >= p.ppg ? '+' : ''}${fmt(p.last3 - p.ppg)} vs avg` : undefined} tone={p.last3 != null && p.last3 >= p.ppg * 1.15 ? 'up' : p.last3 != null && p.last3 <= p.ppg * 0.85 ? 'down' : ''} />
        <Tile label="Rest of season" value={fmt(lab.v(p))} sub="pts per week, byes and injuries counted" />
      </div>

      <WeeklyChart p={p} />

      <div className="pgrid">
        <section>
          <h4>This week's matchup</h4>
          {opp && dr ? (
            <dl className="facts wide">
              <dt>Opponent</dt><dd><b>{opp}</b>, {matchupWord(dr.factor)} defense against {p.pos}s</dd>
              <dt>Points allowed</dt><dd>{dr.factor >= 1 ? '+' : ''}{((dr.factor - 1) * 100).toFixed(0)}% vs league average, {dr.rank} of {dr.of} softest</dd>
              <dt>Playoff draw</dt><dd>{sosLabel(playoffSos(d, p))} vs average defense, Weeks {d.meta.regularWeeks + 1} to {d.meta.lastWeek}</dd>
            </dl>
          ) : (
            <p className="muted small">{p.bye === Number(wk) ? 'Bye week.' : 'No opponent data for this week.'}</p>
          )}
          <div className="sched" aria-label="Upcoming schedule">
            {upcoming.slice(0, 8).map((w) => {
              const o = d.nflOpp[p.nfl]?.[String(w)]
              const f = o ? d.defense[o]?.[p.pos] ?? 1 : null
              const cls = f === null ? '' : f >= 1.08 ? 'soft' : f <= 0.92 ? 'tough' : ''
              return (
                <div key={w} className={`sched-c ${cls} ${w === week ? 'now' : ''}`}>
                  <span>Wk {w}</span>
                  <b>{o ?? 'Bye'}</b>
                  <span>{fmt(p.proj[String(w)] ?? 0)}</span>
                </div>
              )
            })}
          </div>
          <p className="muted small">Green is a soft matchup, red a tough one. The number under each opponent is his expected points.</p>
        </section>

        <section>
          <h4>Owned and started</h4>
          <dl className="facts wide">
            <dt>ESPN rostered</dt><dd>{fmt(p.own, 0)}%{p.ownChg ? ` (${p.ownChg > 0 ? '+' : ''}${fmt(p.ownChg)} pts this week)` : ''}</dd>
            <dt>ESPN started</dt><dd>{fmt(p.started, 0)}% of leagues start him</dd>
            <dt>Sleeper</dt>
            <dd>
              {p.adds || p.drops ? `${p.adds.toLocaleString()} adds and ${p.drops.toLocaleString()} drops in 24h` : 'Not trending'}
              {sleeperRow ? `, #${sleeperRow.rank} most ${sleeperRow.kind === 'add' ? 'added' : 'dropped'}` : ''}
            </dd>
            <dt>Sleeper %</dt><dd className="muted">Sleeper does not publish percent owned or started in its public feed</dd>
          </dl>
          <h4>Health and news</h4>
          <dl className="facts wide">
            <dt>Status</dt><dd>{p.inj ? <>{p.inj}{playP ? `, about ${Math.round(playP * 100)}% to play` : ''}</> : 'Healthy, no report'}</dd>
            {p.injNote && (<><dt>Report</dt><dd>{p.injNote}</dd></>)}
            {p.jev?.headline && (
              <>
                <dt>News</dt>
                <dd>
                  {p.jev.url ? <a href={p.jev.url} target="_blank" rel="noreferrer">{p.jev.headline}</a> : p.jev.headline}
                  {p.jev.role !== 'none' && <> Role {p.jev.role}.</>}
                  {p.jev.timeline && p.jev.timeline !== 'not_stated' && <> Timeline: {p.jev.timeline.replaceAll('_', ' ')}.</>}
                </dd>
              </>
            )}
            {!p.inj && !p.injNote && !p.jev?.headline && (<><dt>News</dt><dd className="muted">Nothing flagged</dd></>)}
          </dl>
        </section>

        <section>
          <h4>How the projection is built</h4>
          <dl className="facts wide">
            <dt>Pace when active</dt><dd>{fmt(p.rate)} pts/g: blend of season {fmt(parts.season)} and ESPN's {fmt(parts.espn)}, trend x{parts.trend.toFixed(2)}{parts.jev !== 1 ? `, news x${parts.jev.toFixed(2)}` : ''}</dd>
            <dt>This week</dt><dd>{fmt(p.proj[wk] ?? 0)} expected{p.projIf && p.projIf[wk] !== p.proj[wk] ? `, ${fmt(p.projIf[wk] ?? 0)} if he plays` : ''}</dd>
            <dt>vs ESPN</dt><dd>{p.espnWeek !== null ? <>ESPN has {fmt(p.espnWeek)}{edge !== null ? `, we are ${edge >= 0 ? '+' : ''}${fmt(edge)}` : ''}</> : 'No ESPN weekly number'}</dd>
            <dt>Playoffs</dt><dd>{playoffPts > 0 ? `${fmt(playoffPts)} projected points across Weeks ${d.meta.regularWeeks + 1} to ${d.meta.lastWeek}` : 'No playoff weeks left to project'}</dd>
          </dl>
        </section>

        <section>
          <h4>Consistency and role</h4>
          <dl className="facts wide">
            <dt>Best / worst</dt><dd>{best && worst ? `${fmt(best.v)} (Wk ${best.w}) / ${fmt(worst.v)} (Wk ${worst.w})` : '–'}</dd>
            <dt>Week-to-week swing</dt><dd>{vals.length >= 2 ? `±${fmt(swing)} pts (${pct(p.ppg ? swing / p.ppg : 0)} of average)` : 'Needs two games'}</dd>
            <dt>Beat his average</dt><dd>{vals.length ? `${beat} of ${vals.length} games` : '–'}</dd>
            <dt>Usage</dt>
            <dd>
              {!u ? 'No snap or target data yet' : p.pos === 'QB'
                ? `${fmt(u.passYdsPg, 0)} pass yds/g, ${fmt(u.rushYdsPg, 0)} rush yds/g, ${u.tdTotal} TDs`
                : `${p.pos === 'RB' ? `${fmt(u.carPg)} carries, ` : ''}${fmt(u.tgtPg)} targets/g${u.tgtShare ? `, ${fmt(u.tgtShare * 100, 0)}% target share` : ''}${u.snapPct ? `, ${fmt(u.snapPct * 100, 0)}% snaps` : ''}, ${u.tdTotal} TDs`}
            </dd>
          </dl>
        </section>
      </div>
    </div>
  )
}
