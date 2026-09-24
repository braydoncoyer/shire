// Single-scattering atmosphere (Rayleigh, Mie, ozone) with a cheap multiple-scattering term, after
// Hillaire 2020. The same model runs on the CPU (sun color, ambient light, exposure) and on the GPU
// (the sky-view LUT), so the lighting and the sky always agree. Distances are in kilometers.

export const R_GROUND = 6360;
export const R_TOP = 6460;
export const CAMERA_ALT_KM = 0.08;

export const RAYLEIGH_SCATTER = [5.802e-3, 13.558e-3, 33.1e-3];
export const RAYLEIGH_H = 8.0;
export const MIE_SCATTER = 3.996e-3;
export const MIE_EXTINCT = 4.44e-3;
export const MIE_H = 1.2;
export const MIE_G = 0.8;
export const OZONE_ABSORB = [0.65e-3, 1.881e-3, 0.085e-3];

// Scene-referred sun illuminance. Everything in the renderer is linear radiance relative to this.
export const SUN_ILLUMINANCE = 10;
export const MS_FACTOR = 0.35;

// Haze adds a low, dense aerosol layer on top of the background Mie.
export const HAZE_H = 0.35;
export const HAZE_SCALE = 7;

function raySphereFar(oy, dy, r) {
  // Origin (0, oy, 0), direction with vertical component dy (unit), sphere at the planet center.
  const b = oy * dy;
  const c = oy * oy - r * r;
  const d = b * b - c;
  if (d < 0) return -1;
  return -b + Math.sqrt(d);
}

function raySphereNear(oy, dy, r) {
  const b = oy * dy;
  const c = oy * oy - r * r;
  const d = b * b - c;
  if (d < 0) return -1;
  return -b - Math.sqrt(d);
}

function densities(h, haze) {
  const r = Math.exp(-h / RAYLEIGH_H);
  const m = Math.exp(-h / MIE_H) + haze * HAZE_SCALE * Math.exp(-h / HAZE_H);
  const o = Math.max(0, 1 - Math.abs(h - 25) / 15);
  return [r, m, o];
}

function extinction(h, haze) {
  const [r, m, o] = densities(h, haze);
  return [0, 1, 2].map((i) => RAYLEIGH_SCATTER[i] * r + MIE_EXTINCT * m + OZONE_ABSORB[i] * o);
}

/** Transmittance from altitude `h` (km) toward a direction with elevation sine `mu`. */
export function transmittance(h, mu, haze, steps = 32) {
  const oy = R_GROUND + h;
  if (raySphereNear(oy, mu, R_GROUND) > 0) {
    // Below the horizon: let the sun fade out over a couple of degrees instead of snapping off.
    const horizonMu = -Math.sqrt(Math.max(0, 1 - (R_GROUND / oy) ** 2));
    const k = Math.max(0, 1 - (horizonMu - mu) / 0.03);
    if (k <= 0) return [0, 0, 0];
    return transmittance(h, horizonMu + 1e-4, haze, steps).map((v) => v * k);
  }
  const t = raySphereFar(oy, mu, R_TOP);
  const dt = t / steps;
  const od = [0, 0, 0];
  const cosT = Math.sqrt(Math.max(0, 1 - mu * mu));
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) * dt;
    const x = cosT * s, y = oy + mu * s;
    const hh = Math.sqrt(x * x + y * y) - R_GROUND;
    const e = extinction(hh, haze);
    od[0] += e[0] * dt; od[1] += e[1] * dt; od[2] += e[2] * dt;
  }
  return od.map((v) => Math.exp(-v));
}

const phaseRayleigh = (c) => (3 / (16 * Math.PI)) * (1 + c * c);
function phaseMie(c, g = MIE_G) {
  const g2 = g * g;
  return (3 / (8 * Math.PI)) * ((1 - g2) * (1 + c * c)) / ((2 + g2) * Math.pow(1 + g2 - 2 * g * c, 1.5));
}

/** Sky radiance for a unit view direction, sun direction (both [x, y, z]). */
export function skyRadiance(dir, sun, haze, steps = 16) {
  const oy = R_GROUND + CAMERA_ALT_KM;
  const tGround = raySphereNear(oy, dir[1], R_GROUND);
  const tMax = tGround > 0 ? tGround : raySphereFar(oy, dir[1], R_TOP);
  const dt = tMax / steps;
  const cosV = dir[0] * sun[0] + dir[1] * sun[1] + dir[2] * sun[2];
  const pr = phaseRayleigh(cosV), pm = phaseMie(cosV);
  const L = [0, 0, 0], T = [1, 1, 1];
  for (let i = 0; i < steps; i++) {
    const s = (i + 0.5) * dt;
    const px = dir[0] * s, py = oy + dir[1] * s, pz = dir[2] * s;
    const r = Math.sqrt(px * px + py * py + pz * pz);
    const h = r - R_GROUND;
    const mu = (px * sun[0] + py * sun[1] + pz * sun[2]) / r;
    const ts = transmittance(h, mu, haze, 8);
    const [dr, dm] = densities(h, haze);
    const ext = extinction(h, haze);
    for (let c = 0; c < 3; c++) {
      const sr = RAYLEIGH_SCATTER[c] * dr, sm = MIE_SCATTER * dm;
      const single = (sr * pr + sm * pm) * ts[c];
      const ms = (sr + sm) * ts[c] * MS_FACTOR / (4 * Math.PI) + (sr + sm) * 0.002 * Math.max(0, sun[1] + 0.2);
      const stepT = Math.exp(-ext[c] * dt);
      L[c] += T[c] * (single + ms) * (1 - stepT) / Math.max(ext[c], 1e-6);
      T[c] *= stepT;
    }
  }
  return L.map((v) => v * SUN_ILLUMINANCE);
}

/**
 * Everything the lights and exposure need from the atmosphere for a given sun direction.
 * Cheap enough to run whenever the sun moves.
 */
export function evaluateLighting(sun, haze) {
  const sunT = transmittance(CAMERA_ALT_KM, sun[1], haze);
  const sunColor = sunT.map((v) => v * SUN_ILLUMINANCE);

  // Irradiance from the sky dome onto an upward-facing surface, by a coarse quadrature.
  const irr = [0, 0, 0];
  const horizon = [0, 0, 0];
  const zenith = skyRadiance([0, 1, 0], sun, haze);
  const ELEV = [0.12, 0.45, 0.85, 1.3];
  const AZ = 8;
  let wsum = 0;
  for (const el of ELEV) {
    for (let a = 0; a < AZ; a++) {
      const az = (a / AZ) * Math.PI * 2;
      const d = [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
      const L = skyRadiance(d, sun, haze, 10);
      const w = Math.sin(el) * Math.cos(el);
      for (let c = 0; c < 3; c++) irr[c] += L[c] * w;
      wsum += w;
      if (el === ELEV[0]) for (let c = 0; c < 3; c++) horizon[c] += L[c] / AZ;
    }
  }
  // Mean cosine-weighted radiance times pi is the irradiance of the upper hemisphere.
  for (let c = 0; c < 3; c++) irr[c] = (irr[c] / wsum) * Math.PI;
  return { sunColor, skyIrradiance: irr, zenith, horizon };
}

export const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
