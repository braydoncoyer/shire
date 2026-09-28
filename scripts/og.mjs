// The social preview image (public/og.jpg, 1200 × 630): a render of Hobbiton at sunset from the
// Hill, with the title set over it as on the loading screen. Needs the dev server (npm run dev).
//   node scripts/og.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const SHOT = 'shots/og_scene.png';
const QUERY = 'cam=-58,32,-114,-2.378,-0.19&fly&time=19.25&weather=fair';

// 1. The scene, at twice the size for a crisp downscale.
execFileSync('node', ['scripts/shot.mjs', 'og_scene', QUERY], { stdio: 'inherit', env: { ...process.env, W: '2400', H: '1260', WAIT: '4000' } });

// 2. The type over it.
const img = `data:image/png;base64,${fs.readFileSync(SHOT).toString('base64')}`;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;1,500&family=Inter:wght@500;600&display=block" rel="stylesheet">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0c0f0b; }
  .bg { position: absolute; inset: 0; background: url(${img}) center 42% / cover; }
  .veil { position: absolute; inset: 0;
    background: radial-gradient(75% 95% at 0% 100%, rgba(6,8,5,.8) 0%, rgba(6,8,5,.42) 42%, transparent 72%),
                linear-gradient(0deg, rgba(6,8,5,.45), transparent 40%); }
  .corner { position: absolute; left: 64px; bottom: 58px; color: #f3ecd8; }
  .eyebrow { font: 600 15px/1 Inter, sans-serif; letter-spacing: .2em; text-transform: uppercase; color: #d9b45a; margin: 0 0 16px; }
  h1 { font: 500 118px/.9 'Cormorant Garamond', serif; margin: 0; letter-spacing: -.005em; text-shadow: 0 2px 30px rgba(0,0,0,.4); }
  p { font: italic 500 29px/1.3 'Cormorant Garamond', serif; margin: 18px 0 0; color: rgba(243,236,216,.86); max-width: 560px; }
</style></head><body>
  <div class="bg"></div><div class="veil"></div>
  <div class="corner">
    <p class="eyebrow">A walk in Hobbiton</p>
    <h1>The Shire</h1>
    <p>Wander the lanes, take the guided tour, and stay for the fireworks.</p>
  </div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 86 });
await browser.close();
console.log(`public/og.jpg ${(fs.statSync('public/og.jpg').size / 1024).toFixed(0)} KB`);
