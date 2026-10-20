import { useEffect, useState } from 'react'
import type { Player } from '../types'
import { useEngineCtx } from '../dataContext'
import { useFocus, useNumbered } from '../focus'
import { RangeChart, weekRange } from '../components/RangeChart'
import { PlayerProfile } from '../components/PlayerProfile'
import { weekAdvice } from '../engine/advice'
import { breakingRosterNews } from '../espn/breaking'
import { fetchNewsBundle } from '../espn/load'
import { dedupeNews, linkNewsToPlayers, newsFromPlayers, type NewsItem } from '../espn/parse'
import { useDeskNews } from '../components/SubmitLink'
import { sourceLabel, submittedBreaking } from '../news/submit'
import { Avatar, InjuryTag, PlayChance, RankDelta, fmt, hot, signed } from '../components/bits'
import { GlassCard, NewsCard, PlayerCard, StatGroup, SuccessMark } from '../components/glass'
import { PlayerLink, TeamLink } from '../components/links'

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX']

function FloorSummary({ roster, week }: { roster: Player[]; week: number }) {
  const rows = roster
    .map((p) => ({ p, r: weekRange(p, week) }))
    .filter((x): x is { p: Player; r: { floor: number; exp: number; ceil: number } } => x.r != null)
  if (!rows.length) return <p className="muted small">No one on this roster is projected to play that week.</p>
  const ceil = rows.reduce((a, b) => (b.r.ceil > a.r.ceil ? b : a))
  const exp = rows.reduce((a, b) => (b.r.exp > a.r.exp ? b : a))
  const floor = rows.reduce((a, b) => (b.r.floor < a.r.floor ? b : a))
  const short = (name: string) => name.split(' ').slice(-1)[0] ?? name
  return (
    <StatGroup
      label="Week range"
      items={[
        { label: `Ceiling · ${short(ceil.p.name)}`, value: fmt(ceil.r.ceil), tone: 'up', className: 'hero', title: `${ceil.p.name}, 90th percentile week` },
        { label: `Expected · ${short(exp.p.name)}`, value: fmt(exp.r.exp), tone: 'accent', title: `${exp.p.name}, projected points` },
        { label: `Floor · ${short(floor.p.name)}`, value: fmt(floor.r.floor), title: `${floor.p.name}, 10th percentile week` },
      ]}
    />
  )
}

function PlayerRow({ p, slot }: { p: Player; slot: string }) {
  const { d, lab, tradeOf } = useEngineCtx()
  const tv = tradeOf(p)
  const wk = p.proj[String(d.meta.week)] ?? 0
  const onBye = p.bye === d.meta.week
  const out = !p.locked && wk === 0 && !!p.inj && p.inj !== 'ACTIVE'
  const heat = hot(p)
  return (
    <PlayerCard>
      <span className="slot">{slot}</span>
      <Avatar p={p} />
      <div className="prow-id">
        <div className="pname"><PlayerLink id={p.id} name={p.name} /></div>
        <div className="pmeta">
          <span>{p.pos}</span>
          <TeamLink abbr={p.nfl} />
          {p.bye && <span>Bye {p.bye}</span>}
          <InjuryTag p={p} />
          <PlayChance p={p} />
          <RankDelta p={p} />
        </div>
      </div>
      <StatGroup
        className="player-stats"
        items={[
          { key: 'wk', label: p.locked ? 'Final' : `Week ${d.meta.week}`, value: onBye ? 'Bye' : out ? 'Out' : fmt(wk), className: 'wk hero', title: p.locked ? 'Final for this week' : 'Projected this week' },
          { key: 'fppg', label: 'fPPG', value: p.gp ? fmt(p.ppg) : '–', className: 'fppg', title: 'Fantasy points per game this season (half PPR)' },
          { key: 'l3', label: 'Last 3', value: p.last3 != null ? fmt(p.last3) : '–', className: 'l3', tone: heat === 'up' ? 'up' : heat === 'down' ? 'down' : 'neutral', title: 'Average of his last 3 games: how hot or cold he is' },
          { key: 'ros', label: 'ROS/wk', value: fmt(lab.v(p)), className: 'ros', title: 'Weighted points per week from next week on. Playoff weeks count 1.5×.' },
          { key: 'trade', label: 'Trade', value: signed(tv.surplus), className: 'trade', tone: tv.surplus > 0 ? 'up' : tv.surplus < 0 ? 'down' : 'neutral', title: `Trade value: ${fmt(tv.production)} pts/wk minus the replacement ${p.pos} at ${fmt(tv.replacement)} (QB12, RB30, WR30, TE12). Playoff weeks count 1.5×. Bye and injury weeks are already in the projection.` },
        ]}
      />
    </PlayerCard>
  )
}

function BreakingStrip({ roster }: { roster: Player[] }) {
  const [feed, setFeed] = useState<NewsItem[] | null>(null)
  const desk = useDeskNews()
  const key = roster.map((p) => p.id).join(',')
  useEffect(() => {
    let stop = false
    fetchNewsBundle()
      .then((bundle) => {
        if (stop) return
        const jev = newsFromPlayers(roster)
        setFeed(dedupeNews(linkNewsToPlayers([...jev, ...bundle.espn, ...bundle.scoreboard], roster)))
      })
      .catch(() => { if (!stop) setFeed([]) })
    return () => { stop = true }
  }, [key, roster])
  const items = feed
    ? dedupeNews([
      ...breakingRosterNews(dedupeNews(linkNewsToPlayers([...feed, ...desk], roster)), roster, Date.now()),
      ...submittedBreaking(dedupeNews(linkNewsToPlayers([...feed, ...desk], roster)), roster, Date.now()),
    ])
    : submittedBreaking(desk, roster, Date.now())
  if (!items.length) return null
  return (
    <div className="breaking" aria-label="Breaking injury news">
      {items.slice(0, 3).map((item) => (
        <NewsCard
          key={item.id}
          featured
          kicker={`Breaking · ${sourceLabel(item.source)}`}
          title={item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.headline}</a> : item.headline}
          summary={item.summary}
        />
      ))}
    </div>
  )
}

export function Roster() {
  const { d, lab, ranks } = useEngineCtx()
  const me = d.meta.myTeamId
  const mine = lab.rosters.get(me)!
  const starters = mine.filter((p) => p.slot && SLOT_ORDER.includes(p.slot)).sort((a, b) => SLOT_ORDER.indexOf(a.slot!) - SLOT_ORDER.indexOf(b.slot!))
  const bench = mine.filter((p) => p.slot === 'BE').sort((a, b) => lab.v(b) - lab.v(a))
  const ir = mine.filter((p) => p.slot === 'IR')
  useNumbered([...starters, ...bench, ...ir])
  const wa = weekAdvice(mine, d.meta.week)
  const r = ranks[me]
  const { setPinned } = useFocus()
  const [rangeTeam, setRangeTeam] = useState(me)
  const [rangeWeek, setRangeWeek] = useState(d.meta.week)
  const [profile, setProfile] = useState<Player | null>(null)
  const pick = (pl: Player) => { setPinned(pl); setProfile(pl) }
  const weeks = Array.from({ length: d.meta.lastWeek - d.meta.week + 1 }, (_, i) => d.meta.week + i)
  return (
    <div className="screen">
      <BreakingStrip roster={mine} />
      <GlassCard featured lean as="section">
        <h2>Week {d.meta.week} lineup</h2>
        {wa.swaps.length ? (
          <>
            <p>
              This week projects <b>{fmt(wa.current)}</b>. {wa.swaps.length === 1 ? 'One change' : 'A few changes'} gets you to <b>{fmt(wa.best)}</b>.
            </p>
            <ul className="swaps">
              {wa.swaps.map((s) => (
                <li key={s.out.id}>
                  <span className="swap-in">Start <PlayerLink id={s.in.id} name={s.in.name} /></span>
                  <span className="muted">bench <PlayerLink id={s.out.id} name={s.out.name} /></span>
                  <span className="gain">{signed(s.gain)} pts</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <SuccessMark major label={`This lineup is the one to roll with: ${fmt(wa.best)} projected points.`} />
        )}
      </GlassCard>

      <GlassCard>
        <div className="panel-head">
          <h2>Floor, expected, ceiling</h2>
          <div className="range-pick">
            <label>Team{' '}
              <select value={rangeTeam} onChange={(e) => { setRangeTeam(Number(e.target.value)); setProfile(null) }} aria-label="Team">
                {[...d.teams].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name))).map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.wins}-{t.losses})</option>
                ))}
              </select>
            </label>
            <label>Week{' '}
              <select value={rangeWeek} onChange={(e) => setRangeWeek(Number(e.target.value))} aria-label="Week">
                {weeks.map((w) => <option key={w} value={w}>{w}{w > d.meta.regularWeeks ? ' (playoffs)' : ''}</option>)}
              </select>
            </label>
          </div>
        </div>
        {profile ? (
          <PlayerProfile p={profile} week={rangeWeek} onBack={() => setProfile(null)} />
        ) : (
          <>
            <p className="muted small">Each player's projected half-PPR points: the dot is the expected score, the bar runs from a bad week (10th percentile) to a big week (90th percentile). Click a player to open his profile.</p>
            <FloorSummary roster={lab.rosters.get(rangeTeam) ?? []} week={rangeWeek} />
            <RangeChart roster={lab.rosters.get(rangeTeam) ?? []} week={rangeWeek} onPick={pick} />
          </>
        )}
      </GlassCard>

      <GlassCard>
        <div className="panel-head">
          <h2>Starters</h2>
          <div className="pos-ranks" aria-label="Your league rank by position">
            {(['QB', 'RB', 'WR', 'TE', 'FLEX'] as const).map((k) => (
              <span key={k} className={r[k].rank <= 3 ? 'good' : r[k].rank >= 8 ? 'bad' : ''}>
                {k} <b>{r[k].rank}</b>
              </span>
            ))}
          </div>
        </div>
        {starters.map((p) => <PlayerRow key={p.id} p={p} slot={p.slot === 'FLEX' ? 'Flex' : p.slot!} />)}
      </GlassCard>

      <GlassCard>
        <h2>Bench</h2>
        {bench.length === 0 ? <p className="muted">The bench is clear this week. <a className="dest" href="#waivers">Check waivers</a>.</p> : bench.map((p) => <PlayerRow key={p.id} p={p} slot="Bn" />)}
      </GlassCard>

      {ir.length > 0 && (
        <GlassCard>
          <h2>Injured reserve</h2>
          {ir.map((p) => <PlayerRow key={p.id} p={p} slot="IR" />)}
        </GlassCard>
      )}
    </div>
  )
}
