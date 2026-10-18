import { useEffect, useState } from 'react'
import { useOptionalEngine } from '../dataContext'
import { fetchClub, fetchClubStats, fetchLastGame, fetchRoster } from '../espn/load'
import { statLineEmpty, type ClubGame, type ClubProfile, type ClubStats, type RosterPlayer } from '../espn/parse'
import type { Player } from '../types'
import { InjuryTag, fmt, signed } from '../components/bits'
import { EmptyState, GlassCard, Skeleton } from '../components/glass'
import { BackButton, PlayerLink, TeamLink } from '../components/links'

function shown(n: number | null, digits = 1): string | null {
  if (n == null) return null
  return Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(digits)
}

function GameRow({ game, abbr, label }: { game: ClubGame; abbr: string; label: string }) {
  const home = game.homeAbbr === abbr
  const opp = home ? game.awayAbbr : game.homeAbbr
  const us = home ? game.homeScore : game.awayScore
  const them = home ? game.awayScore : game.homeScore
  const scored = us != null && them != null
  return (
    <article className="club-game lift">
      <p className="news-kicker">{label}{game.detail ? ` · ${game.detail}` : ''}</p>
      <h3>
        {home ? 'vs' : 'at'} <TeamLink abbr={opp} />
        {scored ? <span className="club-score"> {us}-{them}</span> : null}
      </h3>
      <p className="news-next">
        <a className="dest" href={`#game/${encodeURIComponent(game.id)}`}>Open game</a>
        <TeamLink abbr={opp}>Club page</TeamLink>
      </p>
    </article>
  )
}

function FantasySkill({ players }: { players: Player[] }) {
  const engine = useOptionalEngine()
  if (!engine) return null
  const week = String(engine.d.meta.week)
  return (
    <div className="skill-list">
      {players.map((p) => {
        const tv = engine.tradeOf(p)
        const opp = engine.d.nflOpp[p.nfl]?.[week]
        return (
          <article key={p.id} className="skill-row">
            <div>
              <PlayerLink id={p.id} name={p.name} />
              <p className="pmeta">
                <span>{p.pos}</span>
                <InjuryTag p={p} />
                <span>Week {engine.d.meta.week} {fmt(p.proj[week] ?? 0)}</span>
                <span>Trade {signed(tv.surplus)}</span>
                {opp && <TeamLink abbr={opp}>{`vs ${opp}`}</TeamLink>}
              </p>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function TeamPage({ abbr }: { abbr: string }) {
  const engine = useOptionalEngine()
  const [club, setClub] = useState<ClubProfile | null | 'missing'>(null)
  const [stats, setStats] = useState<ClubStats | null>(null)
  const [last, setLast] = useState<ClubGame | null>(null)
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [statsNote, setStatsNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stop = false
    setClub(null)
    setStats(null)
    setLast(null)
    setRoster([])
    setError(null)
    setStatsNote(null)
    fetchClub(abbr)
      .then(async (next) => {
        if (stop) return
        setClub(next)
        const [statBlock, lastGame, skill] = await Promise.all([
          fetchClubStats(next.id),
          fetchLastGame(next.id),
          fetchRoster(next.abbr),
        ])
        if (stop) return
        setStats(statBlock)
        setLast(lastGame)
        setRoster(skill)
        if (!statBlock || (statLineEmpty(statBlock.offense) && statLineEmpty(statBlock.defense))) {
          setStatsNote('Scoring and yards were not on this pull.')
        }
      })
      .catch((e: Error) => {
        if (stop) return
        if (e.message === '404') setClub('missing')
        else {
          setClub('missing')
          setError(e.message === 'ESPN club payload had no team' ? 'ESPN did not return this club.' : `ESPN did not answer (${e.message}).`)
        }
      })
    return () => { stop = true }
  }, [abbr])

  const fantasySkill = (engine?.d.players ?? [])
    .filter((p) => p.nfl.toUpperCase() === abbr)
    .sort((a, b) => b.ros - a.ros)
    .slice(0, 8)

  if (club === null) {
    return <section className="screen"><Skeleton variant="card" label={`Loading ${abbr}`} /></section>
  }
  if (club === 'missing') {
    return (
      <section className="screen">
        <EmptyState title={`No club named ${abbr}`} body={error ?? 'ESPN has no NFL team with that abbreviation.'}>
          <BackButton fallback="#games" />
          <p className="news-next"><a className="dest" href="#games">Open the week</a><a className="dest" href="#news">News</a></p>
        </EmptyState>
      </section>
    )
  }

  const offense = stats?.offense
  const defense = stats?.defense
  const tiles = [
    offense?.pointsPerGame != null ? { label: 'Points / game', value: shown(offense.pointsPerGame) } : null,
    offense?.yardsPerGame != null ? { label: 'Yards / game', value: shown(offense.yardsPerGame, 0) } : null,
    defense?.pointsPerGame != null ? { label: 'Points allowed', value: shown(defense.pointsPerGame) } : null,
    defense?.yardsPerGame != null ? { label: 'Yards allowed', value: shown(defense.yardsPerGame, 0) } : null,
  ].filter((t): t is { label: string; value: string } => t !== null && t.value !== null)

  return (
    <section className="screen">
      <GlassCard
        as="article"
        featured
        className="destination club-head"
        style={club.color ? { boxShadow: `inset 0 3px 0 ${club.color}, var(--shadow-card)` } : undefined}
      >
        <header className="profile-head">
          {club.logo && <img className="club-logo" src={club.logo} alt="" width={64} height={64} />}
          <div className="profile-id">
            <h2>{club.name}</h2>
            <p className="pmeta">
              <span>{club.abbr}</span>
              {club.record && <span>{club.record}</span>}
              {club.pointsFor != null && club.pointsAgainst != null && <span>{club.pointsFor} scored, {club.pointsAgainst} allowed</span>}
            </p>
          </div>
          <BackButton fallback="#games" />
        </header>
        {tiles.length > 0 ? (
          <div className="ptiles">
            {tiles.map((t) => (
              <div key={t.label} className="ptile">
                <span className="ptile-l">{t.label}</span>
                <b>{t.value}</b>
              </div>
            ))}
          </div>
        ) : (
          <p>{statsNote ?? 'Scoring and yards are still loading.'}</p>
        )}
        {statsNote && tiles.length > 0 && <p className="muted small">{statsNote}</p>}
        {offense?.passYardsPerGame != null && offense.rushYardsPerGame != null && (
          <p className="muted small">{shown(offense.passYardsPerGame, 0)} pass yards and {shown(offense.rushYardsPerGame, 0)} rush yards per game.</p>
        )}
      </GlassCard>

      <div className="club-games">
        {club.next ? <GameRow game={club.next} abbr={club.abbr} label="Next game" /> : <article className="club-game"><p>No next game on this pull.</p><p><a className="dest" href="#games">Open the week</a></p></article>}
        {last ? <GameRow game={last} abbr={club.abbr} label="Last game" /> : <article className="club-game"><p>No completed game on this schedule pull.</p></article>}
      </div>

      <GlassCard as="article">
        <h2>Skill players</h2>
        {fantasySkill.length > 0 ? (
          <>
            <p className="muted small">From the league file, ranked by rest-of-season points. The week number is this app's projection. Trade is points per week above a replacement at the position.</p>
            <FantasySkill players={fantasySkill} />
          </>
        ) : (
          <>
            <p className="muted small">The league file has no players on {club.abbr}. This list is the ESPN skill roster, in the order ESPN returns it, not a fantasy ranking.</p>
            {roster.length === 0 && <p>The roster did not load. <a className="dest" href="#news">Check the news</a>.</p>}
            <div className="skill-list">
              {roster.slice(0, 16).map((p) => (
                <article key={p.id} className="skill-row">
                  <div>
                    <PlayerLink id={p.id} name={p.name} />
                    <p className="pmeta">
                      <span>{p.pos}</span>
                      {p.injury ? <span className={`inj inj-${p.injury === 'Out' ? 'OUT' : p.injury === 'Doubtful' ? 'DOUBTFUL' : 'QUESTIONABLE'}`}>{p.injury}</span> : <span>No injury tag</span>}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
        <p className="news-next"><a className="dest" href="#news">News</a><a className="dest" href="#games">Games</a></p>
      </GlassCard>
    </section>
  )
}
