// Life in the Shire: fireflies over the grass after dusk, butterflies by day, and small flocks of
// birds wheeling over the valley. Each kind is one draw of simple cards animated entirely in the
// vertex shader from a per-creature id; nothing is simulated on the CPU.
//
// Fireflies and butterflies live in a box that follows the camera: each has a fixed home in world
// space, wrapped into the box, so they stay put as you walk and new ones appear at the edges
// (faded in) rather than following you.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, uv, vec2, vec3, vec4, float, fract, sin, cos, abs, max, min, pow, hash, mix,
  smoothstep, length, cameraPosition, cameraWorldMatrix, varying, select, atan, normalize, floor,
} from 'three/tsl';
import { LAYERS } from '../core/Layers.js';
import { WATER_Y, GREEN_DRAGON } from './Layout.js';
import { cleanPoly } from './Kit.js';

/** Geometry of `n` items, each a copy of `verts` ([x, y, z, u, v]) and `tris`, with an 'id' attribute. */
function items(n, verts, tris) {
  const pos = [], uvs = [], ids = [], idx = [];
  for (let i = 0; i < n; i++) {
    const b = i * verts.length;
    for (const [x, y, z, u, v] of verts) {
      pos.push(x, y, z);
      uvs.push(u, v);
      ids.push(i);
    }
    for (const t of tris) idx.push(b + t);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('id', new THREE.Float32BufferAttribute(ids, 1));
  g.setIndex(idx);
  return g;
}
const QUAD = [[-0.5, -0.5, 0, 0, 0], [0.5, -0.5, 0, 1, 0], [0.5, 0.5, 0, 1, 1], [-0.5, 0.5, 0, 0, 1]];
const QUAD_TRIS = [0, 1, 2, 0, 2, 3];
// Two wings hinged on the body line (local z): x < 0 is the left wing, x > 0 the right.
const WINGS = [
  [0, 0, -0.5, 0.5, 0], [-1, 0, -0.5, 0, 0], [-1, 0, 0.5, 0, 1], [0, 0, 0.5, 0.5, 1],
  [0, 0, -0.5, 0.5, 0], [1, 0, -0.5, 1, 0], [1, 0, 0.5, 1, 1], [0, 0, 0.5, 0.5, 1],
];
const WING_TRIS = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6];

const rnd = (id, k) => hash(id.add(k * 1013));

/** A point's home inside a box of `size` centered on the camera, wrapped so it stays fixed in the world. */
function wrapped(id, size) {
  const home = vec2(rnd(id, 1), rnd(id, 2)).mul(size);
  const rel = fract(home.sub(cameraPosition.xz).div(size)).sub(0.5).mul(size);
  return { xz: cameraPosition.xz.add(rel), edge: max(abs(rel.x), abs(rel.y)).div(size * 0.5) };
}

/** 1 inside the Green Dragon's footprint (an even-odd crossing test over its outline), else 0. */
function inInn(p) {
  const poly = cleanPoly(GREEN_DRAGON.poly);
  let crossings = float(0);
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[j];
    if (az === bz) continue;
    const straddles = p.y.greaterThan(az).notEqual(p.y.greaterThan(bz));
    const left = p.x.lessThan(p.y.sub(az).mul((bx - ax) / (bz - az)).add(ax));
    crossings = crossings.add(select(straddles.and(left), float(1), float(0)));
  }
  return step05(fract(crossings.mul(0.5)));
}
const step05 = (v) => select(v.greaterThan(0.25), float(1), float(0));

export class Wildlife {
  constructor(maps, sky) {
    this.u = { time: uniform(0), wind: uniform(new THREE.Vector2()) };
    this.group = new THREE.Group();
    this.group.add(this._fireflies(maps, sky), this._butterflies(maps, sky), this._birds(sky));
    for (const m of this.group.children) {
      m.frustumCulled = false;
      m.layers.set(LAYERS.NO_REFLECT);
    }
  }

  _fireflies(maps, sky) {
    const N = 700, BOX = 60;
    const u = this.u, su = sky.u;
    const glow = varying(float(0), 'ffGlow');
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.positionNode = Fn(() => {
      const id = attribute('id', 'float');
      const { xz, edge } = wrapped(id, BOX);
      const t = u.time;
      // Lazy loops: each drifts around its home, bobbing.
      const ph = rnd(id, 3).mul(6.283);
      const wander = vec2(sin(t.mul(0.23).add(ph)), cos(t.mul(0.19).add(ph.mul(1.7)))).mul(1.4)
        .add(vec2(sin(t.mul(0.61).add(ph.mul(2.1))), cos(t.mul(0.53).add(ph))).mul(0.35));
      const p = xz.add(wander);
      const ground = maps.height(p);
      const y = ground.add(rnd(id, 4).mul(rnd(id, 4)).mul(2.2).add(0.25)).add(sin(t.mul(0.7).add(ph.mul(3))).mul(0.25));
      // A short flash every few seconds, each on its own rhythm.
      const cycle = fract(t.mul(rnd(id, 5).mul(0.2).add(0.22)).add(rnd(id, 6)));
      const flash = smoothstep(0.0, 0.06, cycle).mul(float(1).sub(smoothstep(0.08, 0.32, cycle)));
      // After dusk only, not over water, faded in at the edge of the box and near the camera.
      const on = smoothstep(0.25, 0.7, su.night).mul(float(1).sub(smoothstep(0.75, 1.0, edge)))
        .mul(smoothstep(WATER_Y + 0.2, WATER_Y + 0.6, ground)).mul(smoothstep(0.6, 1.5, length(vec3(p.x, y, p.y).sub(cameraPosition))))
        .mul(float(1).sub(inInn(p)));
      glow.assign(flash.mul(on));
      const size = float(0.22);
      const c = attribute('position', 'vec3').xy;
      const right = cameraWorldMatrix.element(0).xyz, up = cameraWorldMatrix.element(1).xyz;
      return vec3(p.x, y, p.y).add(right.mul(c.x.mul(size))).add(up.mul(c.y.mul(size)));
    })();
    m.colorNode = Fn(() => {
      const r = length(uv().sub(0.5)).mul(2);
      const core = pow(max(float(1).sub(r), 0), 6).mul(3).add(pow(max(float(1).sub(r), 0), 2).mul(0.25));
      return vec4(vec3(0.75, 1.0, 0.25).mul(core).mul(glow).mul(0.5), 1);
    })();
    return new THREE.Mesh(items(N, QUAD, QUAD_TRIS), m);
  }

  _butterflies(maps, sky) {
    // Most butterflies keep to flowers: small colonies of up to four, each over a flower drift or
    // bed, though only some patches have one. A few strays wander anywhere.
    const N = 480, BOX = 70, COLONY = 4;
    const u = this.u, su = sky.u;
    const tint = varying(vec3(1), 'bfTint');
    const vis = varying(float(0), 'bfVis');
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
    m.positionNode = Fn(() => {
      const id = attribute('id', 'float');
      const colony = floor(id.div(COLONY));
      const stray = rnd(id, 20).lessThan(0.025);
      const { xz: home, edge } = wrapped(select(stray, id.add(10000), colony), BOX);
      // Flowers at the colony's home (the same drifts and beds the ground cover grows).
      const lanes = maps.lanes(home);
      const drift = smoothstep(0.5, 0.68, maps.noise(home, 17).r.mul(0.7).add(maps.noise(home, 6.5).b.mul(0.3)));
      const flowers = max(drift, smoothstep(0.7, 0.9, lanes.a)).mul(float(1).sub(smoothstep(0.02, 0.3, lanes.r)));
      const settled = flowers.greaterThan(0.5).and(rnd(colony, 21).lessThan(0.4)).and(rnd(id, 22).lessThan(0.8));
      // Colonies flit about their patch, low over the flowers; strays range widely and higher.
      const R1 = select(stray, float(4.5), float(1.1)), R2 = select(stray, float(0.6), float(0.35));
      const spot = select(stray, vec2(0), vec2(rnd(id, 23), rnd(id, 24)).sub(0.5).mul(2.2));
      const t = u.time.add(rnd(id, 3).mul(100));
      const ph = rnd(id, 4).mul(9);
      // Erratic wandering: a slow loop plus quick jinks.
      const a = vec2(sin(t.mul(0.31)), cos(t.mul(0.27))).mul(R1).add(vec2(sin(t.mul(1.7).add(ph)), cos(t.mul(1.3))).mul(R2));
      const va = vec2(cos(t.mul(0.31)).mul(0.31), sin(t.mul(0.27)).mul(-0.27)).mul(R1)
        .add(vec2(cos(t.mul(1.7).add(ph)).mul(1.7), sin(t.mul(1.3)).mul(-1.3)).mul(R2));
      const p = home.add(spot).add(a);
      const ground = maps.height(p);
      const lift = select(stray, rnd(id, 5).mul(1.1).add(0.8), rnd(id, 5).mul(0.5).add(0.3));
      const y = ground.add(lift).add(sin(t.mul(2.3)).mul(0.18)).add(sin(t.mul(9)).mul(0.04));
      const heading = atan(va.x, va.y);
      // Wings beat fast, sometimes held open to glide.
      const beat = sin(t.mul(22)).mul(0.5).add(0.5);
      const glide = smoothstep(0.6, 0.9, sin(t.mul(0.9).add(rnd(id, 6).mul(6))));
      const ang = mix(beat.mul(1.3).add(0.05), float(0.25), glide);
      const lp = attribute('position', 'vec3');
      const side = select(lp.x.lessThan(0), float(-1), float(1));
      const span = abs(lp.x);
      const size = rnd(id, 7).mul(0.05).add(0.08); // a little larger than life, to read at walking distance
      const wing = vec3(side.mul(span).mul(cos(ang)), span.mul(sin(ang)), lp.z.mul(0.9)).mul(size);
      const ch = cos(heading), sh = sin(heading);
      const rot = vec3(wing.x.mul(ch).add(wing.z.mul(sh)), wing.y, wing.z.mul(ch).sub(wing.x.mul(sh)));
      const pick = rnd(id, 8);
      tint.assign(select(pick.lessThan(0.45), vec3(0.95, 0.95, 0.9), select(pick.lessThan(0.8), vec3(1.0, 0.85, 0.25), vec3(0.95, 0.5, 0.15))));
      const present = select(stray.or(settled), float(1), float(0)).mul(float(1).sub(inInn(p)));
      vis.assign(present.mul(float(1).sub(su.night)).mul(float(1).sub(smoothstep(0.8, 1.0, edge))).mul(smoothstep(WATER_Y + 0.2, WATER_Y + 0.8, ground)));
      return vec3(p.x, y, p.y).add(rot).add(vec3(0, select(vis.lessThan(0.5), float(-1e4), float(0)), 0));
    })();
    m.colorNode = Fn(() => {
      // Rounded forewing and hindwing, a dark body line and spotted margins.
      const q = uv();
      const x = abs(q.x.sub(0.5)).mul(2), yy = q.y;
      const fore = length(vec2(x.sub(0.55), yy.sub(0.68)).mul(vec2(1.0, 1.25)));
      const hind = length(vec2(x.sub(0.45), yy.sub(0.28)).mul(vec2(1.2, 1.4)));
      const shape = min(fore, hind);
      const alpha = smoothstep(0.52, 0.44, shape);
      const margin = smoothstep(0.3, 0.45, shape);
      const col = mix(tint, tint.mul(0.25), margin.mul(0.8)).mul(smoothstep(0.02, 0.08, x).mul(0.8).add(0.2));
      const light = su.ambTop.mul(1.2).add(su.sunColor.mul(max(su.sunDir.y, 0).mul(0.6)).div(Math.PI));
      return vec4(col.mul(light), alpha);
    })();
    return new THREE.Mesh(items(N, WINGS, WING_TRIS), m);
  }

  _birds(sky) {
    const N = 26;
    const u = this.u, su = sky.u;
    const vis = varying(float(0), 'birdVis');
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
    m.positionNode = Fn(() => {
      const id = attribute('id', 'float');
      // Three flocks, each wheeling in a wide loop over the valley; birds keep loose formation.
      const flock = id.mod(3);
      const fr = rnd(flock, 11);
      const center = vec3(fr.mul(140).sub(50), rnd(flock, 12).mul(25).add(40), rnd(flock, 13).mul(140).sub(80));
      const R = rnd(flock, 14).mul(50).add(45);
      const speed = float(11).div(R);
      const t = u.time.mul(speed).add(fr.mul(6.283));
      const off = vec3(rnd(id, 1).sub(0.5).mul(14), rnd(id, 2).sub(0.5).mul(6), rnd(id, 3).sub(0.5).mul(14));
      const lag = rnd(id, 4).mul(0.15);
      const a = t.sub(lag);
      const p = center.add(vec3(cos(a).mul(R), sin(a.mul(2.3)).mul(4), sin(a).mul(R).mul(0.7))).add(off);
      const dir = normalize(vec3(sin(a).negate().mul(R), cos(a.mul(2.3)).mul(9.2), cos(a).mul(R).mul(0.7)));
      const heading = atan(dir.x, dir.z);
      // Flap and glide.
      const tt = u.time.add(rnd(id, 5).mul(10));
      const glide = smoothstep(0.2, 0.6, sin(tt.mul(0.45)));
      const ang = mix(sin(tt.mul(9)).mul(0.7), float(0.12), glide);
      const lp = attribute('position', 'vec3');
      const side = select(lp.x.lessThan(0), float(-1), float(1));
      const span = abs(lp.x);
      // Swept-back wings: tips trail behind.
      const wing = vec3(side.mul(span).mul(cos(ang)), span.mul(sin(ang)), lp.z.mul(0.35).add(span.mul(0.25))).mul(0.7);
      const ch = cos(heading), sh = sin(heading);
      const rot = vec3(wing.x.mul(ch).add(wing.z.mul(sh)), wing.y, wing.z.mul(ch).sub(wing.x.mul(sh)));
      vis.assign(float(1).sub(smoothstep(0.3, 0.7, su.night)));
      return p.add(rot).add(vec3(0, select(vis.lessThan(0.5), float(-1e4), float(0)), 0));
    })();
    m.colorNode = Fn(() => {
      const q = uv();
      const x = abs(q.x.sub(0.5)).mul(2);
      // A tapering wing: broad at the body, pointed at the tip.
      const w = mix(float(0.5), float(0.08), x);
      const alpha = step1(abs(q.y.sub(0.5)), w);
      return vec4(vec3(0.05, 0.05, 0.06).add(su.ambTop.mul(0.08)), alpha);
    })();
    return new THREE.Mesh(items(N, WINGS, WING_TRIS), m);
  }

  update(dt) {
    this.u.time.value += dt;
  }
}

const step1 = (v, edge) => float(1).sub(smoothstep(edge.mul(0.9), edge, v));

