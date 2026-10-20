import { useEffect, useRef, useState } from 'react'
import type { BoardGame } from '../board/normalize'
import { bubbleFacts, rowSpeed, scrimFor, shouldAnimate, tickerRows, trackOffset, type TickDirection } from '../board/ticker'

function Bubble({
  game,
  yours,
  selected,
  dim,
  tabbable,
  onSelect,
}: {
  game: BoardGame
  yours: boolean
  selected: boolean
  dim: boolean
  tabbable: boolean
  onSelect: (id: string) => void
}) {
  const facts = bubbleFacts(game)
  const scrim = scrimFor([game.away.color, game.home.color])
  const label = [
    `${game.away.name} ${facts.middle} ${game.home.name}`,
    facts.spread,
    facts.status,
    yours ? 'Your player is in this game' : '',
    selected ? 'Selected' : '',
  ].filter(Boolean).join('. ')
  return (
    <button
      type="button"
      className={['tick', facts.live ? 'is-live' : '', selected ? 'is-on' : '', dim ? 'is-dim' : ''].filter(Boolean).join(' ')}
      data-game-id={game.id}
      tabIndex={tabbable ? 0 : -1}
      aria-current={selected ? 'true' : undefined}
      aria-label={label}
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,${scrim}), rgba(0,0,0,${scrim})), linear-gradient(90deg, ${game.away.color}, ${game.home.color})`,
      }}
      onClick={() => onSelect(game.id)}
    >
      {yours && <i className="roster-mark" title="Your player is in this game" />}
      <span className="tick-line">
        <span className="away">{facts.away}</span>
        <span className="mid">{facts.middle}</span>
        <span className="home">{facts.home}</span>
      </span>
      <span className="tick-sub">
        {facts.spread ? <span className="spread">{facts.spread}</span> : null}
        {facts.status ? <span className="status">{facts.status}</span> : null}
      </span>
    </button>
  )
}

function Row({
  index,
  direction,
  games,
  selectedId,
  matches,
  query,
  yours,
  onSelect,
}: {
  index: number
  direction: TickDirection
  games: BoardGame[]
  selectedId: string | null
  matches: Set<string>
  query: string
  yours: (game: BoardGame) => boolean
  onSelect: (id: string) => void
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const segment = useRef<HTMLDivElement>(null)
  const copy = useRef<HTMLDivElement>(null)
  const paused = useRef(false)
  const travelled = useRef(0)
  const runningRef = useRef(false)
  const [running, setRunning] = useState(false)
  const gameKey = games.map((game) => game.id).join(',')
  const marked = query.trim().length > 0

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    let raf = 0
    let last = performance.now()
    let dead = false
    const frame = (now: number) => {
      if (dead) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const span = segment.current?.offsetWidth ?? 0
      const vp = viewport.current?.clientWidth ?? 0
      const animate = shouldAnimate(span, vp, mq.matches || document.hidden)
      const ready = animate && span > 0 && Boolean(copy.current)
      if (ready && !paused.current) travelled.current += rowSpeed(index, now / 1000) * dt
      const trackEl = track.current
      const vpEl = viewport.current
      if (trackEl && vpEl) {
        if (ready) {
          vpEl.classList.add('is-running')
          // Keep the window to one copy so the loop does not sit a second slate beside the first.
          if (span < vp) {
            vpEl.style.flex = '0 0 auto'
            vpEl.style.width = `${span}px`
          }
          trackEl.style.transform = `translate3d(${trackOffset(direction, travelled.current, span)}px,0,0)`
        } else {
          vpEl.classList.remove('is-running')
          vpEl.style.flex = ''
          vpEl.style.width = ''
          trackEl.style.transform = 'none'
          if (!animate) travelled.current = 0
        }
      }
      if (runningRef.current !== animate) {
        runningRef.current = animate
        setRunning(animate)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const onMotion = () => { travelled.current = 0 }
    mq.addEventListener('change', onMotion)
    return () => {
      dead = true
      cancelAnimationFrame(raf)
      mq.removeEventListener('change', onMotion)
    }
  }, [direction, gameKey, index])

  const showFocused = (button: HTMLButtonElement) => {
    const seg = segment.current
    const trackEl = track.current
    if (!seg || !trackEl || !runningRef.current) return
    const span = seg.offsetWidth
    if (!(span > 0)) return
    const left = button.offsetLeft
    travelled.current = direction === 'left' ? left : (span - (left % span)) % span
    trackEl.style.transform = `translate3d(${trackOffset(direction, travelled.current, span)}px,0,0)`
  }

  const fixed = games.filter((game) => game.state === 'in')
  const moving = games.filter((game) => game.state !== 'in')
  const bubbles = (list: BoardGame[], tabbable: boolean) => list.map((game) => (
    <Bubble
      key={game.id}
      game={game}
      yours={yours(game)}
      selected={game.id === selectedId}
      dim={marked && !matches.has(game.id) && game.id !== selectedId}
      tabbable={tabbable}
      onSelect={onSelect}
    />
  ))

  const scroller = moving.length > 0 && (
    <div
      className="ticker-viewport"
      ref={viewport}
      data-direction={direction}
      onPointerEnter={() => { paused.current = true }}
      onPointerLeave={() => { paused.current = false }}
      onFocus={(event) => {
        paused.current = true
        if (event.target instanceof HTMLButtonElement) showFocused(event.target)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) paused.current = false
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
        const buttons = [...(segment.current?.querySelectorAll('button') ?? [])]
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (at < 0) return
        const next = buttons[at + (event.key === 'ArrowRight' ? 1 : -1)]
        if (!next) return
        event.preventDefault()
        next.focus()
      }}
    >
      <div className="ticker-track" ref={track}>
        {direction === 'right' && running && (
          <div className="ticker-seg" aria-hidden="true" ref={copy}>{bubbles(moving, false)}</div>
        )}
        <div className="ticker-seg" ref={segment}>{bubbles(moving, true)}</div>
        {direction === 'left' && running && (
          <div className="ticker-seg" aria-hidden="true" ref={copy}>{bubbles(moving, false)}</div>
        )}
      </div>
    </div>
  )

  return (
    <div className="ticker-row">
      {fixed.length > 0 && <div className="ticker-fixed">{bubbles(fixed, true)}</div>}
      {scroller}
    </div>
  )
}

export function GameTicker({
  games,
  selectedId,
  matches,
  query,
  yours,
  onSelect,
}: {
  games: BoardGame[]
  selectedId: string | null
  matches: Set<string>
  query: string
  yours: (game: BoardGame) => boolean
  onSelect: (id: string) => void
}) {
  const rows = tickerRows(games)
  if (!rows.length) return null
  return (
    <div className="ticker" data-ticker-rows={rows.length} aria-label="This week's games">
      {rows.map((row) => (
        <Row
          key={row.index}
          index={row.index}
          direction={row.direction}
          games={row.games}
          selectedId={selectedId}
          matches={matches}
          query={query}
          yours={yours}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
