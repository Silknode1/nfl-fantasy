import { useEffect, useId, type CSSProperties, type ReactNode } from 'react'

export type StatTone = 'neutral' | 'up' | 'down' | 'accent'

export type StatItem = {
  key?: string
  label: string
  value: string
  title?: string
  tone?: StatTone
  className?: string
}

/** Translucent surface. Featured cards get a soft purple rim and a specular hairline. */
export function GlassCard({
  children,
  className = '',
  featured = false,
  lean = false,
  as: Tag = 'section',
  style,
  live,
  id,
}: {
  children: ReactNode
  className?: string
  featured?: boolean
  lean?: boolean
  as?: 'section' | 'article' | 'div'
  style?: CSSProperties
  live?: 'polite' | 'assertive'
  id?: string
}) {
  const cls = ['glass', 'panel', featured ? 'featured' : '', lean ? 'lean' : '', className].filter(Boolean).join(' ')
  return <Tag id={id} className={cls} style={style} aria-live={live}>{children}</Tag>
}

/** Related numbers, quiet labels, one strong value. */
export function StatGroup({ items, className = '', label }: { items: StatItem[]; className?: string; label?: string }) {
  return (
    <dl className={`stat-group ${className}`.trim()} aria-label={label}>
      {items.map((item) => (
        <div key={item.key ?? item.label} className={['stat', item.tone && item.tone !== 'neutral' ? item.tone : '', item.className ?? ''].filter(Boolean).join(' ')} title={item.title}>
          <dd>{item.value}</dd>
          <dt>{item.label}</dt>
        </div>
      ))}
    </dl>
  )
}

export function NewsCard({
  kicker,
  title,
  summary,
  featured = false,
  children,
}: {
  kicker: string
  title: ReactNode
  summary?: string | null
  featured?: boolean
  children?: ReactNode
}) {
  return (
    <article className={featured ? 'news-card glass lift featured' : 'news-card glass lift'}>
      <p className="news-kicker">{kicker}</p>
      <h3>{title}</h3>
      {summary ? <p>{summary}</p> : null}
      {children}
    </article>
  )
}

export function RankingRow({
  rank,
  name,
  value,
  meta,
  mine = false,
  tone = 'neutral',
}: {
  rank: number
  name: string
  value: string
  meta?: string
  mine?: boolean
  tone?: StatTone
}) {
  return (
    <div className={`rank-row${mine ? ' mine' : ''}`}>
      <span className="rank-idx">{rank}</span>
      <span className={`status-dot ${tone}`} aria-hidden />
      <span className="rank-name">{name}</span>
      {meta ? <span className="rank-meta">{meta}</span> : <span className="rank-meta" />}
      <b className={`rank-value${tone === 'up' ? ' up' : ''}`}>{value}</b>
    </div>
  )
}

/** Matchup shell used by the NFL board and the game page. */
export function MatchupCard({ open = false, children }: { open?: boolean; children: ReactNode }) {
  return <article className={open ? 'gcard matchup glass featured lift open' : 'gcard matchup glass lift'}>{children}</article>
}

export function PlayerCard({ children }: { children: ReactNode }) {
  return <article className="player-card lift">{children}</article>
}

/** Raycast-style hint. Hidden on small screens in CSS. */
export function ShortcutChip({ keys }: { keys: string }) {
  return <kbd className="shortcut">{keys}</kbd>
}

export function Skeleton({ label, variant = 'rows' }: { label: string; variant?: 'desk' | 'rows' | 'card' }) {
  return (
    <div className={`skeleton-block ${variant}`} role="status" aria-live="polite">
      <span className="sr">{label}</span>
      {variant === 'desk' ? (
        <>
          <span className="shimmer mast" />
          <span className="shimmer row" />
          <span className="shimmer row short" />
          <span className="shimmer row" />
        </>
      ) : variant === 'card' ? (
        <span className="shimmer card" />
      ) : (
        <>
          <span className="shimmer row" />
          <span className="shimmer row" />
          <span className="shimmer row short" />
        </>
      )}
    </div>
  )
}

export function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="empty glass">
      <h3>{title}</h3>
      <p>{body}</p>
      {children}
    </div>
  )
}

/** Light spring and a check. Particles only when `major` is set. */
export function SuccessMark({ label, major = false }: { label: string; major?: boolean }) {
  const id = useId()
  return (
    <p className={major ? 'success-mark major' : 'success-mark'} role="status" id={id}>
      <span className="check" aria-hidden>
        <svg viewBox="0 0 16 16" width="16" height="16">
          <path d="M3.2 8.4 6.3 11.4 12.8 4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {major && (
        <span className="particles" aria-hidden>
          <i /><i /><i /><i />
        </span>
      )}
      <span>{label}</span>
    </p>
  )
}

/** Desktop-only magnetic nudge on primary controls. Touch and reduced motion stay still. */
export function useMagneticHover() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const move = (e: MouseEvent) => {
      if (!fine.matches || reduce.matches) return
      const el = (e.target as HTMLElement | null)?.closest?.('.magnetic, button.primary') as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      const dx = Math.max(-6, Math.min(6, (e.clientX - (r.left + r.width / 2)) * 0.18))
      const dy = Math.max(-4, Math.min(4, (e.clientY - (r.top + r.height / 2)) * 0.18))
      el.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`
    }
    const out = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('.magnetic, button.primary') as HTMLElement | null
      if (!el) return
      const related = e.relatedTarget
      if (related instanceof Node && el.contains(related)) return
      el.style.translate = ''
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseout', out)
    return () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseout', out)
    }
  }, [])
}
