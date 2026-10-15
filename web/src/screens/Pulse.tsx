import { useMemo, useState } from 'react'
import type { Player, TrendRow } from '../types'
import { useEngineCtx } from '../dataContext'
import { useFocus } from '../focus'

type Source = 'sleeper' | 'espn'
const POSITIONS = ['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const count = (n: number) => (n >= 10000 ? compact.format(n) : n.toLocaleString('en-US'))
const pts = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(1)}`

function Bars({ title, rows, kind, src, status, onPick }: {
  title: string; rows: TrendRow[]; kind: 'add' | 'drop'; src: Source
  status: (r: TrendRow) => { label: string; cls: string; p?: Player }; onPick: (p: Player) => void
}) {
  const val = (r: TrendRow) => (src === 'espn' ? Math.abs(r.change ?? 0) : r.count ?? 0)
  const max = Math.max(1, ...rows.map(val))
  return (
    <section className="pulse-col">
      <h3>{title}</h3>
      {rows.length === 0 && <p className="muted small">No players at this position in this window.</p>}
      <ol className="pulse-list">
        {rows.map((r) => {
          const st = status(r)
          const v = src === 'espn' ? `${pts(r.change ?? 0)} pts` : count(r.count ?? 0)
          const tip = src === 'espn'
            ? `${r.name}: ${pts(r.change ?? 0)} pts rostered this week, ${r.rostered}% rostered, ${r.started}% started`
            : `${r.name}: ${(r.count ?? 0).toLocaleString('en-US')} ${kind === 'add' ? 'adds' : 'drops'}`
          return (
            <li key={`${r.rank}-${r.name}`} className={st.p ? 'pick' : ''} title={tip}
              onClick={() => st.p && onPick(st.p)} onKeyDown={(e) => { if (st.p && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onPick(st.p) } }}
              tabIndex={st.p ? 0 : undefined}>
              <span className={`dot ${st.cls}`} aria-hidden="true" />
              <span className="pl-name">
                {r.name}
                <small>{r.pos} {r.team}{r.inj ? ` · ${r.inj.toLowerCase().replace('_', ' ')}` : ''}{st.label ? ` · ${st.label}` : ''}</small>
              </span>
              <span className="pl-bar"><i className={kind} style={{ width: `${Math.max(2, (100 * val(r)) / max)}%` }} /></span>
              <span className="pl-val">{v}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export function Pulse() {
  const { d } = useEngineCtx()
  const { setPinned } = useFocus()
  const t = d.trends
  const [src, setSrc] = useState<Source>('sleeper')
  const [win, setWin] = useState('24h')
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>('All')
  const [top, setTop] = useState(15)
  const byId = useMemo(() => new Map(d.players.map((p) => [p.id, p])), [d])
  const team = (id: number) => d.teams.find((x) => x.id === id)?.name ?? ''
  const status = (r: TrendRow) => {
    const p = r.id ? byId.get(r.id) : undefined
    if (!p) return { label: '', cls: '' }
    if (!p.teamId) return { label: p.status === 'WAIVERS' ? 'on waivers here' : 'free agent here', cls: 'fa', p }
    if (p.teamId === d.meta.myTeamId) return { label: 'yours', cls: 'mine', p }
    return { label: team(p.teamId), cls: 'taken', p }
  }
  if (!t) {
    return (
      <div className="screen">
        <section className="panel"><h2>Waiver pulse</h2><p className="muted">No trend data yet. Run <code>./fantasy.sh</code> to pull Sleeper and ESPN trends.</p></section>
      </div>
    )
  }
  const pick = (kind: 'add' | 'drop') =>
    (src === 'espn' ? t.espn[kind] : t.sleeper[win]?.[kind] ?? []).filter((r) => pos === 'All' || r.pos === pos).slice(0, top)
  const adds = pick('add')
  const drops = pick('drop')
  const freeHot = adds.filter((r) => status(r).cls === 'fa').slice(0, 3)
  const pulled = new Date(t.pulledAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return (
    <div className="screen">
      <section className="panel">
        <div className="panel-head">
          <h2>Waiver pulse</h2>
          <div className="seg" role="group" aria-label="Source">
            {(['sleeper', 'espn'] as const).map((k) => (
              <button key={k} className={src === k ? 'on' : ''} aria-pressed={src === k} onClick={() => setSrc(k)}>{k === 'sleeper' ? 'Sleeper' : 'ESPN'}</button>
            ))}
          </div>
        </div>
        <p className="muted small">
          {src === 'sleeper'
            ? 'Adds and drops across all Sleeper leagues in the chosen window.'
            : 'Change in percent rostered across all ESPN leagues over the past week, in percentage points. ESPN only reports this one window.'}{' '}
          Pulled {pulled}. Dots show status in your league: <span className="dot fa" /> free agent, <span className="dot mine" /> yours, <span className="dot taken" /> rostered. Click a player for his card.
        </p>
        <div className="pulse-controls">
          {src === 'sleeper' && (
            <div className="seg" role="group" aria-label="Timeframe">
              {t.windows.map((w) => (
                <button key={w} className={win === w ? 'on' : ''} aria-pressed={win === w} onClick={() => setWin(w)}>{w}</button>
              ))}
            </div>
          )}
          <div className="seg" role="group" aria-label="Position">
            {POSITIONS.map((k) => (
              <button key={k} className={pos === k ? 'on' : ''} aria-pressed={pos === k} onClick={() => setPos(k)}>{k}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="How many">
            {[10, 15, 20].map((n) => (
              <button key={n} className={top === n ? 'on' : ''} aria-pressed={top === n} onClick={() => setTop(n)}>Top {n}</button>
            ))}
          </div>
        </div>
        {freeHot.length > 0 && (
          <p className="pulse-take">
            Still free in your league: {freeHot.map((r, i) => (
              <span key={r.name}>{i > 0 && ', '}<b>{r.name}</b> ({r.pos}, {src === 'espn' ? `${pts(r.change ?? 0)} pts` : `${count(r.count ?? 0)} adds`})</span>
            ))}.
          </p>
        )}
        <div className="pulse-cols">
          <Bars title="Most added" rows={adds} kind="add" src={src} status={status} onPick={setPinned} />
          <Bars title="Most dropped" rows={drops} kind="drop" src={src} status={status} onPick={setPinned} />
        </div>
      </section>
    </div>
  )
}
