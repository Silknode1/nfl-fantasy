import { chromium } from 'playwright'
const url = 'file://' + process.cwd() + '/dist-artifact/index.html'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errs = []
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
page.on('pageerror', e => errs.push(String(e)))
const shots = process.argv.slice(2).length ? process.argv.slice(2) : ['team', 'trades', 'waivers', 'league', 'espn', 'plan']
for (const s of shots) {
  await page.goto(url + '#' + s)
  await page.waitForTimeout(s === 'trades' || s === 'plan' ? 6000 : 1500)
  await page.screenshot({ path: `shot-${s}.png`, fullPage: true })
}
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(url + '#team'); await page.waitForTimeout(1500)
await page.screenshot({ path: 'shot-mobile.png', fullPage: false })
console.log('errors:', errs.slice(0, 5))
await browser.close()
