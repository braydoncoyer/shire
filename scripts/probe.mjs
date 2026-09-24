// Evaluate an expression in the running app: node scripts/probe.mjs "<query>" "<js expr>"
import puppeteer from 'puppeteer-core';
const [q, expr] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.goto(`http://127.0.0.1:5190/?shot&${q}`);
await page.waitForFunction('window.shireReady === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
console.log(await page.evaluate(expr));
await browser.close();
