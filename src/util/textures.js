// Tileable noise textures baked on the CPU at startup. Sampling a texture in a shader is far cheaper
// than evaluating procedural noise per pixel, which matters for the cloud raymarch.

import * as THREE from 'three/webgpu';
import { tileFbm2, makeWorley2, makeWorley3, smoothstep, clamp } from './noise.js';
import { LANE_TEXTURE } from '../world/Layout.js';

function dataTex(data, w, h, { format = THREE.RGBAFormat, mips = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, format, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mips;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const b = (v) => Math.round(clamp(v, 0, 1) * 255);

/**
 * Cloud weather map. R: billowy cumulus shapes (Perlin-Worley). G: mid-frequency breakup.
 * B: fibrous fbm for cirrus. A: fine detail.
 */
export function makeWeatherTexture(size = 512) {
  const data = new Uint8Array(size * size * 4);
  const raw = new Float32Array(size * size);
  const w1 = makeWorley2(6, 11), w2 = makeWorley2(14, 12), w3 = makeWorley2(30, 13);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const perlin = tileFbm2(u, v, 4, 6) * 0.5 + 0.5;
      const worley = 1 - (w1(u, v) * 0.625 + w2(u, v) * 0.25 + w3(u, v) * 0.125);
      // Remap Perlin by Worley: rounded, cauliflower-edged blobs.
      const pw = clamp((perlin - (1 - worley)) / (1 - (1 - worley) + 1e-4), 0, 1);
      const mid = tileFbm2(u + 0.37, v + 0.71, 12, 4) * 0.5 + 0.5;
      const cir = tileFbm2(u + 0.13, v + 0.52, 8, 6, 0.6) * 0.5 + 0.5;
      const fine = tileFbm2(u + 0.61, v + 0.29, 32, 3) * 0.5 + 0.5;
      const k = (y * size + x) * 4;
      raw[y * size + x] = pw * 0.7 + perlin * 0.3;
      data[k + 1] = b(mid);
      data[k + 2] = b(cir);
      data[k + 3] = b(fine);
    }
  }
  // Histogram-equalize the cumulus channel so "cloud cover" maps linearly to sky coverage.
  const order = Array.from(raw.keys()).sort((a, c) => raw[a] - raw[c]);
  for (let i = 0; i < order.length; i++) data[order[i] * 4] = b(i / (order.length - 1));
  return dataTex(data, size, size);
}

/** 3D Worley fbm, inverted, used to erode cloud edges into puffs. */
export function makeCloudDetailTexture(size = 32) {
  const data = new Uint8Array(size * size * size);
  const a = makeWorley3(4, 21), c = makeWorley3(8, 22), d = makeWorley3(16, 23);
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, s = z / size;
        const n = 1 - (a(u, v, s) * 0.55 + c(u, v, s) * 0.3 + d(u, v, s) * 0.15);
        data[(z * size + y) * size + x] = b(n);
      }
  const t = new THREE.Data3DTexture(data, size, size, size);
  t.format = THREE.RedFormat;
  t.type = THREE.UnsignedByteType;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

/** General-purpose tileable fbm at four frequencies, for ground coloring. */
export function makeGroundNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, k = (y * size + x) * 4;
      data[k] = b(tileFbm2(u, v, 2, 5) * 0.6 + 0.5);
      data[k + 1] = b(tileFbm2(u + 0.3, v + 0.7, 6, 5) * 0.6 + 0.5);
      data[k + 2] = b(tileFbm2(u + 0.5, v + 0.1, 16, 4) * 0.6 + 0.5);
      data[k + 3] = b(tileFbm2(u + 0.9, v + 0.4, 48, 3) * 0.6 + 0.5);
    }
  return dataTex(data, size, size);
}

/** R: gravel lane coverage, G: stream bed, B: hobbit-hole yards, A: beds (1 flowers, 0.5 vegetables). */
export function makeLaneTexture() {
  const { n, dist, width, stream, yard, bed } = LANE_TEXTURE;
  const data = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) {
    const w = width[k] || 2.5;
    // Store a soft falloff; the shader sharpens it with its own noise so the edge frays.
    data[k * 4] = b(1 - smoothstep(w * 0.5 - 0.6, w * 0.5 + 0.9, dist[k]));
    data[k * 4 + 1] = b(1 - smoothstep(1.2, 5.5, stream[k]));
    data[k * 4 + 2] = yard[k];
    data[k * 4 + 3] = bed[k];
  }
  const t = dataTex(data, n, n);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
