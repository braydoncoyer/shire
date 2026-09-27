// CPU profile of the whole load (cold, fresh profile), summarized by self time per function and
// per source file:  node scripts/loadprofile.mjs   (BASE or PORT env selects the server)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1728, height: 1117, deviceScaleFactor: 2 });
const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.goto(`${process.env.BASE || `http://127.0.0.1:${process.env.PORT || 5190}/`}?shot`);
await page.waitForFunction('window.shireReady === true', { timeout: 180000, polling: 50 });
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dt = profile.timeDeltas;
profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
const fn = new Map(), file = new Map();
for (const [id, t] of self) {
  const cf = byId.get(id).callFrame;
  const f = (cf.url.split('/').pop() || '(native)').split('?')[0];
  const k = `${cf.functionName || '(anon)'}  ${f}:${cf.lineNumber + 1}`;
  fn.set(k, (fn.get(k) || 0) + t);
  file.set(f, (file.get(f) || 0) + t);
}
const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `${(t / 1000).toFixed(0).padStart(6)} ms  ${k}`).join('\n');
console.log('By file:\n' + top(file, 14) + '\n\nBy function:\n' + top(fn, 30));
await browser.close();
