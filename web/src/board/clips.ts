/**
 * Clip search for the Games page and the club page. The query strings are fixed.
 * Listing real videos needs the YouTube Data API through the dev server proxy; without a key
 * the list stays empty and says so. Nothing here makes up a video id or a title.
 */

export interface ClipResult {
  videoId: string
  title: string
  channelTitle: string
  publishedAt: string | null
}

export interface ClipSignal {
  channelTitle: string | null
  kind: ClipKind
}

export type ClipKind = 'highlights' | 'preview' | 'analysis' | 'press' | 'other'

export interface RankedClip extends ClipResult {
  because: string | null
}

export type ClipListState =
  | { status: 'no-key' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ok'; items: ClipResult[] }

export const TOP_CLIPS = 3

export function gameClipQuery(home: string, away: string, week: number): string {
  return `${home} vs ${away} week ${week} preview`
}

export function teamClipQuery(team: string, week: number): string {
  return `${team} Football week ${week}`
}

export function youtubeResultsHref(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

/**
 * Start of the NFL week that holds these kickoffs: 08:00 UTC on the Tuesday before the
 * earliest kickoff (about 4am Eastern, after Monday night ends).
 */
export function nflWeekStart(kickoffs: string[]): string | null {
  const times = kickoffs.map((iso) => Date.parse(iso)).filter((t) => Number.isFinite(t))
  if (!times.length) return null
  const first = new Date(Math.min(...times))
  const day = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate(), 8))
  const back = (day.getUTCDay() - 2 + 7) % 7
  day.setUTCDate(day.getUTCDate() - back)
  if (day.getTime() > first.getTime()) day.setUTCDate(day.getUTCDate() - 7)
  return day.toISOString()
}

export function clipSearchPath(query: string, publishedAfter: string): string {
  const params = new URLSearchParams({ q: query, publishedAfter, maxResults: String(TOP_CLIPS) })
  return `/yt/search?${params.toString()}`
}

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>' }

function decode(text: string): string {
  return text.replace(/&(amp|quot|#39|lt|gt);/g, (m) => ENTITIES[m] ?? m)
}

/** YouTube Data API search.list items → results. Items without a video id are dropped. */
export function parseSearch(raw: unknown): ClipResult[] {
  const items = isRec(raw) && Array.isArray(raw.items) ? raw.items : []
  const out: ClipResult[] = []
  for (const item of items) {
    if (!isRec(item)) continue
    const id = isRec(item.id) ? str(item.id.videoId) : ''
    if (!/^[\w-]{11}$/.test(id)) continue
    const snip = isRec(item.snippet) ? item.snippet : {}
    out.push({
      videoId: id,
      title: decode(str(snip.title)) || 'Untitled video',
      channelTitle: decode(str(snip.channelTitle)),
      publishedAt: str(snip.publishedAt) || null,
    })
  }
  return out
}

/** The proxy's answer → a list state. A proxy that says no key is the honest empty state. */
export function clipListFrom(raw: unknown): ClipListState {
  if (!isRec(raw)) return { status: 'unavailable' }
  if (raw.configured === false) return { status: 'no-key' }
  if (typeof raw.error === 'string' && raw.error) return { status: 'error', message: raw.error }
  return { status: 'ok', items: parseSearch(raw).slice(0, TOP_CLIPS) }
}

export function clipKind(title: string): ClipKind {
  const t = title.toLowerCase()
  if (/\bhighlights?\b|\bevery (touchdown|td)\b/.test(t)) return 'highlights'
  if (/\bpreview\b|\bpredictions?\b|\bpicks?\b|\bkeys to\b/.test(t)) return 'preview'
  if (/\bbreakdown\b|\bfilm\b|\banalysis\b|\ball-22\b|\bexplained\b/.test(t)) return 'analysis'
  if (/\bpress conference\b|\bpresser\b|\bpostgame\b|\bmedia availability\b/.test(t)) return 'press'
  return 'other'
}

export function signalFrom(meta: { channelTitle?: string | null; title?: string | null }): ClipSignal {
  return { channelTitle: meta.channelTitle?.trim() || null, kind: clipKind(meta.title ?? '') }
}

/**
 * Pasted links are a hint for what belongs here: results from the same channel first,
 * then the same kind of video, otherwise YouTube's order. Each move names its reason.
 */
export function rankClips(results: ClipResult[], signals: ClipSignal[]): RankedClip[] {
  const channels = new Set(signals.map((s) => s.channelTitle?.toLowerCase()).filter((c): c is string => Boolean(c)))
  const kinds = new Set<ClipKind>(signals.map((s) => s.kind).filter((k) => k !== 'other'))
  const scored = results.map((clip, i) => {
    const sameChannel = clip.channelTitle && channels.has(clip.channelTitle.toLowerCase())
    const kind = clipKind(clip.title)
    const sameKind = kinds.has(kind)
    const because = sameChannel
      ? `Same channel as a link you pasted (${clip.channelTitle})`
      : sameKind ? `Same kind as a link you pasted (${kind})` : null
    return { clip: { ...clip, because }, score: (sameChannel ? 2 : 0) + (sameKind ? 1 : 0), i }
  })
  scored.sort((a, b) => b.score - a.score || a.i - b.i)
  return scored.map((row) => row.clip).slice(0, TOP_CLIPS)
}

const SIGNAL_KEY = 'desk-clip-signals'

export function readSignals(store: Pick<Storage, 'getItem'> | null, context: string): ClipSignal[] {
  try {
    const raw = store?.getItem(SIGNAL_KEY)
    const all: unknown = raw ? JSON.parse(raw) : {}
    const list = isRec(all) && Array.isArray(all[context]) ? all[context] as unknown[] : []
    return list.filter(isRec).map((row) => ({
      channelTitle: str(row.channelTitle) || null,
      kind: (['highlights', 'preview', 'analysis', 'press', 'other'] as const).find((k) => k === row.kind) ?? 'other',
    }))
  } catch {
    return []
  }
}

export function writeSignal(store: Pick<Storage, 'getItem' | 'setItem'> | null, context: string, signal: ClipSignal): ClipSignal[] {
  const current = readSignals(store, context)
  const key = `${signal.channelTitle ?? ''}|${signal.kind}`
  const next = [signal, ...current.filter((s) => `${s.channelTitle ?? ''}|${s.kind}` !== key)].slice(0, 8)
  try {
    const raw = store?.getItem(SIGNAL_KEY)
    const all: unknown = raw ? JSON.parse(raw) : {}
    const base = isRec(all) ? all : {}
    store?.setItem(SIGNAL_KEY, JSON.stringify({ ...base, [context]: next }))
  } catch {
    /* private mode: the signal lasts for this view only */
  }
  return next
}
