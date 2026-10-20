import { describe, expect, test } from 'vitest'
import { breakingRosterNews, type NewsItem } from './breaking'

const NOW = Date.parse('2026-10-18T20:00:00Z')

const roster = [
  { id: '16737', name: 'Mike Evans' },
  { id: '14880', name: 'Kirk Cousins' },
]

function item(over: Partial<NewsItem> & { headline: string }): NewsItem {
  return {
    id: 'fixture-1',
    summary: null,
    published: '2026-10-18T18:00:00Z',
    url: 'https://www.espn.com/nfl/story/_/id/fixture',
    teams: ['SF'],
    playerId: null,
    gameId: null,
    source: 'espn',
    ...over,
  }
}

describe('breaking roster injuries', () => {
  test('matches a fixture headline on my roster by id and by name', () => {
    const byId = item({
      headline: 'Mike Evans left the game with an Achilles injury',
      playerId: '16737',
    })
    const byName = item({
      id: 'fixture-2',
      headline: 'Mike Evans was carted off and ruled out',
      playerId: null,
    })
    const hits = breakingRosterNews([byId, byName], roster, NOW)
    expect(hits.map((h) => h.id)).toEqual(['fixture-1', 'fixture-2'])
  })

  test('ignores a star headline, a stale item, and a player who is not on the roster', () => {
    const star = item({
      headline: "Mike Evans stars in 49ers' win: 'Exactly why he's here'",
      playerId: '16737',
      published: '2026-10-12T04:00:00Z',
    })
    const stale = item({
      id: 'stale',
      headline: 'Mike Evans left the game with an Achilles injury',
      playerId: '16737',
      published: '2026-09-01T00:00:00Z',
    })
    const other = item({
      id: 'other',
      headline: 'CeeDee Lamb left the game with an Achilles injury',
      playerId: '4241389',
    })
    expect(breakingRosterNews([star, stale, other], roster, NOW)).toEqual([])
  })
})
