// Headless check of the UI: start overlay, settings panel, presets, photo mode and saving a photo.
import puppeteer from 'puppeteer-core';
const W = 1600, H = 900;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:5190/${process.argv[2] || ''}`);
await page.waitForFunction('window.shireReady === true', { timeout: 180000 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2500);
await page.screenshot({ path: 'shots/ui_start.png' });
await page.keyboard.press('Tab');
await wait(800);
await page.screenshot({ path: 'shots/ui_settings.png' });
const t0 = await page.evaluate(() => { const r = shire.renderer; return [r.getPixelRatio(), shire.post.msaa, shire.lighting.csm.lights.map((l) => l.shadow.mapSize.x).join()]; });
await page.click('[data-preset=low]');
await wait(2500);
const t1 = await page.evaluate(() => { const r = shire.renderer; return [r.getPixelRatio(), shire.post.msaa, shire.lighting.csm.lights.map((l) => l.shadow.mapSize.x).join(), shire.lighting.csm.lights.map((l) => l.shadow.map?.width).join()]; });
await page.screenshot({ path: 'shots/ui_low.png' });
await page.click('[data-preset=ultra]');
await wait(2500);
await page.screenshot({ path: 'shots/ui_ultra.png' });
await page.click('[data-preset=high]');
await wait(1500);
console.log('high', t0, 'low', t1);
await page.click('#settings [data-close]');
await page.keyboard.press('KeyP');
await wait(1000);
await page.evaluate(() => {
  window.__saved = [];
  HTMLAnchorElement.prototype.click = function () { fetch(this.href).then((r) => r.blob()).then((b) => window.__saved.push([this.download, b.size])); };
});
await page.click('#photo-body input[type=checkbox]');
await wait(1500);
await page.evaluate(() => shire.photo.autofocus());
await wait(1500);
await page.screenshot({ path: 'shots/ui_photo.png' });
await page.click('#photo-capture');
await wait(2000);
await page.select('#photo-body select', '2');
await page.click('#photo-capture');
await wait(3000);
console.log('toast', await page.evaluate(() => document.getElementById('toast').textContent), 'saved', JSON.stringify(await page.evaluate(() => window.__saved)), 'focus', await page.evaluate(() => shire.post.focus.value.toFixed(1)));
console.log('audio', await page.evaluate(() => { shire.audio.resume(); return new Promise((r) => setTimeout(() => r(shire.audio.ctx?.state), 1500)); }));
await page.keyboard.press('KeyP');
await wait(800);
await page.screenshot({ path: 'shots/ui_after.png' });
const errs = logs.filter((l) => /error|warn/i.test(l));
console.log(errs.slice(0, 20).join('\n'));
await browser.close();
