import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: [...(process.env.GPU ? ['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'] : ['--use-angle=swiftshader','--enable-unsafe-swiftshader']),'--window-size=1440,900','--enable-precise-memory-info'] })
const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 })
for (const tab of ['', 'stats', 'places', 'trips', 'map', 'play']) {
  await page.goto('http://localhost:5173/#' + tab, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.evaluate(() => { window.__lt = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }) })
  await new Promise(r => setTimeout(r, 6000))
  const r = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now(); await new Promise(res => { const f = () => { frames++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res() }; requestAnimationFrame(f) })
    return { fps: Math.round(frames / 2), dom: document.querySelectorAll('*').length, svgPaths: document.querySelectorAll('path').length, heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576), longTasks: window.__lt.length, worstMs: Math.max(0, ...window.__lt) }
  })
  console.log(tab || 'home', JSON.stringify(r))
}
await browser.close()
