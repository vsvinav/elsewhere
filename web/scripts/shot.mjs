import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1400,900'] })
const page = await browser.newPage()
const W = +(process.env.W ?? 1440), H = +(process.env.H ?? 900)
await page.setViewport({ width: W, height: H })
page.on('console', m => { const t = m.text(); if (!/vite\]|DevTools|GL Driver/.test(t)) console.log('CONSOLE', m.type(), t.slice(0, 300)) })
page.on('pageerror', e => console.log('PAGEERROR', (e.stack ?? e.message).slice(0, 900)))
page.on('requestfailed', r => console.log('REQFAIL', r.url().slice(0, 120), r.failure()?.errorText))
if (process.env.LS) await page.evaluateOnNewDocument((ls) => { for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v) }, JSON.parse(process.env.LS))
await page.goto(process.argv[2] ?? 'http://localhost:5173', { waitUntil: 'networkidle0', timeout: 60000 })
if (process.argv[3]) { await page.click(process.argv[3]); }
await new Promise(r => setTimeout(r, +(process.argv[4] ?? 8000)))
if (process.env.SCROLL) { await page.evaluate((sel) => { const el = isNaN(+sel) ? document.querySelector(sel) : null; if (el) el.scrollIntoView({ block: 'start' }); else scrollTo(0, +sel) }, process.env.SCROLL); await new Promise(r => setTimeout(r, 1200)) }
const stats = await page.evaluate(() => {
  const out = {}
  for (const c of document.querySelectorAll('canvas')) {
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) { out[c.className] = 'no-gl'; continue }
    const px = new Uint8Array(4 * 200 * 200)
    gl.readPixels(400, 300, 200, 200, gl.RGBA, gl.UNSIGNED_BYTE, px)
    let lit = 0; for (let i = 0; i < px.length; i += 4) if (px[i] + px[i+1] + px[i+2] > 60) lit++
    out[c.className || 'canvas'] = `${lit}/40000 lit px`
  }
  return out
})
console.log('CANVAS', JSON.stringify(stats))
await page.screenshot({ path: process.env.OUT ?? '/tmp/shot.png', fullPage: !!process.env.FULL })
await browser.close()
