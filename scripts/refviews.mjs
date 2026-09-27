// Viewpoints matching the film reference shots: node --import ./scripts/json-loader.mjs scripts/refviews.mjs
const L = await import('../src/world/Layout.js');
const pose = (name, [x, z], [tx, tz], up, pitch, extra = '') => {
  const y = L.heightAt(x, z) + up;
  return `${name} cam=${x.toFixed(1)},${y.toFixed(1)},${z.toFixed(1)},${Math.atan2(x - tx, z - tz).toFixed(3)},${pitch}&fly${extra}`;
};
console.log([
  pose('ref_bridge', [4, 119], [60, 128], 2.2, 0.0),
  pose('ref_across', [-15, -75], [45, 125], 22, -0.12),
  pose('ref_forecourt', [48, 122], [70, 135], 1.7, 0.02),
].join('\n'));
