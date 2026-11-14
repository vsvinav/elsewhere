import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'] })
const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 })
await page.goto('http://localhost:5174/#play', { waitUntil: 'networkidle0', timeout: 60000 })
await new Promise((r) => setTimeout(r, 5000))
if (process.argv[3]) await page.click('.hud-controls .play')
for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, +(process.argv[2] ?? 2500))); await page.screenshot({ path: `/tmp/ps${i}.png` }) }
await browser.close()
