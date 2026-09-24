// GPU-side access to the ground: height, lanes, the stream and the lake, so instanced vegetation
// can be placed entirely in the vertex shader.

import { Fn, textureLoad, texture, ivec2, float, floor, mix, clamp, smoothstep } from 'three/tsl';
import { INNER_HALF, WATER_Y } from './Layout.js';

export class GroundMaps {
  constructor(terrain) {
    this.heightTex = terrain.heightTex;
    this.laneTex = terrain.laneTex;
    this.noiseTex = terrain.groundNoise;
    this.waterTex = terrain.waterTex;
    this.m = terrain.heights.m; // grid size including the 1-cell border
  }

  /** Bilinear ground height at world xz (vec2 node). */
  height(xz) {
    const m = this.m;
    return Fn(() => {
      const g = clamp(xz.add(INNER_HALF + 1), 0, m - 1.001);
      const i = floor(g);
      const f = g.sub(i);
      const ii = ivec2(i);
      const h00 = textureLoad(this.heightTex, ii).r;
      const h10 = textureLoad(this.heightTex, ii.add(ivec2(1, 0))).r;
      const h01 = textureLoad(this.heightTex, ii.add(ivec2(0, 1))).r;
      const h11 = textureLoad(this.heightTex, ii.add(ivec2(1, 1))).r;
      return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
    })();
  }

  /** R: lane coverage (soft), G: stream bed. */
  lanes(xz) {
    return texture(this.laneTex, xz.add(INNER_HALF).div(INNER_HALF * 2));
  }

  /** Signed distance (m) to the lake or pond shore, negative over water. */
  lakeDist(xz) {
    return texture(this.waterTex, xz.add(INNER_HALF).div(INNER_HALF * 2)).r.sub(0.5).mul(60);
  }

  /** 1 over open water, 0 on dry land. */
  lake(xz) {
    return float(1).sub(smoothstep(-2.5, 0.3, this.lakeDist(xz)));
  }

  noise(xz, scale) {
    return texture(this.noiseTex, xz.div(scale));
  }
}

export { WATER_Y };
