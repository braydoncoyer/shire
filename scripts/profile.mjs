// CPU profile of the running app (top self-time functions): node scripts/profile.mjs "<query>"
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.goto('http://127.0.0.1:5190/?shot&' + (process.argv[2] || 'cam=20,,70,0.6,-0.08'));
await page.waitForFunction('window.shireReady === true');
await new Promise((r) => setTimeout(r, 1500));
const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await new Promise((r) => setTimeout(r, 3000));
const { profile } = await cdp.send('Profiler.stop');
const self = new Map();
const dt = {};
for (let i = 0; i < profile.samples.length; i++) dt[profile.samples[i]] = (dt[profile.samples[i]] || 0) + (profile.timeDeltas[i] || 0);
for (const n of profile.nodes) {
  const cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop()}:${cf.lineNumber}`;
  self.set(key, (self.get(key) || 0) + (dt[n.id] || 0));
}
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
for (const [k, v] of top) console.log((v / 1000).toFixed(0).padStart(6), 'ms', k);
await browser.close();
