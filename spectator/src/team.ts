/**
 * One NFL team's page, from the public team, schedule, statistics, leaders, and news feeds.
 * Missing blocks stay empty. Nothing here is a recommendation.
 */

import { num } from './board/normalize'

export interface StatLine {
  label: string
  value: string
}

export interface TeamGame {
  id: string
  week: number | null
  weekLabel: string
  name: string
  date: string
  state: 'pre' | 'in' | 'post'
  detail: string
  opponentAbbr: string
  opponentName: string
  home: boolean
  scoreFor: number | null
  scoreAgainst: number | null
  result: 'W' | 'L' | 'T' | null
}

export interface TeamLeader {
  label: string
  name: string
  stat: string
}

export interface TeamHeadline {
  id: string
  title: string
  blurb: string
  href: string | null
  teamAbbr: string
}

export interface TeamHighlight {
  label: string
  text: string
}

export interface TeamView {
  abbr: string
  id: string
  name: string
  location: string
  color: string
  logo: string | null
  record: string | null
  homeRecord: string | null
  roadRecord: string | null
  pointsFor: number | null
  pointsAgainst: number | null
  pointDifferential: number | null
  pointsPerGame: number | null
  yardsPerGame: number | null
  yardsAllowedPerGame: number | null
  offense: StatLine[]
  defense: StatLine[]
  leaders: TeamLeader[]
  headlines: TeamHeadline[]
  games: TeamGame[]
  focus: TeamGame | null
  lastFinal: TeamGame | null
  highlights: TeamHighlight[]
}

export interface TeamParts {
  team?: unknown
  stats?: unknown
  leaders?: unknown
  names?: Record<string, string>
  news?: unknown
  schedule?: unknown
}

const OFFENSE: { cat: string; name: string; label: string }[] = [
  { cat: 'scoring', name: 'totalPointsPerGame', label: 'Points per game' },
  { cat: 'passing', name: 'yardsPerGame', label: 'Yards per game' },
  { cat: 'passing', name: 'netPassingYardsPerGame', label: 'Net pass yards per game' },
  { cat: 'rushing', name: 'rushingYardsPerGame', label: 'Rush yards per game' },
  { cat: 'miscellaneous', name: 'thirdDownEff', label: 'Third down' },
  { cat: 'miscellaneous', name: 'turnOverDifferential', label: 'Turnover differential' },
]

const DEFENSE_OWN: { cat: string; name: string; label: string }[] = [
  { cat: 'defensive', name: 'sacks', label: 'Sacks' },
  { cat: 'defensiveInterceptions', name: 'interceptions', label: 'Interceptions' },
]

const DEFENSE_OPP: { cat: string; name: string; label: string }[] = [
  { cat: 'scoring', name: 'totalPointsPerGame', label: 'Points allowed per game' },
  { cat: 'passing', name: 'yardsPerGame', label: 'Yards allowed per game' },
  { cat: 'miscellaneous', name: 'thirdDownEff', label: 'Third down allowed' },
]

const LEADERS = new Set(['passingLeader', 'rushingLeader', 'receivingLeader'])

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

function teamNode(raw: unknown): Record<string, unknown> | null {
  if (!isRec(raw)) return null
  if (isRec(raw.team) && (str(raw.team.abbreviation) || str(raw.team.displayName))) return raw.team
  if (str(raw.abbreviation) || str(raw.displayName)) return raw
  return null
}

function logoOf(team: Record<string, unknown>): string | null {
  if (str(team.logo)) return str(team.logo)
  for (const logo of arr(team.logos)) {
    if (!isRec(logo)) continue
    const rel = arr(logo.rel).map(str)
    if (rel.includes('default') && str(logo.href)) return str(logo.href)
  }
  const first = arr(team.logos).find(isRec)
  return first ? str(first.href) || null : null
}

function recordItems(team: Record<string, unknown>): Record<string, unknown>[] {
  const record = isRec(team.record) ? team.record : {}
  return arr(record.items).filter(isRec)
}

function recordSummary(items: Record<string, unknown>[], type: string): string | null {
  const row = items.find((item) => str(item.type) === type)
  return row ? str(row.summary) || null : null
}

function recordStat(items: Record<string, unknown>[], type: string, name: string): number | null {
  const row = items.find((item) => str(item.type) === type)
  if (!row) return null
  for (const stat of arr(row.stats)) {
    if (isRec(stat) && str(stat.name) === name) return num(stat.value)
  }
  return null
}

function categoriesOf(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.filter(isRec)
  if (isRec(node)) return arr(node.categories).filter(isRec)
  return []
}

function statMap(node: unknown): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>()
  for (const cat of categoriesOf(node)) {
    const name = str(cat.name)
    if (!name) continue
    const stats = new Map<string, string>()
    for (const stat of arr(cat.stats)) {
      if (!isRec(stat)) continue
      const value = str(stat.displayValue)
      const key = str(stat.name)
      if (key && value && !stats.has(key)) stats.set(key, value)
    }
    out.set(name, stats)
  }
  return out
}

function pick(map: Map<string, Map<string, string>>, specs: { cat: string; name: string; label: string }[]): StatLine[] {
  const rows: StatLine[] = []
  for (const spec of specs) {
    const value = map.get(spec.cat)?.get(spec.name)
    if (value) rows.push({ label: spec.label, value })
  }
  return rows
}

export function athleteIdFromRef(ref: unknown): string | null {
  const href = typeof ref === 'string' ? ref : isRec(ref) ? str(ref.$ref) || str(ref.href) : ''
  const match = href.match(/athletes\/(\d+)/)
  return match ? match[1] : null
}

export function leaderAthleteIds(raw: unknown): string[] {
  const body = isRec(raw) ? raw : {}
  const ids: string[] = []
  for (const cat of arr(body.categories)) {
    if (!isRec(cat) || !LEADERS.has(str(cat.name))) continue
    const top = arr(cat.leaders).find(isRec)
    const id = top ? athleteIdFromRef(top.athlete) : null
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function leadersOf(raw: unknown, names: Record<string, string>): TeamLeader[] {
  const body = isRec(raw) ? raw : {}
  const out: TeamLeader[] = []
  for (const cat of arr(body.categories)) {
    if (!isRec(cat) || !LEADERS.has(str(cat.name))) continue
    const top = arr(cat.leaders).find(isRec)
    if (!top) continue
    const stat = str(top.displayValue).trim()
    if (!stat) continue
    const id = athleteIdFromRef(top.athlete)
    out.push({
      label: str(cat.displayName) || str(cat.name),
      name: (id && names[id]) || 'Player',
      stat,
    })
  }
  return out
}

function webHref(links: unknown): string | null {
  if (!isRec(links)) return null
  const web = links.web
  if (isRec(web) && str(web.href)) return str(web.href)
  return str(links.href) || null
}

function headlinesOf(raw: unknown, teamAbbr: string): TeamHeadline[] {
  const body = isRec(raw) ? raw : {}
  const out: TeamHeadline[] = []
  const seen = new Set<string>()
  for (const article of arr(body.articles)) {
    if (!isRec(article)) continue
    const title = str(article.headline).trim()
    const key = title.toLowerCase()
    if (!title || seen.has(key)) continue
    seen.add(key)
    out.push({
      id: str(article.id) || title,
      title,
      blurb: cleanBlurb(title, str(article.description)),
      href: webHref(article.links),
      teamAbbr,
    })
  }
  return out.slice(0, 6)
}

function scoreOf(raw: unknown): number | null {
  if (isRec(raw)) return num(raw.value) ?? num(raw.displayValue)
  return num(raw)
}

function gamesOf(raw: unknown, abbr: string): TeamGame[] {
  const body = isRec(raw) ? raw : {}
  const out: TeamGame[] = []
  for (const event of arr(body.events)) {
    if (!isRec(event)) continue
    const comp = arr(event.competitions).find(isRec)
    if (!comp) continue
    const competitors = arr(comp.competitors).filter(isRec)
    const us = competitors.find((c) => str(isRec(c.team) ? c.team.abbreviation : '').toUpperCase() === abbr)
    const them = competitors.find((c) => c !== us)
    if (!us || !them) continue
    const opp = isRec(them.team) ? them.team : {}
    const status = isRec(comp.status) ? comp.status : {}
    const type = isRec(status.type) ? status.type : {}
    const stateRaw = str(type.state)
    const state: TeamGame['state'] = stateRaw === 'in' || stateRaw === 'post' ? stateRaw : 'pre'
    const week = isRec(event.week) ? event.week : {}
    const weekNumber = num(week.number)
    const forScore = scoreOf(us.score)
    const against = scoreOf(them.score)
    let result: TeamGame['result'] = null
    if (state === 'post') {
      if (us.winner === true) result = 'W'
      else if (them.winner === true) result = 'L'
      else if (forScore != null && against != null && forScore === against) result = 'T'
    }
    out.push({
      id: str(event.id) || str(comp.id),
      week: weekNumber,
      weekLabel: str(week.text) || (weekNumber != null ? `Week ${weekNumber}` : 'Week'),
      name: str(event.shortName) || str(event.name),
      date: str(event.date) || str(comp.date),
      state,
      detail: str(type.shortDetail) || str(type.detail) || (state === 'post' ? 'Final' : 'Scheduled'),
      opponentAbbr: str(opp.abbreviation) || '—',
      opponentName: str(opp.displayName) || str(opp.name) || 'Opponent',
      home: us.homeAway === 'home',
      scoreFor: forScore,
      scoreAgainst: against,
      result,
    })
  }
  return out
}

function shown(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded)
}

function highlightsOf(view: Omit<TeamView, 'highlights'>): TeamHighlight[] {
  const out: TeamHighlight[] = []
  const diff = view.pointDifferential
  if (diff != null) {
    const margin = shown(Math.abs(diff))
    const text = diff === 0
      ? `${view.name} are even on points this season.`
      : diff > 0
        ? `${view.name} are ahead by ${margin} points this season.`
        : `${view.name} have been outscored by ${margin} points this season.`
    out.push({ label: 'Point differential', text })
  }
  if (view.homeRecord && view.roadRecord) {
    out.push({ label: 'Home and road', text: `${view.homeRecord} at home and ${view.roadRecord} on the road.` })
  }
  const scored = view.games.filter((game) => game.state === 'post' && game.scoreFor != null)
  const last = scored.slice(-5)
  if (last.length >= 2) {
    const avg = last.reduce((sum, game) => sum + (game.scoreFor ?? 0), 0) / last.length
    let text = `Over the last ${last.length} games they scored ${shown(avg)} a game.`
    if (view.pointsPerGame != null) text += ` Their season average is ${shown(view.pointsPerGame)}.`
    out.push({ label: 'Recent scoring', text })
  }
  if (view.yardsPerGame != null && view.yardsAllowedPerGame != null) {
    out.push({
      label: 'Yardage',
      text: `${shown(view.yardsPerGame)} yards a game on offense, ${shown(view.yardsAllowedPerGame)} allowed.`,
    })
  }
  return out.slice(0, 4)
}

export function parseTeamView(parts: TeamParts): TeamView | null {
  const team = teamNode(parts.team)
  if (!team) return null
  const abbr = (str(team.abbreviation) || '—').toUpperCase()
  const name = str(team.displayName) || str(team.name) || abbr
  const items = recordItems(team)
  const color = str(team.color)
  const results = isRec(parts.stats) && isRec(parts.stats.results) ? parts.stats.results : {}
  const own = statMap(results.stats)
  const opp = statMap(results.opponent)
  const offense = pick(own, OFFENSE)
  const defense = [...pick(opp, DEFENSE_OPP), ...pick(own, DEFENSE_OWN)]
  const games = gamesOf(parts.schedule, abbr)
  const finals = games.filter((game) => game.state === 'post')
  const focus = games.find((game) => game.state === 'pre' || game.state === 'in') ?? finals[finals.length - 1] ?? null
  const lastFinal = finals[finals.length - 1] ?? null
  const pointsPerGame = num(own.get('scoring')?.get('totalPointsPerGame') ?? null)
  const yardsPerGame = num(own.get('passing')?.get('yardsPerGame') ?? null)
  const yardsAllowed = num(opp.get('passing')?.get('yardsPerGame') ?? null)
  const view: Omit<TeamView, 'highlights'> = {
    abbr,
    id: str(team.id),
    name,
    location: str(team.location),
    color: /^[0-9a-fA-F]{6}$/.test(color) ? `#${color}` : '#7d8a9b',
    logo: logoOf(team),
    record: recordSummary(items, 'total'),
    homeRecord: recordSummary(items, 'home'),
    roadRecord: recordSummary(items, 'road'),
    pointsFor: recordStat(items, 'total', 'pointsFor'),
    pointsAgainst: recordStat(items, 'total', 'pointsAgainst'),
    pointDifferential: recordStat(items, 'total', 'pointDifferential'),
    pointsPerGame,
    yardsPerGame,
    yardsAllowedPerGame: yardsAllowed,
    offense,
    defense,
    leaders: leadersOf(parts.leaders, parts.names ?? {}),
    headlines: headlinesOf(parts.news, abbr === '—' ? '' : abbr),
    games,
    focus,
    lastFinal,
  }
  return { ...view, highlights: highlightsOf(view) }
}

export function athleteName(raw: unknown): string | null {
  if (!isRec(raw)) return null
  const athlete = isRec(raw.athlete) ? raw.athlete : raw
  return str(athlete.displayName) || str(athlete.fullName) || null
}

export function seasonYear(raw: unknown): number | null {
  if (!isRec(raw)) return null
  const season = isRec(raw.season) ? raw.season : isRec(raw.requestedSeason) ? raw.requestedSeason : {}
  return num(season.year)
}

export function teamIdOf(raw: unknown): string | null {
  const team = teamNode(raw)
  return team ? str(team.id) || null : null
}
