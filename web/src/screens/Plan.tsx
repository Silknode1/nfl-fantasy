import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import type { PlanItem } from '../engine/advice'
import { pct } from '../components/bits'
import { GlassCard, Skeleton, StatGroup } from '../components/glass'

function Column({ title, when, items }: { title: string; when: string; items: PlanItem[] }) {
  return (
    <GlassCard className="plan-col">
      <h2>{title}</h2>
      <p className="when">{when}</p>
      <ul>
        {items.map((it, i) => (
          <li key={i} className={`plan-item lift ${it.tone ?? 'info'}`}>
            {it.stat && <b className={it.stat.startsWith('+') ? 'plan-stat up' : 'plan-stat'}>{it.stat}</b>}
            <div>
              <div className="plan-title">{it.title}</div>
              <p>{it.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </GlassCard>
  )
}

export function Plan() {
  const { d, plan, sim } = useEngineCtx()
  useNumbered([])
  const me = d.meta.myTeamId
  const team = d.teams.find((t) => t.id === me)!
  if (!plan) {
    return (
      <div className="screen">
        <Skeleton variant="rows" label="Building your plan once the trade search finishes" />
      </div>
    )
  }
  return (
    <div className="screen">
      <GlassCard featured lean className="plan-head">
        <h2>Path to the title</h2>
        <StatGroup
          label="Where you stand"
          items={[
            { label: 'Record', value: `${team.wins}-${team.losses}` },
            { label: 'Playoff odds', value: pct(sim.playoff[me]) },
            { label: 'Title odds', value: pct(sim.title[me]), tone: 'up', className: 'hero' },
          ]}
        />
        <p>
          The job now is less about making the playoffs and more about the strongest possible lineup for Weeks 15–17.
        </p>
        <p className="news-next"><a className="dest" href="#team">My team</a><a className="dest" href="#trades">Trades</a><a className="dest" href="#news">News</a></p>
      </GlassCard>
      <div className="plan-cols">
        <Column title="This week" when={`Week ${d.meta.week}, before kickoff and the next waiver run`} items={plan.short} />
        <Column title="Next few weeks" when={`Weeks ${d.meta.week + 1}–${d.meta.week + 4}`} items={plan.medium} />
        <Column title="Rest of season and playoffs" when={`Through the Week ${d.meta.regularWeeks} finale and Weeks ${d.meta.regularWeeks + 1}–${d.meta.lastWeek}`} items={plan.long} />
      </div>
    </div>
  )
}
