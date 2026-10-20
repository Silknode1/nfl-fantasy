import { useState } from 'react'
import {
  articleFacts,
  boxScorePoints,
  drivesFrom,
  gameArticle,
  headlinesForRecent,
  headlinesFromSummary,
  marginSentence,
  moneylineText,
  playersInGame,
  possessionAbbr,
  standoutsFrom,
  summarySituation,
  watchTarget,
  type DeskPlayer,
} from '../board/desk'
import { gameClipQuery } from '../board/clips'
import {
  formatAmerican,
  movementSentences,
  priceSentence,
  scriptNote,
  type Board,
  type BoardGame,
  type GameContext,
  type RecentGame,
  type TeamContext,
} from '../board/normalize'
import { scoringTrips } from '../board/scoring'
import { searchView } from '../board/search'
import { spreadSlot } from '../board/ticker'
import { winGraph } from '../board/wingraph'
import { useOptionalEngine } from '../dataContext'
import { ShortcutChip } from './glass'
import { ClipStack } from './ClipStack'
import { FieldDiagram } from './FieldDiagram'
import { GameShelf, type ShelfPlayer } from './GameShelf'
import { GameTicker } from './GameTicker'
import { TeamLink } from './links'
import { PlayerLink } from './links'
import { WinGraphFigure } from './WinGraphFigure'

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso || 'time not listed'
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function KnownName({ name }: { name: string }) {
  const players = useOptionalEngine()?.d.players ?? []
  const hit = players.find((p) => p.name.toLowerCase() === name.toLowerCase())
  if (!hit) return <b>{name}</b>
  return <PlayerLink id={hit.id} name={hit.name} />
}

function MarketBlock({ game }: { game: BoardGame }) {
  const quote = game.quote
  const lines = moneylineText(game)
  if (!quote) return null
  const spread = spreadSlot(game)
  return (
    <div className="market-block">
      <h3>Market</h3>
      <div className="detail-grid">
        <div className="mcol">
          <small>{quote.book} spread</small>
          {spread ? <b>{spread}</b> : null}
          <span>{quote.home.price != null ? `${formatAmerican(quote.home.price)} · ${priceSentence(quote.home.price)}` : ''}</span>
        </div>
        <div className="mcol">
          <small>Total</small>
          {quote.total != null ? <b>{quote.total}</b> : null}
          <span>{[quote.overPrice != null ? `Over ${formatAmerican(quote.overPrice)}` : null, quote.underPrice != null ? `Under ${formatAmerican(quote.underPrice)}` : null].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="mcol">
          <small>Moneyline</small>
          <b>{game.away.abbr} {lines.away ?? ''}</b>
          <span>{game.home.abbr} {lines.home ?? ''}</span>
        </div>
      </div>
      {movementSentences(game).map((sentence) => <p key={sentence}>{sentence}</p>)}
      {scriptNote(game) && <p>{scriptNote(game)}</p>}
      <p className="muted">The price next to a line is what that side costs. It is not a side to take.</p>
      {marginSentence(game) && <p>{marginSentence(game)}. That is the score minus the spread, not a forecast.</p>}
    </div>
  )
}

function InjuryList({ teams }: { teams: TeamContext[] }) {
  const rows = teams.flatMap((team) => team.injuries.map((inj) => ({ ...inj, team: team.name })))
  if (!rows.length) return <p className="muted">No out, doubtful, or questionable players on this pull.</p>
  return (
    <ul className="inj-list">
      {rows.map((inj) => (
        <li key={`${inj.team}-${inj.name}-${inj.status}`}>
          <span className={`inj inj-${inj.status === 'Out' ? 'OUT' : inj.status === 'Doubtful' ? 'DOUBTFUL' : 'QUESTIONABLE'}`}>{inj.status}</span>
          <KnownName name={inj.name} />
          <small>{inj.team}{inj.pos ? ` · ${inj.pos}` : ''}{inj.detail ? ` · ${inj.detail}` : ''}</small>
        </li>
      ))}
    </ul>
  )
}

function RecentStrip({ label, games, onOpen }: { label: string; games: RecentGame[]; onOpen: (game: RecentGame) => void }) {
  if (!games.length) return null
  return (
    <div className="recent-strip">
      <h3>{label}</h3>
      <ol>
        {games.map((game, i) => (
          <li key={`${game.id ?? game.week}-${i}`}>
            <button type="button" onClick={() => onOpen(game)}>
              <b className={game.result === 'W' ? 'up' : game.result === 'L' ? 'down' : undefined}>{game.result || '—'}</b>
              <span>Wk {game.week ?? '—'}</span>
              <small>{game.atVs} {game.opponent} {game.pointsFor ?? '—'}–{game.pointsAgainst ?? '—'}</small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function DeskFrame({
  board,
  source,
  lineError,
  selected,
  missingId,
  detail,
  detailError,
  query,
  onQuery,
  onCommit,
  onSelect,
}: {
  board: Board
  source: 'live' | 'snapshot'
  lineError: string | null
  selected: BoardGame | null
  missingId: string | null
  detail: { context: GameContext | null; raw: unknown } | null
  detailError: boolean
  query: string
  onQuery: (value: string) => void
  onCommit: () => void
  onSelect: (id: string) => void
}) {
  const engine = useOptionalEngine()
  const [recent, setRecent] = useState<RecentGame | null>(null)
  const myId = engine?.d.meta.myTeamId ?? -1
  const week = engine ? String(engine.d.meta.week) : ''
  const roster: DeskPlayer[] = engine
    ? engine.d.players
      .filter((p) => p.teamId === myId && p.status === 'ONTEAM')
      .map((p) => ({ id: p.id, name: p.name, nfl: p.nfl, teamId: p.teamId, proj: p.proj[week] ?? null }))
    : []
  const view = searchView(board.games, query, selected?.id ?? null)
  const yours = (game: BoardGame) => playersInGame(game, roster, myId).length > 0

  return (
    <div className="desk-copy">
      <header className="board-head">
        <div>
          <h2>Week {board.week || '—'}{board.season ? ` · ${board.season}` : ''}</h2>
          <p className="muted">
            {source === 'live' ? 'Live scoreboard' : 'Saved scoreboard, ESPN did not answer'} · {when(board.fetchedAt)}
            {board.byes.length > 0 ? <span className="bye-line"> · Bye: {board.byes.map((b, i) => <span key={b.abbr}>{i ? ', ' : ''}<TeamLink abbr={b.abbr}>{b.abbr}</TeamLink></span>)}</span> : null}
          </p>
        </div>
        <label className="findbox desk-find">
          <span className="sr">Find a team</span>
          <ShortcutChip keys="/" />
          <input
            id="board-find"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommit()
              if (e.key === 'Escape') onQuery('')
            }}
            placeholder="Find a team"
            aria-label="Find a team. Enter opens the first match. Clearing the box keeps every game."
          />
        </label>
      </header>
      <GameTicker
        games={view.games}
        selectedId={view.selectedId}
        matches={view.matches}
        query={query}
        yours={yours}
        onSelect={onSelect}
      />
      <div className="game-stage">
        <div className="game-sheet glass featured">
          {lineError && <p className="block-fail">Line: {lineError}</p>}
          {missingId && !selected && (
            <p>That game is not on this week's board. The ticker is still every game we have.</p>
          )}
          {selected && (
            <Selected
              game={selected}
              week={board.week}
              kickoffs={board.games.map((row) => row.kickoff)}
              detail={detail}
              detailError={detailError}
              onRecent={setRecent}
            />
          )}
        </div>
        <GameShelf
          game={selected}
          games={board.games}
          players={selected ? shelfPlayers(selected, roster, myId, detail?.raw ?? null) : []}
          gameState={selected?.state ?? null}
          onSelect={onSelect}
        />
      </div>
      {recent && (
        <div className="week-pop" role="dialog" aria-label={`Week ${recent.week ?? ''}`}>
          <p><b>{recent.result || '—'}</b> {recent.pointsFor ?? '—'}–{recent.pointsAgainst ?? '—'} {recent.atVs} {recent.opponent}{recent.week ? ` · Week ${recent.week}` : ''}</p>
          {headlinesForRecent(recent, []).length === 0 ? <p>No headline stored for this game.</p> : (
            <ul>{headlinesForRecent(recent, []).map((title) => <li key={title}>{title}</li>)}</ul>
          )}
          <button type="button" className="ghost" onClick={() => setRecent(null)}>Close</button>
        </div>
      )}
    </div>
  )
}

function shelfPlayers(game: BoardGame, roster: DeskPlayer[], myId: number, raw: unknown): ShelfPlayer[] {
  const box = raw ? boxScorePoints(raw) : []
  return playersInGame(game, roster, myId).map((player) => ({
    id: player.id,
    name: player.name,
    proj: player.proj,
    scored: game.state === 'pre' ? null : box.find((row) => row.id === player.id)?.points ?? box.find((row) => row.name.toLowerCase() === player.name.toLowerCase())?.points ?? null,
  }))
}

function Selected({
  game,
  week,
  kickoffs,
  detail,
  detailError,
  onRecent,
}: {
  game: BoardGame
  week: number
  kickoffs: string[]
  detail: { context: GameContext | null; raw: unknown } | null
  detailError: boolean
  onRecent: (game: RecentGame) => void
}) {
  const raw = detail?.raw ?? null
  const ctx = detail?.context ?? null
  const situation = (raw && summarySituation(raw)) || game.situation
  const shown: BoardGame = situation && situation !== game.situation ? { ...game, situation } : game
  const watch = watchTarget(game.broadcast)
  const graph = raw ? winGraph(raw, game.home.abbr, game.away.abbr) : null
  const trips = raw ? scoringTrips(raw, { homeId: game.home.id, homeAbbr: game.home.abbr, awayId: game.away.id, awayAbbr: game.away.abbr }) : []
  const drives = raw ? drivesFrom(raw) : []
  const standouts = raw ? standoutsFrom(raw) : []
  const headlines = raw ? headlinesFromSummary(raw, game.id, { names: [game.away.name, game.home.name], abbrs: [game.away.abbr, game.home.abbr] }) : []
  const facts = articleFacts({ game, injuries: [], yours: [], headlines: [], scoringPlays: [] })
  const paragraphs = gameArticle(facts)
  const ball = possessionAbbr(shown)
  const where = [game.venue, game.city, game.indoor === true ? 'Indoor' : game.indoor === false ? 'Outdoor' : null].filter(Boolean).join(' · ')
  const spread = spreadSlot(game)
  const ready = detail != null
  const headline = headlines[0]

  return (
    <article>
      <header className="center-top">
        <div>
          <h2 className="desk-team">
            <TeamLink abbr={game.away.abbr}>{game.away.name}</TeamLink>
            {' at '}
            <TeamLink abbr={game.home.abbr}>{game.home.name}</TeamLink>
          </h2>
          <p className="desk-where">{where || 'Site not on this pull'}</p>
        </div>
        {watch ? (
          <a className="watch-btn" href={watch.href} target="_blank" rel="noreferrer">Watch on {watch.label}</a>
        ) : (
          <button type="button" className="watch-btn" disabled>{game.broadcast || 'No broadcast listed'}</button>
        )}
      </header>
      {game.state === 'pre' ? (
        <p className="live-meta">{when(game.kickoff)}. {game.detail}.{game.broadcast ? ` Watch: ${game.broadcast}.` : ''}</p>
      ) : (
        <>
          <p className="score-line">
            <span className="desk-score">{game.away.abbr} {game.away.score ?? '–'}</span>
            <span className="desk-score">{game.home.abbr} {game.home.score ?? '–'}</span>
          </p>
          <p className="live-meta">
            {game.detail}
            {shown.situation?.clock ? ` · ${shown.situation.clock}` : ''}
            {ball ? ` · ${ball} has the ball` : ''}
            {shown.situation?.redZone ? ' · Red zone' : ''}
          </p>
        </>
      )}
      {detailError && <p className="block-fail">Detail: injuries, drives, and the win-probability series did not load.</p>}
      <div className="game-cols">
        <div className="game-main">
          <section className="desk-section" aria-label="Win probability">
            <h3>Win probability</h3>
            {!ready && !detailError && <p>The summary has not arrived.</p>}
            {graph ? <WinGraphFigure graph={graph} /> : (ready || detailError) && <p>The play-by-play line has not arrived.</p>}
            {!graph && ctx?.predictor && (
              <p>ESPN's matchup predictor has {game.home.abbr} at {ctx.predictor.home}% and {game.away.abbr} at {ctx.predictor.away}%. One figure, not a history.</p>
            )}
          </section>
          <section className="desk-section" aria-label="Headline">
            <h3>Headline</h3>
            {!ready && !detailError && <p className="muted">The summary has not arrived.</p>}
            {(ready || detailError) && !headline && <p>No headline stored for this game.</p>}
            {headline && (headline.href ? <p><a href={headline.href} target="_blank" rel="noreferrer">{headline.title}</a></p> : <p>{headline.title}</p>)}
            {headlines.slice(1).map((item) => (
              <p key={item.id}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</p>
            ))}
          </section>
          <section className="desk-section" aria-label="Standouts">
            <h3>Standouts</h3>
            {!ready && !detailError && <p className="muted">The summary has not arrived.</p>}
            {(ready || detailError) && standouts.length === 0 && <p className="muted">No passing, rushing, or receiving line on this pull.</p>}
            {standouts.length > 0 && (
              <ul className="inj-list">
                {standouts.map((row) => (
                  <li key={row.label}><b>{row.label}</b> <KnownName name={row.name} /> <span>{row.stat}</span></li>
                ))}
              </ul>
            )}
          </section>
          <section className="desk-section" aria-label="Scoring plays">
            <h3>Scoring plays</h3>
            {!ready && !detailError && <p className="muted">Scoring plays have not arrived.</p>}
            {(ready || detailError) && trips.length === 0 && <p className="muted">No scoring plays on this pull.</p>}
            {trips.length > 0 && (
              <ol className="play-list">
                {trips.map((play) => (
                  <li key={play.id || play.text}>
                    {play.field ? <FieldDiagram field={play.field} /> : null}
                    <p>{play.text}</p>
                    <small>{play.kind}{play.quarter ? ` · Q${play.quarter}` : ''}{play.clock ? ` ${play.clock}` : ''}{play.awayScore != null && play.homeScore != null ? ` · ${play.awayScore}–${play.homeScore}` : ''}</small>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="desk-section" aria-label="Rest of the summary">
            <h3>Rest of the summary</h3>
            <div className="article">
              {paragraphs.map((line) => <p key={line}>{line}</p>)}
            </div>
            <h3>Play-by-play</h3>
            {!ready && !detailError && <p className="muted">Drives have not arrived.</p>}
            {(ready || detailError) && drives.length === 0 && <p className="muted">No drives on this pull.</p>}
            {drives.length > 0 && (
              <div className="pbp">
                {drives.map((drive) => (
                  <section key={drive.id}>
                    <h4>{drive.team} · {drive.result}</h4>
                    <ol>
                      {drive.plays.map((play) => (
                        <li key={play.id}>{play.clock} {play.down} {play.text}</li>
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            )}
          </section>
          <ClipStack
            contextId={game.id}
            query={week ? gameClipQuery(game.home.name, game.away.name, week) : null}
            kickoffs={kickoffs}
          />
        </div>
        <div className="game-side">
          <section className="desk-section spread-section" aria-label="Spread">
            <h3>Spread</h3>
            {spread ? <p className="spread-figure">{spread}</p> : null}
          </section>
          {game.quote ? <section className="desk-section"><MarketBlock game={game} /></section> : null}
          <section className="desk-section" aria-label="Situation">
            <h3>Situation</h3>
            <p>
              {game.state === 'pre' ? when(game.kickoff) : game.detail}
              {shown.situation?.clock ? ` · ${shown.situation.clock}` : ''}
              {ball ? ` · ${ball} has the ball` : ''}
              {shown.situation?.redZone ? ' · Red zone' : ''}
            </p>
            {game.broadcast && <p>{game.broadcast}</p>}
          </section>
          <section className="desk-section" aria-label="Injuries">
            <h3>Injuries</h3>
            {ctx ? <InjuryList teams={[ctx.away, ctx.home]} /> : <p className="muted">Injury report has not arrived.</p>}
          </section>
          {ctx && (
            <section className="desk-section" aria-label="Recent results">
              <RecentStrip label={ctx.away.abbr} games={ctx.away.recent} onOpen={onRecent} />
              <RecentStrip label={ctx.home.abbr} games={ctx.home.recent} onOpen={onRecent} />
            </section>
          )}
        </div>
      </div>
    </article>
  )
}
