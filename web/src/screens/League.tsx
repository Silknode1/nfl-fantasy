import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import { fmt, pct } from '../components/bits'
import { GlassCard, RankingRow, StatGroup } from '../components/glass'

const KEYS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BENCH', 'OVERALL'] as const
const LABEL: Record<(typeof KEYS)[number], string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'Flex', BENCH: 'Bench', OVERALL: 'Lineup' }

/** Sequential single hue: rank 1 brightest. Text stays in text tokens. */
const cellBg = (rank: number) => `color-mix(in oklab, var(--accent) ${Math.round(((12 - rank) / 11) * 46 + 8)}%, var(--panel))`

export function League() {
  const { d, ranks, sim, lab } = useEngineCtx()
  useNumbered([])
  const teams = [...d.teams].sort((a, b) => sim.title[b.id] - sim.title[a.id])
  return (
    <div className="screen">
      <GlassCard featured lean>
        <h2>Title board</h2>
        <p className="muted small">Teams in order of this model's title odds. Yours stays marked. The number is an estimate, not a promise.</p>
        <p className="news-next"><a className="dest" href="#team">My team</a><a className="dest" href="#trades">Trades</a><a className="dest" href="#espn">Vs ESPN</a></p>
        <div className="rank-list">
          {teams.map((t, i) => (
            <RankingRow
              key={t.id}
              rank={i + 1}
              name={t.name}
              value={pct(sim.title[t.id])}
              meta={`${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ''} · playoffs ${pct(sim.playoff[t.id])}`}
              mine={t.id === d.meta.myTeamId}
              tone={i === 0 ? 'up' : t.id === d.meta.myTeamId ? 'accent' : 'neutral'}
            />
          ))}
        </div>
      </GlassCard>
      <GlassCard>
        <h2>Where every team stands</h2>
        <p className="muted small">
          Each card is one team. Title odds lead. Each chip is league rank at that spot (1 is best), with projected points per week beside the rank. Odds come from 3,000 simulated seasons: remaining schedule, wins then points for seeding, top six in, seeds one and two get byes. Odds move by about ±2 points between runs.
        </p>
        <div className="stand-list">
          {teams.map((t) => {
            const r = ranks[t.id]
            const mine = t.id === d.meta.myTeamId
            const outlook = lab.baseOutlook.get(t.id)!
            return (
              <article key={t.id} className={mine ? 'stand lift mine' : 'stand lift'}>
                <div className="stand-id">
                  <h3>{t.name}</h3>
                  <p className="muted small">{t.wins}-{t.losses}{t.ties ? `-${t.ties}` : ''}</p>
                </div>
                <StatGroup
                  className="stand-stats"
                  label={`${t.name} outlook`}
                  items={[
                    { key: 'title', label: 'Title', value: pct(sim.title[t.id]), className: 'hero', tone: mine ? 'accent' : 'neutral' },
                    { key: 'playoffs', label: 'Playoffs', value: pct(sim.playoff[t.id]) },
                    { key: 'espn', label: 'ESPN', value: t.espnPlayoffPct !== null ? pct(t.espnPlayoffPct) : '–', title: "ESPN's own playoff simulation" },
                    { key: 'pts', label: 'Pts/wk', value: fmt(outlook.weighted) },
                  ]}
                />
                <div className="pos-ranks" aria-label={`${t.name} position ranks`}>
                  {KEYS.map((k) => (
                    <span
                      key={k}
                      className="pos-chip"
                      style={{ background: cellBg(r[k].rank) }}
                      title={`${t.name} ${LABEL[k]}: rank ${r[k].rank}, ${fmt(r[k].value)} projected pts/wk`}
                    >
                      <span>{LABEL[k]}</span> <b>{r[k].rank}</b> <small>{fmt(r[k].value)}</small>
                    </span>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </GlassCard>
    </div>
  )
}
