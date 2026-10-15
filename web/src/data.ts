import type { FantasyData } from './types'

declare const __INLINE_DATA__: boolean

/**
 * Dev and the repo build read public/data/fantasy.json (rewritten by `python -m fantasy.build`).
 * The published preview inlines a snapshot, photos included, so it works as one file.
 */
export async function loadData(): Promise<FantasyData> {
  if (__INLINE_DATA__) {
    const mods = import.meta.glob('./inline-data.json')
    const load = mods['./inline-data.json']
    if (load) return ((await load()) as { default: FantasyData }).default
  }
  const res = await fetch('data/fantasy.json', { cache: 'no-store' })
  if (!res.ok) throw new Error(`Couldn't load data/fantasy.json (${res.status}). Run python -m fantasy.build first.`)
  return res.json()
}
