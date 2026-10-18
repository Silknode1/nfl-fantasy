import { useEffect, useMemo, useState } from 'react'
import type { FantasyData } from './types'
import { loadData } from './data'
import { useEngine } from './useEngine'
import { DataProvider } from './dataContext'
import { FocusProvider } from './focus'
import { StatRail } from './components/StatRail'
import { Roster } from './screens/Roster'
import { Trades } from './screens/Trades'
import { Waivers } from './screens/Waivers'
import { League } from './screens/League'
import { VsEspn } from './screens/VsEspn'
import { Plan } from './screens/Plan'
import { Pulse } from './screens/Pulse'
import { Board } from './screens/Board'
import { NewsPage } from './screens/NewsPage'
import { PlayerPage } from './screens/PlayerPage'
import { TeamPage } from './screens/TeamPage'
import { GamePage } from './screens/GamePage'
import { pct } from './components/bits'
import { noteHash } from './deskHistory'
import { navCurrent, parseRoute, type Route, type ScreenId } from './route'

const NAV: { id: ScreenId; label: string }[] = [
  { id: 'team', label: 'My team' },
  { id: 'trades', label: 'Trades' },
  { id: 'waivers', label: 'Waivers' },
  { id: 'pulse', label: 'Waiver pulse' },
  { id: 'league', label: 'League' },
  { id: 'espn', label: 'Vs ESPN' },
  { id: 'plan', label: 'Season plan' },
  { id: 'news', label: 'News' },
  { id: 'games', label: 'Games' },
]

const LEAGUE_SCREENS: Partial<Record<ScreenId, JSX.Element>> = {
  team: <Roster />,
  trades: <Trades />,
  waivers: <Waivers />,
  pulse: <Pulse />,
  league: <League />,
  espn: <VsEspn />,
  plan: <Plan />,
}

type ProjMode = 'expected' | 'plays'

function readMode(): ProjMode {
  try {
    return localStorage.getItem('projMode') === 'plays' ? 'plays' : 'expected'
  } catch {
    return 'expected'
  }
}

/** 'If he plays' view: swap each player's expected points for his points-if-he-plays. */
function withMode(d: FantasyData | null, mode: ProjMode): FantasyData | null {
  if (!d || mode === 'expected') return d
  const reg = d.meta.regularWeeks
  const cur = d.meta.week
  return {
    ...d,
    players: d.players.map((p) => {
      if (!p.projIf) return p
      let ros = 0
      let playoffs = 0
      for (const [wk, v] of Object.entries(p.projIf)) {
        const w = Number(wk)
        if (w > reg) playoffs += v
        else if (w > cur) ros += v
      }
      return { ...p, proj: p.projIf, ros: Math.round(ros * 10) / 10, playoffs: Math.round(playoffs * 10) / 10 }
    }),
  }
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const sync = () => {
      noteHash(window.location.hash || '#team')
      setRoute(parseRoute(window.location.hash))
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return route
}

export function App() {
  const [rawData, setData] = useState<FantasyData | null>(null)
  const [mode, setModeState] = useState<ProjMode>(readMode)
  const setMode = (m: ProjMode) => {
    setModeState(m)
    try {
      localStorage.setItem('projMode', m)
    } catch {
      /* private mode: the choice just won't persist */
    }
  }
  const data = useMemo(() => withMode(rawData, mode), [rawData, mode])
  const [error, setError] = useState<string | null>(null)
  const route = useRoute()
  const engine = useEngine(data)
  const current = navCurrent(route)

  useEffect(() => {
    loadData().then(setData).catch((e: Error) => setError(e.message))
  }, [])

  const onBoard = current === 'games'
  const bareTitle = route.kind === 'nfl' ? route.abbr : route.kind === 'player' ? 'Player' : route.kind === 'game' ? 'Game' : route.id === 'news' ? 'News' : route.id === 'games' ? 'Games' : 'My team'
  const showRail = Boolean(engine) && route.kind === 'screen' && route.id !== 'games' && route.id !== 'news'
  const desk = engine
    ? {
        me: engine.d.teams.find((t) => t.id === engine.d.meta.myTeamId)!,
        updated: new Date(engine.d.meta.generatedAt),
      }
    : null

  let main: JSX.Element
  if (route.kind === 'player') main = <PlayerPage id={route.id} />
  else if (route.kind === 'nfl') main = <TeamPage abbr={route.abbr} />
  else if (route.kind === 'game') main = <GamePage id={route.id} />
  else if (route.id === 'games') main = <Board />
  else if (route.id === 'news') main = <NewsPage />
  else if (error) main = <div className="panel"><h2>Couldn't load your league</h2><p>{error}</p><p className="news-next"><a className="dest" href="#games">Games</a><a className="dest" href="#news">News</a></p></div>
  else if (!engine) main = <p className="loading">Loading your league</p>
  else main = LEAGUE_SCREENS[route.id] ?? <Roster />

  const shell = (
    <div className={showRail ? 'app' : 'app no-rail'}>
      <div className="atmosphere" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
      </div>
      <header className="masthead">
        {desk ? (
          <>
            <div className="team">
              <h1>{desk.me.name}</h1>
              <p className="sub">
                {engine!.d.meta.leagueName}, {engine!.d.meta.scoring}, Week {engine!.d.meta.week}
                <span className="model-tag">New model</span>
              </p>
            </div>
            <dl className="odds">
              <div><dt>Record</dt><dd>{desk.me.wins}-{desk.me.losses}{desk.me.ties ? `-${desk.me.ties}` : ''}</dd></div>
              <div><dt>Points for</dt><dd>{desk.me.pf.toFixed(0)}</dd></div>
              <div><dt>Playoff odds</dt><dd>{pct(engine!.sim.playoff[desk.me.id])}</dd></div>
              <div><dt>Bye odds</dt><dd>{pct(engine!.sim.bye[desk.me.id])}</dd></div>
              <div className="hot"><dt>Title odds</dt><dd>{pct(engine!.sim.title[desk.me.id])}</dd></div>
            </dl>
          </>
        ) : (
          <div className="team">
            <h1>NFL board</h1>
            <p className="sub">This week's games, the spread, and the total</p>
          </div>
        )}
      </header>

      <nav className="nav" aria-label="Sections">
        {NAV.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={current === s.id ? 'on' : ''} aria-current={current === s.id ? 'page' : undefined}>
            {s.label}
          </a>
        ))}
        {desk && !onBoard && route.kind === 'screen' && route.id !== 'news' && (
          <div className="modebox" role="group" aria-label="Projection view">
            <span className="modebox-label">Projections</span>
            <button type="button" className={mode === 'expected' ? 'on' : ''} aria-pressed={mode === 'expected'} onClick={() => setMode('expected')} title="Counts the chance an injured player sits (questionable about 63-75% to play)">Expected</button>
            <button type="button" className={mode === 'plays' ? 'on' : ''} aria-pressed={mode === 'plays'} onClick={() => setMode('plays')} title="What a questionable or doubtful player scores if he plays (about 88% of usual)">If he plays</button>
          </div>
        )}
        {desk && (
          <p className="fresh">
            League updated {desk.updated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </p>
        )}
      </nav>

      <main className="main" id="main">
        {onBoard ? SCREENS[0].el : error ? (
          <div className="panel"><h2>Couldn't load your league</h2><p>{error}</p></div>
        ) : !engine ? (
          <p className="loading">Loading your league</p>
        ) : (
          SCREENS.find((s) => s.id === screen)!.el
        )}
      </main>
      {showRail && <StatRail />}

      <footer className="foot">
        {onBoard
          ? 'Spread, total, and moneyline are one book (DraftKings) via ESPN. The price is the market. This page does not place a bet or name a side.'
          : engine
            ? `Sources: ${engine.d.meta.sources.join(', ')}. Projections, odds and acceptance chances are estimates from this app's model, not ESPN's.`
            : 'League file not loaded. Games, clubs, and news still come from the ESPN scoreboard.'}
      </footer>
    </div>
  )

  if (!engine) return shell
  return (
    <DataProvider engine={engine}>
      <FocusProvider>{shell}</FocusProvider>
    </DataProvider>
  )
}
