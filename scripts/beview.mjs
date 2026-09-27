// Camera query in Bag End's door frame: node --import ./scripts/json-loader.mjs scripts/beview.mjs s u ts tu [up] [pitch]
// s: meters to the right of the door as seen from the lane (negative = left), u: meters out in front.
const L = await import('../src/world/Layout.js');
const h = L.HOLES[0], rs = [h.fz, -h.fx];
const P = (s, u) => [h.x + h.fx * u + rs[0] * s, h.z + h.fz * u + rs[1] * s];
const [s, u, ts, tu, up = 1.7, pitch = 0] = process.argv.slice(2).map(Number);
const [x, z] = P(s, u), [tx, tz] = P(ts, tu);
console.log(`cam=${x.toFixed(1)},${(L.heightAt(x, z) + up).toFixed(1)},${z.toFixed(1)},${Math.atan2(x - tx, z - tz).toFixed(3)},${pitch}&fly`);
