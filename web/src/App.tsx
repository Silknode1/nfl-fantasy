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
import { pct } from './components/bits'

const SCREENS = [
  { id: 'games', label: 'Games', el: <Board /> },
  { id: 'team', label: 'My team', el: <Roster /> },
  { id: 'trades', label: 'Trades', el: <Trades /> },
  { id: 'waivers', label: 'Waivers', el: <Waivers /> },
  { id: 'pulse', label: 'Waiver pulse', el: <Pulse /> },
  { id: 'league', label: 'League', el: <League /> },
  { id: 'espn', label: 'Vs ESPN', el: <VsEspn /> },
  { id: 'plan', label: 'Season plan', el: <Plan /> },
] as const

type ScreenId = (typeof SCREENS)[number]['id']

function readHash(): ScreenId {
  const h = window.location.hash.replace('#', '')
  if (!h) return 'games'
  return (SCREENS.find((s) => s.id === h)?.id ?? 'games') as ScreenId
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
  const [screen, setScreen] = useState<ScreenId>(readHash)
  const engine = useEngine(data)

  useEffect(() => {
    loadData().then(setData).catch((e: Error) => setError(e.message))
    const onHash = () => setScreen(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (id: ScreenId) => {
    window.location.hash = id
    setScreen(id)
  }
  const onBoard = screen === 'games'
  const showRail = Boolean(engine) && !onBoard
  const desk = engine
    ? {
        me: engine.d.teams.find((t) => t.id === engine.d.meta.myTeamId)!,
        updated: new Date(engine.d.meta.generatedAt),
      }
    : null

  const shell = (
    <div className={showRail ? 'app' : 'app no-rail'}>
      <header className="masthead">
        {desk ? (
          <>
            <div className="team">
              <h1>{desk.me.name}</h1>
              <p className="sub">
                {engine!.d.meta.leagueName}, {engine!.d.meta.scoring}, Week {engine!.d.meta.week} · New model
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
            <h1>NFL board · New model</h1>
            <p className="sub">This week's games, the spread, and the total</p>
          </div>
        )}
      </header>

      <nav className="nav" aria-label="Sections">
        {SCREENS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={screen === s.id ? 'on' : ''} aria-current={screen === s.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(s.id) }}>
            {s.label}
          </a>
        ))}
        {desk && !onBoard && (
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
            : 'League file not loaded.'}
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
