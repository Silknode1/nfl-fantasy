import { describe, expect, test } from 'vitest'
import { backHash, navCurrent, parseRoute, stepStack } from './route'

describe('parseRoute', () => {
  test('empty hash is My team', () => {
    expect(parseRoute('')).toEqual({ kind: 'screen', id: 'team' })
    expect(parseRoute('#')).toEqual({ kind: 'screen', id: 'team' })
    expect(parseRoute('#team')).toEqual({ kind: 'screen', id: 'team' })
  })

  test('games stays a screen and news is a screen', () => {
    expect(parseRoute('#games')).toEqual({ kind: 'screen', id: 'games' })
    expect(parseRoute('#news')).toEqual({ kind: 'screen', id: 'news' })
  })

  test('player, NFL club, and game are destinations', () => {
    expect(parseRoute('#player/3918298')).toEqual({ kind: 'player', id: '3918298' })
    expect(parseRoute('#player/abc%2Fdef')).toEqual({ kind: 'player', id: 'abc/def' })
    expect(parseRoute('#team/buf')).toEqual({ kind: 'nfl', abbr: 'BUF' })
    expect(parseRoute('#game/401873005')).toEqual({ kind: 'game', id: '401873005' })
  })

  test('unknown hashes fall back to My team', () => {
    expect(parseRoute('#nope')).toEqual({ kind: 'screen', id: 'team' })
    expect(parseRoute('#team/')).toEqual({ kind: 'screen', id: 'team' })
    expect(parseRoute('#team/TOO-LONG')).toEqual({ kind: 'screen', id: 'team' })
  })

  test('nav current lights Games on a game page and nothing on a player', () => {
    expect(navCurrent({ kind: 'screen', id: 'games' })).toBe('games')
    expect(navCurrent({ kind: 'game', id: '1' })).toBe('games')
    expect(navCurrent({ kind: 'player', id: '1' })).toBeNull()
    expect(navCurrent({ kind: 'nfl', abbr: 'BUF' })).toBeNull()
  })
})

describe('stepStack', () => {
  test('pushes a new hash and pops when returning to the previous one', () => {
    const a = stepStack([], '#team')
    const b = stepStack(a, '#player/1')
    const c = stepStack(b, '#team/BUF')
    expect(c).toEqual(['#team', '#player/1', '#team/BUF'])
    expect(stepStack(c, '#player/1')).toEqual(['#team', '#player/1'])
    expect(backHash(c, '#team')).toBe('#player/1')
    expect(backHash(['#team'], '#news')).toBe('#news')
  })
})
