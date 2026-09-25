// Draw calls per subsystem and pass: node scripts/draws.mjs "<query>"
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 1728, height: 1117, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:5190/?shot&${process.argv[2] || ''}`);
await page.waitForFunction('window.shireReady === true', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1000));
console.log(await page.evaluate(() => new Promise((res) => {
  const a = shire, r = a.renderer;
  const groups = { veg: a.vegetation.group, shrubs: a.shrubs.group, holes: a.holes.group, gd: a.greenDragon.group, bounds: a.boundaries.group, bld: a.buildings.group, terrain: a.terrain.group, grass: a.grass.group, water: a.water.group };
  const owner = new Map();
  for (const [k, g] of Object.entries(groups)) g.traverse((o) => owner.set(o, k));
  const counts = {};
  const orig = r._renderObjectDirect.bind(r);
  r._renderObjectDirect = (object, material, scene, camera, ...rest) => {
    const pass = camera.isOrthographicCamera ? 'shadow' : (camera === a.camera ? 'main' : 'refl');
    const k = `${pass}:${owner.get(object) || object.type}`;
    counts[k] = (counts[k] || 0) + 1;
    return orig(object, material, scene, camera, ...rest);
  };
  requestAnimationFrame(() => { for (const k in counts) delete counts[k]; requestAnimationFrame(() => { r._renderObjectDirect = orig; res(Object.entries(counts).sort().map(([k, v]) => `${k.padEnd(20)} ${v}`).join('\n')); }); });
})));
await browser.close();
