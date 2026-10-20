/** League page order: the comparison grid, then the title board. */
export const LEAGUE_SECTION_ORDER = ['ranks', 'title'] as const

export type LeagueSection = (typeof LEAGUE_SECTION_ORDER)[number]
