// A/B frame-time benchmark inside one page, with uncapped frame rate so fps reflects GPU cost.
//   node scripts/bench.mjs "<query>" "<label>=<js>" ["<label>=<js>" ...]
// Each variant's JS runs before its measurement; variants are measured twice, interleaved.
import puppeteer from 'puppeteer-core';
const [q = '', ...variants] = process.argv.slice(2);
const W = +(process.env.W || 1920), H = +(process.env.H || 1080);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:5190/?shot&${q}`);
await page.waitForFunction('window.shireReady === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
const measure = () => page.evaluate(() => new Promise((r) => {
  let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r((performance.now() - t0) / n); };
  requestAnimationFrame(f);
}));
const list = variants.length ? variants : ['default='];
const res = {};
for (let pass = 0; pass < 2; pass++)
  for (const v of list) {
    const [label, ...js] = v.split('=');
    await page.evaluate(js.join('='));
    await new Promise((r) => setTimeout(r, 300));
    (res[label] ||= []).push(await measure());
  }
for (const [k, v] of Object.entries(res)) console.log(`${k.padEnd(14)} ${v.map((x) => x.toFixed(2) + ' ms').join('  ')}`);
await browser.close();
