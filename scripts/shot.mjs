// Headless screenshots of the running dev server (npm run dev) with real WebGPU.
// Usage: node scripts/shot.mjs <name> "<query string>" [<name> "<query>"...]
//   e.g. node scripts/shot.mjs field "time=17.9" hill "cam=-20,40,60,-0.4,-0.2&fly"

import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const args = process.argv.slice(2);
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const BASE = process.env.BASE || 'http://127.0.0.1:5190/';
fs.mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

for (let i = 0; i < args.length; i += 2) {
  const name = args[i], q = args[i + 1] || '';
  const t0 = Date.now();
  await page.goto(`${BASE}?shot&${q}`, { waitUntil: 'load' });
  try {
    await page.waitForFunction('window.shireReady === true || /wrong/.test(document.getElementById("loader-status")?.textContent)', { timeout: 180000 });
  } catch {
    console.log(`${name}: not ready`);
  }
  // Let exposure settle and the TAA-free sky jitter average out a little.
  await new Promise((r) => setTimeout(r, +(process.env.WAIT || 2500)));
  const fps = await page.evaluate(() => document.getElementById('fps')?.textContent || '');
  await page.screenshot({ path: `shots/${name}.png` });
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)}s ${fps}`);
}
const errs = logs.filter((l) => /error|warn/i.test(l));
if (errs.length) console.log(errs.slice(0, 30).join('\n'));
await browser.close();
