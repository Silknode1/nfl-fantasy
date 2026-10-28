/**
 * Framed-desk facts. Every number is copied from a payload field or is
 * score-minus-spread arithmetic. No series is filled in. No chance to cover.
 */

import {
  formatAmerican,
  formatLine,
  situationFrom,
  type BoardGame,
  type GameSituation,
  type RecentGame,
} from './normalize'

export interface WinPoint {
  home: number
  playId: string | null
}

export interface ScoringPlay {
  id: string
  text: string
  clock: string
  quarter: number | null
  team: string
  awayScore: number | null
  homeScore: number | null
}

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

export interface BoxAthlete {
  id: string
  name: string
  points: number
}

export interface Standout {
  label: string
  name: string
  stat: string
}

export interface DeskPlayer {
  id: string
  name: string
  nfl: string
  teamId: number
  proj: number | null
  /** ESPN's weekly projection for the current week. Null when the vendor did not send one. */
  espn?: number | null
}

export interface ArticleFacts {
  away: string
  home: string
  state: 'pre' | 'in' | 'post'
  detail: string
  venue: string | null
  broadcast: string | null
  awayScore: number | null
  homeScore: number | null
  spreadText: string | null
  total: number | null
  awayMoneyline: string | null
  homeMoneyline: string | null
  marginText: string | null
  injuries: { team: string; name: string; status: string }[]
  yours: { name: string; proj: number | null; scored: number | null }[]
  headlines: string[]
  scoringPlays: string[]
}

export interface WatchTarget {
  label: string
  href: string
}

export interface ClipMemory {
  index: number
  seconds: number
}

export interface Playback {
  audible: 'center' | 'shelf' | null
  centerGameId: string | null
  centerPlaying: boolean
  shelfVideoId: string | null
  shelfPlaying: boolean
  memory: Record<string, ClipMemory>
}

export interface DeskHeadline {
  id: string
  title: string
  href: string | null
  gameId: string | null
}

const WATCH: { re: RegExp; label: string; href: string }[] = [
  { re: /youtube\s*tv/i, label: 'YouTube TV', href: 'https://tv.youtube.com/' },
  { re: /prime\s*video|amazon\s*prime|\bprime\b/i, label: 'Prime Video', href: 'https://www.primevideo.com/' },
  { re: /espn\s*\+/i, label: 'ESPN+', href: 'https://plus.espn.com/' },
  { re: /nfl\s*network|\bnfl\s*net\b/i, label: 'NFL Network', href: 'https://www.nfl.com/network/' },
  { re: /\bnbc\b/i, label: 'NBC', href: 'https://www.nbc.com/' },
  { re: /\bcbs\b/i, label: 'CBS', href: 'https://www.cbs.com/nfl/' },
  { re: /\bfox\b/i, label: 'FOX', href: 'https://www.fox.com/nfl/' },
  { re: /\babc\b/i, label: 'ABC', href: 'https://abc.com/' },
  { re: /\bespn\b/i, label: 'ESPN', href: 'https://www.espn.com/watch/' },
  { re: /\bpeacock\b/i, label: 'Peacock', href: 'https://www.peacocktv.com/' },
]

/** This league is half PPR. These are the scoring weights, not a forecast. */
const HALF_PPR = {
  passYd: 0.04,
  passTd: 4,
  interception: -2,
  rushYd: 0.1,
  rushTd: 6,
  reception: 0.5,
  recYd: 0.1,
  recTd: 6,
  fumLost: -2,
  twoPt: 2,
} as const

const DOWN = ['', '1st', '2nd', '3rd', '4th']

function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim().replace(/^[ou]/i, ''))
    return Number.isFinite(n) ? n : null
  }
  return null
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function showNum(n: number): string {
  const r = round1(n)
  return Number.isInteger(r) ? String(r) : String(r)
}

/** ESPN's 0–1 win share, or a figure that is already a percent. */
function asPercent(v: number): number {
  return round1(Math.abs(v) <= 1 ? v * 100 : v)
}

function homeWinOn(row: Record<string, unknown>): number | null {
  const direct = num(row.homeWinPercentage)
  if (direct != null) return asPercent(direct)
  return null
}

export function winSeries(raw: unknown): WinPoint[] {
  const body = isRec(raw) ? raw : {}
  const list = Array.isArray(body.winprobability) ? body.winprobability : Array.isArray(body.winProbability) ? body.winProbability : []
  const out: WinPoint[] = []
  for (const row of list) {
    if (!isRec(row)) continue
    const home = homeWinOn(row)
    if (home == null) continue
    out.push({ home, playId: str(row.playId) || null })
  }
  return out
}

function predictorHome(raw: unknown): number | null {
  if (!isRec(raw) || !isRec(raw.predictor) || !isRec(raw.predictor.homeTeam)) return null
  const n = num(raw.predictor.homeTeam.gameProjection)
  return n == null ? null : round1(n)
}

function situationWin(raw: unknown): number | null {
  if (!isRec(raw)) return null
  const header = isRec(raw.header) ? raw.header : {}
  const comp = arr(header.competitions).find(isRec)
  const spots = [raw.situation, comp && isRec(comp) ? comp.situation : null]
  for (const spot of spots) {
    if (!isRec(spot)) continue
    const last = isRec(spot.lastPlay) ? spot.lastPlay : {}
    const prob = isRec(last.probability) ? last.probability : isRec(spot.probability) ? spot.probability : null
    if (prob) {
      const home = homeWinOn(prob)
      if (home != null) return home
    }
  }
  if (isRec(raw.winprobability) && !Array.isArray(raw.winprobability)) {
    const home = homeWinOn(raw.winprobability)
    if (home != null) return home
  }
  return null
}

/** Last series point, else one current figure ESPN already published. Never a made-up path. */
export function currentHomeWin(raw: unknown): number | null {
  const series = winSeries(raw)
  if (series.length) return series[series.length - 1]!.home
  return situationWin(raw) ?? predictorHome(raw)
}

/** Home score minus away score, plus the home line. Positive means home is ahead of the number. */
export function marginVsSpread(homeScore: number, awayScore: number, homeSpread: number): number {
  return round1(homeScore - awayScore + homeSpread)
}

export function marginSentence(game: BoardGame): string | null {
  const spread = game.quote?.homeSpread
  if (spread == null) return null
  if (game.state === 'pre') return null
  const home = game.home.score
  const away = game.away.score
  if (home == null || away == null) return null
  if (home === 0 && away === 0) return null
  const margin = marginVsSpread(home, away, spread)
  if (margin > 0) return `${game.home.name} is covering by ${showNum(margin)}`
  if (margin < 0) return `${game.home.name} is short of the number by ${showNum(Math.abs(margin))}`
  return `${game.home.name} is on the number`
}

export function spreadText(game: BoardGame): string | null {
  const line = game.quote?.home.line
  if (line == null) return null
  return `${game.home.name} ${formatLine(line)}`
}

export function gameArticle(facts: ArticleFacts): string[] {
  const out: string[] = []
  const where = [facts.venue, facts.broadcast].filter(Boolean).join(', ')
  if (facts.state !== 'pre' && facts.awayScore != null && facts.homeScore != null) {
    const label = facts.state === 'post' ? 'Final' : facts.detail
    out.push(`${facts.away} ${facts.awayScore}, ${facts.home} ${facts.homeScore}. ${label}.`)
  } else {
    out.push(`${facts.away} at ${facts.home}. ${facts.detail}${where ? `. ${where}` : ''}.`)
  }
  const quoted = facts.spreadText != null || facts.total != null || facts.awayMoneyline != null || facts.homeMoneyline != null
  if (!quoted) {
    out.push('No line on this game. The final score is the result. A missing quote is not a number to invent.')
  } else {
    const bits: string[] = []
    if (facts.spreadText) bits.push(`The spread is ${facts.spreadText}`)
    if (facts.total != null) bits.push(`The total is ${facts.total}`)
    if (facts.awayMoneyline != null || facts.homeMoneyline != null) {
      bits.push(`The moneyline is ${facts.away} ${facts.awayMoneyline ?? '—'} and ${facts.home} ${facts.homeMoneyline ?? '—'}`)
    }
    out.push(`${bits.join('. ')}.`)
  }
  if (facts.marginText) out.push(`${facts.marginText}.`)
  if (facts.scoringPlays.length) out.push(`Scoring plays: ${facts.scoringPlays.join('; ')}.`)
  if (facts.injuries.length) {
    const list = facts.injuries.map((row) => `${row.name} (${row.team}, ${row.status})`).join('; ')
    out.push(`Injuries listed: ${list}.`)
  }
  if (facts.yours.length) {
    const anyScored = facts.yours.some((row) => row.scored != null)
    const list = facts.yours.map((row) => {
      const proj = row.proj == null ? 'no week projection stored' : `${row.proj} projected this week`
      if (row.scored == null) return `${row.name}, ${proj}`
      return `${row.name}, ${row.scored} so far and ${proj}`
    }).join('; ')
    out.push(anyScored
      ? `Your players: ${list}. Points so far and the pregame projection are different numbers.`
      : `Your players: ${list}.`)
  }
  if (facts.headlines.length) out.push(`Headlines: ${facts.headlines.join('; ')}.`)
  return out
}

export function summarySituation(raw: unknown): GameSituation | null {
  const body = isRec(raw) ? raw : {}
  const header = isRec(body.header) ? body.header : {}
  const comp = arr(header.competitions).find(isRec)
  return situationFrom(comp ? comp.situation : null) ?? situationFrom(body.situation)
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
  const plays = arr(raw.plays).map(playFrom).filter((p): p is DrivePlay => p !== null)
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

export function drivesFrom(raw: unknown): Drive[] {
  const body = isRec(raw) ? raw : {}
  const drives = isRec(body.drives) ? body.drives : {}
  const rows = [...arr(drives.previous)]
  if (isRec(drives.current)) rows.push(drives.current)
  return rows.map(driveFrom).filter((d): d is Drive => d !== null)
}

function scoringFromRow(raw: unknown, index: number): ScoringPlay | null {
  if (!isRec(raw)) return null
  const text = str(raw.text).trim() || str(raw.shortText).trim()
  if (!text) return null
  const team = isRec(raw.team) ? raw.team : {}
  return {
    id: str(raw.id) || `score-${index}`,
    text,
    clock: isRec(raw.clock) ? str(raw.clock.displayValue) : '',
    quarter: isRec(raw.period) ? num(raw.period.number) : null,
    team: str(team.abbreviation) || str(team.displayName),
    awayScore: num(raw.awayScore),
    homeScore: num(raw.homeScore),
  }
}

export function scoringPlaysFrom(raw: unknown): ScoringPlay[] {
  const body = isRec(raw) ? raw : {}
  if (Array.isArray(body.scoringPlays)) {
    return body.scoringPlays.map(scoringFromRow).filter((p): p is ScoringPlay => p !== null)
  }
  const fromDrives: ScoringPlay[] = []
  drivesFrom(raw).forEach((drive) => {
    drive.plays.forEach((play) => {
      if (!play.scoring) return
      fromDrives.push({
        id: play.id,
        text: play.text,
        clock: play.clock,
        quarter: play.quarter,
        team: drive.team,
        awayScore: play.awayScore,
        homeScore: play.homeScore,
      })
    })
  })
  return fromDrives
}

function statValue(keys: string[], stats: unknown[], names: string[]): number | null {
  for (const name of names) {
    const idx = keys.indexOf(name)
    if (idx < 0) continue
    const n = num(stats[idx])
    if (n != null) return n
  }
  return null
}

function pointsFromStats(keys: string[], stats: unknown[]): number | null {
  const passYd = statValue(keys, stats, ['passingYards'])
  const passTd = statValue(keys, stats, ['passingTouchdowns'])
  const interceptions = statValue(keys, stats, ['interceptions'])
  const rushYd = statValue(keys, stats, ['rushingYards'])
  const rushTd = statValue(keys, stats, ['rushingTouchdowns'])
  const receptions = statValue(keys, stats, ['receptions'])
  const recYd = statValue(keys, stats, ['receivingYards'])
  const recTd = statValue(keys, stats, ['receivingTouchdowns'])
  const fum = statValue(keys, stats, ['fumblesLost'])
  const two = statValue(keys, stats, ['twoPointConversions', 'passingTwoPointConversions', 'rushingTwoPointConversions', 'receivingTwoPointConversions'])
  const parts = [passYd, passTd, interceptions, rushYd, rushTd, receptions, recYd, recTd, fum, two]
  if (parts.every((n) => n == null)) return null
  return round2(
    (passYd ?? 0) * HALF_PPR.passYd
    + (passTd ?? 0) * HALF_PPR.passTd
    + (interceptions ?? 0) * HALF_PPR.interception
    + (rushYd ?? 0) * HALF_PPR.rushYd
    + (rushTd ?? 0) * HALF_PPR.rushTd
    + (receptions ?? 0) * HALF_PPR.reception
    + (recYd ?? 0) * HALF_PPR.recYd
    + (recTd ?? 0) * HALF_PPR.recTd
    + (fum ?? 0) * HALF_PPR.fumLost
    + (two ?? 0) * HALF_PPR.twoPt,
  )
}

export function boxScorePoints(raw: unknown): BoxAthlete[] {
  const body = isRec(raw) ? raw : {}
  const box = isRec(body.boxscore) ? body.boxscore : {}
  const byKey = new Map<string, BoxAthlete>()
  for (const team of arr(box.players)) {
    if (!isRec(team)) continue
    for (const block of arr(team.statistics)) {
      if (!isRec(block)) continue
      const keys = arr(block.keys).map(str)
      for (const row of arr(block.athletes)) {
        if (!isRec(row)) continue
        const athlete = isRec(row.athlete) ? row.athlete : {}
        const id = str(athlete.id)
        const name = str(athlete.displayName) || 'Player'
        const gained = pointsFromStats(keys, arr(row.stats))
        if (gained == null) continue
        const key = id || name.toLowerCase()
        const prev = byKey.get(key)
        if (prev) prev.points = round2(prev.points + gained)
        else byKey.set(key, { id, name, points: gained })
      }
    }
  }
  return [...byKey.values()]
}

export function pointsForPlayer(player: { id: string; name: string }, rows: BoxAthlete[]): number | null {
  const byId = player.id ? rows.find((row) => row.id === player.id) : undefined
  if (byId) return byId.points
  const name = player.name.trim().toLowerCase()
  const byName = rows.find((row) => row.name.trim().toLowerCase() === name)
  return byName ? byName.points : null
}

const STANDOUT_CATS = ['passing', 'rushing', 'receiving'] as const
const STANDOUT_YARDS: Record<(typeof STANDOUT_CATS)[number], string> = {
  passing: 'passingYards',
  rushing: 'rushingYards',
  receiving: 'receivingYards',
}

export function standoutsFrom(raw: unknown): Standout[] {
  const body = isRec(raw) ? raw : {}
  const box = isRec(body.boxscore) ? body.boxscore : {}
  const best = new Map<string, Standout & { yards: number }>()
  for (const team of arr(box.players)) {
    if (!isRec(team)) continue
    for (const block of arr(team.statistics)) {
      if (!isRec(block)) continue
      const name = str(block.name)
      if (!STANDOUT_CATS.includes(name as (typeof STANDOUT_CATS)[number])) continue
      const yardsKey = STANDOUT_YARDS[name as (typeof STANDOUT_CATS)[number]]
      const keys = arr(block.keys).map(str)
      const idx = keys.indexOf(yardsKey)
      if (idx < 0) continue
      for (const row of arr(block.athletes)) {
        if (!isRec(row)) continue
        const stats = arr(row.stats)
        const yards = num(stats[idx])
        if (yards == null) continue
        const athlete = isRec(row.athlete) ? row.athlete : {}
        const current = best.get(name)
        if (current && current.yards >= yards) continue
        best.set(name, {
          label: name.charAt(0).toUpperCase() + name.slice(1),
          name: str(athlete.displayName) || 'Player',
          stat: str(stats[idx]) || String(yards),
          yards,
        })
      }
    }
  }
  return STANDOUT_CATS.map((name) => best.get(name)).filter((row): row is Standout & { yards: number } => row != null).map(({ label, name, stat }) => ({ label, name, stat }))
}

export function playersInGame(game: BoardGame, players: DeskPlayer[], myTeamId: number): DeskPlayer[] {
  const clubs = new Set([game.home.abbr, game.away.abbr])
  return players.filter((player) => player.teamId === myTeamId && clubs.has(player.nfl))
}

export function rosterCounts(games: BoardGame[], players: DeskPlayer[], myTeamId: number): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const game of games) counts[game.id] = playersInGame(game, players, myTeamId).length
  return counts
}

export function pickCenter(games: BoardGame[], counts: Record<string, number>): string | null {
  if (!games.length) return null
  const count = (game: BoardGame) => counts[game.id] ?? 0
  const live = games.filter((game) => game.state === 'in')
  if (live.length) {
    return [...live].sort((a, b) => count(b) - count(a) || a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))[0]!.id
  }
  const upcoming = games.filter((game) => game.state === 'pre').sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id.localeCompare(b.id))
  if (upcoming.length) return upcoming[0]!.id
  const done = games.filter((game) => game.state === 'post').sort((a, b) => b.kickoff.localeCompare(a.kickoff) || b.id.localeCompare(a.id))
  return (done[0] ?? games[0])!.id
}

export function ringSlots<T>(items: T[]): { top: T[]; right: T[]; bottom: T[]; left: T[] } {
  const slots = { top: [] as T[], right: [] as T[], bottom: [] as T[], left: [] as T[] }
  const order = ['top', 'right', 'bottom', 'left'] as const
  items.forEach((item, i) => slots[order[i % 4]!].push(item))
  return slots
}

export function watchTarget(broadcast: string | null): WatchTarget | null {
  const name = broadcast?.trim()
  if (!name) return null
  const hit = WATCH.find((row) => row.re.test(name))
  return hit ? { label: hit.label, href: hit.href } : null
}

export function moneylineText(game: BoardGame): { away: string | null; home: string | null } {
  const quote = game.quote
  if (!quote) return { away: null, home: null }
  return {
    away: quote.away.moneyline == null ? null : formatAmerican(quote.away.moneyline),
    home: quote.home.moneyline == null ? null : formatAmerican(quote.home.moneyline),
  }
}

export function youtubeId(input: string): string | null {
  const text = input.trim()
  if (/^[\w-]{11}$/.test(text)) return text
  try {
    const url = new URL(text)
    const host = url.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? ''
      return /^[\w-]{11}$/.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'm.youtube.com') {
      const v = url.searchParams.get('v')
      if (v && /^[\w-]{11}$/.test(v)) return v
      const parts = url.pathname.split('/').filter(Boolean)
      const slot = parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live' ? parts[1] : ''
      return slot && /^[\w-]{11}$/.test(slot) ? slot : null
    }
  } catch {
    return null
  }
  return null
}

export function youtubeSearchHref(away: string, home: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${away} ${home} highlights`)}`
}

export function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`
}

export function advanceClip(index: number, count: number): number {
  if (count <= 0) return 0
  return (index + 1) % count
}

export function idlePlayback(): Playback {
  return { audible: null, centerGameId: null, centerPlaying: false, shelfVideoId: null, shelfPlaying: false, memory: {} }
}

function remember(play: Playback, gameId: string, index: number, seconds: number): Playback {
  return { ...play, memory: { ...play.memory, [gameId]: { index, seconds } } }
}

export function playCenter(play: Playback, gameId: string): Playback {
  return { ...play, audible: 'center', centerGameId: gameId, centerPlaying: true, shelfPlaying: false }
}

export function pauseCenter(play: Playback, gameId: string, index: number, seconds: number): Playback {
  return {
    ...remember(play, gameId, index, seconds),
    audible: play.audible === 'center' ? null : play.audible,
    centerPlaying: false,
  }
}

export function leaveCenter(play: Playback, gameId: string, index: number, seconds: number): Playback {
  const paused = pauseCenter(play, gameId, index, seconds)
  return { ...paused, centerGameId: null }
}

export function pinClipPauses(play: Playback, gameId: string, index: number, seconds: number): Playback {
  return pauseCenter(play, gameId, index, seconds)
}

export function playShelf(play: Playback, videoId: string, centerGameId: string | null, index: number, seconds: number): Playback {
  const remembered = centerGameId ? remember(play, centerGameId, index, seconds) : play
  return { ...remembered, audible: 'shelf', centerPlaying: false, shelfVideoId: videoId, shelfPlaying: true }
}

export function pauseShelf(play: Playback): Playback {
  return { ...play, shelfPlaying: false, audible: play.audible === 'shelf' ? null : play.audible }
}

export function pushPin<T extends { id: string }>(pins: T[], item: T): T[] {
  return [item, ...pins.filter((pin) => pin.id !== item.id)]
}

export function dropPin<T extends { id: string }>(pins: T[], id: string): T[] {
  return pins.filter((pin) => pin.id !== id)
}

function webHref(links: unknown): string | null {
  if (!isRec(links)) return null
  const web = isRec(links.web) ? str(links.web.href) : ''
  return web || str(links.href) || null
}

const BETTING_HEADLINE = /\b(how to bet|best bet|prop plays?|parlay|sportsbook|betting tips?)\b/i

function mentionsClub(title: string, clubs: { names: string[]; abbrs: string[] }): boolean {
  const text = title.toLowerCase()
  for (const name of clubs.names) {
    const parts = name.trim().split(/\s+/)
    const nick = (parts[parts.length - 1] ?? '').toLowerCase()
    if (name && text.includes(name.toLowerCase())) return true
    if (nick.length > 3 && text.includes(nick)) return true
  }
  return clubs.abbrs.some((abbr) => new RegExp(`\\b${abbr}\\b`, 'i').test(title))
}

export function headlinesFromSummary(raw: unknown, gameId: string, clubs?: { names: string[]; abbrs: string[] }): DeskHeadline[] {
  const body = isRec(raw) ? raw : {}
  const out: DeskHeadline[] = []
  const seen = new Set<string>()
  const push = (rawItem: unknown, id: string | null, gameStory: boolean) => {
    if (!isRec(rawItem)) return
    const title = (str(rawItem.headline) || str(rawItem.shortLinkText)).trim()
    if (!title || BETTING_HEADLINE.test(title)) return
    if (!gameStory && clubs && !mentionsClub(title, clubs)) return
    const key = title.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ id: str(rawItem.id) || id || key, title, href: webHref(rawItem.links), gameId })
  }
  push(body.article, gameId, true)
  const news = isRec(body.news) ? body.news : {}
  for (const article of arr(news.articles)) push(article, null, false)
  for (const article of arr(body.articles)) push(article, null, false)
  return out
}

export function headlinesForRecent(game: RecentGame, stored: { gameId: string | null; title: string }[]): string[] {
  const extra = game.id ? stored.filter((item) => item.gameId === game.id).map((item) => item.title) : []
  const own = game.headline ? [game.headline] : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const title of [...own, ...extra]) {
    const key = title.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(title.trim())
  }
  return out
}

export function possessionAbbr(game: BoardGame): string | null {
  const id = game.situation?.possessionId
  if (!id) return null
  if (game.home.id === id) return game.home.abbr
  if (game.away.id === id) return game.away.abbr
  return null
}

export function articleFacts(input: {
  game: BoardGame
  injuries: { team: string; name: string; status: string }[]
  yours: { name: string; proj: number | null; scored: number | null }[]
  headlines: string[]
  scoringPlays: string[]
}): ArticleFacts {
  const lines = moneylineText(input.game)
  return {
    away: input.game.away.name,
    home: input.game.home.name,
    state: input.game.state,
    detail: input.game.detail,
    venue: input.game.venue,
    broadcast: input.game.broadcast,
    awayScore: input.game.state === 'pre' ? null : input.game.away.score,
    homeScore: input.game.state === 'pre' ? null : input.game.home.score,
    spreadText: spreadText(input.game),
    total: input.game.quote?.total ?? null,
    awayMoneyline: lines.away,
    homeMoneyline: lines.home,
    marginText: marginSentence(input.game),
    injuries: input.injuries,
    yours: input.yours,
    headlines: input.headlines,
    scoringPlays: input.scoringPlays,
  }
}
