// Walking routes for the tour: the shortest way between two points along the village's lanes (and
// over the bridge), smoothed into a line a camera can follow without jerking at every junction.

import { LANES, BRIDGE } from '../world/Layout.js';

let graph = null;

/** Nodes are the lanes' 1 m samples; edges run along each lane and across junctions and the bridge. */
function build() {
  const xs = [], zs = [], adj = [];
  const add = (x, z) => { xs.push(x); zs.push(z); adj.push([]); return xs.length - 1; };
  const link = (a, b) => {
    const d = Math.hypot(xs[a] - xs[b], zs[a] - zs[b]);
    adj[a].push(b, d);
    adj[b].push(a, d);
  };
  const lane = [];
  for (const L of LANES) {
    const pts = L.samples || L.pts;
    let prev = -1;
    for (const [x, z] of pts) {
      const i = add(x, z);
      lane.push(L);
      if (prev >= 0) link(prev, i);
      prev = i;
    }
  }
  // The bridge deck, end to end.
  let prev = -1;
  const n = Math.ceil(BRIDGE.half * 2);
  const bridge = [];
  for (let k = 0; k <= n; k++) {
    const t = -BRIDGE.half + (k / n) * BRIDGE.half * 2;
    const i = add(BRIDGE.x + BRIDGE.dx * t, BRIDGE.z + BRIDGE.dz * t);
    lane.push(null);
    bridge.push(i);
    if (prev >= 0) link(prev, i);
    prev = i;
  }
  // Junctions: nodes of different lanes (or the bridge ends) within reach of each other.
  const cell = 2, grid = new Map();
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  for (let i = 0; i < xs.length; i++) {
    const k = key(xs[i], zs[i]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const near = (i, r) => {
    const out = [];
    const cx = Math.floor(xs[i] / cell), cz = Math.floor(zs[i] / cell), s = Math.ceil(r / cell);
    for (let a = -s; a <= s; a++)
      for (let b = -s; b <= s; b++)
        for (const j of grid.get(`${cx + a},${cz + b}`) || []) if (j !== i && Math.hypot(xs[i] - xs[j], zs[i] - zs[j]) < r) out.push(j);
    return out;
  };
  for (let i = 0; i < xs.length; i++)
    for (const j of near(i, 1.8)) if (j > i && lane[i] !== lane[j]) link(i, j);
  for (const e of [bridge[0], bridge[bridge.length - 1]]) {
    for (const j of near(e, 5)) if (lane[j]) link(e, j);
  }
  return { xs, zs, adj, near: (x, z) => {
    let best = -1, bd = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = (xs[i] - x) ** 2 + (zs[i] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  } };
}

/** Dijkstra over the lane graph, with a small binary heap. */
function shortest(g, a, b) {
  const n = g.xs.length, dist = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
  const heap = [[0, a]];
  dist[a] = 0;
  const push = (d, i) => {
    heap.push([d, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, i] = pop();
    if (i === b) break;
    if (d > dist[i]) continue;
    const e = g.adj[i];
    for (let k = 0; k < e.length; k += 2) {
      const j = e[k], nd = d + e[k + 1];
      if (nd < dist[j]) { dist[j] = nd; from[j] = i; push(nd, j); }
    }
  }
  const path = [];
  for (let i = b; i >= 0; i = from[i]) {
    path.push([g.xs[i], g.zs[i]]);
    if (i === a) break;
  }
  return path.reverse();
}

/** Evenly spaced points along a polyline. */
function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    let t = step - carry;
    while (t <= len) {
      out.push([ax + ((bx - ax) * t) / len, az + ((bz - az) * t) / len]);
      t += step;
    }
    carry = len - (t - step);
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(out[out.length - 1][0] - last[0], out[out.length - 1][1] - last[1]) > step * 0.3) out.push(last);
  return out;
}

/**
 * A walking line from `a` to `b` ([x, z]) along the lanes: onto the nearest lane, along it, and off
 * to `b`. Returns { pts: [[x, z]...] every 0.5 m, length }.
 */
export function route(a, b) {
  graph ||= build();
  const ia = graph.near(a[0], a[1]), ib = graph.near(b[0], b[1]);
  const pts = [a, ...shortest(graph, ia, ib), b];
  // Drop the nodes at the ends that would double back.
  let line = resample(pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.05), 0.5);
  // Round off junction corners: a moving average a few meters wide, ends held where they are.
  for (let pass = 0; pass < 3; pass++) {
    const s = line.map((p) => p.slice());
    for (let i = 1; i < line.length - 1; i++) {
      const w = Math.min(6, i, line.length - 1 - i);
      let x = 0, z = 0;
      for (let k = -w; k <= w; k++) { x += line[i + k][0]; z += line[i + k][1]; }
      s[i] = [x / (w * 2 + 1), z / (w * 2 + 1)];
    }
    line = s;
  }
  line = resample(line, 0.5);
  let length = 0;
  for (let i = 1; i < line.length; i++) length += Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
  return { pts: line, length };
}

/** Point and direction `d` meters along a route. */
export function along(r, d) {
  const f = Math.max(0, Math.min(r.pts.length - 1, (d / r.length) * (r.pts.length - 1)));
  const i = Math.min(r.pts.length - 2, Math.floor(f)), t = f - i;
  const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
  return [ax + (bx - ax) * t, az + (bz - az) * t];
}

/** Two routes end to end (the second starting where the first ends). */
export function join(a, b) {
  return { pts: [...a.pts, ...b.pts.slice(1)], length: a.length + b.length };
}
