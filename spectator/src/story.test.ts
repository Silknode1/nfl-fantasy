import { describe, expect, test } from 'vitest'
import { normalizeScoreboard } from './board/normalize'
import { drivesFrom, headlinesFromScoreboard, headlinesFromSummary } from './story'

const slate = {
  season: { year: 2026 },
  week: { number: 6 },
  events: [
    {
      id: '401872996',
      date: '2026-10-18T13:30Z',
      shortName: 'HOU VS JAX',
      competitions: [
        {
          id: '401872996',
          date: '2026-10-18T13:30Z',
          status: { type: { state: 'pre', shortDetail: '10/18 - 9:30 AM EDT' } },
          competitors: [
            {
              homeAway: 'home',
              team: { id: '30', abbreviation: 'JAX', displayName: 'Jacksonville Jaguars', location: 'Jacksonville', color: '007487' },
              records: [{ type: 'total', summary: '4-1' }],
            },
            {
              homeAway: 'away',
              team: { id: '34', abbreviation: 'HOU', displayName: 'Houston Texans', location: 'Houston', color: '03202f' },
              records: [{ type: 'total', summary: '4-1' }],
            },
          ],
          odds: [
            {
              provider: { displayName: 'DraftKings' },
              spread: -2.5,
              overUnder: 41.5,
              pointSpread: {
                home: { close: { line: '-2.5', odds: '-120' } },
                away: { close: { line: '+2.5', odds: '+100' } },
              },
              total: {
                over: { close: { line: 'o41.5', odds: '-115' } },
                under: { close: { line: 'u41.5', odds: '-105' } },
              },
            },
          ],
        },
      ],
    },
    {
      id: '401872995',
      shortName: 'SEA @ DEN',
      competitions: [
        {
          status: { type: { state: 'post', shortDetail: 'Final/OT' } },
          headlines: [
            {
              type: 'Recap',
              shortLinkText: "Broncos beat the Seahawks 17-14 in OT",
              description: 'Denver found a way in overtime.',
            },
          ],
          competitors: [
            { homeAway: 'home', score: '17', winner: true, team: { id: '7', abbreviation: 'DEN', displayName: 'Denver Broncos' } },
            { homeAway: 'away', score: '14', winner: false, team: { id: '26', abbreviation: 'SEA', displayName: 'Seattle Seahawks' } },
          ],
        },
      ],
    },
  ],
}

describe('scoreboard game', () => {
  test('reads teams, kickoff, spread, and total', () => {
    const board = normalizeScoreboard(slate, '2026-10-18T06:00:00Z')
    const game = board.games.find((g) => g.id === '401872996')
    expect(game?.away.abbr).toBe('HOU')
    expect(game?.home.name).toBe('Jacksonville Jaguars')
    expect(game?.kickoff).toBe('2026-10-18T13:30Z')
    expect(game?.state).toBe('pre')
    expect(game?.quote?.homeSpread).toBe(-2.5)
    expect(game?.quote?.total).toBe(41.5)
    expect(game?.home.record).toBe('4-1')
  })
})

describe('drive and play', () => {
  test('reads a drive, its play, and an empty summary', () => {
    const drives = drivesFrom({
      drives: {
        previous: [
          {
            id: 'd1',
            description: '8 plays, 20 yards, 5:01',
            displayResult: 'Punt',
            team: { abbreviation: 'SEA' },
            plays: [
              {
                id: 'p1',
                text: 'W.Lutz kicks 63 yards from DEN 35 to SEA 2.',
                scoringPlay: false,
                period: { number: 1 },
                clock: { displayValue: '15:00' },
                start: { down: 0, distance: 0 },
              },
              {
                id: 'p2',
                text: 'Jason Myers 55 Yd Field Goal',
                scoringPlay: true,
                awayScore: 3,
                homeScore: 0,
                period: { number: 1 },
                clock: { displayValue: '6:31' },
                start: { down: 4, distance: 8 },
              },
            ],
          },
        ],
        current: {
          id: 'd2',
          description: '3 plays, 12 yards, 1:10',
          displayResult: 'Current',
          team: { abbreviation: 'DEN' },
          plays: [{ id: 'p3', text: 'Bo Nix pass incomplete.', clock: { displayValue: '1:02' }, period: { number: 2 } }],
        },
      },
    })
    expect(drives).toHaveLength(2)
    expect(drives[0]).toMatchObject({ team: 'SEA', result: 'Punt', summary: '8 plays, 20 yards, 5:01' })
    expect(drives[0].plays[0]).toMatchObject({ clock: '15:00', quarter: 1, down: '', scoring: false })
    expect(drives[0].plays[1]).toMatchObject({ down: '4th & 8', scoring: true, awayScore: 3, homeScore: 0 })
    expect(drives[1].team).toBe('DEN')
    expect(drivesFrom({})).toEqual([])
    expect(drivesFrom({ drives: { previous: [{ id: 'empty' }] } })).toEqual([])
  })
})

describe('headline', () => {
  test('reads a game story, a league headline, and a scoreboard recap', () => {
    const headlines = headlinesFromSummary(
      {
        article: {
          id: 'recap',
          headline: 'Broncos beat the Seahawks 17-14 in OT',
          description: '— Denver found a way in overtime.',
          links: { web: { href: 'https://www.espn.com/nfl/recap' } },
        },
        news: {
          articles: [
            {
              id: 'n1',
              headline: 'Broncos beat the Seahawks 17-14 in OT',
              description: 'Duplicate of the recap.',
            },
            {
              headline: 'Ex-Broncos exec John Beake dies at 87',
              description: 'John Beake helped land John Elway.',
              links: { web: { href: 'https://www.espn.com/nfl/story/beake' } },
            },
          ],
        },
      },
      { id: '401872995', name: 'SEA @ DEN' },
    )
    expect(headlines.map((h) => h.title)).toEqual([
      'Broncos beat the Seahawks 17-14 in OT',
      'Ex-Broncos exec John Beake dies at 87',
    ])
    expect(headlines[0]).toMatchObject({ kind: 'game', gameName: 'SEA @ DEN', blurb: 'Denver found a way in overtime.', href: 'https://www.espn.com/nfl/recap' })
    expect(headlines[1].kind).toBe('league')
    expect(headlinesFromSummary({})).toEqual([])

    const fromBoard = headlinesFromScoreboard(slate)
    expect(fromBoard).toHaveLength(1)
    expect(fromBoard[0]).toMatchObject({
      title: 'Broncos beat the Seahawks 17-14 in OT',
      blurb: 'Denver found a way in overtime.',
      gameId: '401872995',
      kind: 'game',
    })
  })
})
