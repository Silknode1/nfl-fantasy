import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import type { PlanItem } from '../engine/advice'
import { pct } from '../components/bits'

function Column({ title, when, items }: { title: string; when: string; items: PlanItem[] }) {
  return (
    <section className="panel plan-col">
      <h2>{title}</h2>
      <p className="when">{when}</p>
      <ul>
        {items.map((it, i) => (
          <li key={i} className={`plan-item ${it.tone ?? 'info'}`}>
            <div className="plan-title">
              <span>{it.title}</span>
              {it.stat && <b>{it.stat}</b>}
            </div>
            <p>{it.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Plan() {
  const { d, plan, sim } = useEngineCtx()
  useNumbered([])
  const me = d.meta.myTeamId
  if (!plan) return <div className="screen"><section className="panel"><p className="loading">Building your plan once the trade search finishes…</p></section></div>
  return (
    <div className="screen">
      <section className="panel plan-head">
        <h2>Path to the title</h2>
        <p>
          You're {d.teams.find((t) => t.id === me)!.wins}-{d.teams.find((t) => t.id === me)!.losses} with {pct(sim.playoff[me])} playoff odds and {pct(sim.title[me])} title odds. The job now is less about making the playoffs and more about the strongest possible lineup for Weeks 15–17.
        </p>
      </section>
      <div className="plan-cols">
        <Column title="This week" when={`Week ${d.meta.week}, before kickoff and the next waiver run`} items={plan.short} />
        <Column title="Next few weeks" when={`Weeks ${d.meta.week + 1}–${d.meta.week + 4}`} items={plan.medium} />
        <Column title="Rest of season and playoffs" when={`Through the Week ${d.meta.regularWeeks} finale and Weeks ${d.meta.regularWeeks + 1}–${d.meta.lastWeek}`} items={plan.long} />
      </div>
    </div>
  )
}
