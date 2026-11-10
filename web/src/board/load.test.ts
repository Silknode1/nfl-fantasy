import { describe, expect, test } from 'vitest'
import { scoreboardPath } from './load'

describe('scoreboard path', () => {
  test('asks ESPN for the league week instead of the week that just ended', () => {
    expect(scoreboardPath(10)).toBe('/espn/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=10')
    expect(scoreboardPath()).toBe('/espn/apis/site/v2/sports/football/nfl/scoreboard')
    expect(scoreboardPath(0)).toBe('/espn/apis/site/v2/sports/football/nfl/scoreboard')
  })
})
