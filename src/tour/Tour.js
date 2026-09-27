// Tour mode: a guided walk through Hobbiton, like the tour of the set. It opens with a glide over
// the lake down into Gandalf's Cutting, then walks the lanes at a hobbit's eye height, stopping at
// the famous views (the look up to Bag End, the Party Field, Bagshot Row, Bag End and the view from
// its gate, the Party Tree, the Mill and the bridge) while the afternoon turns to dusk. It ends at
// the Green Dragon after dark, watching Gandalf's fireworks over the water, and goes in to the fire.
//
// Two lengths: the full tour, and a short one that skips the Party Field and cuts past the longer
// walks. Pressing a key, clicking, or leaving the window pauses it; from the pause you can carry
// on, start again, or walk on by yourself from wherever you are.

import { route, along } from './Route.js';
import { heightAt, surfaceAt, WATER_Y } from '../world/Layout.js';
import { EYE } from '../player/Player.js';

const groundAt = (x, z) => Math.max(heightAt(x, z), surfaceAt(x, z));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// The stops. `at` is where you stand, `look` what you look at ([x, z] and a height above the
// ground there, or [x, y, z] absolute), `hold` seconds [full, short], `hour` the time of day on
// arrival. `pan` sweeps the view (radians) while you stand there; `fov` pushes in.
const STOPS = [
  {
    at: [116, -87], look: [30, -75, 2], hold: [5, 3.5], hour: 16.7, pan: 0.3,
    title: 'Hobbiton', line: 'Out of the cutting, the village opens up across the hillside.',
  },
  {
    at: [59, -50], look: [-60, -100, 3], hold: [6, 4], hour: 16.9, pan: 0.15,
    title: 'The lane up to Bag End', line: 'Between two grassy banks, up the Hill to the oak — the view from the films.',
  },
  {
    at: [12, -66], look: [-2, -75, 2], hold: [7, 0], hour: 17.1, pan: 0.5, only: 'full',
    title: 'The Party Field', line: 'Laid out for Bilbo’s eleventy-first birthday: the pavilion, the dance ring and the bandstand.',
  },
  {
    at: [-11.4, -54.5], look: [-10.54, -60.47, 1.0], hold: [6, 4], hour: 17.3, pan: 0.5,
    title: 'Bagshot Row', line: 'Sam Gamgee’s yellow door, below the Hill.',
  },
  {
    at: [-54.5, -96.5], look: [-65.86, -103.82, 1.0], hold: [7, 5], hour: 17.55, pan: 0.1, fov: 52,
    title: 'Bag End', line: 'Bilbo’s hole under the Hill. No admittance except on party business.',
  },
  {
    at: [-57, -97], look: [27, -44, 4], hold: [7, 5], hour: 17.75, pan: 0.35,
    title: 'The view from Bag End', line: 'Over the Party Field and the Party Tree to the Bywater and the Green Dragon.',
    next: { cut: 'short' },
  },
  {
    at: [21, -30.5], look: [67, 138, 6], hold: [6, 4], hour: 18.85, pan: 0.3,
    title: 'The Party Tree', line: 'The great pine above the water, hung with lanterns for the party.',
    // The walk on from here is the long way round the lake.
    next: { title: 'The Merry Meander', line: 'Round the Bywater by the lakeside path, to the Mill.', cut: 'short' },
  },
  {
    at: [4, 119], look: [60, 128, 3], hold: [6, 4], hour: 19.4, pan: 0.35,
    title: 'The Mill and the bridge', line: 'Sandyman’s Mill turns on the Mill Run, and the double-arched bridge leads to the inn.',
  },
  {
    at: [48, 122], look: [24, 40, 22], hold: [46, 32], hour: 20.3, pan: 0.2, finale: true,
    title: 'The Green Dragon', line: 'Night falls, and Gandalf’s fireworks go up over the water.',
  },
];
// Inside to the fire: through the open door off the lane, to stand before the hearth.
const INN = { door: [75.1, 128.2], inside: [73.5, 132.8], hearth: [74.8, 136.1] };

// The opening glide: down from high over the lake to the mouth of Gandalf's Cutting.
const LAND = [161.5, -109.6];
const AERIAL = {
  pts: [[40, 78, 175], [118, 52, 60], [182, 26, -40], [176, 6, -112], null],
  looks: [[-20, 8, -60], [-10, 6, -70], [120, 4, -95], [150, 3, -97], null],
};
const SPEED = { full: 2.8, short: 3.0 }; // walking, m/s
const RAMP = 2.2; // seconds to get up to walking speed, and to slow to a stop
// The light is set per stop, not by a running clock: warm afternoon sun on Bag End's door (it's in
// the Hill's shadow by six), long shadows from its gate, sunset behind the Party Tree, dusk at the
// Mill, and night by the time you reach the Green Dragon.
const START_HOUR = 16.4;

export class Tour {
  constructor(app) {
    this.app = app;
    this.state = 'off'; // 'off' | 'playing' | 'paused' | 'ended'
    this.el = {
      root: document.getElementById('tour'),
      step: document.getElementById('tour-step'),
      title: document.getElementById('tour-title'),
      line: document.getElementById('tour-line'),
      caption: document.getElementById('tour-caption'),
      progress: document.getElementById('tour-progress'),
      fade: document.getElementById('tour-fade'),
      menu: document.getElementById('tour-menu'),
      menuEyebrow: document.getElementById('tour-menu-eyebrow'),
      menuTitle: document.getElementById('tour-menu-title'),
      menuLine: document.getElementById('tour-menu-line'),
      resume: document.getElementById('tour-resume'),
      restart: document.getElementById('tour-restart'),
      walk: document.getElementById('tour-walk'),
    };
    this.el.resume.addEventListener('click', () => this.resume());
    this.el.restart.addEventListener('click', () => this.start(this.kind));
    this.el.walk.addEventListener('click', () => this.exit(true));

    // Anything you do pauses it.
    const pauseKeys = (e) => {
      if (this.state !== 'playing' || ['KeyM', 'Backquote', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight', 'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight'].includes(e.code)) return;
      if (e.code === 'Space') e.preventDefault();
      this.pause();
    };
    addEventListener('keydown', pauseKeys);
    app.renderer.domElement.addEventListener('pointerdown', () => { if (this.state === 'playing') this.pause(); });
    addEventListener('blur', () => { if (this.state === 'playing' && !app.settings.shot) this.pause(); });
  }

  get active() {
    return this.state !== 'off';
  }

  // ---------------------------------------------------------------------------------------------

  /** Lay out the whole tour as a list of timed segments. */
  _plan(kind) {
    const full = kind === 'full', speed = SPEED[kind];
    const segs = [];
    let t = 0;
    const push = (s) => { s.t0 = t; t += s.dur; segs.push(s); return s; };

    const stops = STOPS.filter((s) => full || s.only !== 'full');
    // The glide in.
    const landing = route(LAND, stops[0].at);
    const ahead = along(landing, 8);
    const pts = AERIAL.pts.slice(0, -1).concat([[LAND[0], groundAt(...LAND) + EYE, LAND[1]]]);
    const looks = AERIAL.looks.slice(0, -1).concat([[ahead[0], groundAt(...ahead) + EYE * 0.9, ahead[1]]]);
    push({ type: 'fly', dur: full ? 22 : 15, pts, looks, hour0: START_HOUR, hour1: 16.6, line: { title: 'Gandalf’s Cutting', line: 'The way in: over the Bywater and down into the lane through the hill.' } });

    let from = LAND, hour = 16.6, prevStop = null;
    stops.forEach((s, i) => {
      const cut = prevStop?.next?.cut === kind || prevStop?.next?.cut === true;
      if (cut) {
        push({ type: 'cut', dur: 1.8, hour0: hour, hour1: s.hour, to: s });
      } else {
        const r = i === 0 ? landing : route(from, s.at);
        push({ type: 'walk', dur: this._walkTime(r.length, speed), r, speed, hour0: hour, hour1: s.hour, to: s, from: prevStop, caption: prevStop?.next?.line && !cut ? { title: prevStop.next.title, line: prevStop.next.line } : null });
      }
      push({ type: 'hold', dur: s.hold[full ? 0 : 1], stop: s, index: i, count: stops.length, hour0: s.hour, hour1: s.finale ? s.hour + 0.45 : s.hour + 0.02 });
      hour = s.finale ? s.hour + 0.45 : s.hour + 0.02;
      from = s.at;
      prevStop = s;
    });
    // In to the fire.
    const r = route(from, INN.door);
    const inside = { pts: [...r.pts], length: r.length };
    for (const p of [INN.inside, [INN.inside[0] + (INN.hearth[0] - INN.inside[0]) * 0.1, INN.inside[1] + (INN.hearth[1] - INN.inside[1]) * 0.1]]) {
      const last = inside.pts[inside.pts.length - 1];
      const d = Math.hypot(p[0] - last[0], p[1] - last[1]), n = Math.max(1, Math.round(d / 0.5));
      for (let k = 1; k <= n; k++) inside.pts.push([last[0] + ((p[0] - last[0]) * k) / n, last[1] + ((p[1] - last[1]) * k) / n]);
      inside.length += d;
    }
    const hearth = { at: inside.pts[inside.pts.length - 1], look: [INN.hearth[0], INN.hearth[1], 0.8], pan: 0.15, hold: [6, 5], title: 'By the fire', line: '' };
    push({ type: 'walk', dur: this._walkTime(inside.length, speed * 0.8), r: inside, speed: speed * 0.8, hour0: hour, hour1: hour + 0.05, to: hearth, from: prevStop });
    push({ type: 'hold', dur: hearth.hold[full ? 0 : 1], stop: hearth, hour0: hour + 0.05, hour1: hour + 0.1, last: true });
    return { segs, total: t };
  }

  /** Time to walk `len` m at `v` m/s, easing in and out over a second or so. */
  _walkTime(len, v) {
    const ramp = RAMP, dRamp = v * ramp * 0.5;
    return len < dRamp * 2 ? 2 * Math.sqrt(len / (v / ramp)) : ramp * 2 + (len - dRamp * 2) / v;
  }

  /** Distance walked `t` s into a walk of `len` m at `v` m/s. */
  _walkDist(t, len, v, dur) {
    const ramp = RAMP, a = v / ramp;
    if (len < v * ramp) {
      const h = dur / 2;
      return t < h ? 0.5 * a * t * t : len - 0.5 * a * (dur - t) ** 2;
    }
    if (t < ramp) return 0.5 * a * t * t;
    if (t > dur - ramp) return len - 0.5 * a * (dur - t) ** 2;
    return v * ramp * 0.5 + v * (t - ramp);
  }

  // ---------------------------------------------------------------------------------------------

  start(kind = 'full') {
    const app = this.app, s = app.settings;
    if (this.state === 'off') s.tourBackup = { weather: s.weather, timeSpeed: s.timeSpeed };
    s.weather = 'clear';
    s.timeSpeed = 0;
    this.kind = kind;
    this.plan = this._plan(kind);
    this.t = 0;
    this.fireworksFired = false;
    this.yaw = null;
    this.camY = null;
    this.fov = s.fov;
    this.fovV = 0;
    this.state = 'playing';
    app.input.blockLock = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.el.root.hidden = false;
    this.el.menu.hidden = true;
    this._fade(1, 0);
    this._fade(0, 1.4);
    this.captionKey = null;
    app.hud.refresh();
    app.audio.resume();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this._menu('Tour paused', this.current?.title || 'The tour', 'Carry on where you left off, start again, or walk on from here by yourself.', true);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.el.menu.hidden = true;
    this.el.root.hidden = false;
    this.app.hud.refresh();
  }

  /** Leave the tour. With `walk`, carry on on foot from where the camera is. */
  exit(walk) {
    const app = this.app, s = app.settings, p = app.player;
    if (s.tourBackup) {
      Object.assign(s, s.tourBackup);
      delete s.tourBackup;
      s.save();
    }
    // (Mid-glide, you land where the glide would have: at the mouth of the cutting.)
    const flying = this.seg?.type === 'fly';
    const [x, z] = flying ? LAND : [app.camera.position.x, app.camera.position.z];
    p.fly = false;
    p.setPose(x, undefined, z, this.yaw ?? p.yaw, flying ? 0 : this.pitch ?? 0);
    app.applyQuality();
    this.state = 'off';
    this.el.root.hidden = true;
    this.el.menu.hidden = true;
    this._fade(0, 0.3);
    app.input.blockLock = false;
    if (walk) {
      app.hud.started = true;
      app.audio.resume();
      app.renderer.domElement.requestPointerLock?.()?.catch?.(() => {});
    }
    app.hud.refresh();
  }

  _menu(eyebrow, title, line, canResume) {
    const el = this.el;
    el.menuEyebrow.textContent = eyebrow;
    el.menuTitle.textContent = title;
    el.menuLine.textContent = line;
    el.resume.hidden = !canResume;
    el.restart.textContent = canResume ? 'Start again' : 'Take the tour again';
    el.walk.classList.toggle('primary', !canResume);
    el.menu.hidden = false;
    el.root.hidden = true; // the caption and hint give way to the menu
  }

  _fade(to, seconds) {
    const f = this.el.fade;
    f.style.transition = seconds ? `opacity ${seconds}s ease` : 'none';
    f.style.opacity = String(to);
    if (!seconds) void f.offsetWidth; // so a fade straight after starts from here
  }

  /** Jump to `t` seconds in (for screenshots). */
  seek(t) {
    this.t = t;
    this.yaw = null;
    this.camY = null;
  }

  // ---------------------------------------------------------------------------------------------

  update(dt) {
    if (this.state === 'off') return;
    const app = this.app, s = app.settings;
    if (this.state === 'playing') this.t += dt;
    const { segs, total } = this.plan;
    if (this.t >= total && this.state === 'playing') {
      this.state = 'ended';
      this._menu('The end of the tour', 'The Green Dragon', 'Stay a while by the fire, or head back out into the night.', false);
    }
    const t = Math.min(this.t, total - 1e-3);
    let seg = segs[0];
    for (const g of segs) if (t >= g.t0) seg = g;
    this.seg = seg;
    const u = (t - seg.t0) / seg.dur;
    s.time = lerp(seg.hour0, seg.hour1, clamp(u, 0, 1));

    // `smoothT`: how long the view takes to settle on where it should look (a damped spring, so turns
    // ease in and out rather than snapping round); `maxTurn`: the fastest it turns, rad/s.
    let x, y, z, look, walking = false, speed = 0, flying = false, fov = s.fov, smoothT = 0.9, maxTurn = 0.75;
    if (seg.type === 'fly') {
      const e = smooth(u);
      [x, y, z] = catmull(seg.pts, e);
      look = catmull(seg.looks, e);
      flying = true;
      smoothT = 0.4;
      maxTurn = 2;
    } else if (seg.type === 'walk') {
      const r = seg.r, d = this._walkDist(t - seg.t0, r.length, seg.speed, seg.dur);
      [x, z] = along(r, d);
      // Look well down the path (a few points averaged, so bends are taken gently)...
      const ahead = [0, 0, 0];
      for (const a of [5, 9, 13]) {
        const [ax, az] = along(r, Math.min(r.length, d + a));
        ahead[0] += ax / 3; ahead[1] += (groundAt(ax, az) + EYE * 0.85) / 3; ahead[2] += az / 3;
      }
      // ...easing away from the last stop's view as you set off, and toward the next one's as you
      // come up to it.
      look = ahead;
      if (seg.from) look = mixLook(this._stopLook(seg.from, 1), look, smooth(d / 10));
      look = mixLook(look, this._stopLook(seg.to, 0), smooth((d - (r.length - 14)) / 12));
      const dd = 0.2, [bx, bz] = along(r, Math.min(r.length, d + dd));
      speed = Math.min(seg.speed, (this._walkDist(Math.min(seg.dur, t - seg.t0 + 0.05), r.length, seg.speed, seg.dur) - d) / 0.05);
      this._vel = [(bx - x) / dd * speed, (bz - z) / dd * speed];
      walking = true;
    } else if (seg.type === 'cut') {
      // Fade out where you are, fade in at the next stop.
      if (u < 0.5) { x = this.lastX; z = this.lastZ; look = this.lastLook; }
      else { [x, z] = seg.to.at; look = this._stopLook(seg.to, 0); }
      if (!this.cutting) { this._fade(1, seg.dur * 0.45); this.cutting = seg; }
      if (u >= 0.5 && this.cutting === seg && !this.cutIn) { this._fade(0, seg.dur * 0.45); this.cutIn = true; this.yaw = null; this.camY = null; }
    } else {
      const st = seg.stop;
      [x, z] = st.at;
      // A slow sweep across the view, and a gentle push in where there's something to look closer at.
      look = this._stopLook(st, u);
      if (st.fov) fov = lerp(s.fov, st.fov, smooth(u * 1.4));
      if (st.finale && !this.fireworksFired && t - seg.t0 > 1.5) {
        this.fireworksFired = true;
        app.fireworks.start();
      }
      if (seg.last && u > 0.75 && this.state === 'playing') this._fade(0.55, 2);
      smoothT = 1.1;
      maxTurn = 0.6;
      if (this.captionKey !== seg) this._caption(st.title, st.line, seg.index !== undefined ? `Stop ${seg.index + 1} of ${seg.count}` : 'The Green Dragon');
      this.captionKey = seg;
    }
    if (seg.type !== 'cut') { this.cutting = null; this.cutIn = false; }
    if (seg.type === 'walk' && seg.caption && this.captionKey !== seg) { this._caption(seg.caption.title, seg.caption.line, 'On the way'); this.captionKey = seg; }
    if (seg.type === 'fly' && this.captionKey !== seg) { this._caption(seg.line.title, seg.line.line, 'Welcome to the Shire'); this.captionKey = seg; }
    if (seg.type === 'walk' && !seg.caption && this.captionKey?.type === 'hold' && t - seg.t0 > 2.5) this._hideCaption();
    this.lastX = x; this.lastZ = z; this.lastLook = look;

    // Where the eye is: on the ground at a hobbit's height when walking, gently smoothed over steps.
    const ground = groundAt(x, z);
    if (!flying) y = ground + EYE;
    if (this.camY === null || flying) this.camY = y;
    else this.camY += (y - this.camY) * (1 - Math.exp(-dt * 6));
    const p = app.player;
    if (walking) p.bob += speed * dt * 1.25;
    const camY = this.camY + (walking ? Math.sin(p.bob * 2) * 0.012 : 0);

    // Where it looks, turning smoothly.
    const dx = look[0] - x, dy = look[1] - camY, dz = look[2] - z;
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (this.yaw === null) {
      this.yaw = yaw; this.pitch = pitch; this.yawV = 0; this.pitchV = 0;
    } else if (this.state === 'playing') {
      [this.yaw, this.yawV] = damp(this.yaw, this.yaw + wrap(yaw - this.yaw), this.yawV, smoothT, maxTurn, dt);
      this.yaw = wrap(this.yaw);
      [this.pitch, this.pitchV] = damp(this.pitch, pitch, this.pitchV, smoothT, maxTurn * 0.5, dt);
    }
    if (this.state === 'playing') [this.fov, this.fovV] = damp(this.fov, fov, this.fovV || 0, 1.2, 20, dt);

    // Drive the walker, so footsteps, the indoor check and the sounds all follow along.
    p.fly = flying;
    p.pos.set(x, flying ? y : ground, z);
    p.yaw = this.yaw;
    p.pitch = this.pitch;
    p.onGround = !flying;
    p.vel.set(walking ? this._vel[0] : 0, 0, walking ? this._vel[1] : 0);
    const cam = app.camera;
    cam.position.set(x, camY, z);
    cam.rotation.set(this.pitch, this.yaw, 0);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.el.progress.style.transform = `scaleX(${clamp(t / total, 0, 1)})`;
  }

  get current() {
    return this._current;
  }

  /** Where a stop's view points `u` (0..1) of the way through its pan. */
  _stopLook(st, u) {
    const look = this._target(st);
    return st.pan ? panLook(st.at, look, st.pan * (smooth(u) - 0.5)) : look;
  }

  /** What a stop looks at: a point `up` m above the ground (or the water) at [x, z]. */
  _target(st) {
    const [x, z, up] = st.look;
    return [x, Math.max(groundAt(x, z), WATER_Y) + up, z];
  }

  _caption(title, line, step) {
    const el = this.el;
    this._current = { title };
    el.caption.classList.remove('on');
    clearTimeout(this.capTimer);
    this.capTimer = setTimeout(() => {
      el.step.textContent = step;
      el.title.textContent = title;
      el.line.textContent = line;
      el.caption.classList.add('on');
    }, 350);
  }

  _hideCaption() {
    this.el.caption.classList.remove('on');
    this.captionKey = null;
  }
}

/**
 * A critically damped spring toward `target` (as Unity's SmoothDamp): settles in about `time` s,
 * never faster than `max` units/s, with no jolt when the target moves. Returns [value, velocity].
 */
function damp(cur, target, vel, time, max, dt) {
  const w = 2 / time, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const lim = max * time;
  const change = clamp(cur - target, -lim, lim), to = cur - change;
  const tmp = (vel + w * change) * dt;
  const nv = (vel - w * tmp) * e;
  let out = to + (change + tmp) * e;
  if ((target - cur > 0) === (out > target)) return [target, 0];
  return [out, nv];
}

/** Centripetal-ish Catmull-Rom through `pts` (arrays of 3), at 0..1 along them. */
function catmull(pts, s) {
  const n = pts.length - 1, f = clamp(s, 0, 1) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
    out[k] = 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  }
  return out;
}

function mixLook(a, b, w) {
  return [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)];
}

/** Turn a look target about the viewer by `a` radians. */
function panLook([x, z], look, a) {
  const dx = look[0] - x, dz = look[2] - z, c = Math.cos(a), s = Math.sin(a);
  return [x + dx * c + dz * s, look[1], z - dx * s + dz * c];
}
