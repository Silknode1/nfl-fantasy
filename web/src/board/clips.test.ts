import { describe, expect, test } from 'vitest'
import {
  clipKind,
  clipListFrom,
  clipSearchPath,
  gameClipQuery,
  nflWeekStart,
  parseSearch,
  rankClips,
  readSignals,
  signalFrom,
  teamClipQuery,
  writeSignal,
  youtubeResultsHref,
  type ClipResult,
} from './clips'

function memoryStore(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => map.clear(),
    key: () => null,
    get length() { return map.size },
  }
}

describe('clip queries', () => {
  test('clip query strings match the spec exactly', () => {
    expect(gameClipQuery('San Francisco 49ers', 'Washington Commanders', 6)).toBe('San Francisco 49ers vs Washington Commanders week 6 preview')
    expect(teamClipQuery('Buffalo Bills', 6)).toBe('Buffalo Bills Football week 6')
    expect(youtubeResultsHref('Buffalo Bills Football week 6')).toBe('https://www.youtube.com/results?search_query=Buffalo%20Bills%20Football%20week%206')
  })

  test('the week starts the Tuesday before the first kickoff', () => {
    expect(nflWeekStart(['2026-10-16T00:15:00Z', '2026-10-18T17:00:00Z', '2026-10-20T00:15:00Z'])).toBe('2026-10-13T08:00:00.000Z')
    expect(nflWeekStart(['2026-10-13T09:00:00Z'])).toBe('2026-10-13T08:00:00.000Z')
    expect(nflWeekStart(['2026-10-13T07:00:00Z'])).toBe('2026-10-06T08:00:00.000Z')
    expect(nflWeekStart([])).toBeNull()
  })

  test('the proxy path asks for three videos published this week', () => {
    const path = clipSearchPath('Buffalo Bills Football week 6', '2026-10-13T08:00:00.000Z')
    const url = new URL(path, 'http://localhost')
    expect(url.pathname).toBe('/yt/search')
    expect(url.searchParams.get('q')).toBe('Buffalo Bills Football week 6')
    expect(url.searchParams.get('publishedAfter')).toBe('2026-10-13T08:00:00.000Z')
    expect(url.searchParams.get('maxResults')).toBe('3')
  })
})

describe('clip list', () => {
  test('no key is the honest empty state, not a made-up list', () => {
    expect(clipListFrom({ configured: false })).toEqual({ status: 'no-key' })
    expect(clipListFrom(null)).toEqual({ status: 'unavailable' })
    expect(clipListFrom({ configured: true, error: 'quota' })).toEqual({ status: 'error', message: 'quota' })
  })

  test('reads real search items and keeps at most three', () => {
    const item = (id: string, title: string) => ({ id: { kind: 'youtube#video', videoId: id }, snippet: { title, channelTitle: 'NFL', publishedAt: '2026-10-14T12:00:00Z' } })
    const raw = { configured: true, items: [item('aaaaaaaaaaa', 'A &amp; B'), item('bbbbbbbbbbb', 'B'), { id: { kind: 'youtube#channel' } }, item('ccccccccccc', 'C'), item('ddddddddddd', 'D')] }
    expect(parseSearch(raw)).toHaveLength(4)
    const state = clipListFrom(raw)
    expect(state.status).toBe('ok')
    if (state.status === 'ok') {
      expect(state.items.map((c) => c.videoId)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'])
      expect(state.items[0]!.title).toBe('A & B')
    }
  })

  test('a pasted link pulls its channel, then its kind, to the top and says why', () => {
    const results: ClipResult[] = [
      { videoId: 'aaaaaaaaaaa', title: '49ers vs Commanders Highlights', channelTitle: 'NFL', publishedAt: null },
      { videoId: 'bbbbbbbbbbb', title: 'Commanders film breakdown', channelTitle: 'Film Room', publishedAt: null },
      { videoId: 'ccccccccccc', title: 'Week 6 preview', channelTitle: 'Other', publishedAt: null },
    ]
    expect(rankClips(results, []).map((c) => c.because)).toEqual([null, null, null])
    const ranked = rankClips(results, [signalFrom({ channelTitle: 'Film Room', title: 'Bills All-22 breakdown' })])
    expect(ranked[0]!.videoId).toBe('bbbbbbbbbbb')
    expect(ranked[0]!.because).toContain('Same channel')
    const byKind = rankClips(results, [signalFrom({ channelTitle: 'Somebody', title: 'Bills at Chiefs preview' })])
    expect(byKind[0]!.videoId).toBe('ccccccccccc')
    expect(byKind[0]!.because).toContain('preview')
  })

  test('signals are remembered per game or team', () => {
    const store = memoryStore()
    writeSignal(store, 'game:1', { channelTitle: 'NFL', kind: 'highlights' })
    writeSignal(store, 'game:1', { channelTitle: 'NFL', kind: 'highlights' })
    writeSignal(store, 'team:BUF', { channelTitle: 'Bills', kind: 'press' })
    expect(readSignals(store, 'game:1')).toEqual([{ channelTitle: 'NFL', kind: 'highlights' }])
    expect(readSignals(store, 'team:BUF')).toEqual([{ channelTitle: 'Bills', kind: 'press' }])
    expect(readSignals(store, 'game:2')).toEqual([])
    expect(clipKind('Postgame press conference')).toBe('press')
    expect(clipKind('Random vlog')).toBe('other')
  })
})
