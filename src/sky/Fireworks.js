// Gandalf's fireworks over the lake. Rockets go up from the shore below the Party Tree and burst high
// over the water: gold willows, colored peonies, tilted rings, green palms ("green trees"), and
// crackling white strobes. Everything is one draw: each shell's launch and burst are written to a
// small texture when it's fired, and every spark works out where it is from that in the vertex
// shader (drag and gravity have a closed form), so the CPU does nothing per spark.
//
// A show runs for about 75 seconds, every clear night at ten (or on demand), ending in a finale.
// Each burst briefly lights the land and water around it (LampLight.flash) and is heard a moment
// after it's seen, as far off as it is.

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, vec3, float, int, ivec2, hash, normalize, length, smoothstep, max, exp, mix, varying,
  cameraPosition, uv, textureLoad, floor, sin, cos, sqrt, step, abs, pow, cross, clamp,
} from 'three/tsl';
import { heightAt, WATER_Y } from '../world/Layout.js';

const SHELLS = 32; // in the air at once, recycled in turn
const K = 360; // sparks per shell; the first TRAIL are the rocket's trail
const TRAIL = 24;
const N = SHELLS * K;

// Shell types, and per type: drag, gravity, life (s), burst speed spread.
const TYPES = ['peony', 'willow', 'ring', 'palm', 'crackle'];
const DRAG = [1.5, 2.2, 1.5, 1.1, 1.6];
const GRAV = [3.0, 5.0, 3.0, 6.5, 3.0];
const LIFE = [1.9, 4.2, 1.7, 2.6, 2.2];

const COLORS = {
  gold: [1, 0.66, 0.26], red: [1, 0.22, 0.12], green: [0.3, 1, 0.3], blue: [0.3, 0.45, 1],
  white: [1, 0.95, 0.85], violet: [0.78, 0.35, 1], orange: [1, 0.45, 0.1],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);

// Where the rockets go up (the shore below Gandalf's cart) and the air they burst in, over the water.
const LAUNCH = { x: 33, z: -23, r: 3 };
const SKY = { x0: 2, x1: 46, z0: 8, z1: 48, y0: WATER_Y + 36, y1: WATER_Y + 60 };

export class Fireworks {
  constructor(lampLight) {
    this.lampLight = lampLight;
    this.time = 0;
    this.shells = Array.from({ length: SHELLS }, () => null);
    this.next = 0;
    this.show = null;
    this.onEvent = null; // (kind, position, shellType) for sound
    this.flashes = [];

    // Shell table: row 0 burst xyz + burst time, 1 first color + type, 2 fade color + speed,
    // 3 launch xyz + launch time.
    this.table = new Float32Array(SHELLS * 4 * 4);
    for (let s = 0; s < SHELLS; s++) this.table[(3 * SHELLS + s) * 4 + 3] = -1e4;
    for (let s = 0; s < SHELLS; s++) this.table[s * 4 + 3] = -1e4;
    this.tex = new THREE.DataTexture(this.table, SHELLS, 4, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.needsUpdate = true;

    this.u = { time: uniform(0), intensity: uniform(3.6) };
    this.mesh = this._mesh();
  }

  _mesh() {
    const pos = new Float32Array(N * 4 * 3), uvs = new Float32Array(N * 4 * 2), ids = new Float32Array(N * 4);
    const idx = new Uint32Array(N * 6);
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        pos[v * 3] = k & 1 ? 0.5 : -0.5;
        pos[v * 3 + 1] = k >> 1;
        uvs[v * 2] = k & 1;
        uvs[v * 2 + 1] = k >> 1;
        ids[v] = i;
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setAttribute('id', new THREE.BufferAttribute(ids, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const u = this.u, tex = this.tex;
    const glow = varying(vec3(0), 'fwGlow');
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    m.fog = false;
    m.positionNode = Fn(() => {
      const id = attribute('id', 'float');
      const shell = floor(id.div(K)), k = id.sub(shell.mul(K));
      const col = int(shell);
      const r0 = textureLoad(tex, ivec2(col, 0)), r1 = textureLoad(tex, ivec2(col, 1));
      const r2 = textureLoad(tex, ivec2(col, 2)), r3 = textureLoad(tex, ivec2(col, 3));
      const burst = r0.xyz, tB = r0.w, launch = r3.xyz, tL = r3.w, ty = r1.w;
      const t = u.time;
      const R = (j) => hash(id.add(j * 1013));
      const S = (j) => hash(shell.add(j * 7919 + 0.5).add(tB));
      const is = (n) => float(1).sub(step(0.5, abs(ty.sub(n))));
      const per = (arr) => arr.reduce((acc, v, n) => acc.add(is(n).mul(v)), float(0));

      // --- the burst -------------------------------------------------------------------------
      const zz = R(1).mul(2).sub(1), a = R(2).mul(Math.PI * 2), sr = sqrt(float(1).sub(zz.mul(zz)));
      const sphere = vec3(sr.mul(cos(a)), zz, sr.mul(sin(a)));
      const tilt = S(1).mul(1.2).add(0.2);
      const ring = vec3(cos(a), sin(a).mul(sin(tilt)), sin(a).mul(cos(tilt)));
      // Palm: eight arms curving up and out, their sparks strung out along each arm.
      const arm = floor(R(3).mul(8)).div(8).mul(Math.PI * 2).add(S(3).mul(6.283));
      const palm = normalize(vec3(cos(arm).mul(0.8), 0.9, sin(arm).mul(0.8)).add(sphere.mul(0.06)));
      const dir = sphere.mul(is(0).add(is(1)).add(is(4))).add(ring.mul(is(2))).add(palm.mul(is(3)));
      const spread = mix(R(4).mul(0.35).add(0.75), float(1), is(2)).mul(mix(float(1), R(4).mul(0.7).add(0.3), is(3)));
      const v0 = dir.mul(spread).mul(r2.w);
      const c = per(DRAG), gy = per(GRAV);
      const life = per(LIFE).mul(R(5).mul(0.4).add(0.8));
      const tau = t.sub(tB);
      const e = exp(c.negate().mul(max(tau, 0)));
      const gv = vec3(0, gy.negate(), 0).div(c);
      const pB = burst.add(gv.mul(max(tau, 0))).add(v0.sub(gv).mul(float(1).sub(e)).div(c));
      const velB = gv.add(v0.sub(gv).mul(e));
      const age = clamp(tau.div(life), 0, 1);
      const aliveB = step(0, tau).mul(step(tau, life));
      const fadeB = pow(float(1).sub(age), mix(float(1.5), float(0.8), is(1)));
      const flash = exp(tau.mul(-18)).mul(1.4).add(1);
      // Willows sizzle; crackle shells turn to white strobing specks at the end.
      const sizzle = mix(float(1), sin(t.mul(40).add(id)).mul(0.3).add(0.7), is(1));
      const late = smoothstep(0.55, 0.62, age).mul(is(4));
      const strobe = mix(float(1), step(0.55, hash(id.add(floor(t.mul(24)).mul(0.37)))).mul(2.2), late);
      const colB = mix(r1.xyz, r2.xyz, smoothstep(0.25, 0.9, age)).mul(float(1).sub(late)).add(vec3(1, 0.95, 0.85).mul(late));
      const brightB = fadeB.mul(flash).mul(sizzle).mul(strobe);

      // --- the rocket's trail on the way up ----------------------------------------------------
      const lag = k.mul(0.03);
      const ut = t.sub(lag).sub(tL).div(max(tB.sub(tL), 0.1));
      const uc = clamp(ut, 0, 1);
      const rise = float(1).sub(float(1).sub(uc).mul(float(1).sub(uc)));
      const jit = vec3(R(6).sub(0.5), R(7).sub(0.5), R(8).sub(0.5)).mul(k.mul(0.012));
      const pT = vec3(mix(launch.x, burst.x, uc), mix(launch.y, burst.y, rise), mix(launch.z, burst.z, uc)).add(jit);
      const aliveT = step(0, ut).mul(step(ut, 1));
      const brightT = pow(float(1).sub(k.div(TRAIL)), 2).mul(0.5);
      const velT = burst.sub(launch).div(max(tB.sub(tL), 0.1)).mul(vec3(1, float(2).mul(float(1).sub(uc)), 1));

      const trail = step(k, TRAIL - 0.5);
      const p = mix(pB, pT, trail);
      const vel = mix(velB, velT, trail);
      const alive = mix(aliveB, aliveT, trail);
      glow.assign(mix(colB.mul(brightB), vec3(1, 0.7, 0.35).mul(brightT), trail).mul(u.intensity).mul(alive));

      // A streak along its motion, facing the camera; at least a pixel or two wide far away.
      const view = p.sub(cameraPosition), dist = length(view);
      const speed = length(vel);
      const along = vel.div(max(speed, 0.001));
      const side = normalize(cross(along, view).add(vec3(0, 0.0001, 0)));
      const width = max(float(0.16), dist.mul(0.0026)).mul(mix(exp(tau.mul(-18)).mul(0.5).add(1), float(1), trail)).mul(alive);
      const len = max(width, speed.mul(0.05)).mul(alive);
      const lp = attribute('position', 'vec3');
      return p.add(side.mul(lp.x.mul(width))).sub(along.mul(lp.y.mul(len)));
    })();
    // Soft across the streak, dimming toward its tail.
    m.colorNode = Fn(() => {
      const q = uv();
      const across = pow(float(1).sub(abs(q.x.mul(2).sub(1))), 1.5);
      return glow.mul(across).mul(mix(float(1), float(0.25), q.y));
    })();

    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.renderOrder = 3;
    mesh.visible = false;
    return mesh;
  }

  /** Begin a show (about 75 s, ending in a finale). */
  start() {
    this.show = { t: 0, next: 0.8, dur: 75, finale: 60 };
  }

  get active() {
    return !!this.show || this.shells.some((s) => s && this.time < s.end);
  }

  /** Fire one shell. */
  launch(type = pick(['peony', 'peony', 'willow', 'ring', 'palm', 'crackle'])) {
    const s = this.next;
    this.next = (this.next + 1) % SHELLS;
    const ty = TYPES.indexOf(type);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * LAUNCH.r;
    const lx = LAUNCH.x + Math.cos(a) * r, lz = LAUNCH.z + Math.sin(a) * r;
    const L = [lx, heightAt(lx, lz) + 0.3, lz];
    const Bp = [rnd(SKY.x0, SKY.x1), rnd(SKY.y0, SKY.y1), rnd(SKY.z0, SKY.z1)];
    const tL = this.time, tB = tL + rnd(1.5, 2.1);
    let c1, c2;
    if (type === 'willow') { c1 = COLORS.gold; c2 = [0.9, 0.45, 0.12]; }
    else if (type === 'palm') { c1 = pick([COLORS.green, COLORS.green, COLORS.gold]); c2 = COLORS.gold; }
    else if (type === 'crackle') { c1 = pick([COLORS.gold, COLORS.white]); c2 = COLORS.white; }
    else { c1 = pick([COLORS.red, COLORS.green, COLORS.blue, COLORS.violet, COLORS.orange, COLORS.gold, COLORS.white]); c2 = pick([c1, COLORS.gold, COLORS.white]); }
    const speed = type === 'ring' ? rnd(20, 25) : type === 'willow' ? rnd(21, 26) : type === 'palm' ? rnd(20, 25) : rnd(22, 30);
    const T = this.table, at = (row) => (row * SHELLS + s) * 4;
    T.set([...Bp, tB], at(0));
    T.set([...c1, ty], at(1));
    T.set([...c2, speed], at(2));
    T.set([...L, tL], at(3));
    this.tex.needsUpdate = true;
    this.shells[s] = { B: Bp, L, tB, c1, type, end: tB + LIFE[ty] * 1.3, burst: false };
    this.onEvent?.('launch', L, type);
  }

  update(dt, { hour, prevHour, rain, enabled }) {
    this.time += dt;
    // Kept small for float precision in the shader; shells in flight are shifted with it.
    if (this.time > 3000 && !this.active) this._rebase();
    this.u.time.value = this.time;

    // The nightly show at ten, if the sky is clear enough.
    if (enabled && !this.show && prevHour !== undefined && prevHour < 22 && hour >= 22 && hour - prevHour < 1 && rain < 0.15) this.start();

    if (this.show) {
      const sh = this.show;
      sh.t += dt;
      sh.next -= dt;
      if (sh.t > sh.dur) this.show = null;
      else if (sh.next <= 0) {
        if (sh.t > sh.finale) {
          this.launch();
          sh.next = rnd(0.12, 0.32);
        } else {
          const volley = Math.random() < 0.2 ? Math.floor(rnd(2, 4)) : 1;
          const type = volley > 1 ? pick(['peony', 'ring', 'willow']) : undefined;
          for (let i = 0; i < volley; i++) this.launch(type);
          sh.next = rnd(0.7, 1.9);
        }
      }
    }

    // Bursts: sound, and a flash of light on everything around.
    let best = null, bestI = 0;
    for (const s of this.shells) {
      if (!s) continue;
      if (!s.burst && this.time >= s.tB) {
        s.burst = true;
        this.onEvent?.('burst', s.B, s.type);
      }
      const since = this.time - s.tB;
      if (since >= 0 && since < 1.5) {
        const I = Math.exp(-since * 3.2) * (s.type === 'willow' ? 1.3 : 1);
        if (I > bestI) { bestI = I; best = s; }
      }
    }
    const f = this.lampLight.flash;
    if (best) {
      f.pos.value.set(...best.B);
      f.color.value.setRGB(best.c1[0] * bestI, best.c1[1] * bestI, best.c1[2] * bestI);
    } else f.color.value.setRGB(0, 0, 0);
    this.mesh.visible = this.active;
  }

  _rebase() {
    this.time = 0;
    for (let s = 0; s < SHELLS; s++) {
      this.table[s * 4 + 3] = -1e4;
      this.table[(3 * SHELLS + s) * 4 + 3] = -1e4;
      this.shells[s] = null;
    }
    this.tex.needsUpdate = true;
  }
}
