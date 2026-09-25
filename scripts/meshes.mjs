// Biggest meshes by triangles × instances, with their layers: node scripts/meshes.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 500 });
await page.goto(`http://127.0.0.1:5190/?shot&${process.argv[2] || ''}`);
await page.waitForFunction('window.shireReady === true', { timeout: 120000 });
const out = await page.evaluate(() => {
  const rows = [];
  shire.scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry, tris = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
    const inst = o.isInstancedMesh ? o.count : 1;
    let path = o.name || o.material?.name || o.material?.type; let p = o.parent; while (p && p !== shire.scene) { path = (p.name || '') + '/' + path; p = p.parent; }
    rows.push([tris * inst, `${(tris * inst / 1e3).toFixed(0).padStart(7)}k  ${String(inst).padStart(6)}x ${(tris / 1e3).toFixed(1).padStart(6)}k  layers ${o.layers.mask.toString(2).padStart(5)} cast ${o.castShadow ? 1 : 0}  ${path}`]);
  });
  return rows.sort((a, b) => b[0] - a[0]).slice(0, 30).map((r) => r[1]).join('\n');
});
console.log(out);
await browser.close();
