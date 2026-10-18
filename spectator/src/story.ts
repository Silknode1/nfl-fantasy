/**
 * Play-by-play, headlines, and season lines from an ESPN summary or scoreboard.
 * Missing blocks become empty lists. Nothing here is a wager.
 */

import { num, scoreboardBody } from './board/normalize'

export interface DrivePlay {
  id: string
  text: string
  clock: string
  quarter: number | null
  down: string
  scoring: boolean
  awayScore: number | null
  homeScore: number | null
}

export interface Drive {
  id: string
  team: string
  result: string
  summary: string
  plays: DrivePlay[]
}

export interface Headline {
  id: string
  title: string
  blurb: string
  href: string | null
  gameId: string | null
  gameName: string | null
  /** Game recap or preview, versus a league item that rode along on the summary. */
  kind: 'game' | 'league'
}

export interface SeasonLine {
  abbr: string
  name: string
  points: number | null
  yards: number | null
  passYds: number | null
  rushYds: number | null
  pointsAllowed: number | null
}

export interface TeamStatBlock {
  abbr: string
  name: string
  rows: { label: string; value: string }[]
}

export interface LeaderLine {
  label: string
  name: string
  value: string
  team: string
}

const DOWN = ['', '1st', '2nd', '3rd', '4th']

const SEASON_KEYS = [
  'totalPointsPerGame',
  'yardsPerGame',
  'passingYardsPerGame',
  'rushingYardsPerGame',
  'totalPointsPerGameAllowed',
] as const

const KEY_STATS: { name: string; label: string }[] = [
  { name: 'totalPointsPerGame', label: 'Points per game' },
  { name: 'yardsPerGame', label: 'Yards per game' },
  { name: 'passingYardsPerGame', label: 'Pass yards per game' },
  { name: 'rushingYardsPerGame', label: 'Rush yards per game' },
  { name: 'totalPointsPerGameAllowed', label: 'Points allowed' },
  { name: 'totalYards', label: 'Total yards' },
  { name: 'netPassingYards', label: 'Net passing' },
  { name: 'rushingYards', label: 'Rushing' },
  { name: 'turnovers', label: 'Turnovers' },
  { name: 'thirdDownEff', label: 'Third down' },
]

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function cleanBlurb(title: string, description: string): string {
  const text = description.replace(/^[\s—–-]+/, '').trim()
  if (!text || text === title) return ''
  return text
}

function webHref(links: unknown): string | null {
  if (!isRec(links)) return null
  const web = links.web
  if (isRec(web) && str(web.href)) return str(web.href)
  return str(links.href) || null
}

function downText(start: unknown): string {
  if (!isRec(start)) return ''
  const down = num(start.down)
  const dist = num(start.distance)
  if (down == null || down < 1 || dist == null || dist < 1) return ''
  return `${DOWN[down] || `${down}th`} & ${dist}`
}

function playFrom(raw: unknown, index: number): DrivePlay | null {
  if (!isRec(raw)) return null
  const text = str(raw.text).trim()
  if (!text) return null
  const scoring = raw.scoringPlay === true
  return {
    id: str(raw.id) || `play-${index}`,
    text,
    clock: isRec(raw.clock) ? str(raw.clock.displayValue) : '',
    quarter: isRec(raw.period) ? num(raw.period.number) : null,
    down: downText(raw.start),
    scoring,
    awayScore: scoring ? num(raw.awayScore) : null,
    homeScore: scoring ? num(raw.homeScore) : null,
  }
}

function driveFrom(raw: unknown, index: number): Drive | null {
  if (!isRec(raw)) return null
  const team = isRec(raw.team) ? raw.team : {}
  const plays = arr(raw.plays)
    .map(playFrom)
    .filter((p): p is DrivePlay => p !== null)
  const result = str(raw.displayResult) || str(raw.shortDisplayResult) || str(raw.result)
  const summary = str(raw.description)
  if (!result && !summary && plays.length === 0) return null
  return {
    id: str(raw.id) || `drive-${index}`,
    team: str(team.abbreviation) || str(team.displayName) || 'Team',
    result: result || 'Drive',
    summary,
    plays,
  }
}

/** Previous drives, then the current one when ESPN includes it. */
export function drivesFrom(raw: unknown): Drive[] {
  const body = isRec(raw) ? raw : {}
  const drives = isRec(body.drives) ? body.drives : {}
  const rows = [...arr(drives.previous)]
  if (isRec(drives.current)) rows.push(drives.current)
  return rows.map(driveFrom).filter((d): d is Drive => d !== null)
}

function headlineFrom(raw: unknown, game: { id: string; name: string } | null, kind: Headline['kind']): Headline | null {
  if (!isRec(raw)) return null
  const title = (str(raw.headline) || str(raw.shortLinkText)).trim()
  if (!title) return null
  return {
    id: str(raw.id) || str(raw.nowId) || `${kind}:${title}`,
    title,
    blurb: cleanBlurb(title, str(raw.description)),
    href: webHref(raw.links),
    gameId: game?.id || str(raw.gameId) || null,
    gameName: game?.name || null,
    kind,
  }
}

export function dedupeHeadlines(items: Headline[]): Headline[] {
  const seen = new Set<string>()
  const out: Headline[] = []
  for (const item of items) {
    const key = item.title.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/** Game story first, then league items that arrived on the same summary. */
export function headlinesFromSummary(raw: unknown, game?: { id: string; name: string }): Headline[] {
  const body = isRec(raw) ? raw : {}
  const tag = game ?? null
  const out: Headline[] = []
  const story = headlineFrom(body.article, tag, 'game')
  if (story) out.push(story)
  const news = isRec(body.news) ? body.news : {}
  for (const article of arr(news.articles)) {
    const item = headlineFrom(article, null, 'league')
    if (item) out.push(item)
  }
  for (const article of arr(body.articles)) {
    const item = headlineFrom(article, null, 'league')
    if (item) out.push(item)
  }
  return dedupeHeadlines(out)
}

/** Recap lines that live on the scoreboard competition, not the summary. */
export function headlinesFromScoreboard(raw: unknown): Headline[] {
  const { body } = scoreboardBody(raw)
  const out: Headline[] = []
  for (const ev of arr(body.events)) {
    if (!isRec(ev)) continue
    const game = { id: str(ev.id), name: str(ev.shortName) || str(ev.name) }
    for (const comp of arr(ev.competitions)) {
      if (!isRec(comp)) continue
      for (const headline of arr(comp.headlines)) {
        const item = headlineFrom(headline, game.id ? game : null, 'game')
        if (item) out.push(item)
      }
    }
  }
  return dedupeHeadlines(out)
}

export function seasonLinesFrom(raw: unknown): SeasonLine[] {
  const body = isRec(raw) ? raw : {}
  const box = isRec(body.boxscore) ? body.boxscore : {}
  const out: SeasonLine[] = []
  for (const row of arr(box.teams)) {
    if (!isRec(row)) continue
    const team = isRec(row.team) ? row.team : {}
    const stats = new Map<string, number>()
    for (const stat of arr(row.statistics)) {
      if (!isRec(stat)) continue
      const name = str(stat.name)
      if (!SEASON_KEYS.includes(name as (typeof SEASON_KEYS)[number])) continue
      const value = num(stat.displayValue)
      if (value != null) stats.set(name, value)
    }
    if (!stats.size) continue
    out.push({
      abbr: str(team.abbreviation) || '—',
      name: str(team.displayName) || str(team.name) || 'Team',
      points: stats.get('totalPointsPerGame') ?? null,
      yards: stats.get('yardsPerGame') ?? null,
      passYds: stats.get('passingYardsPerGame') ?? null,
      rushYds: stats.get('rushingYardsPerGame') ?? null,
      pointsAllowed: stats.get('totalPointsPerGameAllowed') ?? null,
    })
  }
  return out
}

export function keyTeamStats(raw: unknown): TeamStatBlock[] {
  const body = isRec(raw) ? raw : {}
  const box = isRec(body.boxscore) ? body.boxscore : {}
  const out: TeamStatBlock[] = []
  for (const row of arr(box.teams)) {
    if (!isRec(row)) continue
    const team = isRec(row.team) ? row.team : {}
    const byName = new Map<string, string>()
    for (const stat of arr(row.statistics)) {
      if (!isRec(stat)) continue
      const value = str(stat.displayValue)
      if (value) byName.set(str(stat.name), value)
    }
    const rows = KEY_STATS
      .filter((spec) => byName.has(spec.name))
      .slice(0, 5)
      .map((spec) => ({ label: spec.label, value: byName.get(spec.name)! }))
    if (!rows.length) continue
    out.push({
      abbr: str(team.abbreviation) || '—',
      name: str(team.displayName) || str(team.name) || 'Team',
      rows,
    })
  }
  return out
}

export function leadersFromSummary(raw: unknown): LeaderLine[] {
  const body = isRec(raw) ? raw : {}
  const out: LeaderLine[] = []
  for (const block of arr(body.leaders)) {
    if (!isRec(block)) continue
    const team = isRec(block.team) ? block.team : {}
    const teamName = str(team.abbreviation) || str(team.displayName)
    for (const cat of arr(block.leaders)) {
      if (!isRec(cat)) continue
      const label = str(cat.displayName) || str(cat.name)
      if (!/pass|rush|receiv/i.test(label)) continue
      const top = arr(cat.leaders).find(isRec)
      if (!top) continue
      const athlete = isRec(top.athlete) ? top.athlete : {}
      out.push({
        label,
        name: str(athlete.displayName) || 'Player',
        value: str(top.displayValue),
        team: teamName,
      })
    }
  }
  return out.slice(0, 8)
}
