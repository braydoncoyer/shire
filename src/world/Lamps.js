// Lamp posts along the village lanes: a wooden post with a crook arm and a lantern hanging from it,
// every twenty-odd meters on alternate sides, kept off the lanes, the yards and the water. They glow
// and light the ground around them after dusk (their positions go into the LampLight bake).

import * as THREE from 'three/webgpu';
import { Builder, mtx, box, cylinder, lantern } from './Kit.js';
import { heightAt, yardAt, laneMask, lakeFactor, lakeDist, HOLES, LANES, VILLAGE, LANDMARKS, PARTY } from './Layout.js';
import { mulberry32 } from '../util/noise.js';

const POST = 0x4a3526, IRON = 0x2a2622;
const SPACING = 18; // m along a lane between posts
const CLEAR = 13; // m from any other lamp

export class LanePosts {
  /** `others`: lamps already placed (hole lanterns, the inn's), so posts don't crowd them. */
  constructor(mats, others = []) {
    this.lamps = [];
    this.colliders = [];
    const rand = mulberry32(2718);
    const B = new Builder();
    const taken = others.map((p) => [p.x, p.z]);
    const free = (x, z) => {
      if (laneMask(x, z) > 0.02 || yardAt(x, z) || lakeFactor(x, z) > 0 || lakeDist(x, z) < 2) return false;
      if (HOLES.some((h) => Math.hypot(x - h.x, z - h.z) < h.width / 2 + 3)) return false;
      if (Math.hypot(x - LANDMARKS.partyTree.x, z - LANDMARKS.partyTree.z) < 15) return false;
      if (Math.hypot(x - PARTY.pavilion.x, z - PARTY.pavilion.z) < 11 || Math.hypot(x - PARTY.dance.x, z - PARTY.dance.z) < 8) return false;
      return !taken.some(([a, b]) => Math.hypot(x - a, z - b) < CLEAR);
    };
    for (const lane of LANES) {
      if (!['footway', 'path', 'steps'].includes(lane.kind) && !/Lakeside|Merry Meander|Bagshot|Hill Lane|Great Smials/.test(lane.name || '')) continue;
      const pts = lane.pts;
      let carry = rand() * SPACING, side = rand() < 0.5 ? 1 : -1;
      for (let s = 0; s < pts.length - 1; s++) {
        const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-3) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        for (let t = carry; t < len; t += SPACING) {
          const cx = ax + dx * t, cz = az + dz * t;
          if (Math.hypot(cx - VILLAGE.x, cz - VILLAGE.z) > VILLAGE.r + 60) continue;
          side = -side;
          // Just off the lane's edge, on this side or failing that the other.
          for (const sd of [side, -side]) {
            const off = lane.width / 2 + 0.75;
            const x = cx - dz * sd * off, z = cz + dx * sd * off;
            if (!free(x, z)) continue;
            this._post(B, x, z, Math.atan2(dz * sd, -dx * sd), rand);
            taken.push([x, z]);
            break;
          }
        }
        carry = (((carry - len) % SPACING) + SPACING) % SPACING;
      }
    }
    this.group = B.build(mats);
  }

  /** A post at (x, z) with its arm reaching toward the lane (`yaw`). */
  _post(B, x, z, yaw, rand) {
    const y = heightAt(x, z), H = 2.25 + rand() * 0.2;
    const at = (px, py, pz, rx, ry, rz) => mtx(x, y, z, 0, yaw, 0).multiply(mtx(px, py, pz, rx, ry, rz));
    B.add('wood', box(0.12, H + 0.3, 0.12), at(0, H / 2 - 0.15, 0), POST);
    B.add('wood', box(0.1, 0.1, 0.62), at(0, H - 0.08, 0.28), POST);
    B.add('wood', box(0.06, 0.06, 0.42), at(0, H - 0.26, 0.14, Math.PI / 4), POST); // brace
    B.add('metal', cylinder(0.012, 0.012, 0.2, 6), at(0, H - 0.23, 0.52), IRON);
    lantern(B, at(0, H - 0.52, 0.52), 0.2);
    const p = new THREE.Vector3(0, H - 0.52, 0.52).applyMatrix4(mtx(x, y, z, 0, yaw, 0));
    this.lamps.push(p);
    this.colliders.push({ x, z, r: 0.15 });
  }
}
