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
import { pct } from './components/bits'

const SCREENS = [
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
  return (SCREENS.find((s) => s.id === h)?.id ?? 'team') as ScreenId
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

  if (error) return <main className="boot"><h1>Couldn't load your league</h1><p>{error}</p></main>
  if (!engine) return <main className="boot"><p className="loading">Loading your league…</p></main>

  const { d, sim } = engine
  const me = d.teams.find((t) => t.id === d.meta.myTeamId)!
  const updated = new Date(d.meta.generatedAt)
  const go = (id: ScreenId) => {
    window.location.hash = id
    setScreen(id)
  }

  return (
    <DataProvider engine={engine}>
      <FocusProvider>
        <div className="app">
          <header className="masthead">
            <div className="team">
              <h1>{me.name}</h1>
              <p className="sub">
                {d.meta.leagueName}, {d.meta.scoring}, Week {d.meta.week}
              </p>
            </div>
            <dl className="odds">
              <div><dt>Record</dt><dd>{me.wins}-{me.losses}{me.ties ? `-${me.ties}` : ''}</dd></div>
              <div><dt>Points for</dt><dd>{me.pf.toFixed(0)}</dd></div>
              <div><dt>Playoff odds</dt><dd>{pct(sim.playoff[me.id])}</dd></div>
              <div><dt>Bye odds</dt><dd>{pct(sim.bye[me.id])}</dd></div>
              <div className="hot"><dt>Title odds</dt><dd>{pct(sim.title[me.id])}</dd></div>
            </dl>
          </header>

          <nav className="nav" aria-label="Sections">
            {SCREENS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className={screen === s.id ? 'on' : ''} aria-current={screen === s.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(s.id) }}>
                {s.label}
              </a>
            ))}
            <div className="modebox" role="group" aria-label="Projection view">
              <span className="modebox-label">Projections</span>
              <button type="button" className={mode === 'expected' ? 'on' : ''} aria-pressed={mode === 'expected'} onClick={() => setMode('expected')} title="Counts the chance an injured player sits (questionable about 63-75% to play)">Expected</button>
              <button type="button" className={mode === 'plays' ? 'on' : ''} aria-pressed={mode === 'plays'} onClick={() => setMode('plays')} title="What a questionable or doubtful player scores if he plays (about 88% of usual)">If he plays</button>
            </div>
            <p className="fresh">
              Updated {updated.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          </nav>

          <main className="main" id="main">{SCREENS.find((s) => s.id === screen)!.el}</main>
          <StatRail />

          <footer className="foot">
            Sources: {d.meta.sources.join(', ')}. Projections, odds and acceptance chances are estimates from this app's model, not ESPN's.
          </footer>
        </div>
      </FocusProvider>
    </DataProvider>
  )
}
