import { useEffect, useState } from 'react'
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

export function App() {
  const [data, setData] = useState<FantasyData | null>(null)
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
