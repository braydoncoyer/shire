// Frame-time distribution while spinning the camera and flying across the set (catches hitches):
//   node scripts/spin.mjs "<query>"   (vsync off; reports median, p95, p99, max)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewport({ width: 1728, height: 1117, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:5190/?shot&${process.argv[2] || 'cam=20,,70,0.6,-0.08'}`);
await page.waitForFunction('window.shireReady === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
const spin = () => page.evaluate(() => new Promise((done) => {
  const p = shire.player, dts = [];
  const x0 = p.camera?.position?.x ?? 0;
  let last = performance.now(); const t0 = last;
  const f = () => {
    const now = performance.now(); dts.push(now - last); last = now;
    const t = (now - t0) / 1000;
    p.yaw += 0.03; // ~1.8 turns/s at 60 fps
    if (t < 8) requestAnimationFrame(f);
    else {
      const s = [...dts].sort((a, b) => a - b), q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
      done({ n: s.length, med: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1], over20: s.filter((d) => d > 20).length });
    }
  };
  requestAnimationFrame(f);
}));
const fmt = (res) => (Object.entries(res).map(([k, v]) => `${k} ${typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(1) : v}`).join('  '));
console.log('first ', fmt(await spin()));
console.log('second', fmt(await spin()));
await browser.close();
