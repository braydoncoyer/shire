// Camera query for a view from (x, z) at `up` m above ground toward (tx, tz):
//   node --import ./scripts/json-loader.mjs scripts/look.mjs x z tx tz [up] [pitch]
const L = await import('../src/world/Layout.js');
const [x, z, tx, tz, up = 1.7, pitch = 0] = process.argv.slice(2).map(Number);
console.log(`cam=${x.toFixed(1)},${(L.heightAt(x, z) + up).toFixed(1)},${z.toFixed(1)},${Math.atan2(x - tx, z - tz).toFixed(3)},${pitch}&fly`);
