import { describe, expect, test } from 'vitest'
import { LEAGUE_SECTION_ORDER } from './sections'

describe('league section order', () => {
  test('the rank grid comes before the title board', () => {
    expect(LEAGUE_SECTION_ORDER[0]).toBe('ranks')
    expect(LEAGUE_SECTION_ORDER[1]).toBe('title')
    expect(LEAGUE_SECTION_ORDER.indexOf('ranks')).toBeLessThan(LEAGUE_SECTION_ORDER.indexOf('title'))
  })
})
