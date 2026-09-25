// Camera presets that reproduce the reference photos of Bag End, then renders them.
// node --import ./scripts/json-loader.mjs scripts/bagend-views.mjs [time]
import { execFileSync } from 'node:child_process';
const L = await import('../src/world/Layout.js');
const h = L.HOLES[0], R = h.arc.R;
const C = [h.x - h.fx * R, h.z - h.fz * R];
const s = [h.fz, -h.fx];
// point at arc position v (m along the facade), u meters in front, returns [x, z]
const P = (v, u) => {
  const a = v / R, dx = h.fx * Math.cos(a) + s[0] * Math.sin(a), dz = h.fz * Math.cos(a) + s[1] * Math.sin(a);
  return [C[0] + dx * (R + u), C[1] + dz * (R + u)];
};
const pose = (name, cam, look, yOff, pitch) => {
  const [x, z] = cam, [tx, tz] = look;
  const y = L.heightAt(x, z) + yOff;
  return [name, `cam=${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)},${Math.atan2(x - tx, z - tz).toFixed(3)},${pitch}&fly`];
};
const t = process.argv[2] || '9.5';
const views = [
  pose('ref_front', P(1.5, 10), P(1.5, 0), 1.7, 0.05), // like be_19: door section and the window right of it
  pose('ref_door', P(0, 5), P(0, 0), 1.6, 0.08), // like be_9: the door close up
  pose('ref_steps', P(-3.5, 8), P(0.5, 0), 0.9, 0.18), // like be_10: from the steps, up at the door
  pose('ref_below', P(-5, 45), P(-5, 0), 1.7, 0.12), // like be_12: from the slope below
  pose('ref_study', P(-8.2, 3.6), P(-8.2, 0), 1.6, 0.12), // like be_2: the arched study window
];
const args = views.flatMap(([n, q]) => [n, `time=${t}&${q}`]);
execFileSync('node', ['scripts/shot.mjs', ...args], { stdio: 'inherit' });
