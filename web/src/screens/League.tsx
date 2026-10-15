import { useState } from 'react'
import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import { fmt, pct } from '../components/bits'

const KEYS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BENCH', 'OVERALL'] as const
const LABEL: Record<(typeof KEYS)[number], string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'Flex', BENCH: 'Bench', OVERALL: 'Lineup' }

/** Sequential single hue: rank 1 brightest. Text stays in text tokens. */
const cellBg = (rank: number) => `color-mix(in oklab, var(--up) ${Math.round(((12 - rank) / 11) * 62 + 6)}%, var(--panel))`

export function League() {
  const { d, ranks, sim, lab } = useEngineCtx()
  useNumbered([])
  const [hover, setHover] = useState<string | null>(null)
  const teams = [...d.teams].sort((a, b) => sim.title[b.id] - sim.title[a.id])
  return (
    <div className="screen">
      <section className="panel">
        <h2>Where every team stands</h2>
        <p className="muted small">
          Each cell is the team's league rank at that spot, from the rest-of-season value of its best starters (1 is best). Odds come from 3,000 simulated seasons: remaining schedule, wins then points for seeding, top six in, seeds one and two get byes. Odds move by about ±2 points between runs.
        </p>
        <div className="table-wrap">
          <table className="heat">
            <thead>
              <tr>
                <th className="tl">Team</th>
                <th>Record</th>
                {KEYS.map((k) => <th key={k}>{LABEL[k]}</th>)}
                <th>Proj pts/wk</th>
                <th>Playoffs</th>
                <th title="ESPN's own playoff simulation">ESPN</th>
                <th>Title</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const r = ranks[t.id]
                const mine = t.id === d.meta.myTeamId
                return (
                  <tr key={t.id} className={mine ? 'mine' : ''}>
                    <th className="tl">{t.name}</th>
                    <td>{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</td>
                    {KEYS.map((k) => {
                      const id = `${t.id}-${k}`
                      return (
                        <td
                          key={k}
                          className="cell"
                          style={{ background: cellBg(r[k].rank) }}
                          onMouseEnter={() => setHover(id)}
                          onMouseLeave={() => setHover(null)}
                          title={`${t.name} ${LABEL[k]}: rank ${r[k].rank}, ${fmt(r[k].value)} projected pts/wk`}
                        >
                          {r[k].rank}
                          {hover === id && <span className="cell-tip">{fmt(r[k].value)} pts/wk</span>}
                        </td>
                      )
                    })}
                    <td>{fmt(lab.baseOutlook.get(t.id)!.weighted)}</td>
                    <td>{pct(sim.playoff[t.id])}</td>
                    <td className="muted">{t.espnPlayoffPct !== null ? pct(t.espnPlayoffPct) : '–'}</td>
                    <td><b>{pct(sim.title[t.id])}</b></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
