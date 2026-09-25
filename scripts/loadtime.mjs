// Time spent in each loading phase: node scripts/loadtime.mjs   (PORT env selects the server)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1728, height: 1117, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(() => {
  window.__phases = [];
  new MutationObserver(() => {
    const t = document.getElementById('loader-status')?.textContent;
    if (t && window.__phases.at(-1)?.[0] !== t) window.__phases.push([t, performance.now()]);
  }).observe(document, { subtree: true, childList: true, characterData: true });
});
await page.goto(`http://127.0.0.1:${process.env.PORT || 5190}/?shot`);
await page.waitForFunction('window.shireReady === true', { timeout: 120000, polling: 50 });
const ph = await page.evaluate(() => [...window.__phases, ['ready', performance.now()]]);
for (let i = 0; i < ph.length - 1; i++) console.log(((ph[i + 1][1] - ph[i][1]) / 1000).toFixed(2).padStart(6), 's ', ph[i][0]);
console.log('total', (ph.at(-1)[1] / 1000).toFixed(2), 's');
await browser.close();
