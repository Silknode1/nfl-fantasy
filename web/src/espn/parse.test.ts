import { describe, expect, test } from 'vitest'
import {
  dedupeNews,
  injuryFromRoster,
  linkNewsToPlayers,
  newsFromPlayers,
  parseAthlete,
  parseClub,
  parseClubStats,
  parseEspnNews,
  parseLastGame,
  parseRoster,
  parseScoreboardHeadlines,
  statLineEmpty,
} from './parse'

const teamPayload = {
  team: {
    id: '2',
    abbreviation: 'BUF',
    displayName: 'Buffalo Bills',
    color: '00338d',
    logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png' }],
    record: {
      items: [
        {
          type: 'total',
          summary: '4-1',
          stats: [
            { name: 'pointsFor', value: 164 },
            { name: 'pointsAgainst', value: 141 },
            { name: 'wins', value: 4 },
          ],
        },
      ],
    },
    nextEvent: [
      {
        id: '401873005',
        date: '2026-10-18T20:25Z',
        shortName: 'BUF @ LV',
        competitions: [
          {
            id: '401873005',
            status: { type: { state: 'pre', shortDetail: '10/18 - 4:25 PM EDT' } },
            competitors: [
              { homeAway: 'home', team: { abbreviation: 'LV', displayName: 'Las Vegas Raiders' } },
              { homeAway: 'away', team: { abbreviation: 'BUF', displayName: 'Buffalo Bills' } },
            ],
          },
        ],
      },
    ],
  },
}

describe('parseClub', () => {
  test('reads record, points, and the next game', () => {
    const club = parseClub(teamPayload)
    expect(club).toMatchObject({
      id: '2',
      abbr: 'BUF',
      name: 'Buffalo Bills',
      color: '#00338d',
      record: '4-1',
      pointsFor: 164,
      pointsAgainst: 141,
    })
    expect(club?.next).toMatchObject({ id: '401873005', awayAbbr: 'BUF', homeAbbr: 'LV', state: 'pre', homeScore: null })
  })

  test('returns null when the club abbreviation is missing', () => {
    expect(parseClub({ team: { id: '2', displayName: 'Bills' } })).toBeNull()
  })
})

describe('parseClubStats', () => {
  test('reads offense and defense points and yards', () => {
    const stats = parseClubStats({
      results: {
        stats: {
          categories: [
            { name: 'scoring', stats: [{ name: 'totalPoints', value: 164 }, { name: 'totalPointsPerGame', value: 32.8 }] },
            {
              name: 'rushing',
              stats: [
                { name: 'totalYards', value: 2039, perGameValue: 407.8 },
                { name: 'rushingYardsPerGame', value: 158 },
              ],
            },
            { name: 'passing', stats: [{ name: 'passingYardsPerGame', value: 249.8 }] },
          ],
        },
        opponent: [
          { name: 'scoring', stats: [{ name: 'totalPointsPerGame', value: 28.2 }, { name: 'totalPoints', value: 141 }] },
          { name: 'rushing', stats: [{ name: 'totalYards', value: 2020, perGameValue: 404 }] },
        ],
      },
    })
    expect(stats?.offense).toMatchObject({ points: 164, pointsPerGame: 32.8, yards: 2039, yardsPerGame: 407.8, passYardsPerGame: 249.8, rushYardsPerGame: 158 })
    expect(stats?.defense).toMatchObject({ points: 141, pointsPerGame: 28.2, yards: 2020, yardsPerGame: 404 })
    expect(statLineEmpty({ points: null, pointsPerGame: null, yards: null, yardsPerGame: null, passYardsPerGame: null, rushYardsPerGame: null })).toBe(true)
  })

  test('returns null when results are missing', () => {
    expect(parseClubStats({ status: 'ok' })).toBeNull()
  })
})

describe('parseLastGame', () => {
  test('keeps the latest completed game and its score', () => {
    const last = parseLastGame({
      events: [
        {
          id: 'old',
          date: '2026-09-01T00:00Z',
          shortName: 'BAL @ BUF',
          competitions: [{
            status: { type: { state: 'post', completed: true, shortDetail: 'Final' } },
            competitors: [
              { homeAway: 'home', score: { value: 40, displayValue: '40' }, team: { abbreviation: 'BUF', displayName: 'Buffalo Bills' } },
              { homeAway: 'away', score: { value: 41, displayValue: '41' }, team: { abbreviation: 'BAL', displayName: 'Baltimore Ravens' } },
            ],
          }],
        },
        {
          id: 'future',
          competitions: [{
            status: { type: { state: 'pre', completed: false } },
            competitors: [
              { homeAway: 'home', team: { abbreviation: 'LV', displayName: 'Las Vegas Raiders' } },
              { homeAway: 'away', team: { abbreviation: 'BUF', displayName: 'Buffalo Bills' } },
            ],
          }],
        },
      ],
    })
    expect(last).toMatchObject({ id: 'old', homeScore: 40, awayScore: 41, state: 'post' })
  })
})

describe('news parsers', () => {
  test('reads an ESPN article, its story link, and the tagged club', () => {
    const [item] = parseEspnNews({
      articles: [{
        id: '50206700',
        headline: 'Ex-Broncos exec John Beake dies at 87',
        description: 'The team said Saturday.',
        published: '2026-10-18T02:58:11Z',
        links: { web: { href: 'https://www.espn.com/nfl/story/_/id/50206700/beake' } },
        categories: [{ type: 'team', team: { abbreviation: 'den' } }, { type: 'league', description: 'NFL' }],
      }],
    })
    expect(item).toMatchObject({
      id: 'espn-50206700',
      headline: 'Ex-Broncos exec John Beake dies at 87',
      url: 'https://www.espn.com/nfl/story/_/id/50206700/beake',
      teams: ['DEN'],
      source: 'espn',
    })
  })

  test('reads a scoreboard recap and both clubs', () => {
    const [item] = parseScoreboardHeadlines({
      events: [{
        id: '401872995',
        shortName: 'SEA @ DEN',
        competitions: [{
          competitors: [
            { homeAway: 'home', team: { abbreviation: 'DEN', displayName: 'Denver Broncos' } },
            { homeAway: 'away', team: { abbreviation: 'SEA', displayName: 'Seattle Seahawks' } },
          ],
          headlines: [{ shortLinkText: 'Broncos beat the Seahawks 17-14 in OT', description: '— The Broncos found a way.' }],
        }],
      }],
    })
    expect(item).toMatchObject({
      headline: 'Broncos beat the Seahawks 17-14 in OT',
      summary: 'The Broncos found a way.',
      teams: ['SEA', 'DEN'],
      gameId: '401872995',
      source: 'scoreboard',
      url: null,
    })
  })

  test('builds Jev items and matches a player name in an ESPN headline', () => {
    const jev = newsFromPlayers([{
      id: '3918298',
      name: 'Josh Allen',
      nfl: 'BUF',
      jev: { headline: 'Allen is expected to play', url: 'https://example.test/allen', published: '2026-10-17T12:00:00Z', role: 'none', timeline: 'not_stated' },
    }])
    expect(jev[0]).toMatchObject({ id: 'jev-3918298', playerId: '3918298', teams: ['BUF'], url: 'https://example.test/allen' })
    const linked = linkNewsToPlayers(
      [{ id: 'espn-1', headline: 'How Bills QB Josh Allen has become a star', summary: null, published: null, url: 'https://www.espn.com/nfl/story', teams: ['BUF'], playerId: null, gameId: null, source: 'espn' }],
      [{ id: '3918298', name: 'Josh Allen', nfl: 'BUF' }, { id: '1', name: 'Allen', nfl: 'BUF' }],
    )
    expect(linked[0]?.playerId).toBe('3918298')
    const merged = dedupeNews([...jev, { ...jev[0]!, id: 'dup' }])
    expect(merged).toHaveLength(1)
  })
})

describe('roster and athlete', () => {
  test('keeps skill players and their injury tag', () => {
    const rows = parseRoster({
      athletes: [
        {
          position: 'offense',
          items: [
            { id: '3918298', fullName: 'Josh Allen', position: { abbreviation: 'QB' }, injuries: [], headshot: { href: 'https://a.espncdn.com/josh.png' } },
            { id: '1', fullName: 'DJ Moore', position: { abbreviation: 'WR' }, injuries: [{ status: 'Questionable' }] },
            { id: '2', fullName: 'Dee Alford', position: { abbreviation: 'CB' }, injuries: [{ status: 'Questionable' }] },
          ],
        },
      ],
    })
    expect(rows.map((p) => p.pos)).toEqual(['QB', 'WR'])
    expect(rows[1]).toMatchObject({ injury: 'Questionable' })
    expect(injuryFromRoster(rows, '1')).toBe('Questionable')
    expect(injuryFromRoster(rows, 'missing')).toBeNull()
  })

  test('reads the athlete card and season stat line', () => {
    const card = parseAthlete({
      athlete: {
        id: '3918298',
        displayName: 'Josh Allen',
        jersey: '17',
        position: { abbreviation: 'QB' },
        team: { abbreviation: 'buf', displayName: 'Buffalo Bills' },
        status: { name: 'Active' },
        headshot: { href: 'https://a.espncdn.com/josh.png' },
        statsSummary: { statistics: [{ shortDisplayName: 'Pass Yards', displayValue: '1,249', rankDisplayValue: '10th' }] },
      },
    })
    expect(card).toMatchObject({
      id: '3918298',
      name: 'Josh Allen',
      pos: 'QB',
      teamAbbr: 'BUF',
      jersey: '17',
      status: 'Active',
      injury: null,
      stats: [{ label: 'Pass Yards', value: '1,249 (10th)' }],
    })
  })
})
