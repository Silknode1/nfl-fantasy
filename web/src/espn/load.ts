import {
  injuryFromRoster,
  parseAthlete,
  parseAthleteNews,
  parseClub,
  parseClubStats,
  parseEspnNews,
  parseLastGame,
  parseRoster,
  parseScoreboardHeadlines,
  type AthleteCard,
  type ClubGame,
  type ClubProfile,
  type ClubStats,
  type NewsItem,
  type RosterPlayer,
} from './parse'

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}

export async function fetchClub(abbr: string): Promise<ClubProfile> {
  const raw = await getJson(`/espn/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(abbr.toLowerCase())}`)
  const club = parseClub(raw)
  if (!club) throw new Error('ESPN club payload had no team')
  return club
}

export async function fetchClubStats(id: string): Promise<ClubStats | null> {
  try {
    return parseClubStats(await getJson(`/espn/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(id)}/statistics`))
  } catch {
    return null
  }
}

export async function fetchLastGame(id: string): Promise<ClubGame | null> {
  try {
    return parseLastGame(await getJson(`/espn/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(id)}/schedule`))
  } catch {
    return null
  }
}

export async function fetchRoster(abbr: string): Promise<RosterPlayer[]> {
  try {
    return parseRoster(await getJson(`/espn/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(abbr.toLowerCase())}/roster`))
  } catch {
    return []
  }
}

export async function fetchAthlete(id: string): Promise<{ card: AthleteCard; news: NewsItem[] }> {
  const [core, overview] = await Promise.all([
    getJson(`/espn/apis/common/v3/sports/football/nfl/athletes/${encodeURIComponent(id)}`),
    getJson(`/espn/apis/common/v3/sports/football/nfl/athletes/${encodeURIComponent(id)}/overview`).catch(() => null),
  ])
  const card = parseAthlete(core)
  if (!card) throw new Error('ESPN athlete payload had no player')
  const news = overview ? parseAthleteNews(overview) : []
  if (!card.injury && card.teamAbbr) {
    card.injury = injuryFromRoster(await fetchRoster(card.teamAbbr), card.id)
  }
  return { card, news }
}

export async function fetchNewsBundle(): Promise<{ espn: NewsItem[]; scoreboard: NewsItem[]; espnFailed: boolean; boardFailed: boolean }> {
  const espnTry = getJson('/espn/apis/site/v2/sports/football/nfl/news?limit=15')
    .then((raw) => ({ items: parseEspnNews(raw), failed: false }))
    .catch(() => ({ items: [] as NewsItem[], failed: true }))
  const boardTry = getJson('/espn/apis/site/v2/sports/football/nfl/scoreboard')
    .then((raw) => ({ items: parseScoreboardHeadlines(raw), failed: false }))
    .catch(async () => {
      try {
        const saved = await getJson('data/scoreboard.json')
        return { items: parseScoreboardHeadlines(saved), failed: false }
      } catch {
        return { items: [] as NewsItem[], failed: true }
      }
    })
  const [espn, board] = await Promise.all([espnTry, boardTry])
  return { espn: espn.items, scoreboard: board.items, espnFailed: espn.failed, boardFailed: board.failed }
}
