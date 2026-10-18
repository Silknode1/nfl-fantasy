import { backHash, stepStack } from './route'

const KEY = 'fantasy-desk-stack'

export function readStack(): string[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || '[]') as unknown
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function noteHash(hash: string): string[] {
  const next = stepStack(readStack(), hash || '#team')
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode: Back falls through to the fallback */
  }
  return next
}

export function goBack(fallback: string) {
  const target = backHash(readStack(), fallback)
  const current = window.location.hash || '#team'
  window.location.hash = target === current ? fallback : target
}
