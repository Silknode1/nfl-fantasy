import { describe, expect, test } from 'vitest'
import { parseTeamView } from './team'

const fixture = {
  team: {
    team: {
      id: '7',
      abbreviation: 'DEN',
      displayName: 'Denver Broncos',
      location: 'Denver',
      color: 'FB4F14',
      logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/den.png', rel: ['full', 'default'] }],
      record: {
        items: [
          {
            type: 'total',
            summary: '4-2',
            stats: [
              { name: 'pointsFor', value: 114 },
              { name: 'pointsAgainst', value: 125 },
              { name: 'pointDifferential', value: -11 },
              { name: 'gamesPlayed', value: 6 },
            ],
          },
          { type: 'home', summary: '3-0' },
          { type: 'road', summary: '1-2' },
        ],
      },
    },
  },
  stats: {
    results: {
      stats: {
        categories: [
          {
            name: 'rushing',
            stats: [{ name: 'rushingYardsPerGame', displayName: 'Rushing Yards Per Game', displayValue: '84.2' }],
          },
          {
            name: 'passing',
            stats: [{ name: 'yardsPerGame', displayName: 'Yards Per Game', displayValue: '259.0' }],
          },
          {
            name: 'scoring',
            stats: [{ name: 'totalPointsPerGame', displayName: 'Total Points Per Game', displayValue: '19.0' }],
          },
        ],
      },
      opponent: [
        {
          name: 'scoring',
          stats: [{ name: 'totalPointsPerGame', displayValue: '20.8' }],
        },
        {
          name: 'passing',
          stats: [{ name: 'yardsPerGame', displayValue: '369.8' }],
        },
      ],
    },
  },
  leaders: {
    categories: [
      {
        name: 'passingLeader',
        displayName: 'Passing Leader',
        leaders: [
          {
            displayValue: '114/189, 1049 YDS, 6 TD, 3 INT',
            athlete: {
              $ref: 'http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/4426338?lang=en',
            },
          },
        ],
      },
    ],
  },
  names: { '4426338': 'Bo Nix' },
  news: {
    articles: [
      {
        id: '50206700',
        headline: 'Ex-Broncos exec John Beake dies at 87',
        description: 'John Beake helped land John Elway.',
        links: { web: { href: 'https://www.espn.com/nfl/story/beake' } },
      },
    ],
  },
  schedule: {
    events: [
      {
        id: '401872975',
        date: '2026-10-05T00:20Z',
        shortName: 'DEN @ SF',
        week: { number: 4, text: 'Week 4' },
        competitions: [
          {
            status: { type: { state: 'post', shortDetail: 'Final' } },
            competitors: [
              { homeAway: 'home', winner: true, score: { value: 24 }, team: { abbreviation: 'SF', displayName: 'San Francisco 49ers' } },
              { homeAway: 'away', winner: false, score: { value: 14 }, team: { abbreviation: 'DEN', displayName: 'Denver Broncos' } },
            ],
          },
        ],
      },
      {
        id: '401872989',
        date: '2026-10-11T20:05Z',
        shortName: 'DEN @ LAC',
        week: { number: 5, text: 'Week 5' },
        competitions: [
          {
            status: { type: { state: 'post', shortDetail: 'Final' } },
            competitors: [
              { homeAway: 'home', winner: false, score: { value: 17 }, team: { abbreviation: 'LAC', displayName: 'Los Angeles Chargers' } },
              { homeAway: 'away', winner: true, score: { value: 23 }, team: { abbreviation: 'DEN', displayName: 'Denver Broncos' } },
            ],
          },
        ],
      },
      {
        id: '401873019',
        date: '2026-10-26T00:05Z',
        shortName: 'DEN @ ARI',
        week: { number: 7, text: 'Week 7' },
        competitions: [
          {
            status: { type: { state: 'pre', shortDetail: '10/25 - 4:05 PM MST' } },
            competitors: [
              { homeAway: 'home', team: { abbreviation: 'ARI', displayName: 'Arizona Cardinals' } },
              { homeAway: 'away', team: { abbreviation: 'DEN', displayName: 'Denver Broncos' } },
            ],
          },
        ],
      },
    ],
  },
}

describe('team page', () => {
  test('reads an offense stat, a passing leader, and a headline', () => {
    const view = parseTeamView(fixture)
    expect(view?.abbr).toBe('DEN')
    expect(view?.name).toBe('Denver Broncos')
    expect(view?.record).toBe('4-2')
    expect(view?.homeRecord).toBe('3-0')
    expect(view?.roadRecord).toBe('1-2')
    expect(view?.pointsFor).toBe(114)
    expect(view?.pointsAgainst).toBe(125)

    const rush = view?.offense.find((row) => /rush/i.test(row.label))
    expect(rush).toMatchObject({ label: 'Rush yards per game', value: '84.2' })
    expect(view?.defense.find((row) => row.label === 'Points allowed per game')?.value).toBe('20.8')

    expect(view?.leaders[0]).toMatchObject({
      label: 'Passing Leader',
      name: 'Bo Nix',
      stat: '114/189, 1049 YDS, 6 TD, 3 INT',
    })

    expect(view?.headlines[0]).toMatchObject({
      title: 'Ex-Broncos exec John Beake dies at 87',
      blurb: 'John Beake helped land John Elway.',
      href: 'https://www.espn.com/nfl/story/beake',
      teamAbbr: 'DEN',
    })

    expect(view?.focus).toMatchObject({ id: '401873019', opponentAbbr: 'ARI', state: 'pre' })
    expect(view?.lastFinal).toMatchObject({ id: '401872989', result: 'W', scoreFor: 23, scoreAgainst: 17 })

    const differential = view?.highlights.find((h) => h.label === 'Point differential')
    expect(differential?.text).toContain('11')
    const recent = view?.highlights.find((h) => h.label === 'Recent scoring')
    expect(recent?.text).toContain('19')
  })

  test('returns null without a team, and empty blocks when the rest is missing', () => {
    expect(parseTeamView({})).toBeNull()
    const view = parseTeamView({
      team: { team: { abbreviation: 'DEN', displayName: 'Denver Broncos' } },
    })
    expect(view?.offense).toEqual([])
    expect(view?.leaders).toEqual([])
    expect(view?.headlines).toEqual([])
    expect(view?.focus).toBeNull()
  })
})
