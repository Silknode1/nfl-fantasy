import type { ReactNode } from 'react'
import { goBack } from '../deskHistory'

export function PlayerLink({ id, name, children }: { id: string; name: string; children?: ReactNode }) {
  return (
    <a className="player-link" href={`#player/${encodeURIComponent(id)}`}>
      {children ?? name}
    </a>
  )
}

export function TeamLink({ abbr, children }: { abbr: string; children?: ReactNode }) {
  const clean = abbr.trim().toUpperCase()
  if (!/^[A-Z]{2,4}$/.test(clean)) return <span>{children ?? abbr}</span>
  return (
    <a className="team-link" href={`#team/${clean}`}>
      {children ?? clean}
    </a>
  )
}

export function BackButton({ fallback, label = 'Back' }: { fallback: string; label?: string }) {
  return (
    <button type="button" className="ghost back" onClick={() => goBack(fallback)}>
      {label}
    </button>
  )
}
