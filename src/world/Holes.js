// Hobbit holes and their gardens, generated from the HOLES list in Layout.js. The facade itself
// comes from HoleModel.js; this file lays out everything around it the way the set does: flagstone
// paths, a fence and gate on the lane (wattle, rustic rail or pickets), a letterbox, shrubs and
// flowering bushes crowding the front, pots by the door, chimneys through the turf, and here and
// there a vegetable patch, a bench, a washing line, beehives or a lamp post.

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder, lantern } from './Kit.js';
import { buildFacade } from './HoleModel.js';
import { HOLES, heightAt, laneMask, LANES, bagEndWallZone } from './Layout.js';
import { mulberry32 } from '../util/noise.js';

const TIMBER = 0x5c4330, WEATHERED = 0x7d6e5a, WILLOW = 0x8a7550;
const FLAG = [0x9a958b, 0xa8a293, 0x8f897d, 0xb1aa99];
const FLOWER_KINDS = ['hydrangea', 'roses', 'marigold', 'yellow'];

export class HobbitHoles {
  constructor(mats, shrubs) {
    this.shrubs = shrubs;
    const B = new Builder();
    this.colliders = [];
    this.lanterns = [];
    this.chimneys = [];
    this.veg = [];
    this.signs = [];
    for (const hole of HOLES) this._hole(B, hole);
    this.group = B.build(mats);
    this.group.add(this._vegetables());
    for (const m of this.signs) this.group.add(partySign(m));
  }

  _hole(B, hole) {
    const rand = mulberry32(hole.seed + 1);
    const base = new THREE.Matrix4().makeRotationY(hole.yaw).setPosition(hole.x, hole.y, hole.z);
    const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => base.clone().multiply(mtx(x, y, z, rx, ry, rz, sx, sy, sz));
    const toWorld = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(base);
    // Like `at`, but y is an offset above the ground at (x, z) (yards can slope, as at Bag End).
    const ground = (lx, lz) => { const w = toWorld(lx, lz); return heightAt(w.x, w.z) - hole.y; };
    const atG = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => at(x, ground(x, z) + y, z, rx, ry, rz, sx, sy, sz);
    // Bag End's facade curves; place things by arc position v and distance u in front of it.
    const arcW = (v, u) => {
      const R = hole.arc.R, a = v / R;
      const dx = hole.fx * Math.cos(a) + hole.fz * Math.sin(a), dz = hole.fz * Math.cos(a) - hole.fx * Math.sin(a);
      return { x: hole.x - hole.fx * R + dx * (R + u), z: hole.z - hole.fz * R + dz * (R + u), yaw: Math.atan2(dx, dz) };
    };
    const sc = hole.scale;
    const hw = hole.width / 2, cx = hole.center;
    const yard = hole.yard;

    // Facade (Bag End's in segments set around the curve of its dome).
    if (hole.segments) {
      const R = hole.arc.R;
      for (const seg of hole.segments) {
        const a = seg.v / R;
        // Rotate the door frame about the arc center (R behind the door).
        const m = base.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -R))
          .multiply(new THREE.Matrix4().makeRotationY(a)).multiply(new THREE.Matrix4().makeTranslation(0, 0, R));
        const { lanterns } = buildFacade(B, { ...hole, bays: seg.bays, seed: hole.seed + Math.round(seg.v * 10) }, m);
        this.lanterns.push(...lanterns);
      }
    } else {
      const { lanterns } = buildFacade(B, hole, base.clone().multiply(new THREE.Matrix4().makeScale(sc, sc, sc)));
      this.lanterns.push(...lanterns);
    }

    // Chimneys poking through the turf behind.
    if (hole.arc) {
      // Bag End's chimneys stand on top of the dome: a stout stone stack and two brick ones.
      for (const [v, u, stone] of [[-9.5, -5.5, false], [-1.5, -6.5, true], [5.5, -5, false]]) {
        const p = arcW(v, u), gy = heightAt(p.x, p.z);
        const hgt = stone ? 1.5 : 1.2;
        B.add(stone ? 'stone' : 'brick', box(stone ? 0.8 : 0.6, hgt + 0.8, stone ? 0.8 : 0.6), mtx(p.x, gy + (hgt - 0.8) / 2, p.z, 0, p.yaw), stone ? 0x8f887a : 0x9e5a3e);
        B.add('stone', box(stone ? 0.95 : 0.74, 0.12, stone ? 0.95 : 0.74), mtx(p.x, gy + hgt + 0.06, p.z, 0, p.yaw), 0x7e786c);
        for (const o of stone ? [-0.18, 0.18] : [0]) B.add('brick', cylinder(0.1, 0.12, 0.35, 10), mtx(p.x + o, gy + hgt + 0.3, p.z, 0, p.yaw), 0xa8603e);
        this.chimneys.push(new THREE.Vector3(p.x, gy + hgt + 0.55, p.z));
      }
    }
    const nCh = hole.arc ? 0 : hole.width > 7 ? 2 : 1;
    for (let k = 0; k < nCh; k++) {
      const chx = cx + (nCh === 1 ? (rand() < 0.5 ? -1 : 1) * (0.6 + rand()) : (k ? 1 : -1) * hw * 0.55);
      const chz = -2.6 - rand() * 1.5;
      const wp = toWorld(chx, chz);
      const gy = heightAt(wp.x, wp.z) - hole.y;
      const top = gy + 0.9 + rand() * 0.6;
      const brick = rand() < 0.55;
      B.add(brick ? 'brick' : 'stone', box(0.55, top - gy + 0.8, 0.55), at(chx, (top + gy - 0.8) / 2, chz), brick ? 0xa0553a : 0x9d968a);
      B.add('stone', box(0.68, 0.1, 0.68), at(chx, top + 0.05, chz), 0x8a8478);
      B.add('brick', cylinder(0.1, 0.13, 0.32, 10), at(chx, top + 0.26, chz), 0xa8603e);
      this.chimneys.push(toWorld(chx, chz).setY(hole.y + top + 0.45));
    }

    // Flagstone path from the gate to the door.
    for (let z = 0.5 * sc; z < yard + 0.2; z += 0.55 + rand() * 0.15) {
      const w = 0.55 + rand() * 0.35, d = 0.38 + rand() * 0.14;
      if (hole.arc) break; // Bag End has its own crazy paving and steps
      const x = (rand() - 0.5) * 0.25;
      B.add('rock', box(w, 0.08, d), atG(x, 0.02, z, 0, (rand() - 0.5) * 0.4), FLAG[Math.floor(rand() * FLAG.length)]);
    }

    // Fence and gate along the lane edge.
    const fz = hole.gateU ?? yard + 0.15;
    const style = hole.fence || (hole.bagEnd ? 'wattle' : ['wattle', 'rail', 'picket', 'rail'][Math.floor(rand() * 4)]);
    const gate = 0.7;
    // Bag End's front is open: only a short stretch of fence either side of its gate.
    const x0 = hole.segments ? -3.2 : cx - hw - 0.6, x1 = hole.segments ? 3.2 : cx + hw + 0.6;
    for (const [a, b] of hole.arc ? [] : [[x0, -gate], [gate, x1]]) {
      if (b - a < 0.3) continue;
      this._fence(B, atG, style, a, b, fz, rand);
      const mid = toWorld((a + b) / 2, fz);
      this.colliders.push({ x: mid.x, z: mid.z, hx: (b - a) / 2, hz: 0.1, rot: hole.yaw });
    }
    // Bag End's gate stands to the right of the door; the steps climb up and left from it.
    const gx = hole.gateX || 0;
    for (const s of [-1, 1]) {
      B.add('wood', box(0.14, 1.15, 0.14), atG(gx + s * gate, 0.57, fz), TIMBER);
      B.add('wood', new THREE.SphereGeometry(0.1, 8, 6), atG(gx + s * gate, 1.2, fz), TIMBER);
    }
    // The gate, swung open.
    const swing = hole.bagEnd ? -0.35 : -1.25;
    for (const y of [0.35, 0.85]) B.add('wood', box(gate * 1.9, 0.08, 0.05), atG(gx - gate, y, fz, 0, swing).multiply(mtx(gate * 0.95, 0, 0)), WEATHERED);
    if (hole.bagEnd) for (let k = 0; k < 6; k++) B.add('wood', box(0.05, 0.8, 0.04), atG(gx - gate, 0.5, fz, 0, swing).multiply(mtx(0.12 + k * 0.24, 0, 0)), WEATHERED);

    // Letterbox: a hollowed log on a post, or a painted box.
    const lbx = hole.bagEnd ? gx - gate - 0.4 : gx + gate + 0.45; // Bag End's: just left of the gate
    B.add('wood', box(0.12, 1.0, 0.12), atG(lbx, 0.5, fz + 0.3), TIMBER);
    if (hole.bagEnd || rand() < 0.5) B.add('wood', cylinder(0.14, 0.14, 0.62, 10), atG(lbx, 1.1, fz + 0.3, 0, 0, Math.PI / 2), 0x7a5a3c);
    else B.add('paint', box(0.3, 0.24, 0.4), atG(lbx, 1.1, fz + 0.3), hole.doorColor);
    // Bag End's "No admittance except on party business" board, hung on the gate.
    if (hole.bagEnd) {
      // The sign hangs on the gate, which stands only slightly ajar.
      this.signs.push(atG(gx - gate, 0.62, fz, 0, -0.35).multiply(mtx(gate * 0.95, 0, 0.05)));
      // The wattle fence runs on along the whole garden front, following the curve of the lane.
      this._laneFence(B, hole, toWorld(gx, fz), gate, rand);
    }

    if (hole.arc) this._bagEndGarden(B, hole, at, atG, arcW, rand);

    if (!hole.arc) {
    // Planting: bushes at the facade ends, flowering shrubs in the beds, pots by the door.
    for (const e of [cx - hw - 0.5, cx + hw + 0.5]) {
      const p = toWorld(e, 0.5 + rand() * 0.5);
      this.shrubs.add(rand() < 0.5 ? 'bush' : 'broad', p.x, p.z, (0.8 + rand() * 0.5) * sc, rand() * 6.28, hole.y);
    }
    for (let x = cx - hw + 0.4; x < cx + hw - 0.3; x += 0.9 + rand() * 0.6) {
      if (Math.abs(x) < hole.doorR * sc + 0.4) continue; // keep the door clear
      if (rand() < 0.3) continue;
      const p = toWorld(x, 0.8 + rand() * 0.4);
      this.shrubs.add(FLOWER_KINDS[Math.floor(rand() * FLOWER_KINDS.length)], p.x, p.z, 0.55 + rand() * 0.35, rand() * 6.28, hole.y);
    }
    for (let x = x0 + 0.5; x < x1 - 0.3; x += 1.1 + rand() * 0.8) {
      if (Math.abs(x) < gate + 0.5 || rand() < 0.35) continue;
      const p = toWorld(x, fz - 0.6);
      const k = rand() < 0.6 ? FLOWER_KINDS[Math.floor(rand() * FLOWER_KINDS.length)] : 'bush';
      this.shrubs.add(k, p.x, p.z, 0.5 + rand() * 0.3, rand() * 6.28, hole.y);
    }
    for (const s of [-1, 1]) {
      if (rand() < 0.4) continue;
      const px = s * (hole.doorR * sc + 0.45);
      B.add('brick', cylinder(0.24, 0.17, 0.32, 12), at(px, 0.16, 0.45), 0xb8633a);
      const p = toWorld(px, 0.45);
      this.shrubs.add(rand() < 0.5 ? 'marigold' : 'roses', p.x, p.z, 0.5, rand() * 6.28, hole.y + 0.28);
    }
    }

    // Occasional props.
    if (rand() < 0.45 && !hole.arc) {
      const bx = (rand() < 0.5 ? -1 : 1) * Math.min(hw - 0.9, hole.doorR * sc + 1.4);
      B.add('wood', box(1.3, 0.06, 0.38), at(bx, 0.45, 0.9), WEATHERED);
      B.add('wood', box(1.3, 0.3, 0.05), at(bx, 0.72, 0.72, -0.12), WEATHERED);
      for (const s of [-1, 1]) B.add('wood', box(0.07, 0.45, 0.35), at(bx + s * 0.55, 0.22, 0.9), TIMBER);
    }
    if (!hole.bagEnd && rand() < 0.22) {
      const side = rand() < 0.5 ? -1 : 1, px = cx + side * (hw - 0.4), z0 = 1.4, z1 = Math.max(2.8, yard - 1.0);
      for (const z of [z0, z1]) B.add('wood', box(0.08, 1.9, 0.08), at(px, 0.95, z), TIMBER);
      B.add('wood', box(0.015, 0.015, z1 - z0), at(px, 1.8, (z0 + z1) / 2), 0xdddddd);
      const cloth = [0xe8e0d0, 0x7a9ac0, 0xc07a6a, 0xd8c070, 0xb8c8a0];
      for (let k = 0; k < 3; k++) {
        const z = z0 + 0.4 + k * ((z1 - z0 - 0.8) / 2);
        B.add('plaster', box(0.02, 0.55, 0.45), at(px, 1.52, z, 0, 0, (rand() - 0.5) * 0.1), cloth[Math.floor(rand() * cloth.length)]);
      }
    }
    if (!hole.bagEnd && rand() < 0.15) {
      // Skeps (straw beehives) on a little stand.
      const bx = cx + (rand() < 0.5 ? -1 : 1) * (hw - 0.6);
      B.add('wood', box(1.2, 0.5, 0.5), at(bx, 0.25, yard - 1.1), WEATHERED);
      for (const s of [-0.3, 0.3]) B.add('thatch', new THREE.SphereGeometry(0.24, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), at(bx + s, 0.5, yard - 1.1), 0xd0b070);
    }
    if (rand() < 0.3) {
      const lpx = -gate - 0.5;
      B.add('metal', box(0.07, 2.0, 0.07), atG(lpx, 1.0, fz - 0.25), 0x2a2622);
      lantern(B, atG(lpx, 2.16, fz - 0.25), 0.2);
      this.lanterns.push(toWorld(lpx, fz - 0.25).setY(hole.y + ground(lpx, fz - 0.25) + 2.1));
    }

    // Vegetable rows (instanced below).
    if (hole.veg && !hole.bagEnd) {
      const side = hole.seed % 2 ? 1 : -1;
      for (let u = 1.9; u < yard - 1.4; u += 0.5)
        for (let v = 2.0; v < hw + 0.6; v += 0.45) {
          const p = toWorld(cx + side * v + (rand() - 0.5) * 0.1, u + (rand() - 0.5) * 0.1);
          this.veg.push({ x: p.x, y: hole.y, z: p.z, kind: u > yard - 2.1 && rand() < 0.35 ? 1 : 0, s: 0.6 + rand() * 0.4, r: rand() * 6.28 });
        }
    }

    // The mound and facade block the way.
    const m = toWorld(cx, -2);
    this.colliders.push({ x: m.x, z: m.z, hx: hw, hz: 2.05, rot: hole.yaw });
  }

  /** Bag End's garden, after the set: see refs/ and docs/hobbiton-reference.md. */
  _bagEndGarden(B, hole, at, atG, arcW, rand) {
    const T = hole.terrace;
    const shrubs = this.shrubs;

    // Stone steps from the terrace down to the gate, set into the slope.
    // Rough, uneven slabs, each laid as two or three stones, with grass creeping between them.
    const STEP = [0x857d6e, 0x9a907e, 0x7a7466, 0x8e8676];
    const gx = hole.gateX || 0, sx0 = 0.2, slant = Math.atan2(gx - sx0, (hole.gateU ?? hole.yard) - T);
    const U = hole.gateU ?? hole.yard;
    for (let u = T + 0.3; u < U - 0.1; u += 0.48 + rand() * 0.08) {
      const cx = sx0 + ((u - T) / (U - T)) * (gx - sx0);
      let x = -0.75 + (rand() - 0.5) * 0.15;
      while (x < 0.75) {
        const w = 0.45 + rand() * 0.45;
        const px = cx + (x + w / 2) * Math.cos(slant), pu = u - (x + w / 2) * Math.sin(slant);
        B.add('rock', box(w - 0.04, 0.2, 0.5 + rand() * 0.12), atG(px, -0.04 + rand() * 0.04, pu + (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.06, slant + (rand() - 0.5) * 0.25, (rand() - 0.5) * 0.06), STEP[Math.floor(rand() * STEP.length)]);
        x += w;
      }
    }
    // Crazy paving: small irregular flagstones set in gravel, from the door to the steps and
    // spreading right toward the bench.
    const FLAGS = [0x8f8676, 0x7f786a, 0x9b9282, 0x756e61, 0x877f70];
    const flag = (r) => {
      const n = 5 + Math.floor(rand() * 3), pts = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.6, rr = r * (0.7 + rand() * 0.45);
        pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
      }
      return new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.05, bevelEnabled: false }).rotateX(-Math.PI / 2);
    };
    for (let u = 0.45; u < T + 0.1; u += 0.32)
      for (let x = -1.05; x < (u > 1.4 && u < 3.4 ? 3.9 : 1.1); x += 0.34) {
        if (rand() < 0.22) continue;
        const px = x + (rand() - 0.5) * 0.14, pu = u + (rand() - 0.5) * 0.14;
        B.add('rock', flag(0.13 + rand() * 0.07), at(px, -0.01, pu, 0, rand() * 6.28, 0), FLAGS[Math.floor(rand() * FLAGS.length)]);
      }
    // Planter boxes and pots by the door.
    for (const [x, u, r] of [[-1.9, 1.1, 0.3], [2.3, 0.9, -0.2]]) {
      B.add('wood', box(1.1, 0.4, 0.45), at(x, 0.2, u, 0, r), 0x7a5a3c);
      const p = new THREE.Vector3(x, 0, u).applyMatrix4(at(0, 0, 0));
      shrubs.add(rand() < 0.5 ? 'marigold' : 'roses', p.x, p.z, 0.55, rand() * 6.28, hole.y + 0.35);
    }

    // The dry-stone retaining wall along the terrace edge, broken by the steps.
    for (let v = -12.8; v < 8.8; v += 0.32) {
      if (Math.abs(v - 0.2) < 1.0) continue;
      const p = arcW(v, T + 0.25);
      const top = hole.y + 0.08;
      const foot = heightAt(p.x, p.z) - 0.15;
      if (foot > top - 0.2) continue;
      // Long, flat fieldstones laid in rough courses, from the ground below up to the terrace.
      for (let y = Math.max(foot, hole.y - 1.6) - 0.1; y < top; y += 0.15) {
        const w = 0.4 + rand() * 0.45, h = 0.13 + rand() * 0.08;
        const tint = [0x7a7362, 0x8a806c, 0x6a6556, 0x958b76, 0x5f5a4c][Math.floor(rand() * 5)];
        const q = arcW(v + (rand() - 0.5) * 0.25, T + 0.25 + (rand() - 0.5) * 0.06);
        B.add('rock', box(1, 1, 1), mtx(q.x, Math.min(y + h / 2, top - h / 2), q.z, (rand() - 0.5) * 0.06, q.yaw + (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.1, w, h * 0.9, 0.38), tint);
      }
    }

    // The dry-stone wall that holds up the lane below the garden, as on film: flat fieldstones in
    // rough courses on the downhill side, from the ground to a little above the lane.
    for (const lane of LANES) {
      const w = lane.width / 2;
      for (let i = 0; i < lane.pts.length - 1; i++) {
        const [ax, az] = lane.pts[i], [bx, bz] = lane.pts[i + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const tx = (bx - ax) / len, tz = (bz - az) / len;
        for (let t = 0; t < len; t += 0.45) {
          const cx = ax + tx * t, cz = az + tz * t;
          if (!bagEndWallZone(cx - tz * (w + 1), cz + tx * (w + 1)) && !bagEndWallZone(cx + tz * (w + 1), cz - tx * (w + 1))) continue;
          const gU = hole.gateU ?? hole.yard, gX = hole.gateX || 0;
          const nearGate = Math.hypot(cx - (hole.x + hole.fx * gU + hole.fz * gX), cz - (hole.z + hole.fz * gU - hole.fx * gX)) < 2.8;
          const top = heightAt(cx, cz) + 0.28;
          for (const sd of [-1, 1]) {
            const ox = -tz * sd, oz = tx * sd;
            if (nearGate && ox * (hole.x - cx) + oz * (hole.z - cz) > 0) continue; // the garden side, at the gate
            if (!bagEndWallZone(cx + ox * (w + 1), cz + oz * (w + 1))) continue;
            const px = cx + ox * (w + 0.25), pz = cz + oz * (w + 0.25);
            const foot = heightAt(cx + ox * (w + 0.55), cz + oz * (w + 0.55));
            if (foot > top - 0.7 || laneMask(px + ox * 0.6, pz + oz * 0.6) > 0.3) continue;
            const yaw = Math.atan2(-tz, tx);
            for (let y = foot - 0.2; y < top; y += 0.15) {
              const sw = 0.35 + rand() * 0.4, sh = 0.12 + rand() * 0.08;
              const tint = [0x7a7362, 0x8a806c, 0x6a6556, 0x958b76, 0x5f5a4c][Math.floor(rand() * 5)];
              const j = (rand() - 0.5) * 0.2;
              B.add('rock', box(1, 1, 1), mtx(px + tx * j, Math.min(y + sh / 2, top - sh / 2), pz + tz * j, (rand() - 0.5) * 0.08, yaw + (rand() - 0.5) * 0.12, (rand() - 0.5) * 0.12, sw, sh * 0.9, 0.36 + rand() * 0.1), tint);
            }
            this.colliders.push({ x: px, z: pz, r: 0.3 });
          }
        }
      }
    }

    // Cottage flowers spilling along the top of the wall.
    for (let v = -12.5; v < 8.5; v += 1.0) {
      if (Math.abs(v - 0.2) < 1.3) continue;
      const p = arcW(v, T - 0.35 + (rand() - 0.5) * 0.3);
      shrubs.add(['roses', 'marigold', 'yellow', 'hydrangea', 'lavender'][Math.floor(rand() * 5)], p.x, p.z, 0.6 + rand() * 0.3, rand() * 6.28, hole.y);
    }

    // Lavender along the terrace in front of the study; herbs and cottage flowers by the door.
    for (let v = -14.5; v < -2.5; v += 0.8)
      for (const u of [2.0, 3.0]) {
        if (v > -5.2 && v < -2.2) continue; // Bilbo's bench
        const p = arcW(v + (rand() - 0.5) * 0.3, u + (rand() - 0.5) * 0.3);
        shrubs.add('lavender', p.x, p.z, 0.75 + rand() * 0.25, rand() * 6.28, hole.y);
      }
    for (const [v, u, k] of [[-1.8, 0.8, 'roses'], [1.9, 0.8, 'hydrangea'], [2.6, 1.6, 'yellow'], [-2.4, 1.0, 'marigold'], [5.5, 1.2, 'yellow'], [6.5, 2.2, 'roses'], [4.4, 3.4, 'hydrangea']]) {
      const p = arcW(v, u);
      shrubs.add(k, p.x, p.z, 0.8 + rand() * 0.3, rand() * 6.28, hole.y);
    }
    // Nasturtiums tumbling along the foot of the wall, and more on the slope.
    for (let v = -13; v < 8; v += 1.1) {
      if (Math.abs(v - 0.2) < 1.4 || rand() < 0.3) continue;
      const p = arcW(v, T + 1.1 + rand() * 1.6);
      shrubs.add('nasturtium', p.x, p.z, 0.9 + rand() * 0.5, rand() * 6.28);
    }
    // Ivy smothering the turf between the facade segments.
    const spans = hole.segSpans;
    for (let k = 0; k < spans.length - 1; k++) {
      const v = (spans[k][1] + spans[k + 1][0]) / 2;
      const p = arcW(v, 0.4);
      shrubs.add('ivy', p.x, p.z, 1.15 + rand() * 0.3, p.yaw, hole.y);
    }

    // Bilbo's bench on the terrace, and the giant pumpkin in its wheelbarrow by the steps.
    const bx = -3.6, bz = 2.3;
    B.add('wood', box(1.5, 0.07, 0.42), at(bx, 0.46, bz, 0, 0.25), 0x8a7152);
    B.add('wood', box(1.5, 0.32, 0.05), at(bx, 0.72, bz - 0.2, -0.15, 0.25), 0x8a7152);
    for (const s of [-1, 1]) B.add('wood', box(0.08, 0.46, 0.38), at(bx + s * 0.62 * Math.cos(0.25), 0.23, bz - s * 0.62 * Math.sin(0.25), 0, 0.25), 0x5c4330);
    const wx = 2.8, wz = T - 0.9, wr = 2.6;
    B.add('wood', box(1.1, 0.08, 0.7), at(wx, 0.42, wz, 0, wr, -0.12), 0x6e5238);
    for (const s of [-1, 1]) B.add('wood', box(1.1, 0.25, 0.05), at(wx, 0.52, wz + s * 0.35, 0, wr, -0.12), 0x6e5238);
    for (const s of [-1, 1]) B.add('wood', box(1.0, 0.05, 0.05), at(wx - 0.9 * Math.cos(wr), 0.45, wz + 0.9 * Math.sin(wr) + s * 0.28, 0, wr, 0.25), 0x5c4330);
    B.add('wood', new THREE.TorusGeometry(0.22, 0.05, 6, 16), at(wx + 0.6 * Math.cos(wr), 0.23, wz - 0.6 * Math.sin(wr), 0, wr + Math.PI / 2, 0), 0x4a3526);
    B.add('paint', new THREE.SphereGeometry(0.36, 20, 14), at(wx, 0.72, wz, 0, 0, 0.1, 1.25, 0.75, 1.05), 0xe08a2e);
    B.add('wood', cylinder(0.04, 0.05, 0.16, 6), at(wx - 0.08, 1.0, wz, 0.3, 0, 0.3), 0x6a6a3a);
    const wc = new THREE.Vector3(wx, 0, wz).applyMatrix4(at(0, 0, 0));
    this.colliders.push({ x: wc.x, z: wc.z, r: 0.7 });
    // The terrace wall is a drop; keep walkers on the steps.
    for (const [v0, v1] of [[-12.8, -0.8], [1.2, 8.8]]) {
      for (let v = v0; v < v1; v += 1.5) {
        const p = arcW(v, T + 0.25);
        this.colliders.push({ x: p.x, z: p.z, r: 0.55 });
      }
    }
  }

  /**
   * Bag End's wattle fence: it runs along the garden side of the lane, at the gate's distance from
   * the lane's centerline, both ways from the gate until the lane meets another path.
   */
  _laneFence(B, hole, gatePt, gate, rand) {
    let best = null;
    for (const lane of LANES) {
      if (!lane.samples) continue;
      lane.samples.forEach(([x, z], i) => {
        const d = Math.hypot(x - gatePt.x, z - gatePt.z);
        if (!best || d < best.d) best = { d, lane, i };
      });
    }
    if (!best) return;
    const { lane, i: i0 } = best;
    const pts = lane.samples;
    const off = Math.max(best.d, lane.width / 2 + 0.35);
    // Lane normal at sample i, oriented to stay on the same side as its neighbour (so the fence
    // keeps to one side of the lane through bends and switchbacks).
    const normalAt = (i) => {
      const [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, bz - az) || 1;
      return [-(bz - az) / l, (bx - ax) / l];
    };
    // The garden side at the gate.
    const [gx, gz] = normalAt(i0);
    const side0 = Math.sign(gx * (hole.x - pts[i0][0]) + gz * (hole.z - pts[i0][1])) || 1;
    for (const dir of [-1, 1]) {
      let prev = null, walked = 0, prevN = null;
      for (let i = i0; i >= 0 && i < pts.length && walked < 26; i += dir) {
        if (i !== i0) walked += Math.hypot(pts[i][0] - pts[i - dir][0], pts[i][1] - pts[i - dir][1]);
        let [nx, nz] = normalAt(i);
        nx *= side0; nz *= side0;
        if (prevN && nx * prevN[0] + nz * prevN[1] < 0) { nx = -nx; nz = -nz; }
        // A hairpin: the side has swung more than ~70 degrees; stop rather than cut across.
        if (prevN && nx * prevN[0] + nz * prevN[1] < 0.35) break;
        prevN = [nx, nz];
        const x = pts[i][0] + nx * off, z = pts[i][1] + nz * off;
        if (Math.hypot(x - gatePt.x, z - gatePt.z) < gate + 0.1) { prev = null; continue; }
        // Stop where the fence would touch any path (a junction, or this lane after a bend).
        // (The fence runs along this lane's soft edge, so only test on the garden side of it: any path
        // found there is another one joining.)
        if (walked > 2 && laneMask(x + nx * 0.7, z + nz * 0.7) > 0.05) break;
        const y = heightAt(x, z);
        if (prev && Math.hypot(x - prev.x, z - prev.z) > 2) break;
        B.add('wood', box(0.05, 0.9, 0.05), mtx(x, y + 0.42, z, (rand() - 0.5) * 0.08, 0, (rand() - 0.5) * 0.08), WEATHERED);
        if (prev) {
          const len = Math.hypot(x - prev.x, z - prev.z), yaw = Math.atan2(-(z - prev.z), x - prev.x);
          for (let yy = 0.12; yy < 0.75; yy += 0.07)
            B.add('wood', box(len + 0.04, 0.045, 0.035), mtx((x + prev.x) / 2, (y + prev.y) / 2 + yy, (z + prev.z) / 2, 0, yaw, 0), WILLOW);
          this.colliders.push({ x: (x + prev.x) / 2, z: (z + prev.z) / 2, hx: len / 2, hz: 0.1, rot: yaw });
        }
        prev = { x, z, y };
      }
    }
  }

  /** Wattle fence along Bag End's curved lane frontage, from arc position v0 to v1. */
  _arcFence(B, hole, arcW, v0, v1, rand, dir) {
    // Built outward from the gate post, stopping for good at the first lane it would touch.
    const u = hole.yard + 0.15;
    let prev = null;
    const vs = [];
    for (let v = v0; v <= v1 + 1e-6; v += 0.45) vs.push(v);
    if (dir < 0) vs.reverse();
    for (const v of vs) {
      const p = arcW(v, u), y = heightAt(p.x, p.z);
      const q = arcW(v, u + 0.5);
      if (laneMask(p.x, p.z) > 0.02 || laneMask(q.x, q.z) > 0.02) break;
      B.add('wood', box(0.05, 0.9, 0.05), mtx(p.x, y + 0.42, p.z, (rand() - 0.5) * 0.08, 0, (rand() - 0.5) * 0.08), WEATHERED);
      if (prev) {
        const len = Math.hypot(p.x - prev.x, p.z - prev.z), yaw = Math.atan2(-(p.z - prev.z), p.x - prev.x);
        for (let yy = 0.12; yy < 0.75; yy += 0.07)
          B.add('wood', box(len + 0.04, 0.045, 0.035), mtx((p.x + prev.x) / 2, (y + prev.y) / 2 + yy, (p.z + prev.z) / 2, 0, yaw, 0), WILLOW);
        this.colliders.push({ x: (p.x + prev.x) / 2, z: (p.z + prev.z) / 2, hx: len / 2, hz: 0.1, rot: yaw });
      }
      prev = { x: p.x, z: p.z, y };
    }
  }

  _fence(B, at, style, a, b, z, rand) {
    const len = b - a;
    if (style === 'picket') {
      for (let x = a + 0.08; x < b; x += 0.16) {
        const h = 0.8 + Math.sin(x * 7.3) * 0.03;
        B.add('wood', box(0.07, h, 0.025), at(x, h / 2, z, 0, 0, (rand() - 0.5) * 0.04), 0xd8d2c0);
      }
      for (const y of [0.25, 0.62]) B.add('wood', box(len, 0.06, 0.04), at((a + b) / 2, y, z - 0.03), 0xd8d2c0);
    } else if (style === 'rail') {
      // Rustic split rails between leaning posts.
      const n = Math.max(1, Math.round(len / 2));
      for (let k = 0; k <= n; k++) B.add('wood', box(0.13, 1.0, 0.13), at(a + (len * k) / n, 0.5, z, (rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.08), WEATHERED);
      for (const y of [0.45, 0.85]) B.add('wood', box(len, 0.08, 0.06), at((a + b) / 2, y + (rand() - 0.5) * 0.04, z, 0, 0, (rand() - 0.5) * 0.03), WEATHERED);
    } else {
      // Wattle: stakes with woven withies (bands of thin rods).
      for (let x = a + 0.15; x < b; x += 0.4) B.add('wood', box(0.05, 0.85, 0.05), at(x, 0.42, z), WEATHERED);
      for (let y = 0.12; y < 0.75; y += 0.07) B.add('wood', box(len, 0.045, 0.035), at((a + b) / 2, y, z + (Math.round(y / 0.07) % 2 ? 0.02 : -0.02)), WILLOW);
    }
  }

  _vegetables() {
    const group = new THREE.Group();
    const kinds = [
      { geo: new THREE.IcosahedronGeometry(0.2, 1), color: 0x5f8f3a, sy: 0.7 },
      { geo: new THREE.SphereGeometry(0.22, 12, 8), color: 0xd9822b, sy: 0.75 },
    ];
    kinds.forEach((k, idx) => {
      const list = this.veg.filter((v) => v.kind === idx);
      if (!list.length) return;
      const mat = new THREE.MeshStandardNodeMaterial({ color: k.color, roughness: 0.8 });
      const mesh = new THREE.InstancedMesh(k.geo, mat, list.length);
      list.forEach((v, i) => mesh.setMatrixAt(i, mtx(v.x, v.y + 0.12 * v.s, v.z, 0, v.r, 0, v.s, v.s * k.sy, v.s)));
      mesh.instanceMatrix = new THREE.StorageInstancedBufferAttribute(mesh.instanceMatrix.array, 16);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.layers.set(3); // LAYERS.DETAIL
      mesh.computeBoundingSphere();
      group.add(mesh);
    });
    return group;
  }
}

/** "No admittance except on party business", hand-lettered on a weathered board. */
function partySign(matrix) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e0cc';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(90,70,40,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * 512, Math.random() * 256, 30 + Math.random() * 80, 1 + Math.random() * 2);
  }
  g.strokeStyle = '#6a5a44';
  g.lineWidth = 10;
  g.strokeRect(5, 5, 502, 246);
  g.fillStyle = '#2a2018';
  g.textAlign = 'center';
  g.font = 'italic 600 44px "Cormorant Garamond", Georgia, serif';
  g.fillText('No admittance', 256, 88);
  g.font = 'italic 600 38px "Cormorant Garamond", Georgia, serif';
  g.fillText('except on', 256, 142);
  g.fillText('party business', 256, 196);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.4, 0.025), [
    ...Array(4).fill(new THREE.MeshStandardNodeMaterial({ color: 0x6a5a44, roughness: 0.9 })),
    new THREE.MeshStandardNodeMaterial({ map: tex, roughness: 0.85 }),
    new THREE.MeshStandardNodeMaterial({ color: 0x6a5a44, roughness: 0.9 }),
  ]);
  board.matrixAutoUpdate = false;
  board.matrix.copy(matrix);
  board.castShadow = board.receiveShadow = true;
  return board;
}
