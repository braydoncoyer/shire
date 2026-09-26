// Walk test: node scripts/walk.mjs x z yaw seconds  → logs the path (walking mode, W held).
import puppeteer from 'puppeteer-core';
const [x, z, yaw, secs = 6] = process.argv.slice(2).map(Number);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage(); await p.setViewport({ width: 800, height: 500 });
await p.goto(`http://127.0.0.1:5190/?shot&cam=${x},,${z},${yaw},0`);
await p.waitForFunction('window.shireReady === true', { timeout: 120000 });
const log = await p.evaluate((secs) => new Promise((res) => {
  const a = shire, out = [];
  a.input.keys.add('KeyW');
  const t0 = performance.now();
  const iv = setInterval(() => {
    const q = a.player.pos;
    out.push(`${((performance.now() - t0) / 1000).toFixed(1)}s (${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)}) inside=${a.greenDragon.interior.inside(q.x, q.z)}`);
    if (performance.now() - t0 > secs * 1000) { clearInterval(iv); a.input.keys.delete('KeyW'); res(out.join('\n')); }
  }, 500);
}), secs);
console.log(log);
console.log(await p.evaluate(() => JSON.stringify(shire.greenDragon.interior.doorPoints.map((d) => d.map((v) => +v.toFixed(2))))));
await b.close();
