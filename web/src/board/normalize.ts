/**
 * Current NFL week, from ESPN's public scoreboard, shaped for the games board.
 *
 * The spread and total are one book's price. Implied team totals are that price
 * restated as points each team is expected to score. Nothing here is a pick,
 * a win probability for a wager, or a link to a sportsbook.
 */

export type GameState = 'pre' | 'in' | 'post'
export type BoardFilter = 'pre' | 'in' | 'post' | 'all'
export type BoardSort = 'kickoff' | 'total' | 'spread'

export interface Side {
  id: string
  abbr: string
  name: string
  location: string
  score: number | null
  winner: boolean
  record: string | null
  homeRecord: string | null
  roadRecord: string | null
  color: string
  logo: string | null
}

export interface QuoteSide {
  /** Spread from this team's perspective. Negative means this team is favored. */
  line: number | null
  openLine: number | null
  /** American price of this team's spread. */
  price: number | null
  moneyline: number | null
  openMoneyline: number | null
}

export interface GameQuote {
  book: string
  /** Home team's spread. Negative means the home team is favored. */
  homeSpread: number | null
  total: number | null
  openTotal: number | null
  overPrice: number | null
  underPrice: number | null
  home: QuoteSide
  away: QuoteSide
  favoriteFlipped: boolean
}

export interface Leader {
  label: string
  name: string
  stat: string
  teamId: string
}

/** Ball, red zone, and clock, only from an ESPN situation object. */
export interface GameSituation {
  possessionId: string | null
  redZone: boolean | null
  clock: string | null
}

export interface BoardGame {
  id: string
  kickoff: string
  name: string
  state: GameState
  detail: string
  neutral: boolean
  note: string | null
  venue: string | null
  city: string | null
  indoor: boolean | null
  broadcast: string | null
  home: Side
  away: Side
  quote: GameQuote | null
  /** (total ∓ home spread) / 2, rounded to the half point. */
  implied: { home: number; away: number } | null
  leaders: Leader[]
  situation: GameSituation | null
}

export interface ByeTeam {
  abbr: string
  name: string
}

export interface Board {
  season: number
  week: number
  byes: ByeTeam[]
  games: BoardGame[]
  fetchedAt: string
}

export interface RecentGame {
  id: string | null
  week: number | null
  result: string
  opponent: string
  atVs: string
  pointsFor: number | null
  pointsAgainst: number | null
  /** Headline ESPN already stored on this result, if the payload had one. */
  headline: string | null
}

export interface InjuryRow {
  name: string
  pos: string
  status: 'Out' | 'Doubtful' | 'Questionable'
  detail: string
}

export interface TeamContext {
  abbr: string
  name: string
  recent: RecentGame[]
  avgPoints: number | null
  implied: number | null
  gap: number | null
  gapNote: string | null
  injuries: InjuryRow[]
  irCount: number
}

export interface GameContext {
  home: TeamContext
  away: TeamContext
  /** ESPN's own matchup model, in percent. Not a market price. */
  predictor: { home: number; away: number } | null
}

const INJURY_RANK: Record<InjuryRow['status'], number> = { Out: 0, Doubtful: 1, Questionable: 2 }

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim().replace(/^[ou]/i, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function half(n: number): number {
  return Math.round(n * 2) / 2
}

/**
 * Favorite's implied total is the larger one. homeSpread is negative when home is favored.
 * Home is rounded to the half point, and away is the rest of the total, so the two numbers still add up.
 */
export function impliedTeamTotals(total: number, homeSpread: number): { home: number; away: number } {
  const home = half((total - homeSpread) / 2)
  return { home, away: half(total - home) }
}

export function formatLine(n: number | null): string {
  if (n == null) return '—'
  const shown = (Math.round(n * 2) / 2).toFixed(1)
  return n > 0 ? `+${shown}` : shown
}

export function formatAmerican(n: number | null): string {
  if (n == null) return '—'
  const r = Math.round(n)
  return r > 0 ? `+${r}` : String(r)
}

/** What the American price charges. A description of the price, not a suggestion to take it. */
export function priceSentence(american: number): string {
  const a = Math.round(american)
  if (a < 0) return `Risk ${Math.abs(a)} to win 100`
  if (a > 0) return `Risk 100 to win ${a}`
  return 'Even money'
}

export function scriptNote(game: BoardGame): string | null {
  const spread = game.quote?.homeSpread
  if (spread == null || Math.abs(spread) < 7) return null
  const fav = spread < 0 ? game.home.name : game.away.name
  const dog = spread < 0 ? game.away.name : game.home.name
  const margin = Math.abs(spread).toFixed(1)
  return `${fav} are favored by ${margin}. A margin that large often means more rushes for ${fav} and more dropbacks for ${dog}.`
}

export function scoringGapNote(name: string, implied: number, recent: number[]): { avg: number; gap: number; note: string } | null {
  if (!recent.length) return null
  const avg = Math.round((recent.reduce((s, n) => s + n, 0) / recent.length) * 10) / 10
  const gap = Math.round((implied - avg) * 10) / 10
  const avgText = Number.isInteger(avg) ? avg.toFixed(0) : String(avg)
  let note: string
  if (Math.abs(gap) < 3) {
    note = `The implied total for ${name} is ${implied}. Over the last five they scored ${avgText} a game, within 3 points of that.`
  } else if (gap > 0) {
    note = `The implied total for ${name} is ${implied}, ${gap} above the ${avgText} they have scored over the last five.`
  } else {
    note = `The implied total for ${name} is ${implied}, ${Math.abs(gap)} below the ${avgText} they have scored over the last five.`
  }
  return { avg, gap, note }
}

export function moveChips(game: BoardGame): string[] {
  const q = game.quote
  if (!q) return []
  const chips: string[] = []
  if (q.favoriteFlipped) chips.push('Favorite flipped')
  if (q.home.openLine != null && q.home.line != null && q.home.openLine !== q.home.line) {
    chips.push(`Spread ${formatLine(q.home.openLine)} → ${formatLine(q.home.line)}`)
  }
  if (q.openTotal != null && q.total != null && q.openTotal !== q.total) {
    chips.push(`Total ${q.openTotal} → ${q.total}`)
  }
  return chips.slice(0, 2)
}

export function movementSentences(game: BoardGame): string[] {
  const q = game.quote
  if (!q) return []
  const out: string[] = []
  if (q.favoriteFlipped && q.home.openLine != null && q.home.line != null) {
    const openFav = q.home.openLine < 0 ? game.home.name : game.away.name
    const nowFav = q.home.line < 0 ? game.home.name : game.away.name
    out.push(`The favorite flipped from ${openFav} to ${nowFav}.`)
  }
  if (q.home.openLine != null && q.home.line != null && q.home.openLine !== q.home.line) {
    out.push(`${game.home.name} moved from ${formatLine(q.home.openLine)} to ${formatLine(q.home.line)}.`)
  }
  if (q.openTotal != null && q.total != null && q.openTotal !== q.total) {
    const dir = q.total > q.openTotal ? 'up' : 'down'
    out.push(`The total moved ${dir} from ${q.openTotal} to ${q.total}.`)
  }
  return out
}

function recordOf(records: unknown, type: string): string | null {
  for (const row of arr(records)) {
    if (!isRec(row)) continue
    if (str(row.type) === type || str(row.name).toLowerCase() === type) {
      const summary = str(row.summary)
      if (summary) return summary
    }
  }
  return null
}

function sideFrom(raw: unknown): Side | null {
  if (!isRec(raw) || !isRec(raw.team)) return null
  const team = raw.team
  const color = str(team.color)
  const score = num(raw.score)
  return {
    id: str(team.id),
    abbr: str(team.abbreviation) || '—',
    name: str(team.displayName) || str(team.name) || 'Team',
    location: str(team.location),
    score,
    winner: raw.winner === true,
    record: recordOf(raw.records, 'total'),
    homeRecord: recordOf(raw.records, 'home'),
    roadRecord: recordOf(raw.records, 'road'),
    color: /^[0-9a-fA-F]{6}$/.test(color) ? `#${color}` : '#7d8a9b',
    logo: str(team.logo) || null,
  }
}

function closeOpen(node: unknown): { close: number | null; open: number | null; closeOdds: number | null; openOdds: number | null } {
  const empty = { close: null, open: null, closeOdds: null, openOdds: null }
  if (!isRec(node)) return empty
  const close = isRec(node.close) ? node.close : null
  const open = isRec(node.open) ? node.open : null
  return {
    close: num(close?.line),
    open: num(open?.line),
    closeOdds: num(close?.odds),
    openOdds: num(open?.odds),
  }
}

function flipped(flag: Record<string, unknown>): boolean {
  return typeof flag.favorite === 'boolean' && typeof flag.favoriteAtOpen === 'boolean' && flag.favorite !== flag.favoriteAtOpen
}

function quoteFrom(raw: unknown): GameQuote | null {
  const odds = arr(isRec(raw) ? raw.odds : null)
  const o = odds.find(isRec)
  if (!o) return null
  const point = isRec(o.pointSpread) ? o.pointSpread : {}
  const total = isRec(o.total) ? o.total : {}
  const ml = isRec(o.moneyline) ? o.moneyline : {}
  const homeSpread = closeOpen(point.home)
  const awaySpread = closeOpen(point.away)
  const homeMl = closeOpen(ml.home)
  const awayMl = closeOpen(ml.away)
  const over = closeOpen(total.over)
  const under = closeOpen(total.under)
  const line = homeSpread.close ?? num(o.spread)
  const totalLine = over.close ?? num(o.overUnder)
  const homeFlag = isRec(o.homeTeamOdds) ? o.homeTeamOdds : {}
  const awayFlag = isRec(o.awayTeamOdds) ? o.awayTeamOdds : {}
  const book = isRec(o.provider) ? str(o.provider.displayName) || str(o.provider.name) : ''
  return {
    book: book || 'Book',
    homeSpread: line,
    total: totalLine,
    openTotal: over.open,
    overPrice: over.closeOdds ?? num(o.overOdds),
    underPrice: under.closeOdds ?? num(o.underOdds),
    home: {
      line,
      openLine: homeSpread.open,
      price: homeSpread.closeOdds,
      moneyline: homeMl.closeOdds,
      openMoneyline: homeMl.openOdds,
    },
    away: {
      line: awaySpread.close ?? (line == null ? null : -line),
      openLine: awaySpread.open ?? (homeSpread.open == null ? null : -homeSpread.open),
      price: awaySpread.closeOdds,
      moneyline: awayMl.closeOdds,
      openMoneyline: awayMl.openOdds,
    },
    favoriteFlipped: flipped(homeFlag) || flipped(awayFlag),
  }
}

export function situationFrom(raw: unknown): GameSituation | null {
  if (!isRec(raw)) return null
  const possessionId = str(raw.possession) || null
  const redZone = typeof raw.isRedZone === 'boolean' ? raw.isRedZone : typeof raw.redZone === 'boolean' ? raw.redZone : null
  const clockObj = isRec(raw.clock) ? str(raw.clock.displayValue) : ''
  const last = isRec(raw.lastPlay) && isRec(raw.lastPlay.clock) ? str(raw.lastPlay.clock.displayValue) : ''
  const clock = str(raw.displayClock) || (typeof raw.clock === 'string' ? raw.clock : '') || clockObj || last || null
  if (!possessionId && redZone == null && !clock) return null
  return { possessionId, redZone, clock }
}

function leadersFrom(raw: unknown): Leader[] {
  const out: Leader[] = []
  for (const block of arr(isRec(raw) ? raw.leaders : null)) {
    if (!isRec(block)) continue
    const top = arr(block.leaders).find(isRec)
    if (!top) continue
    const athlete = isRec(top.athlete) ? top.athlete : {}
    const team = isRec(top.team) ? top.team : isRec(athlete.team) ? athlete.team : {}
    out.push({
      label: str(block.shortDisplayName) || str(block.displayName) || 'Stat',
      name: str(athlete.displayName) || 'Player',
      stat: str(top.displayValue),
      teamId: str(team.id),
    })
  }
  return out.slice(0, 3)
}

function gameFrom(raw: unknown): BoardGame | null {
  if (!isRec(raw)) return null
  const comp = arr(raw.competitions).find(isRec)
  if (!comp) return null
  const competitors = arr(comp.competitors).filter(isRec)
  const home = sideFrom(competitors.find((c) => c.homeAway === 'home'))
  const away = sideFrom(competitors.find((c) => c.homeAway === 'away'))
  if (!home || !away) return null
  const status = isRec(comp.status) ? comp.status : {}
  const type = isRec(status.type) ? status.type : {}
  const stateRaw = str(type.state)
  const state: GameState = stateRaw === 'in' || stateRaw === 'post' ? stateRaw : 'pre'
  const venue = isRec(comp.venue) ? comp.venue : {}
  const address = isRec(venue.address) ? venue.address : {}
  const cityBits = [str(address.city), str(address.country)].filter((s) => s && s !== 'USA')
  const broadcasts = arr(comp.broadcasts).find(isRec)
  const names = broadcasts ? arr(broadcasts.names).map(str).filter(Boolean) : []
  const note = arr(comp.notes)
    .map((n) => (isRec(n) ? str(n.headline) : ''))
    .find(Boolean)
  const quote = quoteFrom(comp)
  const implied = quote?.total != null && quote.homeSpread != null ? impliedTeamTotals(quote.total, quote.homeSpread) : null
  return {
    id: str(raw.id) || str(comp.id),
    kickoff: str(comp.date) || str(raw.date),
    name: str(raw.shortName) || `${away.abbr} @ ${home.abbr}`,
    state,
    detail: str(type.shortDetail) || str(type.detail) || state,
    neutral: comp.neutralSite === true,
    note: note || null,
    venue: str(venue.fullName) || null,
    city: cityBits.join(', ') || null,
    indoor: typeof venue.indoor === 'boolean' ? venue.indoor : null,
    broadcast: names[0] || str(comp.broadcast) || null,
    home,
    away,
    quote,
    implied,
    leaders: leadersFrom(comp),
    situation: situationFrom(comp.situation),
  }
}

export function scoreboardBody(raw: unknown): { body: Record<string, unknown>; fetchedAt: string | null } {
  if (isRec(raw) && isRec(raw.scoreboard)) {
    return { body: raw.scoreboard, fetchedAt: str(raw.fetchedAt) || null }
  }
  return { body: isRec(raw) ? raw : {}, fetchedAt: null }
}

export function normalizeScoreboard(raw: unknown, fetchedAt: string): Board {
  const { body, fetchedAt: stamped } = scoreboardBody(raw)
  const season = isRec(body.season) ? body.season : {}
  const week = isRec(body.week) ? body.week : {}
  const byes = arr(week.teamsOnBye)
    .filter(isRec)
    .map((t) => ({ abbr: str(t.abbreviation), name: str(t.shortDisplayName) || str(t.displayName) }))
    .filter((t) => t.abbr)
  const games = arr(body.events)
    .map(gameFrom)
    .filter((g): g is BoardGame => g !== null)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))
  return {
    season: num(season.year) ?? 0,
    week: num(week.number) ?? 0,
    byes,
    games,
    fetchedAt: stamped || fetchedAt,
  }
}

export function matchGame(game: BoardGame, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const blob = [game.away.abbr, game.away.name, game.away.location, game.home.abbr, game.home.name, game.home.location, game.venue, game.city, game.note]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return blob.includes(q)
}

export function filterGames(games: BoardGame[], filter: BoardFilter): BoardGame[] {
  if (filter === 'all') return games
  return games.filter((g) => g.state === filter)
}

export function sortGames(games: BoardGame[], sort: BoardSort): BoardGame[] {
  const copy = [...games]
  if (sort === 'total') {
    copy.sort((a, b) => (b.quote?.total ?? -1) - (a.quote?.total ?? -1) || a.kickoff.localeCompare(b.kickoff))
  } else if (sort === 'spread') {
    copy.sort((a, b) => Math.abs(b.quote?.homeSpread ?? -1) - Math.abs(a.quote?.homeSpread ?? -1) || a.kickoff.localeCompare(b.kickoff))
  } else {
    copy.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))
  }
  return copy
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  if (s.length % 2) return s[mid]
  return half((s[mid - 1] + s[mid]) / 2)
}

export interface WindowGroup {
  label: string
  games: BoardGame[]
}

export function groupByWindow(games: BoardGame[]): WindowGroup[] {
  const groups: WindowGroup[] = []
  for (const game of games) {
    const label = game.state === 'in' ? 'In progress' : game.state === 'post' ? 'Final' : game.detail
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.games.push(game)
    else groups.push({ label, games: [game] })
  }
  return groups
}

function recentFrom(events: unknown, teamId: string): RecentGame[] {
  return arr(events)
    .filter(isRec)
    .map((ev) => {
      const opp = isRec(ev.opponent) ? ev.opponent : {}
      const homeId = str(ev.homeTeamId)
      const forScore = num(homeId === teamId ? ev.homeTeamScore : ev.awayTeamScore)
      const against = num(homeId === teamId ? ev.awayTeamScore : ev.homeTeamScore)
      const headline = str(ev.headline) || str(ev.shortLinkText) || str(ev.shortHeadline) || null
      return {
        id: str(ev.id) || null,
        week: num(ev.week),
        result: str(ev.gameResult),
        opponent: str(opp.abbreviation) || str(opp.displayName) || 'OPP',
        atVs: str(ev.atVs),
        pointsFor: forScore,
        pointsAgainst: against,
        headline,
      }
    })
}

function injuriesFrom(rows: unknown): { injuries: InjuryRow[]; irCount: number } {
  const injuries: InjuryRow[] = []
  let irCount = 0
  for (const row of arr(rows)) {
    if (!isRec(row)) continue
    const status = str(row.status)
    if (status === 'Injured Reserve') {
      irCount += 1
      continue
    }
    if (status !== 'Out' && status !== 'Doubtful' && status !== 'Questionable') continue
    const athlete = isRec(row.athlete) ? row.athlete : {}
    const pos = isRec(athlete.position) ? athlete.position : {}
    const details = isRec(row.details) ? row.details : {}
    const kind = str(details.type)
    const extra = str(details.detail)
    const detail = [kind, extra].filter((s) => s && s.toLowerCase() !== 'not specified').join(', ')
    injuries.push({
      name: str(athlete.displayName) || 'Player',
      pos: str(pos.abbreviation),
      status,
      detail,
    })
  }
  injuries.sort((a, b) => INJURY_RANK[a.status] - INJURY_RANK[b.status] || a.pos.localeCompare(b.pos) || a.name.localeCompare(b.name))
  return { injuries, irCount }
}

export function normalizeSummary(raw: unknown, game: BoardGame): GameContext {
  const body = isRec(raw) ? raw : {}
  const lastFive = arr(body.lastFiveGames).filter(isRec)
  const injuryTeams = arr(body.injuries).filter(isRec)
  const sideBlock = (side: Side, list: Record<string, unknown>[], key: 'team') =>
    list.find((row) => isRec(row[key]) && str((row[key] as Record<string, unknown>).id) === side.id)

  const build = (side: Side, implied: number | null): TeamContext => {
    const five = sideBlock(side, lastFive, 'team')
    const inj = sideBlock(side, injuryTeams, 'team')
    const recent = five ? recentFrom(five.events, side.id) : []
    const listed = inj ? injuriesFrom(inj.injuries) : { injuries: [], irCount: 0 }
    const points = recent.map((g) => g.pointsFor).filter((n): n is number => n != null)
    const gap = implied != null ? scoringGapNote(side.name, implied, points) : null
    return {
      abbr: side.abbr,
      name: side.name,
      recent,
      avgPoints: gap?.avg ?? (points.length ? Math.round((points.reduce((s, n) => s + n, 0) / points.length) * 10) / 10 : null),
      implied,
      gap: gap?.gap ?? null,
      gapNote: gap?.note ?? null,
      injuries: listed.injuries,
      irCount: listed.irCount,
    }
  }

  const predictor = isRec(body.predictor) ? body.predictor : null
  const homePct = predictor && isRec(predictor.homeTeam) ? num(predictor.homeTeam.gameProjection) : null
  const awayPct = predictor && isRec(predictor.awayTeam) ? num(predictor.awayTeam.gameProjection) : null

  return {
    home: build(game.home, game.implied?.home ?? null),
    away: build(game.away, game.implied?.away ?? null),
    predictor: homePct != null && awayPct != null ? { home: homePct, away: awayPct } : null,
  }
}
