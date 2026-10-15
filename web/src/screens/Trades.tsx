import { useEffect, useMemo, useState } from 'react'
import type { Player, Pos } from '../types'
import { useEngineCtx } from '../dataContext'
import { useNumbered } from '../focus'
import { DECLINE_BELOW, KIND_LABEL, kindOf, type TradeEval } from '../engine/trade'
import { tradeSummary, verdict, ordinal } from '../engine/summary'
import { Avatar, GradeMark, InjuryTag, fmt, pct, signed } from '../components/bits'

function Side({ title, players }: { title: string; players: Player[] }) {
  const { lab } = useEngineCtx()
  return (
    <div className="side">
      <h3>{title}</h3>
      {players.map((p) => (
        <div key={p.id} className="side-p">
          <Avatar p={p} size={72} />
          <div>
            <div className="pname">{p.name} <InjuryTag p={p} /></div>
            <div className="pmeta"><span>{p.pos}</span><span>{p.nfl}</span></div>
            <div className="pmeta"><span><b>{fmt(p.ppg)}</b> pts/g</span><span><b>{fmt(lab.v(p))}</b> ROS/wk</span></div>
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
    <table className="ranks-table">
      <caption>Your league rank by position</caption>
      <thead>
        <tr><th></th>{keys.map((k) => <th key={k}>{k}</th>)}</tr>
      </thead>
      <tbody>
        <tr><th>Now</th>{keys.map((k) => <td key={k}>{ordinal(ev.ranks!.before[k].rank)}</td>)}</tr>
        <tr>
          <th>After</th>
          {keys.map((k) => {
            const b = ev.ranks!.before[k].rank
            const a = ev.ranks!.after[k].rank
            return <td key={k} className={a < b ? 'up' : a > b ? 'down' : ''}>{ordinal(a)}</td>
          })}
        </tr>
      </tbody>
    </table>
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
            <button className="trade-item" onClick={() => onPick(c)}>
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
    <section className="panel preview" aria-live="polite">
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
        <div><small>Starting pts/wk, Weeks {d.meta.week + 1}–{d.meta.regularWeeks}</small><b>{fmt(ev.me.before.regular)} <span className="arrow">to</span> {fmt(ev.me.after.regular)}</b><em className={ev.me.regDelta >= 0 ? 'up' : 'down'}>{signed(ev.me.regDelta)}</em></div>
        <div><small>Starting pts/wk, playoffs</small><b>{fmt(ev.me.before.playoff)} <span className="arrow">to</span> {fmt(ev.me.after.playoff)}</b><em className={ev.me.poDelta >= 0 ? 'up' : 'down'}>{signed(ev.me.poDelta)}</em></div>
        {ev.title && <div><small>Title odds</small><b>{pct(ev.title.before, 1)} <span className="arrow">to</span> {pct(ev.title.after, 1)}</b><em className={ev.title.after >= ev.title.before ? 'up' : 'down'}>{signed((ev.title.after - ev.title.before) * 100)} pts</em></div>}
        {ev.playoff && <div><small>Playoff odds</small><b>{pct(ev.playoff.before, 1)} <span className="arrow">to</span> {pct(ev.playoff.after, 1)}</b><em className={ev.playoff.after >= ev.playoff.before ? 'up' : 'down'}>{signed((ev.playoff.after - ev.playoff.before) * 100)} pts</em></div>}
        <div><small>They accept (estimate)</small><b>{pct(ev.acceptance)}</b><em className="muted">their lineup {signed(ev.partner.delta)}/wk</em></div>
      </div>
      <RankShift ev={ev} />
      {onPick && ev.acceptance < 0.3 && <Counters ev={ev} onPick={onPick} />}
      {(ev.addsMe.length > 0 || ev.dropsMe.length > 0) && (
        <p className="muted small">
          Roster fit: {ev.addsMe.length ? `you'd add ${ev.addsMe.map((p) => p.name).join(', ')} from free agency` : ''}
          {ev.dropsMe.length ? `you'd drop ${ev.dropsMe.map((p) => p.name).join(', ')}` : ''}.
        </p>
      )}
    </section>
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
    <section className="panel builder">
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
            <label key={p.id} className="pick">
              <input type="checkbox" checked={give.includes(p.id)} onChange={() => toggle(give, setGive, p.id)} />
              <span>{p.name}</span><small>{p.pos} {fmt(lab.v(p))}</small>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>You get (up to 3)</legend>
          {theirs.map((p) => (
            <label key={p.id} className="pick">
              <input type="checkbox" checked={get.includes(p.id)} onChange={() => toggle(get, setGet, p.id)} />
              <span>{p.name}</span><small>{p.pos} {fmt(lab.v(p))}</small>
            </label>
          ))}
        </fieldset>
      </div>
      <button className="primary" disabled={!give.length || !get.length} onClick={run}>Grade this trade</button>
    </section>
  )
}

type Tab = 'best' | '2for1' | '3for1' | 'reach' | '1for1'
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'best', label: 'Best', hint: 'The strongest deals of any shape, ranked by how much each helps you times the chance they accept.' },
  { id: '2for1', label: '2-for-1', hint: 'You send two players for one better one. Every piece is a real player they would keep, and the open roster spot is valued as a typical free-agent pickup.' },
  { id: '3for1', label: '3-for-1', hint: 'Three for one, aimed only at players worth 9+ points a week. They must keep all three, so they drop two of their own.' },
  { id: 'reach', label: 'Long shots', hint: 'Consolidations that add 1.5+ starting points a week but that the other manager will probably turn down as offered. Use them as opening asks, then add to the package.' },
  { id: '1for1', label: '1-for-1', hint: 'Straight swaps.' },
]

export function Trades() {
  const { d, trades, board, lab, progress } = useEngineCtx()
  const [tab, setTab] = useState<Tab>('best')
  const [sel, setSel] = useState<TradeEval | null>(null)
  const [custom, setCustom] = useState<TradeEval | null>(null)
  const list = !board ? null : tab === 'best' ? trades : board[tab]
  const current = custom ?? (sel && list?.includes(sel) ? sel : null) ?? list?.[0] ?? null
  const numbered = useMemo(() => (current ? [...current.trade.give, ...current.trade.get] : []), [current])
  useNumbered(numbered)
  const info = TABS.find((t) => t.id === tab)!
  return (
    <div className="screen trades">
      <section className="panel trade-list">
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
        {!board && <p className="loading">Checking deals across 11 teams: {progress.toLocaleString()} so far</p>}
        {list?.length === 0 && <p>Nothing of this shape both helps you and has a fair chance of a yes. Check back after waivers run.</p>}
        <ol>
          {list?.map((ev) => {
            const partner = d.teams.find((t) => t.id === ev.trade.partnerId)!
            const active = current === ev
            return (
              <li key={ev.trade.partnerId + ev.trade.give.map((p) => p.id).join() + ev.trade.get.map((p) => p.id).join()}>
                <button className={`trade-item${active ? ' active' : ''}`} onClick={() => { setCustom(null); setSel(ev) }}>
                  <GradeMark grade={ev.grade} size="sm" />
                  <span className="ti-body">
                    <span className="ti-line"><span className="muted">Give</span> {ev.trade.give.map((p) => p.name).join(' + ')}</span>
                    <span className="ti-line"><span className="muted">Get</span> {ev.trade.get.map((p) => p.name).join(' + ')}</span>
                    <span className="ti-meta">
                      {tab === 'best' && <span className="kind">{KIND_LABEL[kindOf(ev.trade)]}</span>}
                      {partner.name}, {pct(ev.acceptance)} accept, title {signed(((ev.title?.after ?? 0) - (ev.title?.before ?? 0)) * 100)} pts
                    </span>
                    {ev.simpler && <span className="ti-simpler">{ev.simpler.trade.give.map((p) => p.name).join(' + ')} alone does about as well</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </section>
      <div className="trade-main">
        {current ? <TradePreview ev={current} onPick={(e) => { setCustom(e) }} /> : <section className="panel"><p className="loading">Grading trades</p></section>}
        <Builder onEval={setCustom} />
      </div>
    </div>
  )
}
