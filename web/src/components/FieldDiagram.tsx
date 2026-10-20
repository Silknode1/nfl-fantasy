import { spotLabel, type FieldTrip } from '../board/scoring'

/** A small field, only when ESPN sent both ends of the scoring play. */
export function FieldDiagram({ field }: { field: FieldTrip }) {
  const w = 240
  const h = 52
  const x = (spot: number) => 16 + (Math.max(0, Math.min(100, spot)) / 100) * (w - 32)
  const labelX = (spot: number) => Math.max(36, Math.min(w - 36, x(spot)))
  const from = spotLabel(field.playStart, field.defense)
  const to = spotLabel(field.playEnd, field.defense)
  const start = field.driveStart
  return (
    <svg className="field-diagram" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${field.offense} ball from ${from} to ${to}`}>
      <rect x="16" y="14" width={w - 32} height="22" rx="2" className="field-grass" />
      <line x1="16" x2="16" y1="14" y2="36" className="field-goal" />
      <line x1={w - 16} x2={w - 16} y1="14" y2="36" className="field-goal" />
      <line x1={x(50)} x2={x(50)} y1="14" y2="36" className="field-mid" />
      {start != null && <line x1={x(start)} x2={x(field.playStart)} y1="25" y2="25" className="field-drive" />}
      <line x1={x(field.playStart)} x2={x(field.playEnd)} y1="25" y2="25" className="field-play" />
      <circle cx={x(field.playStart)} cy="25" r="3" className="field-dot" />
      <circle cx={x(field.playEnd)} cy="25" r="3.5" className="field-end" />
      <text x={labelX(field.playStart)} y="48" textAnchor="middle" className="field-lab">{from}</text>
      <text x={labelX(field.playEnd)} y="10" textAnchor="middle" className="field-lab">{to}</text>
    </svg>
  )
}
