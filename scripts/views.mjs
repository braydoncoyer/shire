// Standard test views across the set, as "name query" lines: node --import ./scripts/json-loader.mjs scripts/views.mjs
const L = await import('../src/world/Layout.js');
const pose = (name, [x, z], [tx, tz], up, pitch, fly = true) => {
  const y = L.heightAt(x, z) + up;
  return `${name} cam=${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)},${Math.atan2(x - tx, z - tz).toFixed(3)},${pitch}${fly ? '&fly' : ''}`;
};
const be = [L.LANDMARKS.bagEnd.x, L.LANDMARKS.bagEnd.z], gd = [L.GREEN_DRAGON.x, L.GREEN_DRAGON.z], pt = [L.LANDMARKS.partyTree.x, L.LANDMARKS.partyTree.z];
console.log([
  pose('hill', [be[0] + 15, be[1] + 15], gd, 1.7, -0.08),
  pose('lake', [90, 175], be, 1.7, 0.02),
  pose('bridge', [L.BRIDGE.x, L.BRIDGE.z], gd, 1.7, 0),
  pose('party', pt, be, 1.7, 0.05),
  pose('overview', [160, 220], [-20, -60], 70, -0.25),
  pose('bagend', [be[0] + 20, be[1] + 8], be, 1.7, 0.05),
].join('\n'));
