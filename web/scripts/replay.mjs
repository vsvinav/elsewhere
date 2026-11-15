import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, userDataDir: '/tmp/elsewhere-prof',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'] })
const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 })
page.on('pageerror', e => console.log('PAGEERROR', e.message)); page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)) })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 60000 })
if (await page.$('.ob-drop')) {
  console.log('importing…')
  const input = await page.$('input[type=file]')
  await input.uploadFile('/Users/svinav/timeline/timeline.json')
  await page.waitForFunction(() => !document.querySelector('.ob-drop'), { timeout: 240000 })
}
if (await page.$('.ob-q')) {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 500))
    const tag = await page.$('.ob-tag'); if (tag) await tag.click()
    const btn = await page.$('.ob-actions .btn:not(.quiet)')
    const txt = btn ? await btn.evaluate(b => b.textContent) : ''
    console.log('step', i, txt)
    if (!btn) break
    await btn.click()
    await new Promise(r => setTimeout(r, 400))
    if (!(await page.$('.ob-q'))) break
  }
}
await page.goto('http://localhost:5173/#play', { waitUntil: 'networkidle0', timeout: 60000 })
await new Promise(r => setTimeout(r, 4000))
const speedLog2 = +(process.argv[2] ?? 0)
await page.evaluate((v) => {
  const el = document.querySelector('.hud-speed input')
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  set.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true }))
}, speedLog2)
const playing = await page.$('.hud-controls .play[aria-label=Pause]')
if (!playing) await page.click('.hud-controls .play')
for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 3000)); await page.screenshot({ path: `/tmp/rp${speedLog2}-${i}.png` }) }
console.log(await page.evaluate(() => document.querySelector('.hud-speed span')?.textContent))
await browser.close()
