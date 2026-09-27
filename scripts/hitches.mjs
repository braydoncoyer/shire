// Pipelines created after loading finished, while turning, flying, entering the inn, on the bridge,
// in rain and in photo mode: each one is a potential hitch.  node scripts/hitches.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.goto(`http://127.0.0.1:${process.env.PORT || 5190}/?shot&speed=60`);
await page.waitForFunction('window.shireReady === true', { timeout: 180000, polling: 50 });
const count = () => page.evaluate(() => shire.renderer._pipelines.caches.size);
const c0 = await count();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
// Spin in place.
for (let k = 0; k < 24; k++) { await page.evaluate((k) => { shire.player.yaw += Math.PI / 12; }, k); await wait(80); }
log.push(['spin', (await count()) - c0]);
// Fly over the village, then stand inside the inn, then at the lake.
await page.evaluate(() => shire.player.setPose(0, 60, 0, 0.5, -0.4)); await wait(1500);
log.push(['aerial', (await count()) - c0]);
await page.evaluate(() => { const [x, z] = shire.greenDragon.interior.hearthXZ(); shire.player.setPose(x + 3, undefined, z + 1, 0, 0); }); await wait(1500);
log.push(['inn', (await count()) - c0]);
await page.evaluate(() => shire.player.setPose(19.2, 5.6, 127.2, -0.37, -0.3)); await wait(1500);
log.push(['bridge', (await count()) - c0]);
await page.evaluate(() => { shire.settings.weather = 'rain'; shire.weather.goTo('rain', 1); }); await wait(3000);
log.push(['rain', (await count()) - c0]);
await page.evaluate(() => { shire.photo.enter(); shire.photo._set('dof', true); }); await wait(1500);
log.push(['photo dof', (await count()) - c0]);
console.log('after load:', c0, 'pipelines; new since:', JSON.stringify(log));
await browser.close();
