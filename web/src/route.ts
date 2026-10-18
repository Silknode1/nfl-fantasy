export const SCREEN_IDS = ['team', 'trades', 'waivers', 'pulse', 'league', 'espn', 'plan', 'news', 'games'] as const
export type ScreenId = (typeof SCREEN_IDS)[number]

export type Route =
  | { kind: 'screen'; id: ScreenId }
  | { kind: 'player'; id: string }
  | { kind: 'nfl'; abbr: string }
  | { kind: 'game'; id: string }

const SCREENS = new Set<string>(SCREEN_IDS)

/** Hash routes. Empty and `#team` are My team. `#team/BUF` is the NFL club. Games stays a screen, last in the nav. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '').trim()
  if (!raw) return { kind: 'screen', id: 'team' }
  let parts: string[]
  try {
    parts = raw.split('/').map((part) => decodeURIComponent(part))
  } catch {
    return { kind: 'screen', id: 'team' }
  }
  const head = parts[0] ?? ''
  if (head === 'player' && parts[1]) return { kind: 'player', id: parts[1] }
  if (head === 'team' && parts[1] && /^[A-Za-z]{2,4}$/.test(parts[1])) return { kind: 'nfl', abbr: parts[1].toUpperCase() }
  if (head === 'game' && parts[1]) return { kind: 'game', id: parts[1] }
  if (head === 'news' && parts.length === 1) return { kind: 'screen', id: 'news' }
  if (SCREENS.has(head) && parts.length === 1) return { kind: 'screen', id: head as ScreenId }
  return { kind: 'screen', id: 'team' }
}

/** Which nav item is current. A game page keeps Games lit. A player or club page lights none. */
export function navCurrent(route: Route): ScreenId | null {
  if (route.kind === 'screen') return route.id
  if (route.kind === 'game') return 'games'
  return null
}

/**
 * Linear hash stack. Going to the previous entry pops (browser back or the Back control).
 * Any other hash pushes. The same hash twice is a no-op.
 */
export function stepStack(stack: string[], hash: string): string[] {
  const next = hash || '#team'
  if (stack.length >= 2 && stack[stack.length - 2] === next) return stack.slice(0, -1)
  if (stack[stack.length - 1] === next) return stack
  return [...stack, next].slice(-24)
}

export function backHash(stack: string[], fallback: string): string {
  const safe = fallback.startsWith('#') ? fallback : `#${fallback}`
  if (stack.length >= 2) return stack[stack.length - 2]!
  return safe
}
