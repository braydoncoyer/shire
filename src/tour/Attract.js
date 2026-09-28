// The view behind the start screen: high on the Hill above Bag End, looking out over the party on
// the field, the Party Tree, the Bywater and the Green Dragon, drifting slowly to and fro. The
// loading screen's picture (public/loader.webp) is a render of its first frame, so when loading
// finishes the live scene fades in exactly where the picture was.
//   Regenerate the picture after changing the pose or the look of the village:
//   node scripts/shot.mjs loader "cam=-58,32,-114,-2.378,-0.223&fly&time=16.5&weather=fair"
//   cwebp -q 74 -resize 1920 0 shots/loader.png -o public/loader.webp

const POS = [-58, 32, -114];
const LOOK = [15, 8, -38];
const PERIOD = 140; // seconds, there and back
const SWAY = 7, PUSH = 4; // meters sideways, and in toward the village at the far end of the swing

export class Attract {
  constructor(app) {
    this.app = app;
    this.t = 0;
    const dx = LOOK[0] - POS[0], dz = LOOK[2] - POS[2], l = Math.hypot(dx, dz);
    this.fwd = [dx / l, dz / l];
    this.right = [-dz / l, dx / l];
  }

  /** On while the start screen waits for the first choice (never in headless shots). */
  get active() {
    const app = this.app, s = app.settings;
    return !app.hud.started && !app.tour.active && !s.shot && !s.cam;
  }

  /** Put the camera `t` seconds into the drift. */
  apply(t = this.t) {
    const w = (t / PERIOD) * Math.PI * 2, side = Math.sin(w) * SWAY, push = (1 - Math.cos(w)) * 0.5 * PUSH;
    const [fx, fz] = this.fwd, [rx, rz] = this.right;
    const x = POS[0] + rx * side + fx * push, z = POS[2] + rz * side + fz * push, y = POS[1] - push * 0.3;
    const lx = LOOK[0] + rx * side * 0.35, lz = LOOK[2] + rz * side * 0.35;
    const cam = this.app.camera;
    cam.position.set(x, y, z);
    const dx = lx - x, dy = LOOK[1] - y, dz = lz - z;
    cam.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0);
  }

  update(dt) {
    this.t += dt;
    this.apply();
  }
}
