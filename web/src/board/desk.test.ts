import { describe, expect, test } from 'vitest'
import { normalizeScoreboard, type BoardGame } from './normalize'
import {
  advanceClip,
  boxScorePoints,
  currentHomeWin,
  dropPin,
  drivesFrom,
  gameArticle,
  shelfPointLabel,
  marginSentence,
  marginVsSpread,
  pickCenter,
  playersInGame,
  pushPin,
  ringSlots,
  scoringPlaysFrom,
  standoutsFrom,
  watchTarget,
  winSeries,
  headlinesFromSummary,
  youtubeId,
  youtubeSearchHref,
  type ArticleFacts,
  type Playback,
  leaveCenter,
  pauseCenter,
  pinClipPauses,
  playCenter,
  playShelf,
  idlePlayback,
} from './desk'

function liveGame(partial: Partial<BoardGame> & Pick<BoardGame, 'id'>): BoardGame {
  return {
    kickoff: '2026-10-18T17:00:00Z',
    name: partial.id,
    state: 'in',
    detail: '2nd 8:00',
    neutral: false,
    note: null,
    venue: 'Stadium',
    city: 'City',
    indoor: false,
    broadcast: 'CBS',
    home: { id: 'h', abbr: 'HOM', name: 'Home Team', location: 'Home', score: 10, winner: false, record: null, homeRecord: null, roadRecord: null, color: '#000', logo: null },
    away: { id: 'a', abbr: 'AWY', name: 'Away Team', location: 'Away', score: 7, winner: false, record: null, homeRecord: null, roadRecord: null, color: '#111', logo: null },
    quote: {
      book: 'DraftKings',
      homeSpread: -7,
      total: 44,
      openTotal: null,
      overPrice: -110,
      underPrice: -110,
      home: { line: -7, openLine: null, price: -110, moneyline: -280, openMoneyline: null },
      away: { line: 7, openLine: null, price: -110, moneyline: 230, openMoneyline: null },
      favoriteFlipped: false,
    },
    implied: { home: 25.5, away: 18.5 },
    leaders: [],
    situation: null,
    ...partial,
  }
}

describe('win probability series', () => {
  test('plots only the points ESPN sent', () => {
    const series = winSeries({
      winprobability: [
        { homeWinPercentage: 0.42, playId: 'p1' },
        { homeWinPercentage: 0.61, playId: 'p2' },
      ],
    })
    expect(series).toEqual([
      { home: 42, playId: 'p1' },
      { home: 61, playId: 'p2' },
    ])
  })

  test('no series means no invented line, even when the pregame predictor is present', () => {
    const raw = { predictor: { homeTeam: { gameProjection: '59' }, awayTeam: { gameProjection: '41' } } }
    expect(winSeries(raw)).toEqual([])
    expect(winSeries({})).toEqual([])
    expect(winSeries({ winprobability: [] })).toEqual([])
    expect(currentHomeWin(raw)).toBe(59)
  })
})

describe('margin versus the spread', () => {
  test('is the score margin plus the home line, not a chance to cover', () => {
    expect(marginVsSpread(10, 7, -7)).toBe(-4)
    expect(marginVsSpread(17, 7, -7)).toBe(3)
    const game = liveGame({ id: 'g' })
    expect(marginSentence(game)).toBe('Home Team is short of the number by 4')
    const covering = liveGame({
      id: 'c',
      home: { ...liveGame({ id: 'x' }).home, score: 17 },
      away: { ...liveGame({ id: 'x' }).away, score: 7 },
    })
    expect(marginSentence(covering)).toBe('Home Team is covering by 3')
    expect(marginSentence(covering)).not.toMatch(/%|chance|probability/i)
  })

  test('a missing quote does not become a cover percentage', () => {
    const game = liveGame({ id: 'nq', quote: null, implied: null })
    expect(marginSentence(game)).toBeNull()
    const facts: ArticleFacts = {
      away: game.away.name,
      home: game.home.name,
      state: 'in',
      detail: game.detail,
      venue: game.venue,
      broadcast: game.broadcast,
      awayScore: 7,
      homeScore: 10,
      spreadText: null,
      total: null,
      awayMoneyline: null,
      homeMoneyline: null,
      marginText: marginSentence(game),
      injuries: [],
      yours: [],
      headlines: [],
      scoringPlays: [],
    }
    const text = gameArticle(facts).join(' ')
    expect(text).toContain('A missing quote is not a number to invent.')
    expect(text).not.toMatch(/chance to cover|cover probability|%\s*to cover/i)
    expect(text).not.toMatch(/\bbecause\b|\bdue to\b/i)
  })

  test('the article leaves out a headline it was not given', () => {
    const text = gameArticle({
      away: 'Away Team',
      home: 'Home Team',
      state: 'post',
      detail: 'Final',
      venue: 'Stadium',
      broadcast: 'FOX',
      awayScore: 14,
      homeScore: 21,
      spreadText: 'Home Team -3.5',
      total: 47.5,
      awayMoneyline: '+150',
      homeMoneyline: '-170',
      marginText: 'Home Team is covering by 3.5',
      injuries: [{ team: 'Home Team', name: 'Ada Lovelace', status: 'Questionable' }],
      yours: [{ name: 'Grace Hopper', proj: 12.4, scored: 8 }],
      headlines: [],
      scoringPlays: ['Grace Hopper 8 yard pass'],
    }).join(' ')
    expect(text).toContain('21')
    expect(text).toContain('14')
    expect(text).toContain('covering by 3.5')
    expect(text).toContain('Ada Lovelace')
    expect(text).toContain('12.4')
    expect(text).toContain('Grace Hopper 8 yard pass')
    expect(text).not.toContain('Coach said')
    expect(text).not.toMatch(/\bbecause\b/i)
  })
})

describe('scoreboard situation', () => {
  test('reads possession, red zone, and clock only when the situation object has them', () => {
    const board = normalizeScoreboard({
      events: [
        {
          id: 'sit',
          competitions: [
            {
              date: '2026-10-18T17:00:00Z',
              status: { type: { state: 'in', shortDetail: '2nd 4:11' } },
              situation: { possession: '30', isRedZone: true, displayClock: '4:11' },
              competitors: [
                { homeAway: 'home', score: '7', team: { id: '30', abbreviation: 'JAX', displayName: 'Jacksonville Jaguars' } },
                { homeAway: 'away', score: '3', team: { id: '34', abbreviation: 'HOU', displayName: 'Houston Texans' } },
              ],
            },
          ],
        },
      ],
    }, 't')
    expect(board.games[0].situation).toEqual({ possessionId: '30', redZone: true, clock: '4:11' })
  })
})

describe('summary blocks', () => {
  test('reads scoring plays and drives that are present and nothing when they are not', () => {
    expect(scoringPlaysFrom({})).toEqual([])
    expect(drivesFrom({})).toEqual([])
    const plays = scoringPlaysFrom({
      scoringPlays: [
        { id: 's1', text: 'Field goal', awayScore: 3, homeScore: 0, clock: { displayValue: '8:01' }, period: { number: 1 }, team: { abbreviation: 'HOU' } },
      ],
    })
    expect(plays).toEqual([{ id: 's1', text: 'Field goal', clock: '8:01', quarter: 1, team: 'HOU', awayScore: 3, homeScore: 0 }])
    const drives = drivesFrom({
      drives: { previous: [{ id: 'd1', displayResult: 'TD', team: { abbreviation: 'JAX' }, plays: [{ id: 'p1', text: 'Pass complete', scoringPlay: false, clock: { displayValue: '1:00' }, period: { number: 2 } }] }] },
    })
    expect(drives[0]).toMatchObject({ id: 'd1', team: 'JAX', result: 'TD' })
    expect(drives[0].plays[0].text).toBe('Pass complete')
  })

  test('scores the box with half-PPR arithmetic and matches an ESPN id before a name', () => {
    const raw = {
      boxscore: {
        players: [
          {
            statistics: [
              {
                name: 'passing',
                keys: ['passingYards', 'passingTouchdowns', 'interceptions'],
                athletes: [{ athlete: { id: '11', displayName: 'Passer' }, stats: ['250', '2', '1'] }],
              },
              {
                name: 'rushing',
                keys: ['rushingYards', 'rushingTouchdowns'],
                athletes: [{ athlete: { id: '11', displayName: 'Passer' }, stats: ['20', '1'] }],
              },
              {
                name: 'receiving',
                keys: ['receptions', 'receivingYards', 'receivingTouchdowns'],
                athletes: [{ athlete: { id: '22', displayName: 'Catcher' }, stats: ['6', '80', '1'] }],
              },
            ],
          },
        ],
      },
    }
    const rows = boxScorePoints(raw)
    expect(rows.find((r) => r.id === '11')?.points).toBe(24)
    expect(rows.find((r) => r.id === '22')?.points).toBe(17)
    const game = liveGame({
      id: 'g',
      home: { ...liveGame({ id: 'x' }).home, abbr: 'HOM' },
      away: { ...liveGame({ id: 'x' }).away, abbr: 'AWY' },
    })
    const yours = playersInGame(game, [
      { id: '22', name: 'Catcher', nfl: 'HOM', teamId: 4, proj: 14.2 },
      { id: '99', name: 'Other Name', nfl: 'HOM', teamId: 4, proj: 3 },
      { id: '11', name: 'Passer', nfl: 'AWY', teamId: 9, proj: 20 },
    ], 4)
    expect(yours.map((p) => p.id)).toEqual(['22', '99'])
  })

  test('standouts are the box leaders, not a projection', () => {
    const rows = standoutsFrom({
      boxscore: {
        players: [
          {
            statistics: [
              { name: 'passing', keys: ['passingYards'], labels: ['YDS'], athletes: [{ athlete: { displayName: 'A' }, stats: ['10'] }, { athlete: { displayName: 'B' }, stats: ['80'] }] },
            ],
          },
        ],
      },
    })
    expect(rows).toEqual([{ label: 'Passing', name: 'B', stat: '80' }])
    expect(standoutsFrom({})).toEqual([])
  })
})

describe('which game sits in the center', () => {
  test('picks the live game with the most roster players, else the next kickoff, else the latest final', () => {
    const early = liveGame({ id: 'early', kickoff: '2026-10-18T17:00:00Z', state: 'in' })
    const late = liveGame({ id: 'late', kickoff: '2026-10-18T20:00:00Z', state: 'in' })
    const next = liveGame({ id: 'next', kickoff: '2026-10-18T21:00:00Z', state: 'pre' })
    expect(pickCenter([early, late, next], { early: 1, late: 3, next: 5 })).toBe('late')
    expect(pickCenter([next, liveGame({ id: 'later', kickoff: '2026-10-18T23:00:00Z', state: 'pre' })], {})).toBe('next')
    const doneA = liveGame({ id: 'a', kickoff: '2026-10-18T17:00:00Z', state: 'post' })
    const doneB = liveGame({ id: 'b', kickoff: '2026-10-18T20:20:00Z', state: 'post' })
    expect(pickCenter([doneA, doneB], {})).toBe('b')
  })

  test('spreads the other games around the ring', () => {
    expect(ringSlots(['a', 'b', 'c', 'd', 'e'])).toEqual({ top: ['a', 'e'], right: ['b'], bottom: ['c'], left: ['d'] })
    expect(ringSlots([])).toEqual({ top: [], right: [], bottom: [], left: [] })
  })
})

describe('headlines for this game', () => {
  test('keeps this game and drops other clubs and betting guides', () => {
    const items = headlinesFromSummary({
      article: { id: 'a', headline: 'The 49ers look to avoid a letdown' },
      news: {
        articles: [
          { id: 'b', headline: 'How to bet Cowboys-Packers: Analysis, tips and top prop plays' },
          { id: 'c', headline: "Panthers' Tremble admits a TD taunt" },
          { id: 'd', headline: 'Commanders try to get past a tie' },
        ],
      },
    }, 'g1', { names: ['San Francisco 49ers', 'Washington Commanders'], abbrs: ['SF', 'WSH'] })
    expect(items.map((item) => item.title)).toEqual([
      'The 49ers look to avoid a letdown',
      'Commanders try to get past a tie',
    ])
  })
})

describe('watch and clips', () => {
  test('maps a broadcast name to that network site', () => {
    expect(watchTarget('Prime Video')).toEqual({ label: 'Prime Video', href: 'https://www.primevideo.com/' })
    expect(watchTarget('NFL Net')?.href).toBe('https://www.nfl.com/network/')
    expect(watchTarget('ESPN')?.href).toBe('https://www.espn.com/watch/')
    expect(watchTarget('YouTube TV')?.href).toBe('https://tv.youtube.com/')
    expect(watchTarget(null)).toBeNull()
  })

  test('a pasted youtube url becomes an id and search is just a link', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=abcdefghijk')).toBe('abcdefghijk')
    expect(youtubeId('https://youtu.be/abcdefghijk')).toBe('abcdefghijk')
    expect(youtubeId('not a video')).toBeNull()
    expect(youtubeSearchHref('Houston Texans', 'Jacksonville Jaguars')).toContain('search_query=')
    expect(advanceClip(2, 3)).toBe(0)
  })
})

describe('shelf points', () => {
  test('a finished score, a projection, and an out player stay different labels', () => {
    expect(shelfPointLabel({ proj: 14.1, scored: 17, out: false, bye: false }, 'post')).toEqual({ kind: 'final', scored: 17 })
    expect(shelfPointLabel({ proj: 14.1, scored: 0, out: false, bye: false }, 'in')).toEqual({ kind: 'live', scored: 0, proj: 14.1 })
    expect(shelfPointLabel({ proj: 0, scored: 0, out: true, bye: false }, 'in')).toEqual({ kind: 'out' })
    expect(shelfPointLabel({ proj: null, scored: null, out: false, bye: false }, 'pre')).toEqual({ kind: 'missing' })
  })
})

describe('playback and pins', () => {
  test('leaving the center pauses and remembers, and a shelf clip is the only soundtrack', () => {
    let play: Playback = playCenter(idlePlayback(), 'g1')
    expect(play.centerPlaying).toBe(true)
    play = leaveCenter(play, 'g1', 1, 42)
    expect(play.centerPlaying).toBe(false)
    expect(play.memory.g1).toEqual({ index: 1, seconds: 42 })
    play = playCenter(play, 'g1')
    play = pinClipPauses(play, 'g1', 1, 50)
    expect(play.centerPlaying).toBe(false)
    expect(play.memory.g1.seconds).toBe(50)
    play = playCenter(play, 'g1')
    play = playShelf(play, 'vid', 'g1', 1, 55)
    expect(play.shelfPlaying).toBe(true)
    expect(play.centerPlaying).toBe(false)
    expect(play.audible).toBe('shelf')
    expect(play.memory.g1.seconds).toBe(55)
    play = pauseCenter(play, 'g1', 0, 1)
    expect(play.shelfPlaying).toBe(true)
  })

  test('pinning adds to the top and unpin removes that item', () => {
    const first = pushPin([], { id: 'a', kind: 'news' })
    const second = pushPin(first, { id: 'b', kind: 'player' })
    expect(second.map((p) => p.id)).toEqual(['b', 'a'])
    expect(pushPin(second, { id: 'a', kind: 'news' }).map((p) => p.id)).toEqual(['a', 'b'])
    expect(dropPin(second, 'b').map((p) => p.id)).toEqual(['a'])
  })
})
