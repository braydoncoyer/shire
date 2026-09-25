// Facade bay geometry shared by the terrain (to size each hole's turf mound) and the facade model.
// Pure math, no Three.js.

/** Spring height and rise of each bay's arch. */
function bayArch(bay, doorR) {
  const h = bay.w / 2;
  const spring = bay.kind === 'door' ? doorR * 2 + 0.28 : bay.kind === 'bay' ? 2.35 : bay.kind === 'wall' ? 1.55 : 1.85;
  const rise = Math.min(h * 0.62, bay.kind === 'door' ? 0.75 : bay.kind === 'bay' ? 1.05 : 0.5);
  return { spring, rise };
}

export function layoutBays(spec) {
  // The origin is the door's center, or the middle of the facade if it has no door.
  const doorIdx = spec.bays.findIndex((b) => b.kind === 'door');
  let x = 0;
  if (doorIdx >= 0) {
    for (let i = 0; i < doorIdx; i++) x += spec.bays[i].w;
    x = -(x + spec.bays[doorIdx].w / 2);
  } else {
    x = -spec.bays.reduce((a, b) => a + b.w, 0) / 2;
  }
  const out = [];
  for (const b of spec.bays) {
    const { spring, rise } = bayArch(b, spec.doorR);
    out.push({ ...b, a: x, b: x + b.w, c: x + b.w / 2, h: b.w / 2, spring, rise });
    x += b.w;
  }
  return out;
}

export function archY(bay, v) {
  const t = (v - bay.c) / bay.h;
  return bay.spring + bay.rise * Math.sqrt(Math.max(0, 1 - t * t));
}

/** Highest point of the facade (top of the turf hood) at v, for sizing the mound behind it. */
export function facadeTop(bays, v) {
  for (const b of bays) if (v >= b.a - 1e-6 && v <= b.b + 1e-6) return archY(b, v) + 0.55;
  return 0;
}
