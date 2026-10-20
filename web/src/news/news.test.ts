import { describe, expect, test } from 'vitest'
import { previewText, sentences } from './preview'
import { DATE_LABEL, filterNews, newsKind, POPULARITY_LABEL, popularityScore, UNTAGGED_RULE, type NewsSortable, type PopularityPlayer } from './feed'

const words = (s: string) => s.toLowerCase().match(/[a-z0-9']+/g) ?? []

describe('preview', () => {
  test('trims a long feed to the first 2–4 sentences and adds no words', () => {
    const body = 'Alpha scored twice. Beta sat out. Gamma left early. Delta returned punches. Epsilon watched. Zeta finished the drive.'
    const preview = previewText(body)
    expect(preview).toBeTruthy()
    const n = sentences(preview!).length
    expect(n).toBeGreaterThanOrEqual(2)
    expect(n).toBeLessThanOrEqual(4)
    expect(preview).toBe('Alpha scored twice. Beta sat out. Gamma left early. Delta returned punches.')
    for (const word of words(preview!)) expect(words(body)).toContain(word)
    expect(preview).not.toContain('Epsilon')
    expect(preview).not.toContain('Zeta')
  })

  test('keeps two or three sentences whole', () => {
    expect(previewText('One landed. Two landed.')).toBe('One landed. Two landed.')
    expect(sentences(previewText('One landed. Two landed. Three landed.')!)).toHaveLength(3)
  })

  test('does not invent a second sentence when the feed has one', () => {
    const preview = previewText('Only one sentence is in the feed.')
    expect(sentences(preview!)).toHaveLength(1)
    expect(preview).toBe('Only one sentence is in the feed.')
  })

  test('does not fabricate text for a headline-only item', () => {
    expect(previewText(null, 'Only the headline')).toBeNull()
    expect(previewText('   ', 'Only the headline')).toBeNull()
    expect(previewText('Only the headline', 'Only the headline')).toBeNull()
    expect(previewText('only   the headline', 'Only the headline')).toBeNull()
  })

  test('keeps decimals and initials inside a sentence', () => {
    const body = 'J.K. Dobbins gained 3.5 yards a carry. He practiced fully on Wednesday. The club listed him as questionable. Coaches still like the role. Depth behind him is thin.'
    const preview = previewText(body)!
    expect(sentences(preview)).toHaveLength(4)
    expect(preview.startsWith('J.K. Dobbins gained 3.5 yards a carry.')).toBe(true)
    expect(preview).not.toContain('Depth behind')
  })
})

describe('classification', () => {
  test('an untagged item is team news, and a player tag wins', () => {
    expect(newsKind({ playerId: null })).toBe('team')
    expect(newsKind(item({ id: 'bare', teams: [] }))).toBe('team')
    expect(newsKind(item({ id: 'clubs', teams: ['BUF', 'KC'] }))).toBe('team')
    expect(newsKind({ playerId: 'p1' })).toBe('player')
    expect(newsKind(item({ id: 'both', playerId: 'p1', teams: ['BUF'] }))).toBe('player')
    expect(UNTAGGED_RULE).toMatch(/no player and no team/i)
  })
})

const players: PopularityPlayer[] = [
  { id: 'low', own: 10, adds: 500 },
  { id: 'high-quiet', own: 90, adds: 0 },
  { id: 'high-hot', own: 90, adds: 1000 },
  { id: 'zero', own: 0, adds: 0 },
]

function item(partial: Partial<NewsSortable> & Pick<NewsSortable, 'id'>): NewsSortable {
  return { published: null, playerId: null, teams: [], ...partial }
}

describe('popularity and date', () => {
  test('rostered percent leads, Sleeper adds break ties, and no-signal items sort last', () => {
    const items = [
      item({ id: 'none', published: '2026-10-18T00:00:00Z' }),
      item({ id: 'missing', playerId: 'not-in-file', published: '2026-10-19T00:00:00Z' }),
      item({ id: 'low', playerId: 'low', published: '2026-10-01T00:00:00Z' }),
      item({ id: 'quiet', playerId: 'high-quiet' }),
      item({ id: 'hot', playerId: 'high-hot', published: '2026-10-02T00:00:00Z' }),
      item({ id: 'zero', playerId: 'zero', published: '2026-10-03T00:00:00Z' }),
    ]
    expect(popularityScore(items[0]!, players)).toBeNull()
    expect(popularityScore(items[1]!, players)).toBeNull()
    expect(popularityScore(items[5]!, players)).toEqual({ rostered: 0, adds: 0 })
    expect(filterNews(items, 'popularity', players).map((row) => row.id)).toEqual(['hot', 'quiet', 'low', 'zero', 'missing', 'none'])
    expect(POPULARITY_LABEL).toMatch(/rostered/i)
    expect(POPULARITY_LABEL).toMatch(/Sleeper adds/i)
    expect(POPULARITY_LABEL).toMatch(/no signal/i)
    expect(items.map((row) => row.id)).toEqual(['none', 'missing', 'low', 'quiet', 'hot', 'zero'])
  })

  test('date is newest first and undated items follow', () => {
    const items = [
      item({ id: 'old', published: '2026-10-01T00:00:00Z', playerId: 'low' }),
      item({ id: 'new', published: '2026-10-18T12:00:00Z' }),
      item({ id: 'blank', published: null, teams: ['KC'] }),
      item({ id: 'bad', published: 'not-a-date' }),
      item({ id: 'mid', published: '2026-10-10T00:00:00Z', playerId: 'high-hot', teams: ['BUF'] }),
    ]
    expect(filterNews(items, 'date', players).map((row) => row.id)).toEqual(['new', 'mid', 'old', 'bad', 'blank'])
    expect(DATE_LABEL).toMatch(/Newest first/)
  })

  test('player and team filters follow the tag, with untagged items on the team side', () => {
    const items = [
      item({ id: 'player', playerId: 'low', teams: ['BUF'], published: '2026-10-02T00:00:00Z' }),
      item({ id: 'club', teams: ['KC'], published: '2026-10-03T00:00:00Z' }),
      item({ id: 'bare', published: '2026-10-04T00:00:00Z' }),
    ]
    expect(filterNews(items, 'player', players).map((row) => row.id)).toEqual(['player'])
    expect(filterNews(items, 'team', players).map((row) => row.id)).toEqual(['bare', 'club'])
  })
})
