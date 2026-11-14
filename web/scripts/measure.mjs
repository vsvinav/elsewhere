import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 })
await p.goto('http://localhost:5173/#home', { waitUntil: 'networkidle0' }); await new Promise(r=>setTimeout(r,2500))
console.log(await p.evaluate(() => ['.tray','.strip','.pass','.pass .body','.big','.stubnav','.fields'].map(s => { const e=document.querySelector(s); const r=e.getBoundingClientRect(); return `${s}: x=${r.x} w=${r.width} sw=${e.scrollWidth}` }).join('\n')))
await b.close()
