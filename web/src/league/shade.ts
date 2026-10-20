/** 1 for the best rank, 0 for the worst. */
export function rankIntensity(rank: number, n: number): number {
  if (n <= 1) return 1
  const r = Math.min(Math.max(rank, 1), n)
  return (n - r) / (n - 1)
}

const MIN_MIX = 6
const MAX_MIX = 70

/** Percent of the gold `--up` hue in a cell: rank 1 gets the most. */
export function rankMix(rank: number, n: number): number {
  return Math.round(MIN_MIX + rankIntensity(rank, n) * (MAX_MIX - MIN_MIX))
}

/** Above this much gold the theme's text color loses contrast, so the cell switches to dark ink. */
export const DARK_INK_FROM = 40

export function rankCell(rank: number, n: number): { background: string; dark: boolean } {
  const mix = rankMix(rank, n)
  return { background: `color-mix(in oklab, var(--up) ${mix}%, var(--panel))`, dark: mix >= DARK_INK_FROM }
}
