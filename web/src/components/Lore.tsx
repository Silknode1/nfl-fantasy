import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { FantasyData } from '../types'
import { coincidenceLine, gapLine, quietLine, scoutLine, sectionKey } from '../lore'

const SEEN = 'desk-seen'

function readSeen(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SEEN) || '[]') as unknown
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function useDeskLore(kind: string, id: string, data: FantasyData | null, tradeIds: string[]) {
  const [quietOpen, setQuietOpen] = useState(false)
  const [coinOpen, setCoinOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [gapOpen, setGapOpen] = useState(false)
  const [explored, setExplored] = useState(false)
  const taps = useRef<number[]>([])

  useEffect(() => {
    const key = sectionKey(kind, id)
    const keys = readSeen()
    const next = keys.includes(key) ? keys : [...keys, key].slice(-16)
    try {
      sessionStorage.setItem(SEEN, JSON.stringify(next))
    } catch {
      /* private mode: the notebook simply waits until next time */
    }
    setExplored(next.length >= 3)
  }, [kind, id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuietOpen(false)
        setCoinOpen(false)
        setNoteOpen(false)
        setGapOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let seq = ''
    let timer = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const target = e.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      }
      const k = e.key.toLowerCase()
      if (!/^[a-z]$/.test(k)) {
        seq = ''
        return
      }
      seq = (seq + k).slice(-3)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { seq = '' }, 1200)
      if (seq === 'gap') {
        seq = ''
        setGapOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
    }
  }, [])

  const tapCoincidence = () => {
    const now = Date.now()
    taps.current = taps.current.filter((t) => now - t < 1600)
    taps.current.push(now)
    if (taps.current.length >= 3) {
      taps.current = []
      setCoinOpen(true)
    }
  }

  const quietText = data ? quietLine(data) : null
  const coinText = data ? coincidenceLine(data) : null
  const noteText = data ? scoutLine(data, tradeIds) : null
  const gapText = data ? gapLine(data) : null

  return {
    quietOpen,
    setQuietOpen,
    coinOpen,
    setCoinOpen,
    noteOpen,
    setNoteOpen,
    gapOpen,
    setGapOpen,
    explored,
    tapCoincidence,
    quietText,
    coinText,
    noteText,
    gapText,
  }
}

/** Squircle on the desk mark. Hover, long-press, or a tap. */
export function QuietDot({ open, onToggle }: { open: boolean; onToggle: (next: boolean) => void }) {
  const hold = useRef<number | null>(null)
  const fromHold = useRef(false)
  const clear = () => {
    if (hold.current != null) window.clearTimeout(hold.current)
    hold.current = null
  }
  const arm = (ms: number) => {
    clear()
    hold.current = window.setTimeout(() => {
      fromHold.current = true
      onToggle(true)
    }, ms)
  }
  return (
    <button
      type="button"
      className="quiet-dot"
      aria-label="Desk mark"
      aria-expanded={open}
      onMouseEnter={() => {
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) arm(640)
      }}
      onMouseLeave={clear}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') arm(520)
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fromHold.current) {
          fromHold.current = false
          return
        }
        onToggle(!open)
      }}
    >
      <i aria-hidden />
    </button>
  )
}

export function LoreLine({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <p className="lore-line" role="status">
      <span>{children}</span>
      <button type="button" className="ghost" onClick={onClose}>Close</button>
    </p>
  )
}
