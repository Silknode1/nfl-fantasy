import { useMemo } from 'react'
import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import { fmt, pct } from '../components/bits'
import { GlassCard } from '../components/glass'
import { DRIVER_NOTE, SIM_ODDS_NOTE, simDrivers } from '../league/drivers'
import { rankCell } from '../league/shade'
import { seedsNow, STANDINGS_RULE, standingsOrder } from '../league/standings'

const KEYS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BENCH', 'OVERALL'] as const
const LABEL: Record<(typeof KEYS)[number], string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'Flex', BENCH: 'Bench', OVERALL: 'Lineup' }

const recordOf = (t: { wins: number; losses: number; ties: number }) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''}`

export function League() {
  const { d, ranks, sim, lab } = useEngineCtx()
  useNumbered([])
  const teams = useMemo(() => standingsOrder(d.teams), [d.teams])
  const drivers = useMemo(() => simDrivers(d, lab.baseOutlook), [d, lab])
  const seeds = useMemo(() => seedsNow(d.teams), [d.teams])
  const n = d.teams.length
  return (
    <div className="screen">
      <GlassCard featured lean>
        <h2>Title board</h2>
        <p className="muted small">{STANDINGS_RULE} {SIM_ODDS_NOTE}</p>
        <p className="muted small">{DRIVER_NOTE}</p>
        <ol className="title-board">
          {teams.map((t) => {
            const drv = drivers.get(t.id)
            const mine = t.id === d.meta.myTeamId
            const stats: { label: string; value: string; title?: string }[] = [
              { label: 'Record', value: recordOf(t) },
              { label: 'Title', value: pct(sim.title[t.id]), title: 'Whole percent from this run of simulate(). About ±2 points between runs.' },
              { label: 'PF', value: fmt(t.pf, 1) },
              { label: 'PA', value: fmt(t.pa, 1), title: 'League points against. simulate() does not read this.' },
              { label: 'Games left', value: drv ? String(drv.gamesLeft) : '–', title: 'Regular-season games from this week through the last regular week.' },
              { label: 'Lineup', value: drv ? fmt(drv.projPerWeek) : '–', title: 'Mean projected lineup points in the games simulate() still plays.' },
              { label: 'Spread', value: drv ? fmt(drv.sdPerWeek) : '–', title: 'Mean weekly spread on those lineup scores.' },
              { label: 'Opponents', value: drv ? fmt(drv.oppPerWeek) : '–', title: 'Mean projected lineup points of the opponents in those same games.' },
              { label: 'Seed', value: seeds.get(t.id)?.toString() ?? '–', title: 'Current standings place: win percentage, then points for.' },
              { label: 'Playoffs', value: pct(sim.playoff[t.id]) },
              { label: 'Bye', value: pct(sim.bye[t.id]) },
            ]
            return (
              <li key={t.id} className={mine ? 'title-team mine' : 'title-team'}>
                <h3>{t.name}</h3>
                <dl className="title-stats">
                  {stats.map((stat) => (
                    <div key={stat.label} title={stat.title}>
                      <dt>{stat.label}</dt>
                      <dd>{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            )
          })}
        </ol>
      </GlassCard>
      <GlassCard>
        <h2>Position ranks</h2>
        <p className="muted small">
          Same order as the title board. Each cell is the league rank at that spot, from the rest-of-season value of the best starters. 1 is best. Brighter gold is closer to 1.
        </p>
        <div className="table-wrap">
          <table className="league-grid">
            <thead>
              <tr>
                <th className="league-name">Team</th>
                {KEYS.map((k) => <th key={k}>{LABEL[k]}</th>)}
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const r = ranks[t.id]
                const mine = t.id === d.meta.myTeamId
                return (
                  <tr key={t.id} className={mine ? 'mine' : undefined}>
                    <th className="league-name" scope="row">{t.name}</th>
                    {KEYS.map((k) => {
                      const shade = rankCell(r[k].rank, n)
                      return (
                        <td
                          key={k}
                          className={shade.dark ? 'league-cell dark' : 'league-cell'}
                          style={{ background: shade.background, color: shade.dark ? 'var(--accent-ink)' : undefined }}
                          title={`${t.name} ${LABEL[k]}: rank ${r[k].rank}, ${fmt(r[k].value)} projected pts/wk`}
                        >
                          {r[k].rank}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}
