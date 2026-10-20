import type { WinGraph } from '../board/wingraph'

function caption(graph: WinGraph): string {
  const latest = graph.latest
  return latest.leader ? `${latest.leader} ${latest.pct}%` : `${latest.pct}%`
}

/** ESPN's series only. A null graph is the parent's empty sentence, not a drawn line. */
export function WinGraphFigure({ graph }: { graph: WinGraph }) {
  const W = 760
  const H = graph.timed ? 300 : 220
  const left = 58
  const right = 118
  const top = 28
  const bottom = graph.timed ? 72 : 46
  const plotW = W - left - right
  const plotH = H - top - bottom
  const end = graph.end > 0 ? graph.end : 1
  const xOf = (t: number) => left + (t / end) * plotW
  const yOf = (pct: number) => top + (1 - Math.max(0, Math.min(100, pct)) / 100) * plotH
  const last = graph.points[graph.points.length - 1]
  const label = caption(graph)
  const labelX = last ? xOf(last.t) + 8 : left
  const labelY = last ? yOf(graph.latest.home) : top
  const line = graph.points.map((point) => `${xOf(point.t)},${yOf(point.home)}`).join(' ')
  const described = graph.timed
    ? `ESPN home win probability. Latest ${label}.`
    : `ESPN home win probability in play order. Latest ${label}. No clock was sent with these plays.`

  return (
    <figure className="win-graph">
      <figcaption>ESPN's model</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={described}>
        <text x="18" y={top + plotH / 2} transform={`rotate(-90 18 ${top + plotH / 2})`} textAnchor="middle" className="axis-title">Win %</text>
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line x1={left} x2={left + plotW} y1={yOf(pct)} y2={yOf(pct)} className={pct === 50 ? 'grid-mid' : 'grid'} />
            <text x={left - 8} y={yOf(pct)} textAnchor="end" dominantBaseline="middle" className="axis-tick">{pct}</text>
          </g>
        ))}
        {graph.timed && graph.periods.map((band) => (
          <text key={band.label} x={xOf((band.start + band.end) / 2)} y={top - 8} textAnchor="middle" className="axis-q">{band.label}</text>
        ))}
        {graph.timed && graph.ticks.filter((tick) => tick.boundary).map((tick) => (
          <g key={`b-${tick.t}`}>
            <line x1={xOf(tick.t)} x2={xOf(tick.t)} y1={top} y2={top + plotH} className="grid" />
            <text x={xOf(tick.t)} y={top + plotH + 16} textAnchor="middle" className="axis-tick">{tick.quarterClock}</text>
            {tick.gameLeft && <text x={xOf(tick.t)} y={top + plotH + 32} textAnchor="middle" className="axis-sub">{tick.gameLeft} left</text>}
          </g>
        ))}
        {graph.points.length >= 2 && <polyline points={line} className="win-line-path" />}
        {last && <circle cx={xOf(last.t)} cy={yOf(last.home)} r="4.5" className="win-latest" />}
        {last && (
          <text x={labelX} y={labelY} className="win-label" dominantBaseline="middle">{label}</text>
        )}
        <text x={left + plotW / 2} y={H - 10} textAnchor="middle" className="axis-title">
          {graph.timed ? 'Time remaining in the quarter and in the game' : 'Play order. No clock was sent with these plays.'}
        </text>
      </svg>
    </figure>
  )
}
