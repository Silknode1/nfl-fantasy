import { useState } from 'react'
import type { Player } from '../types'
import { useEngineCtx } from '../dataContext'
import { useFocus, useNumbered } from '../focus'
import { RangeChart } from '../components/RangeChart'
import { PlayerProfile } from '../components/PlayerProfile'
import { weekAdvice } from '../engine/advice'
import { Avatar, InjuryTag, PlayChance, RankDelta, fmt, signed } from '../components/bits'
import { hot } from '../components/bits'

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX']

function PlayerRow({ p, slot }: { p: Player; slot: string }) {
  const { d, lab } = useEngineCtx()
  const wk = p.proj[String(d.meta.week)] ?? 0
  const onBye = p.bye === d.meta.week
  const out = !p.locked && wk === 0 && !!p.inj && p.inj !== 'ACTIVE'
  return (
    <div className="prow">
      <span className="slot">{slot}</span>
      <Avatar p={p} />
      <div className="prow-id">
        <div className="pname">{p.name}</div>
        <div className="pmeta">
          <span>{p.pos}</span>
          <span>{p.nfl}</span>
          {p.bye && <span>Bye {p.bye}</span>}
          <InjuryTag p={p} />
          <PlayChance p={p} />
          <span className="m-only">fPPG {fmt(p.ppg)} · L3 {p.last3 != null ? fmt(p.last3) : '–'}</span>
        </div>
      </div>
      <div className="num fppg" title="Fantasy points per game this season (half PPR)">
        <b>{p.gp ? fmt(p.ppg) : '–'}</b>
        <small>fPPG</small>
      </div>
      <div className={`num l3 ${hot(p)}`} title="Average of his last 3 games: how hot or cold he is">
        <b>{p.last3 != null ? fmt(p.last3) : '–'}</b>
        <small>last 3</small>
      </div>
      <div className="num wk" title={p.locked ? 'Final for this week' : 'Projected this week'}>
        <b>{onBye ? 'Bye' : out ? 'Out' : fmt(wk)}</b>
        <small>{p.locked ? 'final' : `app wk ${d.meta.week}`}</small>
      </div>
      <div className="num ros">
        <b>{fmt(lab.v(p))}</b>
        <small>ROS/wk</small>
      </div>
      <RankDelta p={p} />
    </div>
  )
}

export function Roster() {
  const { d, lab, ranks } = useEngineCtx()
  const me = d.meta.myTeamId
  const mine = lab.rosters.get(me)!
  const starters = mine.filter((p) => p.slot && SLOT_ORDER.includes(p.slot)).sort((a, b) => SLOT_ORDER.indexOf(a.slot!) - SLOT_ORDER.indexOf(b.slot!))
  const bench = mine.filter((p) => p.slot === 'BE').sort((a, b) => lab.v(b) - lab.v(a))
  const ir = mine.filter((p) => p.slot === 'IR')
  useNumbered([...starters, ...bench, ...ir])
  const wa = weekAdvice(mine, d.meta.week)
  const r = ranks[me]
  const { setPinned } = useFocus()
  const [rangeTeam, setRangeTeam] = useState(me)
  const [rangeWeek, setRangeWeek] = useState(d.meta.week)
  const [profile, setProfile] = useState<Player | null>(null)
  const pick = (pl: Player) => { setPinned(pl); setProfile(pl) }
  const weeks = Array.from({ length: d.meta.lastWeek - d.meta.week + 1 }, (_, i) => d.meta.week + i)
  return (
    <div className="screen">
      <section className="panel advice">
        <h2>Week {d.meta.week} lineup</h2>
        {wa.swaps.length ? (
          <>
            <p>
              Your current lineup projects <b>{fmt(wa.current)}</b>. Make {wa.swaps.length === 1 ? 'this change' : 'these changes'} for <b>{fmt(wa.best)}</b>.
            </p>
            <ul className="swaps">
              {wa.swaps.map((s) => (
                <li key={s.out.id}>
                  <span className="swap-in">Start {s.in.name}</span>
                  <span className="muted">bench {s.out.name}</span>
                  <span className="gain">{signed(s.gain)} pts</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Your lineup is already the best one available: <b>{fmt(wa.best)}</b> projected points.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Floor, expected, ceiling</h2>
          <div className="range-pick">
            <label>Team{' '}
              <select value={rangeTeam} onChange={(e) => { setRangeTeam(Number(e.target.value)); setProfile(null) }} aria-label="Team">
                {[...d.teams].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name))).map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.wins}-{t.losses})</option>
                ))}
              </select>
            </label>
            <label>Week{' '}
              <select value={rangeWeek} onChange={(e) => setRangeWeek(Number(e.target.value))} aria-label="Week">
                {weeks.map((w) => <option key={w} value={w}>{w}{w > d.meta.regularWeeks ? ' (playoffs)' : ''}</option>)}
              </select>
            </label>
          </div>
        </div>
        {profile ? (
          <PlayerProfile p={profile} week={rangeWeek} onBack={() => setProfile(null)} />
        ) : (
          <>
            <p className="muted small">Each player's projected half-PPR points: the dot is the expected score, the bar runs from a bad week (10th percentile) to a big week (90th percentile). Click a player to open his profile.</p>
            <RangeChart roster={lab.rosters.get(rangeTeam) ?? []} week={rangeWeek} onPick={pick} />
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Starters</h2>
          <div className="pos-ranks" aria-label="Your league rank by position">
            {(['QB', 'RB', 'WR', 'TE', 'FLEX'] as const).map((k) => (
              <span key={k} className={r[k].rank <= 3 ? 'good' : r[k].rank >= 8 ? 'bad' : ''}>
                {k} <b>{r[k].rank}</b>
              </span>
            ))}
          </div>
        </div>
        {starters.map((p) => <PlayerRow key={p.id} p={p} slot={p.slot === 'FLEX' ? 'Flex' : p.slot!} />)}
      </section>

      <section className="panel">
        <h2>Bench</h2>
        {bench.map((p) => <PlayerRow key={p.id} p={p} slot="Bn" />)}
      </section>

      {ir.length > 0 && (
        <section className="panel">
          <h2>Injured reserve</h2>
          {ir.map((p) => <PlayerRow key={p.id} p={p} slot="IR" />)}
        </section>
      )}
    </div>
  )
}
