import { describe, expect, test } from 'vitest'
import snapshot from '../../public/data/scoreboard.json'
import {
  filterGames,
  formatAmerican,
  formatLine,
  impliedTeamTotals,
  median,
  moveChips,
  movementSentences,
  normalizeScoreboard,
  normalizeSummary,
  priceSentence,
  scoringGapNote,
  scriptNote,
  sortGames,
  type BoardGame,
} from './normalize'

const london = {
  season: { year: 2026 },
  week: { number: 6, teamsOnBye: [{ abbreviation: 'CIN', shortDisplayName: 'Bengals' }] },
  events: [
    {
      id: 'final-1',
      date: '2026-10-16T00:15Z',
      shortName: 'SEA @ DEN',
      competitions: [
        {
          id: 'final-1',
          date: '2026-10-16T00:15Z',
          neutralSite: false,
          venue: { fullName: 'Empower Field', address: { city: 'Denver' }, indoor: false },
          status: { type: { state: 'post', shortDetail: 'Final/OT' } },
          broadcasts: [{ names: ['Prime Video'] }],
          competitors: [
            { homeAway: 'home', winner: true, score: '17', team: { id: '9', abbreviation: 'DEN', displayName: 'Denver Broncos', location: 'Denver', color: '002244' }, records: [{ type: 'total', summary: '4-2' }] },
            { homeAway: 'away', winner: false, score: '14', team: { id: '26', abbreviation: 'SEA', displayName: 'Seattle Seahawks', location: 'Seattle', color: '002244' }, records: [{ type: 'total', summary: '3-2' }] },
          ],
        },
      ],
    },
    {
      id: 'hou-jax',
      date: '2026-10-18T13:30Z',
      shortName: 'HOU VS JAX',
      competitions: [
        {
          id: 'hou-jax',
          date: '2026-10-18T13:30Z',
          neutralSite: true,
          notes: [{ headline: 'NFL London Games' }],
          venue: { fullName: 'Wembley Stadium', address: { city: 'London', country: 'England' }, indoor: false },
          status: { type: { state: 'pre', shortDetail: '10/18 - 9:30 AM EDT' } },
          broadcasts: [{ names: ['NFL Net'] }],
          competitors: [
            {
              homeAway: 'home',
              score: '0',
              team: { id: '30', abbreviation: 'JAX', displayName: 'Jacksonville Jaguars', location: 'Jacksonville', color: '007487', logo: 'https://example.test/jax.png' },
              records: [{ type: 'total', name: 'overall', summary: '3-2' }, { type: 'home', summary: '2-0' }],
            },
            {
              homeAway: 'away',
              score: '0',
              team: { id: '34', abbreviation: 'HOU', displayName: 'Houston Texans', location: 'Houston', color: '03202f' },
              records: [{ type: 'total', summary: '4-1' }, { type: 'road', summary: '2-1' }],
            },
          ],
          odds: [
            {
              provider: { displayName: 'DraftKings' },
              spread: -2.5,
              overUnder: 41.5,
              homeTeamOdds: { favorite: true, favoriteAtOpen: false },
              awayTeamOdds: { favorite: false, favoriteAtOpen: true },
              pointSpread: {
                home: { close: { line: '-2.5', odds: '-120' }, open: { line: '+1.5', odds: '-118' } },
                away: { close: { line: '+2.5', odds: '+100' }, open: { line: '-1.5', odds: '-102' } },
              },
              total: {
                over: { close: { line: 'o41.5', odds: '-115' }, open: { line: 'o41.5', odds: '-110' } },
                under: { close: { line: 'u41.5', odds: '-105' }, open: { line: 'u41.5', odds: '-110' } },
              },
              moneyline: {
                home: { close: { odds: '-142' }, open: { odds: '-105' } },
                away: { close: { odds: '+120' }, open: { odds: '-115' } },
              },
            },
          ],
          leaders: [
            { shortDisplayName: 'PASS', leaders: [{ displayValue: '1402 YDS, 6 TD', athlete: { displayName: 'C.J. Stroud' }, team: { id: '34' } }] },
          ],
        },
      ],
    },
    {
      id: 'big',
      date: '2026-10-18T20:05Z',
      shortName: 'ARI @ LAR',
      competitions: [
        {
          id: 'big',
          date: '2026-10-18T20:05Z',
          status: { type: { state: 'pre', shortDetail: '10/18 - 4:05 PM EDT' } },
          competitors: [
            { homeAway: 'home', team: { id: '14', abbreviation: 'LAR', displayName: 'Los Angeles Rams', location: 'Los Angeles' }, records: [] },
            { homeAway: 'away', team: { id: '22', abbreviation: 'ARI', displayName: 'Arizona Cardinals', location: 'Arizona' }, records: [] },
          ],
          odds: [
            {
              provider: { name: 'DraftKings' },
              spread: -12.5,
              overUnder: 51.5,
              pointSpread: { home: { close: { line: '-12.5', odds: '-110' }, open: { line: '-12.5' } }, away: { close: { line: '+12.5', odds: '-110' }, open: { line: '+12.5' } } },
              total: { over: { close: { line: 'o51.5', odds: '-110' }, open: { line: 'o48.5', odds: '-110' } }, under: { close: { line: 'u51.5', odds: '-110' } } },
              moneyline: { home: { close: { odds: '-650' } }, away: { close: { odds: '+470' } } },
            },
          ],
        },
      ],
    },
  ],
}

function game(id: string, board = normalizeScoreboard(london, '2026-10-18T06:00:00Z')): BoardGame {
  const found = board.games.find((g) => g.id === id)
  if (!found) throw new Error(id)
  return found
}

describe('implied team totals', () => {
  test('gives the favorite the higher number and keeps the sum on the total', () => {
    expect(impliedTeamTotals(41.5, -2.5)).toEqual({ home: 22, away: 19.5 })
    expect(impliedTeamTotals(52.5, -1.5)).toEqual({ home: 27, away: 25.5 })
  })

  test('reads the London game off the scoreboard', () => {
    const jax = game('hou-jax')
    expect(jax.implied).toEqual({ home: 22, away: 19.5 })
    expect(jax.quote?.book).toBe('DraftKings')
    expect(jax.quote?.home.price).toBe(-120)
    expect(jax.quote?.away.moneyline).toBe(120)
    expect(jax.quote?.openTotal).toBe(41.5)
    expect(jax.quote?.favoriteFlipped).toBe(true)
    expect(jax.neutral).toBe(true)
    expect(jax.note).toBe('NFL London Games')
    expect(jax.city).toBe('London, England')
    expect(jax.home.record).toBe('3-2')
    expect(jax.home.score).toBe(0)
    expect(jax.state).toBe('pre')
    expect(jax.leaders[0]).toMatchObject({ name: 'C.J. Stroud', teamId: '34' })
  })

  test('leaves a finished game without a line as no quote', () => {
    const den = game('final-1')
    expect(den.state).toBe('post')
    expect(den.quote).toBeNull()
    expect(den.implied).toBeNull()
    expect(den.home.score).toBe(17)
    expect(den.away.winner).toBe(false)
  })
})

describe('how to read the number', () => {
  test('formats the line and the price', () => {
    expect(formatLine(-2.5)).toBe('-2.5')
    expect(formatLine(2.5)).toBe('+2.5')
    expect(formatAmerican(-142)).toBe('-142')
    expect(formatAmerican(120)).toBe('+120')
    expect(priceSentence(-120)).toBe('Risk 120 to win 100')
    expect(priceSentence(100)).toBe('Risk 100 to win 100')
  })

  test('says the favorite flipped and the spread moved, and stays quiet when the total did not', () => {
    const jax = game('hou-jax')
    expect(moveChips(jax)).toEqual(['Favorite flipped', 'Spread +1.5 → -2.5'])
    expect(movementSentences(jax)).toEqual([
      'The favorite flipped from Houston Texans to Jacksonville Jaguars.',
      'Jacksonville Jaguars moved from +1.5 to -2.5.',
    ])
    expect(scriptNote(jax)).toBeNull()
  })

  test('names a 7-point favorite and reports a total that moved', () => {
    const lar = game('big')
    expect(scriptNote(lar)).toBe('Los Angeles Rams are favored by 12.5. A margin that large often means more rushes for Los Angeles Rams and more dropbacks for Arizona Cardinals.')
    expect(moveChips(lar)).toEqual(['Total 48.5 → 51.5'])
    expect(movementSentences(lar)[0]).toBe('The total moved up from 48.5 to 51.5.')
  })

  test('compares an implied total with recent scoring only as a gap', () => {
    const close = scoringGapNote('Jacksonville Jaguars', 22, [24, 20, 21, 19, 22])
    expect(close?.gap).toBe(0.8)
    expect(close?.note).toContain('within 3 points')
    const high = scoringGapNote('Los Angeles Rams', 32, [21, 24, 18, 22, 20])
    expect(high?.note).toContain('above')
    expect(scoringGapNote('Nobody', 20, [])).toBeNull()
  })
})

describe('slate controls', () => {
  test('filters, sorts, and finds the median total', () => {
    const board = normalizeScoreboard(london, '2026-10-18T06:00:00Z')
    expect(board.week).toBe(6)
    expect(board.byes).toEqual([{ abbr: 'CIN', name: 'Bengals' }])
    expect(board.fetchedAt).toBe('2026-10-18T06:00:00Z')
    expect(filterGames(board.games, 'pre').map((g) => g.id)).toEqual(['hou-jax', 'big'])
    expect(filterGames(board.games, 'post')).toHaveLength(1)
    expect(sortGames(board.games, 'total').map((g) => g.id)).toEqual(['big', 'hou-jax', 'final-1'])
    expect(sortGames(board.games, 'spread')[0].id).toBe('big')
    expect(median([41.5, 51.5])).toBe(46.5)
    expect(median([39.5, 41.5, 44.5])).toBe(41.5)
  })

  test('reads a wrapped snapshot and a summary', () => {
    const board = normalizeScoreboard({ fetchedAt: '2026-10-18T05:00:00Z', scoreboard: london }, 'ignored')
    expect(board.fetchedAt).toBe('2026-10-18T05:00:00Z')
    const jax = game('hou-jax', board)
    const ctx = normalizeSummary(
      {
        predictor: { homeTeam: { gameProjection: '59' }, awayTeam: { gameProjection: '40.6' } },
        lastFiveGames: [
          {
            team: { id: '30' },
            events: [
              { week: 5, gameResult: 'W', atVs: 'vs', homeTeamId: '30', homeTeamScore: '24', awayTeamScore: '17', opponent: { abbreviation: 'KC' } },
              { week: 4, gameResult: 'L', atVs: '@', homeTeamId: '5', homeTeamScore: '20', awayTeamScore: '14', opponent: { abbreviation: 'CLE' } },
            ],
          },
        ],
        injuries: [
          {
            team: { id: '34' },
            injuries: [
              { status: 'Out', athlete: { displayName: 'David Montgomery', position: { abbreviation: 'RB' } }, details: { type: 'Groin', detail: 'Not Specified' } },
              { status: 'Injured Reserve', athlete: { displayName: 'Tank Dell', position: { abbreviation: 'WR' } } },
              { status: 'Questionable', athlete: { displayName: 'Ja\'Marcus Ingram', position: { abbreviation: 'CB' } }, details: { type: 'Elbow', detail: 'Dislocated' } },
            ],
          },
        ],
      },
      jax,
    )
    expect(ctx.predictor).toEqual({ home: 59, away: 40.6 })
    expect(ctx.home.recent[1]).toMatchObject({ result: 'L', opponent: 'CLE', pointsFor: 14, pointsAgainst: 20 })
    expect(ctx.home.avgPoints).toBe(19)
    expect(ctx.home.gapNote).toContain('above')
    expect(ctx.away.injuries.map((i) => i.status)).toEqual(['Out', 'Questionable'])
    expect(ctx.away.injuries[0].detail).toBe('Groin')
    expect(ctx.away.injuries[1].detail).toBe('Elbow, Dislocated')
    expect(ctx.away.irCount).toBe(1)
  })

  test('the saved scoreboard still has a spread and a total on upcoming games', () => {
    const board = normalizeScoreboard(snapshot, 'snapshot')
    expect(board.season).toBe(2026)
    expect(board.games.length).toBeGreaterThan(10)
    const upcoming = board.games.filter((g) => g.state === 'pre')
    expect(upcoming.length).toBeGreaterThan(8)
    for (const g of upcoming) {
      expect(g.quote?.homeSpread).not.toBeNull()
      expect(g.quote?.total).not.toBeNull()
      expect(g.implied).not.toBeNull()
      expect(g.implied!.home + g.implied!.away).toBe(g.quote!.total)
    }
  })
})
