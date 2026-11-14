import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'] })
const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 })
await page.goto(process.argv[2] ?? 'http://localhost:5174/#play', { waitUntil: 'networkidle0', timeout: 60000 })
await new Promise((r) => setTimeout(r, 5000))
if (process.argv[3]) await page.click('.hud-controls .play')
await new Promise((r) => setTimeout(r, 2000))
const fps = []
for (let i = 0; i < 4; i++) fps.push(await page.evaluate(async () => { const d = []; let last = performance.now(); await new Promise((res) => { const t0 = last; const f = () => { const t = performance.now(); d.push(t - last); last = t; t - t0 < 2500 ? requestAnimationFrame(f) : res() }; requestAnimationFrame(f) }); d.sort((a, b) => a - b); return `${Math.round(1000 / (d.reduce((a, b) => a + b) / d.length))}fps p95=${d[Math.floor(d.length * 0.95)].toFixed(0)}ms max=${d[d.length - 1].toFixed(0)}ms` }))
console.log(fps.join(' | '))
await browser.close()
