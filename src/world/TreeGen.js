// Procedural trees: a recursive branch skeleton turned into tapered tubes, plus clusters of
// alpha-tested leaf cards. Leaf normals point away from the crown's center, which makes a crown of
// flat cards shade like one soft, rounded mass. Leaf textures are painted on a canvas at startup.

import * as THREE from 'three/webgpu';
import { mulberry32 } from '../util/noise.js';

const UP = new THREE.Vector3(0, 1, 0);

export const SPECIES = {
  oak: {
    trunk: { length: 4.2, radius: 0.42, wobble: 0.12 },
    levels: [
      { children: 7, start: 0.35, angle: 58, lenFactor: 0.78, radFactor: 0.55, wobble: 0.22, up: 0.06, droop: 0.05, segLen: 1.2, spread: 1 },
      { children: 5, start: 0.25, angle: 48, lenFactor: 0.62, radFactor: 0.55, wobble: 0.28, up: 0.08, droop: 0.06, segLen: 0.9, spread: 1 },
      { children: 4, start: 0.3, angle: 42, lenFactor: 0.55, radFactor: 0.6, wobble: 0.3, up: 0.1, droop: 0.04, segLen: 0.7, spread: 1 },
    ],
    firstLength: 7.5,
    leaves: { perTip: 10, size: 2.0, spread: 1.4, texture: 'broadleaf', aspect: 1 },
    color: 0x4a7a26,
  },
  // The Party Tree: an old pine with long, low, sweeping limbs and dark needle clusters.
  pine: {
    trunk: { length: 5.5, radius: 0.75, wobble: 0.08 },
    levels: [
      { children: 11, start: 0.2, angle: 72, lenFactor: 1, radFactor: 0.45, wobble: 0.16, up: 0.03, droop: 0.12, segLen: 1.4, spread: 1 },
      { children: 6, start: 0.2, angle: 50, lenFactor: 0.5, radFactor: 0.55, wobble: 0.22, up: 0.06, droop: 0.05, segLen: 0.9, spread: 1 },
      { children: 4, start: 0.3, angle: 40, lenFactor: 0.5, radFactor: 0.6, wobble: 0.25, up: 0.12, droop: 0.02, segLen: 0.6, spread: 1 },
    ],
    firstLength: 10.5,
    leaves: { perTip: 7, size: 2.1, spread: 1.0, texture: 'needles', aspect: 0.75 },
    color: 0x3c5a2c,
  },
  poplar: {
    trunk: { length: 17, radius: 0.32, wobble: 0.03 },
    levels: [
      { children: 26, start: 0.12, angle: 18, lenFactor: 0.2, radFactor: 0.35, wobble: 0.12, up: 0.2, droop: 0, segLen: 0.8, spread: 1 },
      { children: 3, start: 0.3, angle: 25, lenFactor: 0.5, radFactor: 0.6, wobble: 0.2, up: 0.2, droop: 0, segLen: 0.6, spread: 1 },
    ],
    firstLength: 4.2,
    leaves: { perTip: 9, size: 1.7, spread: 0.9, texture: 'smallleaf', aspect: 1 },
    color: 0x557f2c,
  },
  willow: {
    trunk: { length: 3.2, radius: 0.5, wobble: 0.15 },
    levels: [
      { children: 7, start: 0.55, angle: 55, lenFactor: 1, radFactor: 0.55, wobble: 0.18, up: 0.1, droop: 0, segLen: 1.0, spread: 1 },
      { children: 7, start: 0.25, angle: 55, lenFactor: 0.6, radFactor: 0.5, wobble: 0.2, up: 0.0, droop: 0.28, segLen: 0.8, spread: 1 },
    ],
    firstLength: 7.5,
    leaves: { perTip: 18, size: 4.6, spread: 1.6, texture: 'willow', aspect: 0.24, hang: true },
    color: 0x7c9a3a,
  },
};

// ---------------------------------------------------------------------------------------------
// Leaf textures

function paintLeafCluster(kind) {
  const W = kind === 'willow' ? 128 : 256, H = kind === 'willow' ? 512 : 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rand = mulberry32(kind.length * 977);
  const leaf = (x, y, len, wid, rot, shade) => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    const v = Math.round(150 + shade * 105);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.moveTo(0, -len / 2);
    g.quadraticCurveTo(wid, -len * 0.1, 0, len / 2);
    g.quadraticCurveTo(-wid, -len * 0.1, 0, -len / 2);
    g.fill();
    g.strokeStyle = `rgba(0,0,0,0.18)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -len / 2);
    g.lineTo(0, len / 2);
    g.stroke();
    g.restore();
  };
  if (kind === 'roundleaf') {
    // Nasturtium: round, flat leaves on long stalks, pale veins radiating from the middle.
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * W * 0.36;
      const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r, R = 16 + rand() * 12;
      const v = Math.round(150 + rand() * 105);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.beginPath();
      g.arc(x, y, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1.2;
      for (let k = 0; k < 9; k++) {
        const b = (k / 9) * Math.PI * 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(b) * R * 0.9, y + Math.sin(b) * R * 0.9);
        g.stroke();
      }
    }
  } else if (kind === 'needles') {
    // Tufts of needles radiating from short twigs.
    for (let t = 0; t < 14; t++) {
      const cx = W * (0.2 + rand() * 0.6), cy = H * (0.25 + rand() * 0.5);
      const n = 40 + Math.floor(rand() * 20);
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, len = 22 + rand() * 26;
        const v = Math.round(140 + rand() * 115);
        g.strokeStyle = `rgb(${v},${v},${v})`;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.8);
        g.stroke();
      }
    }
  } else if (kind === 'willow') {
    // A hanging strand: a thin twig with narrow leaves along it.
    g.strokeStyle = 'rgb(90,90,90)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.bezierCurveTo(W / 2 + 8, H * 0.3, W / 2 - 8, H * 0.7, W / 2 + 3, H);
    g.stroke();
    for (let i = 0; i < 150; i++) {
      const t = rand();
      const x = W / 2 + Math.sin(t * 6) * 6 + (rand() - 0.5) * 30 * (0.4 + t);
      leaf(x, t * H * 0.98, 30 + rand() * 18, 5 + rand() * 3, (rand() - 0.5) * 0.9, rand());
    }
  } else {
    const n = kind === 'smallleaf' ? 260 : 190;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * W * 0.42;
      const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r * 0.9;
      const len = kind === 'smallleaf' ? 16 + rand() * 8 : 26 + rand() * 14;
      // Leaves toward the rim are lit less (self-shadowing inside the clump).
      leaf(x, y, len, len * 0.32, a + (rand() - 0.5) * 1.2 + Math.PI / 2, 0.35 + 0.65 * rand() * (1 - (r / (W * 0.42)) * 0.4));
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

const leafTextures = {};
export function leafTexture(kind) {
  return (leafTextures[kind] ||= paintLeafCluster(kind));
}

// ---------------------------------------------------------------------------------------------
// Skeleton

function perpendicular(d) {
  const a = Math.abs(d.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0);
  return new THREE.Vector3().crossVectors(d, a).normalize();
}

export function growTree(speciesName, seed) {
  const spec = SPECIES[speciesName];
  const rand = mulberry32(seed);
  const rv = () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5);
  const branches = [];
  const tips = [];

  function grow(start, dir, length, radius, level, cfg) {
    const segs = Math.max(2, Math.round(length / cfg.segLen));
    const pts = [start.clone()], radii = [radius];
    const p = start.clone(), d = dir.clone();
    for (let s = 1; s <= segs; s++) {
      d.addScaledVector(rv(), cfg.wobble).addScaledVector(UP, cfg.up).addScaledVector(UP, -cfg.droop * (s / segs) * 2).normalize();
      p.addScaledVector(d, length / segs);
      pts.push(p.clone());
      radii.push(radius * (1 - (s / segs) * 0.75));
    }
    branches.push({ pts, radii, level });
    const next = spec.levels[level];
    if (!next) {
      tips.push({ pts, dir: d.clone() });
      return;
    }
    const n = next.children;
    let phi = rand() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const t = next.start + (1 - next.start) * ((k + rand() * 0.8) / n);
      const f = t * segs, i = Math.min(segs - 1, Math.floor(f)), w = f - i;
      const pos = pts[i].clone().lerp(pts[i + 1], w);
      const pr = radii[i] + (radii[i + 1] - radii[i]) * w;
      const pd = pts[i + 1].clone().sub(pts[i]).normalize();
      phi += 2.39996; // golden angle
      const side = perpendicular(pd).applyAxisAngle(pd, phi);
      const ang = THREE.MathUtils.degToRad(next.angle * (0.8 + rand() * 0.4));
      const cd = pd.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang)).normalize();
      // Scaffold limbs off the trunk have the species' own reach; finer branches scale down.
      const reach = level === 0 ? spec.firstLength : length * next.lenFactor;
      const len = reach * (1.1 - t * 0.5) * (0.8 + rand() * 0.35);
      grow(pos, cd, len, Math.max(0.015, pr * next.radFactor), level + 1, next);
    }
  }

  // The trunk starts a little below ground so it never floats on a slope.
  const trunkLen = spec.trunk.length * (0.85 + rand() * 0.3);
  const trunkCfg = { segLen: 1, up: 0.02, droop: 0, wobble: spec.trunk.wobble };
  const lean = new THREE.Vector3((rand() - 0.5) * 0.1, 1, (rand() - 0.5) * 0.1).normalize();
  grow(new THREE.Vector3(0, -0.4, 0), lean, trunkLen + 0.4, spec.trunk.radius, 0, trunkCfg);
  return { branches, tips, spec, rand };
}

// ---------------------------------------------------------------------------------------------
// Geometry

function tubeGeometry(branches, radialFor) {
  const pos = [], nor = [], uv = [], idx = [];
  let base = 0;
  for (const b of branches) {
    const R = radialFor(b.level);
    const n = b.pts.length;
    let normal = perpendicular(b.pts[1].clone().sub(b.pts[0]).normalize());
    let v = 0;
    for (let i = 0; i < n; i++) {
      const tan = (i < n - 1 ? b.pts[i + 1].clone().sub(b.pts[i]) : b.pts[i].clone().sub(b.pts[i - 1])).normalize();
      // Parallel transport keeps the rings from twisting.
      normal.sub(tan.clone().multiplyScalar(normal.dot(tan))).normalize();
      const binormal = new THREE.Vector3().crossVectors(tan, normal);
      if (i > 0) v += b.pts[i].distanceTo(b.pts[i - 1]);
      for (let r = 0; r <= R; r++) {
        const a = (r / R) * Math.PI * 2;
        const dir = normal.clone().multiplyScalar(Math.cos(a)).addScaledVector(binormal, Math.sin(a));
        const p = b.pts[i].clone().addScaledVector(dir, b.radii[i]);
        pos.push(p.x, p.y, p.z);
        nor.push(dir.x, dir.y, dir.z);
        uv.push(r / R, v / (b.radii[0] * 6.283));
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let r = 0; r < R; r++) {
        const a = base + i * (R + 1) + r, c = a + R + 1;
        idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    base += n * (R + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function leafGeometry(tree) {
  const { tips, spec, rand } = tree;
  const L = spec.leaves;
  const cards = [];
  for (const tip of tips) {
    const n = tip.pts.length;
    for (let k = 0; k < L.perTip; k++) {
      // Along the outer part of the twig, jittered into a loose clump.
      const t = 0.35 + 0.65 * rand();
      const f = t * (n - 1), i = Math.min(n - 2, Math.floor(f));
      const p = tip.pts[i].clone().lerp(tip.pts[i + 1], f - i);
      p.add(new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.7, rand() - 0.5).multiplyScalar(L.spread));
      cards.push(p);
    }
  }
  const center = new THREE.Vector3();
  for (const p of cards) center.add(p);
  center.divideScalar(Math.max(1, cards.length));
  // Normals radiate from a point a little below the crown's centroid.
  center.y -= 0.8;

  const pos = [], nor = [], uv = [], idx = [];
  let v = 0;
  for (const p of cards) {
    // Weeping species: most cards hang as strands; some lie loosely over the top to round the dome.
    const hang = L.hang && rand() > 0.3;
    const size = L.size * (hang ? 0.45 + rand() * 0.9 : L.hang ? 0.45 : 0.75 + rand() * 0.5);
    let right, up;
    if (hang) {
      // Willow strands hang straight down from the twig, turned randomly about the vertical.
      const a = rand() * Math.PI * 2;
      right = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(size * L.aspect);
      up = new THREE.Vector3(0, size, 0);
      p.y -= size * 0.45;
    } else {
      const facing = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      right = perpendicular(facing).multiplyScalar(size);
      up = new THREE.Vector3().crossVectors(facing, right).normalize().multiplyScalar(size * (L.hang ? 1 : L.aspect));
    }
    const nrm = p.clone().sub(center).normalize().lerp(UP, 0.25).normalize();
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    for (const [a, b] of corners) {
      const q = p.clone().addScaledVector(right, a).addScaledVector(up, b);
      pos.push(q.x, q.y, q.z);
      nor.push(nrm.x, nrm.y, nrm.z);
      uv.push(a + 0.5, b + 0.5);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Build a tree variant: { wood, leaves, height, radius }. */
export function buildTree(speciesName, seed) {
  const tree = growTree(speciesName, seed);
  const wood = tubeGeometry(tree.branches, (level) => [8, 6, 4, 3][level] ?? 3);
  const leaves = leafGeometry(tree);
  wood.computeBoundingBox();
  leaves.computeBoundingBox();
  const box = leaves.boundingBox.clone().union(wood.boundingBox);
  return {
    wood,
    leaves,
    height: box.max.y,
    radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2,
    trunkRadius: SPECIES[speciesName].trunk.radius,
  };
}
