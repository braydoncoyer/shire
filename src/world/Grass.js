// GPU-driven ground cover: grass, reeds and wildflowers.
//
// Each layer covers a square grid of world cells that scrolls with the camera, one potential plant
// per cell, so plants stay put as you walk. Every frame a compute pass visits every cell once:
// it places the plant on the ground (height texture), decides whether and how tall it grows (lanes,
// the lake, mowing, meadow patches, shorelines, flower drifts), samples the wind, and culls it
// against distance and the view frustum. Survivors are appended to a compact buffer, and the
// plant mesh is drawn with an indirect draw whose instance count the compute pass wrote. The
// vertex shader only bends the plant.
//
// Three turf layers trade density for reach: dense detailed blades at your feet, sparser and
// simpler ones further out, dissolving into each other with per-blade thresholds.

import * as THREE from 'three/webgpu';
import {
  Fn, If, uniform, uniformArray, instanceIndex, positionLocal, storage, atomicAdd, atomicStore,
  vec2, vec3, vec4, float, uint, hash, mix, smoothstep, saturate, sin, cos, pow, normalize, length,
  max, dot, abs, step, floor, varying, cameraViewMatrix, cameraPosition, positionWorld, color, texture,
  uv, select,
} from 'three/tsl';
import { WATER_Y, LANDMARKS } from './Layout.js';

const PF = LANDMARKS.partyField;

export const GRASS = {
  lush: color(0x3f7a1a),
  bright: color(0x78a82e),
  deep: color(0x2a5212),
  seed: color(0xa6ae54),
};

// Wildflower tints: buttercup, daisy, clover, cornflower, poppy, lavender.
const FLOWERS = [0xf2cf2a, 0xf4f1e6, 0xd98ab8, 0x5f7fd6, 0xd8402a, 0x9a76c9];

const LAYERS = [
  { name: 'near', kind: 'turf', spacing: 0.075, W: 480, seg: 5, width: 0.05, fadeIn: null, rootShade: 0.4 },
  { name: 'mid', kind: 'turf', spacing: 0.18, W: 480, seg: 3, width: 0.085, fadeIn: [12, 16.5], rootShade: 0.55 },
  { name: 'far', kind: 'turf', spacing: 0.42, W: 460, seg: 1, width: 0.2, fadeIn: [36, 42], rootShade: 0.8 },
  { name: 'reeds', kind: 'reed', spacing: 0.22, W: 440, seg: 4, width: 0.045, fadeIn: null, rootShade: 0.45 },
  { name: 'flowers', kind: 'flower', spacing: 0.22, W: 400, fadeIn: null },
];

function bladeGeometry(seg) {
  const pos = [];
  for (let k = 0; k < seg; k++) pos.push(-0.5, k / seg, 0, 0.5, k / seg, 0);
  pos.push(0, 1, 0);
  const idx = [];
  for (let k = 0; k < seg - 1; k++) {
    const a = k * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const a = (seg - 1) * 2;
  idx.push(a, a + 1, seg * 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Two crossed vertical quads; x in [-0.5, 0.5], y in [0, 1], z marks the second quad. */
function flowerGeometry() {
  const pos = [], uvs = [], idx = [];
  for (let q = 0; q < 2; q++) {
    const v = q * 4;
    for (const [x, y] of [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]) {
      pos.push(x, y, q);
      uvs.push(x + 0.5, y);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** A small sprig of flowers. R: petals (tinted), G: stems and leaves, B: yellow centers, A: coverage. */
function flowerTexture() {
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  const heads = [[64, 62, 26], [34, 112, 20], [94, 124, 18]];
  g.strokeStyle = 'rgb(0,255,0)';
  for (const [x, y] of heads) {
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(64 + (x - 64) * 0.3, H);
    g.quadraticCurveTo(64 + (x - 64) * 0.6, (y + H) / 2, x, y);
    g.stroke();
  }
  g.fillStyle = 'rgb(0,255,0)';
  for (const [x, y, s] of [[50, 200, 1], [80, 185, -1], [60, 230, 1]]) {
    g.beginPath();
    g.ellipse(x, y, 14, 5, s * 0.6, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, r] of heads) {
    g.fillStyle = 'rgb(255,0,0)';
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.3, a, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgb(0,0,255)';
    g.beginPath();
    g.arc(x, y, r * 0.3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

export class Grass {
  constructor(maps, sky) {
    this.maps = maps;
    this.sky = sky;
    this.u = {
      time: uniform(0),
      windDir: uniform(new THREE.Vector2(0.7, -0.7)),
      windStrength: uniform(0.5),
      camPos: uniform(new THREE.Vector3()),
      planes: uniformArray(Array.from({ length: 6 }, () => new THREE.Vector4()), 'vec4'),
    };
    this.frustum = new THREE.Frustum();
    this.projView = new THREE.Matrix4();
    this.flowerTex = flowerTexture();
    this.group = new THREE.Group();
    this.layers = LAYERS.map((L) => this._layer(L));
  }

  _layer(L) {
    const N = L.W * L.W;
    const geo = L.kind === 'flower' ? flowerGeometry() : bladeGeometry(L.seg);
    const indirect = new THREE.IndirectStorageBufferAttribute(1, 5);
    indirect.array[0] = geo.index.count;
    geo.setIndirect(indirect);

    // Per visible plant: A = (x, ground y, z, height), B = (side.x, side.z, lean.x, lean.z),
    // C = (r, g, b, seed).
    const bufA = new THREE.StorageInstancedBufferAttribute(N, 4);
    const bufB = new THREE.StorageInstancedBufferAttribute(N, 4);
    const bufC = new THREE.StorageInstancedBufferAttribute(N, 4);
    const base = uniform(new THREE.Vector2());
    const layer = { L, N, base, indirect, bufA, bufB, bufC };

    layer.reset = Fn(() => {
      atomicStore(storage(indirect, 'uint', 5).toAtomic().element(1), uint(0));
    })().compute(1);
    layer.cull = this._cullCompute(layer);

    const mesh = new THREE.Mesh(geo, L.kind === 'flower' ? this._flowerMaterial(layer) : this._bladeMaterial(layer));
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.layers.set(1); // keep ground cover out of the water reflection pass
    mesh.userData = { L };
    layer.mesh = mesh;
    this.group.add(mesh);
    return layer;
  }

  /** Height (0 = no plant) and color for one cell, by layer kind. */
  _plant(L, xz, ground, h) {
    const maps = this.maps;
    const lanes = maps.lanes(xz);
    const n1 = maps.noise(xz, 31);
    const n2 = maps.noise(xz, 6.5);
    const aboveWater = smoothstep(WATER_Y + 0.05, WATER_Y + 0.35, ground);

    if (L.kind === 'reed') {
      // A band along the lake shore and the stream banks, in clumps.
      const ld = maps.lakeDist(xz);
      const lakeBand = smoothstep(0.86, 0.95, ld).mul(float(1).sub(smoothstep(1.0, 1.08, ld)));
      const streamBand = smoothstep(0.12, 0.35, lanes.g).mul(float(1).sub(smoothstep(0.55, 0.8, lanes.g)));
      const clump = smoothstep(0.35, 0.6, n2.r.mul(0.6).add(maps.noise(xz, 13).g.mul(0.5)));
      const band = max(lakeBand, streamBand).mul(clump).mul(float(1).sub(smoothstep(0.02, 0.2, lanes.r)));
      const hgt = band.mul(h[2].mul(0.7).add(0.9)).mul(step(0.2, band));
      const col = mix(color(0x4c6a22), color(0x7a8a38), h[2]).toVar();
      return { hgt, col };
    }

    if (L.kind === 'flower') {
      // Drifts: one species per few-meter patch, dense in meadow, sparse on mown ground.
      const patch = floor(xz.div(3.5));
      const ps = patch.add(65536);
      const pseed = ps.x.toUint().mul(uint(83492791)).bitXor(ps.y.toUint().mul(uint(2654435761)));
      // Each drift has a dominant species; a third of its flowers are strays of any kind.
      const species = select(h[3].lessThan(0.33), h[4].mul(FLOWERS.length).floor(), hash(pseed).mul(FLOWERS.length).floor());
      let tint = color(FLOWERS[0]);
      for (let k = 1; k < FLOWERS.length; k++) tint = select(species.equal(float(k)), color(FLOWERS[k]), tint);
      const drift = smoothstep(0.5, 0.68, maps.noise(xz, 17).r.mul(0.7).add(n2.b.mul(0.3))).mul(0.9);
      const pf = xz.sub(vec2(PF.x, PF.z)).div(vec2(PF.rx, PF.rz));
      const mown = float(1).sub(smoothstep(0.85, 1.1, length(pf)));
      const dryLand = float(1).sub(maps.lake(xz)).mul(float(1).sub(smoothstep(0.1, 0.3, lanes.g)));
      const density = drift.mul(float(1).sub(mown.mul(0.8))).mul(float(1).sub(smoothstep(0.02, 0.3, lanes.r))).mul(dryLand).mul(aboveWater);
      const hgt = step(h[5].mul(0.75).add(0.05), density).mul(h[2].mul(0.25).add(0.3));
      const col = tint.mul(h[4].mul(0.25).add(0.85));
      return { hgt, col };
    }

    // Turf: mostly short grazed grass with patches of longer meadow; mown on the Party Field and
    // along the lanes, the way the set is kept.
    const lake = maps.lake(xz);
    const meadow = smoothstep(0.5, 0.72, n1.r.mul(0.7).add(n2.g.mul(0.3)));
    const laneCut = float(1).sub(smoothstep(0.25, 0.55, lanes.r.add(n2.b.sub(0.5).mul(0.3))));
    const pf = xz.sub(vec2(PF.x, PF.z)).div(vec2(PF.rx, PF.rz));
    const mown = max(float(1).sub(smoothstep(0.85, 1.1, length(pf))), smoothstep(0.02, 0.2, lanes.r));
    const dry = float(1).sub(smoothstep(0.2, 0.5, lanes.g)).mul(float(1).sub(lake)).mul(aboveWater);
    const turf = mix(float(0.2), float(0.5), meadow).mul(float(1).sub(mown.mul(0.55)));
    const hgt = turf.mul(h[2].mul(0.6).add(0.7)).mul(laneCut.mul(0.85).add(0.15)).mul(dry).mul(step(0.02, laneCut.mul(dry)));
    const col = mix(GRASS.lush, GRASS.bright, h[2].mul(0.6).add(n1.g.mul(0.5)).sub(0.1).saturate()).toVar();
    col.assign(mix(col, GRASS.deep, smoothstep(0.55, 0.8, n2.r).mul(0.45)));
    col.assign(mix(col, GRASS.seed, meadow.mul(h[5]).mul(0.35)));
    return { hgt, col };
  }

  _cullCompute(layer) {
    const { L, N, base } = layer;
    const maps = this.maps, u = this.u;
    const S = L.spacing, W = L.W;
    const radius = (W * S) / 2;
    const counter = storage(layer.indirect, 'uint', 5).toAtomic();
    const outA = storage(layer.bufA, 'vec4', N);
    const outB = storage(layer.bufB, 'vec4', N);
    const outC = storage(layer.bufC, 'vec4', N);

    return Fn(() => {
      const i = instanceIndex;
      const cell = base.add(vec2(i.mod(uint(W)).toFloat(), i.div(uint(W)).toFloat()));
      const ci = cell.add(65536);
      const seed = ci.x.toUint().mul(uint(73856093)).bitXor(ci.y.toUint().mul(uint(19349663)));
      const h = [0, 1, 2, 3, 4, 5].map((k) => hash(seed.add(uint(k + (L.kind === 'turf' ? 0 : 17)))));

      const xz = cell.add(vec2(h[0], h[1])).mul(S).toVar();
      const d = length(xz.sub(u.camPos.xz)).toVar();

      // Distance fades with a per-plant threshold, so layers dissolve into each other.
      const fade = float(1).sub(smoothstep(radius * 0.72, radius * 0.97, d)).toVar();
      if (L.fadeIn) fade.mulAssign(smoothstep(L.fadeIn[0], L.fadeIn[1], d));
      const keep = saturate(fade.sub(h[5].mul(0.85)).mul(7)).toVar();
      const inWorld = step(abs(xz.x), 278).mul(step(abs(xz.y), 278));

      If(keep.mul(inWorld).greaterThan(0.001), () => {
        const ground = maps.height(xz).toVar();
        // Frustum test on a sphere around the plant.
        const center = vec3(xz.x, ground.add(0.4), xz.y);
        const inside = float(1).toVar();
        for (let k = 0; k < 6; k++) {
          const p = u.planes.element(k);
          inside.mulAssign(step(-1.0, dot(p.xyz, center).add(p.w)));
        }
        If(inside.greaterThan(0.5), () => {
          const { hgt: h0, col } = this._plant(L, xz, ground, h);
          const hgt = h0.mul(keep).toVar();

          If(hgt.greaterThan(0.015), () => {
            // Orientation: random, nudged to face the camera so blades never go edge-on.
            const ang = h[3].mul(6.2832);
            const side = vec2(cos(ang), sin(ang));
            const toCam = normalize(u.camPos.xz.sub(xz).add(vec2(1e-4, 0)));
            const perp = vec2(toCam.y.negate(), toCam.x);
            const sv = normalize(mix(side, perp.mul(dot(side, perp).sign().add(0.001).sign()), 0.4));

            // Wind: a large moving gust field, plus a random rest lean.
            const gustUV = xz.add(u.windDir.mul(u.time.mul(u.windStrength.mul(4).add(1))));
            const gust = maps.noise(gustUV, 26).r.sub(0.35).mul(1.6);
            const stiff = L.kind === 'turf' ? 1 : 0.45;
            const lean = u.windDir.mul(gust.add(0.25).mul(u.windStrength).mul(0.9 * stiff))
              .add(vec2(h[0].sub(0.5), h[1].sub(0.5)).mul(0.5 * stiff));

            const slot = atomicAdd(counter.element(1), uint(1));
            outA.element(slot).assign(vec4(xz.x, ground, xz.y, hgt));
            outB.element(slot).assign(vec4(sv, lean));
            outC.element(slot).assign(vec4(col, h[4]));
          });
        });
      });
    })().compute(N);
  }

  _instance(layer) {
    const { N } = layer;
    return {
      A: storage(layer.bufA, 'vec4', N).toReadOnly().element(instanceIndex),
      B: storage(layer.bufB, 'vec4', N).toReadOnly().element(instanceIndex),
      C: storage(layer.bufC, 'vec4', N).toReadOnly().element(instanceIndex),
    };
  }

  _backlight(colV, tipV, k) {
    const sunU = this.sky.u;
    return Fn(() => {
      const v = normalize(positionWorld.sub(cameraPosition));
      const back = pow(saturate(dot(v, sunU.sunDir)), 6).mul(tipV).mul(k);
      return colV.mul(sunU.sunColor).mul(back).mul(float(1).sub(smoothstep(0.35, 0.9, sunU.sunDir.y)));
    })();
  }

  _bladeMaterial(layer) {
    const { L } = layer;
    const u = this.u;
    const { A, B, C } = this._instance(layer);
    const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide });
    const tipV = varying(float(0), 'gTip');
    const colV = varying(vec3(0), 'gCol');
    const nV = varying(vec3(0, 1, 0), 'gNormal');

    mat.positionNode = Fn(() => {
      const a = A.toVar(), b = B.toVar(), c = C.toVar();
      const hgt = a.w;
      const sv = b.xy;
      const facing = vec2(sv.y, sv.x.negate());
      const t = positionLocal.y;
      const px = positionLocal.x;

      const flutter = sin(u.time.mul(4.5).add(c.w.mul(40)).add(t.mul(2))).mul(0.12).mul(u.windStrength.add(0.2));
      const lean = b.zw.add(facing.mul(flutter));
      const bend = pow(t, 1.7);
      const offs = lean.mul(bend).mul(hgt);
      const y = t.mul(hgt).mul(float(1).sub(length(lean).mul(bend).mul(0.35)));
      const dist = length(a.xz.sub(cameraPosition.xz));
      const w = float(L.width).mul(c.w.mul(0.5).add(0.75)).mul(float(1).sub(t.mul(0.8))).mul(dist.mul(0.012).add(1));

      // Rounded normal: tilted across the blade, biased up so both sides light like turf.
      nV.assign(normalize(vec3(facing.x, 0, facing.y).add(vec3(sv.x, 0, sv.y).mul(px).mul(1.2)).add(vec3(0, 1.4, 0))));
      tipV.assign(t);
      colV.assign(c.xyz);
      return vec3(a.x.add(sv.x.mul(px).mul(w)).add(offs.x), a.y.add(y).sub(0.02), a.z.add(sv.y.mul(px).mul(w)).add(offs.y));
    })();

    mat.colorNode = Fn(() => {
      const ao = mix(float(L.rootShade), float(1.0), smoothstep(0.0, 0.7, tipV));
      return colV.mul(ao).mul(mix(float(0.85), float(1.12), tipV));
    })();
    mat.normalNode = cameraViewMatrix.mul(vec4(nV, 0)).xyz.normalize();
    mat.emissiveNode = this._backlight(colV, tipV, 0.05);
    return mat;
  }

  _flowerMaterial(layer) {
    const u = this.u;
    const { A, B, C } = this._instance(layer);
    const mat = new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.5 });
    mat.alphaToCoverage = true;
    const colV = varying(vec3(0), 'fCol');
    const tipV = varying(float(0), 'fTip');

    mat.positionNode = Fn(() => {
      const a = A.toVar(), b = B.toVar(), c = C.toVar();
      const hgt = a.w;
      // The second quad is turned 90 degrees.
      const q = positionLocal.z;
      const s0 = b.xy;
      const sv = mix(s0, vec2(s0.y, s0.x.negate()), q);
      const t = positionLocal.y;
      const sway = sin(u.time.mul(2.2).add(c.w.mul(30))).mul(0.08).mul(u.windStrength.add(0.3));
      const offs = b.zw.add(vec2(sway, sway.mul(0.6))).mul(pow(t, 1.5)).mul(hgt);
      const w = hgt.mul(0.55);
      colV.assign(c.xyz);
      tipV.assign(t);
      return vec3(a.x.add(sv.x.mul(positionLocal.x).mul(w)).add(offs.x), a.y.add(t.mul(hgt)).sub(0.02),
        a.z.add(sv.y.mul(positionLocal.x).mul(w)).add(offs.y));
    })();

    const tex = texture(this.flowerTex, uv());
    mat.colorNode = Fn(() => {
      const stem = color(0x4a7a22).mul(tipV.mul(0.5).add(0.5));
      const rgb = colV.mul(tex.r).add(stem.mul(tex.g)).add(color(0xf0c020).mul(tex.b))
        .div(max(tex.r.add(tex.g).add(tex.b), 1e-3));
      return vec4(rgb, tex.a);
    })();
    mat.normalNode = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz.normalize();
    mat.emissiveNode = this._backlight(colV, tipV, 0.04);
    return mat;
  }

  update(dt, camera, settings, renderer) {
    const u = this.u;
    u.time.value += dt;
    const wr = (settings.windDir * Math.PI) / 180;
    u.windDir.value.set(Math.sin(wr), -Math.cos(wr));
    u.windStrength.value = Math.min(1.5, settings.windSpeed / 8);

    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView, camera.coordinateSystem);
    this.frustum.planes.forEach((p, k) => u.planes.array[k].set(p.normal.x, p.normal.y, p.normal.z, p.constant));

    u.camPos.value.copy(camera.position);
    const cx = camera.position.x, cz = camera.position.z;
    for (const layer of this.layers) {
      const { L } = layer;
      layer.base.value.set(Math.floor(cx / L.spacing) - L.W / 2, Math.floor(cz / L.spacing) - L.W / 2);
      if (!layer.mesh.visible || !this.group.visible) continue;
      renderer.compute(layer.reset);
      renderer.compute(layer.cull);
    }
  }
}
