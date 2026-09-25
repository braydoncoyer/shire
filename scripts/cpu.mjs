// CPU time of App.frame() (JS + command encoding), averaged: node scripts/cpu.mjs "<query>" ["<js>"...]
import puppeteer from 'puppeteer-core';
const [q = '', ...variants] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewport({ width: 1728, height: 1117, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:5190/?shot&${q}`);
await page.waitForFunction('window.shireReady === true', { timeout: 120000 });
await page.evaluate(() => {
  const app = shire, f = app.frame.bind(app);
  window.cpuT = [];
  app.renderer.setAnimationLoop(() => { const t = performance.now(); f(); cpuT.push(performance.now() - t); });
});
for (const v of variants.length ? variants : ['default=']) {
  const [label, ...js] = v.split('=');
  await page.evaluate(js.join('=') || '0');
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => (cpuT.length = 0));
  await new Promise((r) => setTimeout(r, 2000));
  const t = await page.evaluate(() => { const s = [...cpuT].sort((a, b) => a - b); return { n: s.length, med: s[s.length >> 1], p90: s[Math.floor(s.length * 0.9)] }; });
  console.log(`${label.padEnd(12)} cpu med ${t.med.toFixed(2)} ms  p90 ${t.p90.toFixed(2)} ms  (${t.n} frames)`);
}
await browser.close();
