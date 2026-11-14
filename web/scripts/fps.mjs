import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--window-size=1440,900'] })
const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 })
await page.goto('http://localhost:5173/#play', { waitUntil: 'networkidle0', timeout: 60000 })
await new Promise(r => setTimeout(r, 6000))
const fps = []
for (let i = 0; i < 3; i++) fps.push(await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(res => { const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res() }; requestAnimationFrame(f) }); return Math.round(n / 2) }))
console.log(process.argv[2] ?? '', 'fps', fps.join(' '))
await browser.close()
