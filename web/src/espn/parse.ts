/**
 * ESPN public JSON, shaped for the club page, the news desk, and the thin player page.
 * Missing blocks stay null. Nothing here is estimated or filled in.
 */

export interface ClubGame {
  id: string
  name: string
  date: string | null
  detail: string | null
  state: 'pre' | 'in' | 'post' | null
  homeAbbr: string
  awayAbbr: string
  homeName: string
  awayName: string
  homeScore: number | null
  awayScore: number | null
}

export interface ClubProfile {
  id: string
  abbr: string
  name: string
  color: string | null
  logo: string | null
  record: string | null
  pointsFor: number | null
  pointsAgainst: number | null
  next: ClubGame | null
}

export interface StatLine {
  points: number | null
  pointsPerGame: number | null
  yards: number | null
  yardsPerGame: number | null
  passYardsPerGame: number | null
  rushYardsPerGame: number | null
}

export interface ClubStats {
  offense: StatLine
  defense: StatLine
}

export interface NewsItem {
  id: string
  headline: string
  summary: string | null
  published: string | null
  url: string | null
  teams: string[]
  playerId: string | null
  gameId: string | null
  source: 'jev' | 'espn' | 'scoreboard'
}

export interface RosterPlayer {
  id: string
  name: string
  pos: string
  injury: string | null
  headshot: string | null
}

export interface AthleteCard {
  id: string
  name: string
  pos: string | null
  teamAbbr: string | null
  teamName: string | null
  jersey: string | null
  status: string | null
  headshot: string | null
  injury: string | null
  stats: { label: string; value: string }[]
}

const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function scoreOf(v: unknown): number | null {
  if (isRec(v)) return num(v.value)
  return num(v)
}

function hexColor(v: unknown): string | null {
  const raw = str(v).replace('#', '')
  return /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : null
}

function stateOf(v: unknown): ClubGame['state'] {
  const s = str(v)
  if (s === 'pre' || s === 'in' || s === 'post') return s
  return null
}

export function parseClubGame(event: unknown): ClubGame | null {
  if (!isRec(event)) return null
  const comp = arr(event.competitions).find(isRec)
  if (!comp) return null
  const sides = arr(comp.competitors).filter(isRec)
  const home = sides.find((s) => s.homeAway === 'home')
  const away = sides.find((s) => s.homeAway === 'away')
  if (!home || !away) return null
  const homeTeam = isRec(home.team) ? home.team : null
  const awayTeam = isRec(away.team) ? away.team : null
  const homeAbbr = str(homeTeam?.abbreviation).toUpperCase()
  const awayAbbr = str(awayTeam?.abbreviation).toUpperCase()
  if (!homeAbbr || !awayAbbr) return null
  const status = isRec(comp.status) && isRec(comp.status.type) ? comp.status.type : null
  const id = str(event.id) || str(comp.id)
  if (!id) return null
  return {
    id,
    name: str(event.shortName) || str(event.name) || `${awayAbbr} @ ${homeAbbr}`,
    date: str(event.date) || null,
    detail: status ? str(status.shortDetail) || str(status.description) || null : null,
    state: stateOf(status?.state),
    homeAbbr,
    awayAbbr,
    homeName: str(homeTeam?.displayName) || homeAbbr,
    awayName: str(awayTeam?.displayName) || awayAbbr,
    homeScore: scoreOf(home.score),
    awayScore: scoreOf(away.score),
  }
}

function statNumber(stats: unknown, name: string): number | null {
  const hit = arr(stats).find((s) => isRec(s) && s.name === name)
  return hit && isRec(hit) ? num(hit.value) : null
}

export function parseClub(raw: unknown): ClubProfile | null {
  if (!isRec(raw)) return null
  const team = isRec(raw.team) ? raw.team : raw
  const abbr = str(team.abbreviation).toUpperCase()
  const id = str(team.id)
  const name = str(team.displayName)
  if (!abbr || !id || !name) return null
  const recordItems = isRec(team.record) ? arr(team.record.items) : []
  const total = recordItems.find((item) => isRec(item) && item.type === 'total')
  const record = total && isRec(total) ? str(total.summary) || null : null
  const stats = total && isRec(total) ? total.stats : null
  const logos = arr(team.logos)
  const logo = logos.find((item) => isRec(item) && str(item.href))
  const next = arr(team.nextEvent).map(parseClubGame).find((g) => g !== null) ?? null
  return {
    id,
    abbr,
    name,
    color: hexColor(team.color),
    logo: logo && isRec(logo) ? str(logo.href) : null,
    record,
    pointsFor: statNumber(stats, 'pointsFor'),
    pointsAgainst: statNumber(stats, 'pointsAgainst'),
    next,
  }
}

function categoriesOf(block: unknown): Record<string, unknown>[] {
  if (!isRec(block)) return []
  return arr(block.categories).filter(isRec)
}

function readStat(cats: Record<string, unknown>[], category: string, name: string): { value: number | null; perGame: number | null } {
  const cat = cats.find((c) => c.name === category)
  const stat = cat ? arr(cat.stats).find((s) => isRec(s) && s.name === name) : null
  if (!stat || !isRec(stat)) return { value: null, perGame: null }
  return { value: num(stat.value), perGame: num(stat.perGameValue) }
}

function lineFrom(cats: Record<string, unknown>[]): StatLine {
  const points = readStat(cats, 'scoring', 'totalPoints')
  const ppg = readStat(cats, 'scoring', 'totalPointsPerGame')
  const yards = readStat(cats, 'rushing', 'totalYards')
  const pass = readStat(cats, 'passing', 'passingYardsPerGame')
  const rush = readStat(cats, 'rushing', 'rushingYardsPerGame')
  return {
    points: points.value,
    pointsPerGame: ppg.value,
    yards: yards.value,
    yardsPerGame: yards.perGame,
    passYardsPerGame: pass.value,
    rushYardsPerGame: rush.value,
  }
}

export function statLineEmpty(line: StatLine): boolean {
  return line.points == null && line.pointsPerGame == null && line.yards == null && line.yardsPerGame == null
}

export function parseClubStats(raw: unknown): ClubStats | null {
  if (!isRec(raw) || !isRec(raw.results)) return null
  const own = isRec(raw.results.stats) ? categoriesOf(raw.results.stats) : []
  const opp = arr(raw.results.opponent).filter(isRec)
  if (!own.length && !opp.length) return null
  return { offense: lineFrom(own), defense: lineFrom(opp) }
}

export function parseLastGame(raw: unknown): ClubGame | null {
  if (!isRec(raw)) return null
  const done = arr(raw.events)
    .map((event) => {
      if (!isRec(event)) return null
      const comp = arr(event.competitions).find(isRec)
      const status = comp && isRec(comp.status) && isRec(comp.status.type) ? comp.status.type : null
      const finished = status?.completed === true || status?.state === 'post'
      return finished ? parseClubGame(event) : null
    })
    .filter((g): g is ClubGame => g !== null)
  return done.length ? done[done.length - 1]! : null
}

function webHref(links: unknown): string | null {
  if (!isRec(links) || !isRec(links.web)) return null
  const href = str(links.web.href)
  return href.startsWith('http') ? href : null
}

function teamAbbrs(categories: unknown): string[] {
  const out: string[] = []
  for (const cat of arr(categories)) {
    if (!isRec(cat) || cat.type !== 'team' || !isRec(cat.team)) continue
    const abbr = str(cat.team.abbreviation).toUpperCase()
    if (abbr && !out.includes(abbr)) out.push(abbr)
  }
  return out
}

export function parseEspnNews(raw: unknown): NewsItem[] {
  if (!isRec(raw)) return []
  const items: NewsItem[] = []
  for (const article of arr(raw.articles)) {
    if (!isRec(article)) continue
    const headline = str(article.headline)
    const id = str(article.id) || str(article.nowId)
    if (!headline || !id) continue
    const summary = str(article.description) || null
    items.push({
      id: `espn-${id}`,
      headline,
      summary,
      published: str(article.published) || str(article.lastModified) || null,
      url: webHref(article.links),
      teams: teamAbbrs(article.categories),
      playerId: null,
      gameId: null,
      source: 'espn',
    })
  }
  return items
}

export function parseAthleteNews(raw: unknown): NewsItem[] {
  if (!isRec(raw)) return []
  return parseEspnNews({ articles: raw.news })
}

export function parseScoreboardHeadlines(raw: unknown): NewsItem[] {
  const root = isRec(raw) && isRec(raw.scoreboard) ? raw.scoreboard : raw
  if (!isRec(root)) return []
  const items: NewsItem[] = []
  for (const event of arr(root.events)) {
    if (!isRec(event)) continue
    const game = parseClubGame(event)
    for (const comp of arr(event.competitions)) {
      if (!isRec(comp)) continue
      for (const headline of arr(comp.headlines)) {
        if (!isRec(headline)) continue
        const title = str(headline.shortLinkText)
        const blurb = str(headline.description).replace(/^—\s*/, '')
        const text = title || (blurb && blurb !== '—' ? blurb : '')
        if (!text || !game) continue
        items.push({
          id: `board-${game.id}-${items.length}`,
          headline: text,
          summary: title && blurb && blurb !== title ? blurb : null,
          published: null,
          url: null,
          teams: [game.awayAbbr, game.homeAbbr],
          playerId: null,
          gameId: game.id,
          source: 'scoreboard',
        })
      }
    }
  }
  return items
}

export function newsFromPlayers(players: { id: string; name: string; nfl: string; jev: { headline: string | null; url: string | null; published: string | null; role: string; timeline: string | null } | null }[]): NewsItem[] {
  const items: NewsItem[] = []
  for (const p of players) {
    const headline = p.jev?.headline?.trim()
    if (!headline) continue
    const bits = [
      p.jev && p.jev.role !== 'none' ? `Role ${p.jev.role}` : null,
      p.jev?.timeline && p.jev.timeline !== 'not_stated' ? p.jev.timeline.replaceAll('_', ' ') : null,
    ].filter((x): x is string => Boolean(x))
    items.push({
      id: `jev-${p.id}`,
      headline,
      summary: bits.length ? bits.join('. ') : null,
      published: p.jev?.published ?? null,
      url: p.jev?.url ?? null,
      teams: p.nfl ? [p.nfl.toUpperCase()] : [],
      playerId: p.id,
      gameId: null,
      source: 'jev',
    })
  }
  return items
}

/** Attach a league player when the headline contains that player's name. Longer names win. */
export function linkNewsToPlayers(items: NewsItem[], players: { id: string; name: string; nfl: string }[]): NewsItem[] {
  const sorted = [...players].filter((p) => p.name.trim().length > 4).sort((a, b) => b.name.length - a.name.length)
  return items.map((item) => {
    if (item.playerId) return item
    const hay = item.headline.toLowerCase()
    const hit = sorted.find((p) => hay.includes(p.name.toLowerCase()))
    if (!hit) return item
    const teams = item.teams.length ? item.teams : hit.nfl ? [hit.nfl.toUpperCase()] : []
    return { ...item, playerId: hit.id, teams }
  })
}

export function dedupeNews(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  for (const item of items) {
    const key = item.headline.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export function parseRoster(raw: unknown): RosterPlayer[] {
  if (!isRec(raw)) return []
  const out: RosterPlayer[] = []
  for (const group of arr(raw.athletes)) {
    if (!isRec(group)) continue
    for (const player of arr(group.items)) {
      if (!isRec(player)) continue
      const pos = isRec(player.position) ? str(player.position.abbreviation).toUpperCase() : ''
      const id = str(player.id)
      const name = str(player.fullName) || str(player.displayName)
      if (!SKILL.has(pos) || !id || !name) continue
      const injury = arr(player.injuries).find((row) => isRec(row) && str(row.status))
      const head = isRec(player.headshot) ? str(player.headshot.href) : ''
      out.push({
        id,
        name,
        pos,
        injury: injury && isRec(injury) ? str(injury.status) : null,
        headshot: head || null,
      })
    }
  }
  return out
}

export function parseAthlete(raw: unknown): AthleteCard | null {
  if (!isRec(raw)) return null
  const athlete = isRec(raw.athlete) ? raw.athlete : raw
  const id = str(athlete.id)
  const name = str(athlete.displayName) || str(athlete.fullName)
  if (!id || !name) return null
  const team = isRec(athlete.team) ? athlete.team : null
  const pos = isRec(athlete.position) ? str(athlete.position.abbreviation).toUpperCase() : ''
  const summary = isRec(athlete.statsSummary) ? arr(athlete.statsSummary.statistics) : []
  const stats = summary.flatMap((row) => {
    if (!isRec(row)) return []
    const label = str(row.shortDisplayName) || str(row.displayName)
    const value = str(row.displayValue)
    if (!label || !value) return []
    const rank = str(row.rankDisplayValue)
    return [{ label, value: rank ? `${value} (${rank})` : value }]
  })
  const injuryRow = arr(athlete.injuries).find((row) => isRec(row) && str(row.status))
  const head = isRec(athlete.headshot) ? str(athlete.headshot.href) : ''
  const status = isRec(athlete.status) ? str(athlete.status.name) || str(athlete.status.abbreviation) : ''
  return {
    id,
    name,
    pos: pos || null,
    teamAbbr: team ? str(team.abbreviation).toUpperCase() || null : null,
    teamName: team ? str(team.displayName) || null : null,
    jersey: str(athlete.jersey) || null,
    status: status || null,
    headshot: head || null,
    injury: injuryRow && isRec(injuryRow) ? str(injuryRow.status) : null,
    stats,
  }
}

export function injuryFromRoster(roster: RosterPlayer[], id: string): string | null {
  return roster.find((p) => p.id === id)?.injury ?? null
}
