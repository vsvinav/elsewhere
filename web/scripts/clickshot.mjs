// usage: node clickshot.mjs <chipLabel> <out>
import puppeteer from 'puppeteer-core'
const [label, out] = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1400,900'] })
const p = await b.newPage(); await p.setViewport({ width: 1400, height: 900 })
p.on('pageerror', (e) => console.log('PAGEERROR', e.message))
p.on('console', (m) => { if (m.type() === 'error' && !/404|wood/.test(m.text())) console.log('CONSOLE', m.text()) })
await p.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await p.evaluate((l) => { [...document.querySelectorAll('.chip')].find((c) => c.textContent.trim() === l)?.click() }, label)
await new Promise((r) => setTimeout(r, 6000))
await p.screenshot({ path: out }); await b.close()
