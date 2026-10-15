import { readFileSync } from 'node:fs'
import type { FantasyData } from '../src/types'
import { TradeLab } from '../src/engine/trade'
import { makeNoise, simulate } from '../src/engine/sim'
const d: FantasyData = JSON.parse(readFileSync('public/data/fantasy.json', 'utf8'))
const lab = new TradeLab(d)
const weeks = Array.from({ length: d.meta.lastWeek - d.meta.week + 1 }, (_, i) => d.meta.week + i)
const noise = makeNoise(d.teams.map(t => t.id), weeks, 3000)
const s = simulate(d, lab.rosters, noise, lab.baseOutlook)
const sum = (o: Record<number, number>) => Object.values(o).reduce((a, b) => a + b, 0)
console.log('title sum', sum(s.title).toFixed(3), 'playoff sum', sum(s.playoff).toFixed(3), 'bye sum', sum(s.bye).toFixed(3))
const s2 = simulate(d, lab.rosters, makeNoise(d.teams.map(t => t.id), weeks, 3000, 7), lab.baseOutlook)
console.log('my title odds, two seeds:', (s.title[4]*100).toFixed(1), (s2.title[4]*100).toFixed(1), ' playoff:', (s.playoff[4]*100).toFixed(1), (s2.playoff[4]*100).toFixed(1))
