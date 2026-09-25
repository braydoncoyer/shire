// Frame times while flying a route across the set at walking-to-running pace, looking around:
//   node scripts/fly.mjs [speed m/s]
import puppeteer from 'puppeteer-core';
const speed = +(process.argv[2] || 6);
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.setViewport({ width: 1728, height: 1117, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${process.env.PORT || 5190}/?shot&fly`);
await page.waitForFunction('window.shireReady === true', { timeout: 120000 });
const run = () => page.evaluate((speed) => new Promise((done) => {
  // Party Field → Bag End → down through the village → the lake → the Green Dragon → out to the fields.
  const route = [[52, -36], [27, -44], [-40, -92], [-20, -40], [10, 20], [30, 90], [66, 130], [140, 200], [260, 120]];
  const p = shire.player, dts = [], worst = [];
  let seg = 0, t = 0, last = performance.now(), T = 0;
  const f = () => {
    const now = performance.now(), dt = now - last; last = now; T += dt / 1000;
    dts.push(dt);
    if (dt > 25 && T > 0.5) worst.push(`${dt.toFixed(0)}ms @${T.toFixed(1)}s seg${seg}`);
    const [ax, az] = route[seg], [bx, bz] = route[seg + 1];
    const len = Math.hypot(bx - ax, bz - az);
    t += (speed * dt) / 1000 / len;
    if (t >= 1) { t = 0; seg++; }
    if (seg >= route.length - 1) {
      const s = [...dts].sort((a, b) => a - b), q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
      return done({ n: s.length, med: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1], over20: s.filter((d) => d > 20).length, over33: s.filter((d) => d > 33).length, secs: T, worst: worst.join(', ') });
    }
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    const yaw = Math.atan2(ax - bx, az - bz) + Math.sin(T * 0.9) * 1.2;
    p.setPose(x, NaN, z, yaw, -0.05); // NaN: stand on the ground
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}), speed);
const fmt = (res) => (Object.entries(res).map(([k, v]) => `${k} ${typeof v !== 'number' ? v : Number.isInteger(v) ? v : v.toFixed(1)}`).join('  '));
console.log('first ', fmt(await run()));
if (process.env.TWICE) console.log('second', fmt(await run()));
await browser.close();
