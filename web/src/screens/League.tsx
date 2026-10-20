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
        <div className="table-wrap">
          <table className="title-board">
            <thead>
              <tr>
                <th className="league-name">Team</th>
                <th>Record</th>
                <th title="Whole percent from this run of simulate(). About ±2 points between runs.">Title</th>
                <th>PF</th>
                <th title="League points against. simulate() does not read this.">PA</th>
                <th title="Regular-season games from this week through the last regular week.">Games left</th>
                <th title="Mean projected lineup points in the games simulate() still plays.">Lineup</th>
                <th title="Mean weekly spread on those lineup scores.">Spread</th>
                <th title="Mean projected lineup points of the opponents in those same games.">Opponents</th>
                <th title="Current standings place: win percentage, then points for.">Seed</th>
                <th>Playoffs</th>
                <th>Bye</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const drv = drivers.get(t.id)
                const mine = t.id === d.meta.myTeamId
                return (
                  <tr key={t.id} className={mine ? 'title-team mine' : 'title-team'}>
                    <th className="league-name" scope="row">{t.name}</th>
                    <td>{recordOf(t)}</td>
                    <td>{pct(sim.title[t.id])}</td>
                    <td>{fmt(t.pf, 1)}</td>
                    <td>{fmt(t.pa, 1)}</td>
                    <td>{drv ? drv.gamesLeft : '–'}</td>
                    <td>{drv ? fmt(drv.projPerWeek) : '–'}</td>
                    <td>{drv ? fmt(drv.sdPerWeek) : '–'}</td>
                    <td>{drv ? fmt(drv.oppPerWeek) : '–'}</td>
                    <td>{seeds.get(t.id) ?? '–'}</td>
                    <td>{pct(sim.playoff[t.id])}</td>
                    <td>{pct(sim.bye[t.id])}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
