import { useEffect, useMemo, useState } from 'react'
import type { Player, Pos } from '../types'
import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import { lineupNeeds, type LineupNeed } from '../engine/needs'
import { DECLINE_BELOW, KIND_LABEL, kindOf, type TradeEval } from '../engine/trade'
import { tradeSummary, verdict, ordinal } from '../engine/summary'
import { Avatar, GradeMark, InjuryTag, fmt, pct, signed } from '../components/bits'
import { EmptyState, GlassCard, Skeleton } from '../components/glass'
import { PlayerLink, TeamLink } from '../components/links'

function Side({ title, players }: { title: string; players: Player[] }) {
  const { lab, tradeOf } = useEngineCtx()
  return (
    <div className="side">
      <h3>{title}</h3>
      {players.map((p) => (
        <div key={p.id} className="side-p">
          <Avatar p={p} size={72} />
          <div>
            <div className="pname"><PlayerLink id={p.id} name={p.name} /> <InjuryTag p={p} /></div>
            <div className="pmeta"><span>{p.pos}</span><TeamLink abbr={p.nfl} /></div>
            <div className="pmeta"><span><b>{fmt(p.ppg)}</b> pts/g</span><span><b>{fmt(lab.v(p))}</b> ROS/wk</span><span><b>{signed(tradeOf(p).surplus)}</b> trade</span></div>
          </div>
        </div>
      ))}
    </div>
  )
}

function RankShift({ ev }: { ev: TradeEval }) {
  if (!ev.ranks) return null
  const keys: (Pos | 'FLEX')[] = ['QB', 'RB', 'WR', 'TE', 'FLEX']
  return (
    <div className="rank-shift" aria-label="Your league rank by position">
      {keys.map((k) => {
        const before = ev.ranks!.before[k].rank
        const after = ev.ranks!.after[k].rank
        const tone = after < before ? 'up' : after > before ? 'down' : ''
        return (
          <div key={k} className={`shift ${tone}`.trim()} title={`${k}: ${ordinal(before)} now, ${ordinal(after)} after`}>
            <span>{k}</span>
            <b>{ordinal(after)}</b>
            <small>{after === before ? 'unchanged' : `was ${ordinal(before)}`}</small>
          </div>
        )
      })}
    </div>
  )
}

function Counters({ ev, onPick }: { ev: TradeEval; onPick: (e: TradeEval) => void }) {
  const { lab, deepen } = useEngineCtx()
  const list = useMemo(() => lab.counterOffers(ev, 4).map(deepen), [ev, lab, deepen])
  return (
    <div className="counters">
      <h3>Closest deals they might take</h3>
      {list.length === 0 && <p className="muted small">No version of this ask both helps you and has a fair chance of a yes. Try a different target.</p>}
      <ol>
        {list.map((c) => (
          <li key={c.trade.give.map((p) => p.id).join() + '>' + c.trade.get.map((p) => p.id).join()}>
            <button className="trade-item lift" onClick={() => onPick(c)}>
              <GradeMark grade={c.grade} size="sm" />
              <span className="ti-body">
                <span className="ti-line"><span className="muted">Give</span> {c.trade.give.map((p) => p.name).join(' + ')}</span>
                <span className="ti-line"><span className="muted">Get</span> {c.trade.get.map((p) => p.name).join(' + ')}</span>
                <span className="ti-meta">
                  {pct(c.acceptance)} accept, you {signed(c.me.delta)}/wk, title {signed(((c.title?.after ?? 0) - (c.title?.before ?? 0)) * 100)} pts
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function TradePreview({ ev, onPick }: { ev: TradeEval; onPick?: (e: TradeEval) => void }) {
  const { d, lab } = useEngineCtx()
  const partner = d.teams.find((t) => t.id === ev.trade.partnerId)!
  const v = verdict(ev.grade)
  const lines = tradeSummary(ev, d, lab)
  return (
    <GlassCard className="preview" live="polite">
      <div className="preview-top">
        <Side title="You give" players={ev.trade.give} />
        <div className="grade-col" key={ev.trade.give.map((p) => p.id).join() + ev.trade.get.map((p) => p.id).join()}>
          <GradeMark grade={ev.grade} />
          <span className={`verdict ${v.tone}`}>{v.word}</span>
        </div>
        <Side title={`You get from ${partner.name}`} players={ev.trade.get} />
      </div>
      {ev.acceptance < DECLINE_BELOW && (
        <p className="decline-flag" role="alert">
          They'd almost certainly decline ({pct(ev.acceptance)}). The grade assumes they say yes; their lineup would change by {signed(ev.partner.delta)} pts a week.
        </p>
      )}
      <div className="summary">
        {lines.map((l, i) => <p key={i}>{l}</p>)}
      </div>
      <div className="stat-grid">
        <div className={ev.me.regDelta >= 0 ? 'up' : 'down'}><small>Starting pts/wk, Weeks {d.meta.week + 1}–{d.meta.regularWeeks}</small><b>{signed(ev.me.regDelta)}</b><em>{fmt(ev.me.before.regular)} to {fmt(ev.me.after.regular)}</em></div>
        <div className={ev.me.poDelta >= 0 ? 'up' : 'down'}><small>Starting pts/wk, playoffs</small><b>{signed(ev.me.poDelta)}</b><em>{fmt(ev.me.before.playoff)} to {fmt(ev.me.after.playoff)}</em></div>
        {ev.title && <div className={ev.title.after >= ev.title.before ? 'up' : 'down'}><small>Title odds</small><b>{signed((ev.title.after - ev.title.before) * 100)} pts</b><em>{pct(ev.title.before, 1)} to {pct(ev.title.after, 1)}</em></div>}
        {ev.playoff && <div className={ev.playoff.after >= ev.playoff.before ? 'up' : 'down'}><small>Playoff odds</small><b>{signed((ev.playoff.after - ev.playoff.before) * 100)} pts</b><em>{pct(ev.playoff.before, 1)} to {pct(ev.playoff.after, 1)}</em></div>}
        <div><small>They accept (estimate)</small><b>{pct(ev.acceptance)}</b><em>their lineup {signed(ev.partner.delta)}/wk</em></div>
      </div>
      <RankShift ev={ev} />
      {onPick && ev.acceptance < 0.3 && <Counters ev={ev} onPick={onPick} />}
      {(ev.addsMe.length > 0 || ev.dropsMe.length > 0) && (
        <p className="muted small">
          Roster fit: {ev.addsMe.length ? `you'd add ${ev.addsMe.map((p) => p.name).join(', ')} from free agency` : ''}
          {ev.dropsMe.length ? `you'd drop ${ev.dropsMe.map((p) => p.name).join(', ')}` : ''}.
        </p>
      )}
    </GlassCard>
  )
}

function Builder({ onEval }: { onEval: (ev: TradeEval | null) => void }) {
  const { d, lab, deepen } = useEngineCtx()
  const me = d.meta.myTeamId
  const others = d.teams.filter((t) => t.id !== me)
  const [partner, setPartner] = useState(others[0].id)
  const [give, setGive] = useState<string[]>([])
  const [get, setGet] = useState<string[]>([])
  const mine = lab.rosters.get(me)!.filter((p) => p.slot !== 'IR').sort((a, b) => lab.v(b) - lab.v(a))
  const theirs = (lab.rosters.get(partner) ?? []).filter((p) => p.slot !== 'IR').sort((a, b) => lab.v(b) - lab.v(a))
  useEffect(() => setGet([]), [partner])
  const toggle = (arr: string[], set: (x: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id].slice(-3))
  const run = () => {
    const ev = lab.evaluate({ partnerId: partner, give: mine.filter((p) => give.includes(p.id)), get: theirs.filter((p) => get.includes(p.id)) })
    onEval(deepen(ev))
  }
  return (
    <GlassCard className="builder" id="trade-builder">
      <h2>Build a trade</h2>
      <label className="field">
        Trade with
        <select value={partner} onChange={(e) => setPartner(Number(e.target.value))}>
          {others.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <div className="pick-cols">
        <fieldset>
          <legend>You give (up to 3)</legend>
          {mine.map((p) => (
            <div key={p.id} className="pick" onClick={(e) => { if ((e.target as HTMLElement).closest('a, input')) return; toggle(give, setGive, p.id) }}>
              <input type="checkbox" checked={give.includes(p.id)} onChange={() => toggle(give, setGive, p.id)} aria-label={`Give ${p.name}`} />
              <PlayerLink id={p.id} name={p.name} /><small>{p.pos} {fmt(lab.v(p))}</small>
            </div>
          ))}
        </fieldset>
        <fieldset>
          <legend>You get (up to 3)</legend>
          {theirs.map((p) => (
            <div key={p.id} className="pick" onClick={(e) => { if ((e.target as HTMLElement).closest('a, input')) return; toggle(get, setGet, p.id) }}>
              <input type="checkbox" checked={get.includes(p.id)} onChange={() => toggle(get, setGet, p.id)} aria-label={`Get ${p.name}`} />
              <PlayerLink id={p.id} name={p.name} /><small>{p.pos} {fmt(lab.v(p))}</small>
            </div>
          ))}
        </fieldset>
      </div>
      <button className="primary" disabled={!give.length || !get.length} onClick={run}>Grade this trade</button>
    </GlassCard>
  )
}

function jumpBuilder() {
  const el = document.getElementById('trade-builder')
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  window.setTimeout(() => el.querySelector('select')?.focus(), reduce ? 0 : 280)
}

function reasonText(n: LineupNeed): string {
  if (n.reason === 'bye') return `bye week ${n.leaves.bye}`
  if (n.reason === 'injury') {
    const status = n.leaves.inj ? n.leaves.inj.toLowerCase().replaceAll('_', ' ') : 'injury'
    return n.leaves.playP != null ? `${status}, ${Math.round(n.leaves.playP * 100)}% to play` : status
  }
  return 'below the median starter'
}

type Tab = 'best' | '2for1' | '3for1' | 'reach' | '1for1'
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'best', label: 'Best', hint: 'Skill-position deals, ranked by the lineup score: weekly points plus 0.2 times the title-odds change. A quarterback target is one row, and only when the needs list is short a QB. Acceptance is an unvalidated estimate and does not set the order.' },
  { id: '2for1', label: '2-for-1', hint: 'You send two players for one better one. Every piece is a real player they would keep, and the open roster spot is valued as a typical free-agent pickup.' },
  { id: '3for1', label: '3-for-1', hint: 'Three for one, aimed only at players worth 9+ points a week. They must keep all three, so they drop two of their own.' },
  { id: 'reach', label: 'Long shots', hint: 'Consolidations that add 1.5+ starting points a week but that the other manager will probably turn down as offered. Use them as opening asks, then add to the package.' },
  { id: '1for1', label: '1-for-1', hint: 'Straight swaps. Skill positions fill the list. A quarterback target appears only when the needs list includes QB.' },
]

export function Trades() {
  const { d, trades, board, lab, progress } = useEngineCtx()
  const needs = useMemo(() => lineupNeeds(d), [d])
  const [tab, setTab] = useState<Tab>('best')
  const [sel, setSel] = useState<TradeEval | null>(null)
  const [custom, setCustom] = useState<TradeEval | null>(null)
  const list = !board ? null : tab === 'best' ? trades : board[tab]
  const current = custom ?? (sel && list?.includes(sel) ? sel : null) ?? list?.[0] ?? null
  const numbered = useMemo(() => (current ? [...current.trade.give, ...current.trade.get] : []), [current])
  useNumbered(numbered)
  const info = TABS.find((t) => t.id === tab)!
  return (
    <div className="screen trades" id="trades">
      <GlassCard className="needs-card" featured lean>
        <h2>Roster needs</h2>
        <p className="muted small">
          Each gap is weighted points per week in the best lineup, the same unit as the trade score. Playoff weeks count 1.5×.
          The name is the player who would leave that slot.
        </p>
        {needs.length === 0 ? (
          <p>No lineup gap at QB, RB, WR, TE, or flex.</p>
        ) : (
          <ul className="needs">
            {needs.map((n) => (
              <li key={`${n.slot}-${n.reason}-${n.leaves.id}`}>
                <span><b>{n.slot}</b> <PlayerLink id={n.leaves.id} name={n.leaves.name} /> would leave</span>
                <span>{signed(n.gap)} pts/wk · {reasonText(n)}</span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
      <GlassCard className="trade-list">
        <h2>Recommended trades</h2>
        <div className="seg seg-wrap" role="tablist" aria-label="Deal shape">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setSel(null); setCustom(null) }}>
              {t.label}
              {board && t.id !== 'best' && <span className="count">{board[t.id].length}</span>}
            </button>
          ))}
        </div>
        <p className="muted small">
          {board ? `Checked ${lab.searched.toLocaleString()} deals. ` : ''}{info.hint} Playoff weeks count 1.5×.
        </p>
        {!board && <Skeleton variant="rows" label={`Checking deals across 11 teams: ${progress.toLocaleString()} so far`} />}
        {list?.length === 0 && (
          <EmptyState title="No deal of this shape" body="Nothing both helps you and has a fair chance of a yes. Check back after waivers run, or build a trade yourself.">
            <p className="news-next"><button type="button" className="dest" onClick={jumpBuilder}>Build a trade</button><a className="dest" href="#waivers">Waivers</a></p>
          </EmptyState>
        )}
        <ol>
          {list?.map((ev) => {
            const partner = d.teams.find((t) => t.id === ev.trade.partnerId)!
            const active = current === ev
            return (
              <li key={ev.trade.partnerId + ev.trade.give.map((p) => p.id).join() + ev.trade.get.map((p) => p.id).join()}>
                <button className={`trade-item lift${active ? ' active' : ''}`} onClick={() => { setCustom(null); setSel(ev) }}>
                  <GradeMark grade={ev.grade} size="sm" />
                  <span className="ti-body">
                    <span className="ti-line"><span className="muted">Give</span> {ev.trade.give.map((p) => p.name).join(' + ')}</span>
                    <span className="ti-line"><span className="muted">Get</span> {ev.trade.get.map((p) => p.name).join(' + ')}</span>
                    <span className="ti-meta">
                      {tab === 'best' && <span className="kind">{KIND_LABEL[kindOf(ev.trade)]}</span>}
                      {partner.name}, {signed(ev.me.delta)} pts/wk, title {signed(((ev.title?.after ?? 0) - (ev.title?.before ?? 0)) * 100)} pts, {pct(ev.acceptance)} accept (estimate)
                    </span>
                    {ev.simpler && <span className="ti-simpler">{ev.simpler.trade.give.map((p) => p.name).join(' + ')} alone does about as well</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </GlassCard>
      <div className="trade-main">
        {current ? <TradePreview ev={current} onPick={(e) => { setCustom(e) }} /> : !board ? <GlassCard><Skeleton variant="card" label="Grading trades" /></GlassCard> : (
          <EmptyState title="Nothing to preview" body="This shape has no recommended deal. Switch tabs, or build a trade below.">
            <p className="news-next"><button type="button" className="dest" onClick={jumpBuilder}>Build a trade</button></p>
          </EmptyState>
        )}
        <Builder onEval={setCustom} />
      </div>
    </div>
  )
}
