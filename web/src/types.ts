export type Pos = 'QB' | 'RB' | 'WR' | 'TE'

export interface Usage {
  games: number
  tgtShare: number | null
  tgtShareTrend: number | null
  oppPg: number | null
  oppTrend: number | null
  snapPct: number | null
  snapTrend: number | null
  tgtPg: number
  carPg: number
  recYdsPg: number
  rushYdsPg: number
  passYdsPg: number
  tdTotal: number
}

export interface JevSignal {
  headline: string | null
  url: string | null
  published: string | null
  role: string
  firm: number | null
  availability: string | null
  timeline: string | null
  urgency: number | null
}

export interface Player {
  id: string
  name: string
  pos: Pos
  nfl: string
  teamId: number
  status: 'ONTEAM' | 'FREEAGENT' | 'WAIVERS'
  slot: string | null
  inj: string | null
  injNote: string | null
  bye: number | null
  photo: string
  actual: Record<string, number>
  gp: number
  ppg: number
  espnWeek: number | null
  espnSeason: number
  own: number
  ownChg: number
  started: number
  usage: Usage | null
  adds: number
  drops: number
  jev: JevSignal | null
  rate: number
  rateParts: { espn: number; season: number; trend: number; jev: number; week?: number; k?: number }
  proj: Record<string, number>
  /** Points if he plays (chance he plays not applied). */
  projIf?: Record<string, number>
  /** Chance he plays this week: 0-1. */
  playP?: number | null
  /** Average of his last 3 games with a stat line. */
  last3?: number | null
  sd: number
  ros: number
  playoffs: number
  ourRank: number
  espnRank: number | null
  tradeLocked: boolean
  locked: boolean
}

export interface Team {
  id: number
  name: string
  abbrev: string
  wins: number
  losses: number
  ties: number
  pf: number
  pa: number
  faabLeft: number
  waiverRank: number
  espnPlayoffPct: number | null
  trades: number
  acquisitions: number
}

export interface Game {
  week: number
  home: number
  away: number
  winner: string
  homePts?: number
  awayPts?: number
}

export interface Meta {
  generatedAt: string
  season: number
  week: number
  regularWeeks: number
  lastWeek: number
  playoffTeams: number
  leagueName: string
  faabBudget: number
  tradeDeadline: string
  myTeamId: number
  scoring: string
  sources: string[]
  sleeperPulledAt: string | null
}

/** Waiver pulse: what the whole fantasy world is adding and dropping (fantasy/trends.py). */
export interface TrendRow {
  rank: number
  id: string | null // ESPN player id when known, so the app can show league status
  name: string
  pos: string
  team: string
  count?: number // Sleeper: adds or drops in the window
  change?: number // ESPN: weekly change in % rostered, percentage points
  rostered?: number
  started?: number
  inj?: string
}
export interface Trends {
  pulledAt: string
  windows: string[]
  sleeper: Record<string, { add: TrendRow[]; drop: TrendRow[] }>
  espn: { add: TrendRow[]; drop: TrendRow[] }
}

export interface FantasyData {
  meta: Meta
  trends?: Trends
  teams: Team[]
  games: Game[]
  defense: Record<string, Partial<Record<Pos, number>>>
  players: Player[]
  photos?: Record<string, string>
  nflOpp: Record<string, Record<string, string>>
}
