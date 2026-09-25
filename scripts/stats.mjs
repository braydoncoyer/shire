// Draw calls and triangles per render pass: node scripts/stats.mjs "<query>"
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewport({ width: 1728, height: 1117, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:5190/?shot&${process.argv[2] || ''}`);
await page.waitForFunction('window.shireReady === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => new Promise((res) => {
  const r = shire.renderer, be = r.backend, rows = [];
  const orig = be.beginRender.bind(be), fin = be.finishRender.bind(be);
  const stack = [];
  be.beginRender = (ctx) => { stack.push({ name: `${ctx.camera?.isOrthographicCamera ? 'ortho' : 'persp'} ${ctx.renderTarget ? (ctx.renderTarget.texture?.name || 'rt') + ' ' + ctx.renderTarget.width + 'x' + ctx.renderTarget.height : 'canvas'}`, c0: r.info.render.drawCalls, t0: r.info.render.triangles }); return orig(ctx); };
  be.finishRender = (ctx) => { const cur = stack.pop(); rows.push(' '.repeat(stack.length * 2) + `${cur.name.padEnd(40)} calls ${String(r.info.render.drawCalls - cur.c0).padStart(5)}  tris ${((r.info.render.triangles - cur.t0) / 1e3).toFixed(0).padStart(7)}k`); return fin(ctx); };
  let n = 0; const tick = () => (++n < 2 ? requestAnimationFrame(tick) : (rows.length = 0, requestAnimationFrame(() => { be.beginRender = orig; be.finishRender = fin; res(rows.join('\n')); }))); requestAnimationFrame(tick);
}));
console.log(out);
await browser.close();
