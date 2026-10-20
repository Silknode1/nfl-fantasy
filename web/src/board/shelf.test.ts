import { describe, expect, test } from 'vitest'
import type { NewsItem } from '../espn/parse'
import { filterNews, newsTeams, pinGameId, unpinGameId } from './shelf'

function news(id: string, headline: string, teams: string[], summary: string | null = null): NewsItem {
  return { id, headline, summary, published: null, url: null, teams, playerId: null, gameId: null, source: 'espn' }
}

const ITEMS = [
  news('1', 'Purdy throws for three', ['SF']),
  news('2', 'Commanders sign a kicker', ['WSH'], 'Special teams move'),
  news('3', 'League notes', []),
]

describe('shelf', () => {
  test('news filters by team and by text', () => {
    expect(filterNews(ITEMS, { team: '', text: '' })).toHaveLength(3)
    expect(filterNews(ITEMS, { team: 'sf', text: '' }).map((n) => n.id)).toEqual(['1'])
    expect(filterNews(ITEMS, { team: '', text: 'special' }).map((n) => n.id)).toEqual(['2'])
    expect(filterNews(ITEMS, { team: 'WSH', text: 'purdy' })).toEqual([])
    expect(newsTeams(ITEMS)).toEqual(['SF', 'WSH'])
  })

  test('pin game puts it on top once, unpin removes it', () => {
    expect(pinGameId([], 'a')).toEqual(['a'])
    expect(pinGameId(['a', 'b'], 'b')).toEqual(['b', 'a'])
    expect(unpinGameId(['a', 'b'], 'a')).toEqual(['b'])
  })
})
