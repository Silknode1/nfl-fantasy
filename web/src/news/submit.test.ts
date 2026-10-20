import { describe, expect, test } from 'vitest'
import type { NewsItem } from '../espn/parse'
import { sentences } from './preview'
import {
  createSubmission,
  inferDeskScope,
  mergeDeskNews,
  newsForGame,
  newsForPlayer,
  newsForTeam,
  readSubmissions,
  saveSubmission,
  submittedBreaking,
  toNewsItem,
} from './submit'

const words = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? []

const NOW = '2026-10-20T12:00:00Z'

function mem() {
  const box = new Map<string, string>()
  return {
    getItem: (key: string) => box.get(key) ?? null,
    setItem: (key: string, value: string) => { box.set(key, value) },
  }
}

function feedItem(partial: Partial<NewsItem> & Pick<NewsItem, 'id' | 'headline'>): NewsItem {
  return {
    summary: null,
    published: NOW,
    url: null,
    teams: [],
    playerId: null,
    gameId: null,
    source: 'espn',
    ...partial,
  }
}

describe('submit a link', () => {
  test('a submitted league URL appears in the news list', () => {
    const made = createSubmission({
      url: 'https://example.com/week-notes',
      title: 'Week notes',
      pasted: '',
      scope: 'league',
      team: null,
      playerId: null,
      now: NOW,
    })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const store = mem()
    saveSubmission(store, made.submission)
    expect(readSubmissions(store).map((row) => row.url)).toEqual(['https://example.com/week-notes'])
    const list = mergeDeskNews([], [toNewsItem(made.submission)])
    expect(list.map((item) => item.url)).toContain('https://example.com/week-notes')
    expect(list[0]?.source).toBe('desk')
    expect(made.submission.summary).toBeNull()
  })

  test('a player-scoped item appears for that player and not for a different player', () => {
    const made = createSubmission({
      url: 'https://example.com/rookie',
      title: 'Alex Rookie update',
      pasted: 'Alex Rookie practiced on Wednesday.',
      scope: 'player',
      team: 'TB',
      playerId: 'p9',
      players: [{ id: 'p9', name: 'Alex Rookie', nfl: 'TB' }],
      now: NOW,
    })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const item = toNewsItem(made.submission)
    expect(newsForPlayer([item], 'p9').map((row) => row.id)).toEqual([item.id])
    expect(newsForPlayer([item], 'p1')).toEqual([])
    expect(newsForTeam([item], 'TB')).toHaveLength(1)
    expect(newsForTeam([item], 'KC')).toEqual([])
  })

  test('the preview uses pasted sentences and does not invent any', () => {
    const pasted = 'Alpha sat out. Beta left early. Gamma watched the rest. Delta returned kicks. Epsilon stayed home.'
    const made = createSubmission({
      url: 'https://example.com/sunday',
      title: 'Sunday notes',
      pasted,
      scope: 'league',
      team: null,
      playerId: null,
      now: NOW,
    })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const summary = made.submission.summary
    expect(summary).toBeTruthy()
    expect(sentences(summary!).length).toBeGreaterThanOrEqual(2)
    expect(sentences(summary!).length).toBeLessThanOrEqual(4)
    for (const word of words(summary!)) expect(words(pasted)).toContain(word)
    expect(summary).not.toContain('Epsilon')
    expect(summary).toBe('Alpha sat out. Beta left early. Gamma watched the rest. Delta returned kicks.')
    const empty = createSubmission({
      url: 'https://example.com/headline-only',
      title: 'Only the headline',
      pasted: 'Only the headline',
      scope: 'league',
      team: null,
      playerId: null,
      now: NOW,
    })
    expect(empty.ok && empty.submission.summary).toBeNull()
  })

  test('a known feed URL is promoted instead of copied', () => {
    const feed = feedItem({
      id: 'espn1',
      headline: 'From the feed',
      url: 'https://www.espn.com/nfl/story/1',
      summary: 'One sentence is in the feed.',
    })
    const made = createSubmission({
      url: 'https://www.espn.com/nfl/story/1/',
      title: 'From the feed',
      pasted: '',
      scope: 'league',
      team: null,
      playerId: null,
      now: NOW,
    })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const merged = mergeDeskNews([feed], [toNewsItem(made.submission)])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('espn1')
    expect(merged[0]?.source).toBe('espn')
  })

  test('a team named in the paste shows on that game shelf', () => {
    const made = createSubmission({
      url: 'https://example.com/sf',
      title: 'Sunday notes',
      pasted: 'The SF defense sat starters.',
      scope: 'league',
      team: null,
      playerId: null,
      clubs: [{ abbr: 'SF', name: 'San Francisco 49ers' }],
      now: NOW,
    })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const item = toNewsItem(made.submission)
    expect(item.teams).toContain('SF')
    expect(newsForGame([item], ['SF', 'WSH'])).toHaveLength(1)
    expect(newsForGame([item], ['KC', 'BUF'])).toEqual([])
  })

  test('a submitted availability note surfaces for that rostered player only', () => {
    const made = createSubmission({
      url: 'https://example.com/avail',
      title: 'Availability',
      pasted: 'Alex Rookie is questionable after leaving practice.',
      scope: 'player',
      team: 'TB',
      playerId: 'p9',
      players: [{ id: 'p9', name: 'Alex Rookie', nfl: 'TB' }],
      now: NOW,
    })
    expect(made.ok).toBe(true)
    if (!made.ok) return
    const item = toNewsItem(made.submission)
    const now = Date.parse(NOW)
    expect(submittedBreaking([item], [{ id: 'p9', name: 'Alex Rookie' }], now)).toEqual([item])
    expect(submittedBreaking([item], [{ id: 'other', name: 'Other Person' }], now)).toEqual([])
  })

  test('scope can be inferred from a player name or left as league', () => {
    const players = [{ id: 'p9', name: 'Alex Rookie', nfl: 'TB' }]
    expect(inferDeskScope('Alex Rookie is questionable', players, []).playerId).toBe('p9')
    expect(inferDeskScope('Nothing about a roster', players, []).scope).toBe('league')
  })
})
