import { describe, expect, test } from 'vitest'
import snapshot from '../../public/data/scoreboard.json'
import { matchGame, normalizeScoreboard, type BoardGame } from './normalize'
import { commitTarget, liveFirst, matchingIds, searchView } from './search'

const SF_WSH = '401873008'

function weekWithLiveNiners(): BoardGame[] {
  const board = normalizeScoreboard(snapshot, '2026-10-19T23:00:00Z')
  return board.games.map((game) => (game.id === SF_WSH
    ? { ...game, state: 'in', detail: '3:12 - 3rd', away: { ...game.away, score: 17 }, home: { ...game.home, score: 14 } }
    : game))
}

function typed(text: string): string[] {
  const out: string[] = []
  for (let i = 1; i <= text.length; i++) out.push(text.slice(0, i))
  for (let i = text.length - 1; i >= 0; i--) out.push(text.slice(0, i))
  return out
}

describe('search on the games page', () => {
  test('clearing search keeps every game and the selected live game', () => {
    const games = weekWithLiveNiners()
    expect(games).toHaveLength(14)
    const selected = commitTarget(games, 'san francisco')
    expect(selected).toBe(SF_WSH)
    for (const query of typed('san francisco')) {
      const view = searchView(games, query, selected)
      expect(view.games).toHaveLength(14)
      expect(view.games.some((game) => game.id === SF_WSH)).toBe(true)
      expect(view.selectedId).toBe(SF_WSH)
    }
    const cleared = searchView(games, '', selected)
    expect(cleared.matches.size).toBe(0)
    expect(cleared.games[0]!.id).toBe(SF_WSH)
  })

  test('regression: a partial query on the way back to empty names a different game first', () => {
    // The old page selected board.games.find(matchGame) on every keystroke. Deleting
    // "san francisco" passes through "s", which names Seattle first, so the live
    // 49ers game lost the selection. searchView never changes the selection.
    const games = weekWithLiveNiners()
    const kickoffOrder = [...games].sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    expect(kickoffOrder.find((game) => matchGame(game, 's'))!.id).not.toBe(SF_WSH)
    expect(searchView(games, 's', SF_WSH).selectedId).toBe(SF_WSH)
  })

  test('a query marks games and leaves the rest of the week on the page', () => {
    const games = weekWithLiveNiners()
    const marks = matchingIds(games, 'WSH')
    expect([...marks]).toEqual([SF_WSH])
    expect(searchView(games, 'WSH', null).games).toHaveLength(14)
    expect(matchingIds(games, '   ').size).toBe(0)
    expect(commitTarget(games, '')).toBeNull()
    expect(commitTarget(games, 'zzz')).toBeNull()
  })

  test('a selection that is not on the board is dropped, not guessed', () => {
    const games = weekWithLiveNiners()
    expect(searchView(games, '', 'not-a-game').selectedId).toBeNull()
  })

  test('live games sort ahead of upcoming and final games', () => {
    const games = weekWithLiveNiners()
    const order = liveFirst(games)
    expect(order[0]!.id).toBe(SF_WSH)
    expect(order[order.length - 1]!.state).toBe('post')
  })
})
