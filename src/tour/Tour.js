// Tour mode: a guided walk through Hobbiton, like the tour of the set. It opens with a glide over
// the lake down into Gandalf's Cutting, then walks the lanes at a hobbit's eye height, stopping at
// the famous views (the look up to Bag End, the Party Field, Bagshot Row, Bag End and the view from
// its gate, the Party Tree, the Mill and the bridge) while the afternoon turns to dusk. It ends at
// the Green Dragon after dark, watching Gandalf's fireworks over the water, and goes in to the fire.
//
// Two lengths: the full tour, and a short one that skips the Party Field and cuts past the longer
// walks. Pressing a key, clicking, or leaving the window pauses it; from the pause you can carry
// on, start again, or walk on by yourself from wherever you are.

import { route, along, join } from './Route.js';
import { heightAt, surfaceAt, WATER_Y } from '../world/Layout.js';
import { EYE } from '../player/Player.js';

const groundAt = (x, z) => Math.max(heightAt(x, z), surfaceAt(x, z));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// The stops, each ending on a composed frame (checked in renders, with the caption in the bottom
// left in mind). `at` is where you stand; the view ends facing `face` ([x, z]) at `pitch`, having
// turned `pan` radians onto it while you stand there; `fov` pushes in. `hold` is seconds [full,
// short], and `hour` the time of day on arrival: the light is chosen per stop, and the tour spends
// a long while in the sunset and dusk.
const STOPS = [
  {
    at: [108, -83], face: [40, -95], pitch: 0.06, hold: [5, 3.5], hour: 17.0, pan: 0.25,
    title: 'Hobbiton', line: 'Out of the cutting, the lane curves in among the first round doors.',
  },
  {
    at: [16, -57], face: [-3, -79], pitch: 0.14, hold: [7, 4.5], hour: 17.3, pan: -0.3,
    quote: ['When Mr. Bilbo Baggins of Bag End announced that he would shortly be celebrating his eleventy-first birthday with a party of special magnificence, there was much talk and excitement in Hobbiton.', 'The Fellowship of the Ring'],
    title: 'The Party Field', line: 'Laid out for Bilbo’s eleventy-first birthday: the pavilion, the dance ring and the bandstand.',
  },
  {
    at: [-4, -47], face: [-18, -61], pitch: 0.05, hold: [6, 4], hour: 17.5, pan: 0.3,
    quote: ['In a hole in the ground there lived a hobbit.', 'The Hobbit'],
    title: 'Bagshot Row', line: 'Stone steps climb past the round doors and gardens below the Hill.',
  },
  {
    at: [-54.5, -96.5], face: [-65, -103.3], pitch: 0.12, hold: [7, 5], hour: 17.7, pan: 0.12, fov: 56,
    quote: ['It had a perfectly round door like a porthole, painted green, with a shiny yellow brass knob in the exact middle.', 'The Hobbit'],
    title: 'Bag End', line: 'Bilbo’s hole under the Hill. No admittance except on party business.',
  },
  {
    at: [-57, -97], face: [27, -44], pitch: -0.13, hold: [7, 5], hour: 18.35, pan: -0.3,
    title: 'The view from Bag End', line: 'Over the Party Field and the Party Tree to the Bywater and the Green Dragon.',
    next: { cut: 'short' },
  },
  {
    at: [52, -40], face: [-40, 5], pitch: 0.06, hold: [7, 5], hour: 19.2, pan: 0.3,
    quote: ['…for they love peace and quiet and good tilled earth: a well-ordered and well-farmed countryside was their favourite haunt.', 'The Fellowship of the Ring'],
    title: 'The Party Tree', line: 'The great pine above the water, hung with lanterns, as the sun goes down.',
    // The walk on from here is the long way round the lake.
    next: { title: 'The Merry Meander', line: 'Round the Bywater by the lakeside path, to the Mill.', cut: 'short', via: [-20, -25] },
  },
  {
    at: [4, 119], face: [60, 125], pitch: 0.06, hold: [7, 5], hour: 19.55, pan: 0.3,
    quote: ['The Road goes ever on and on / Down from the door where it began.', 'The Fellowship of the Ring'], quoteOnWalk: true,
    title: 'The Mill and the bridge', line: 'Sandyman’s Mill turns on the Mill Run, and the double-arched bridge leads to the inn.',
  },
  {
    at: [48, 122], face: [24, 40], pitch: 0.2, hold: [38, 28], hour: 20.05, hourEnd: 20.45, pan: 0.2, finale: true,
    quote: ['There were rockets like a flight of scintillating birds singing with sweet voices.', 'The Fellowship of the Ring'],
    title: 'The Green Dragon', line: 'Dusk turns to night, and Gandalf’s fireworks go up over the water.',
  },
];
const QUOTE_TIME = 8, QUOTE_LEAD = 3.5; // seconds a quote is up, and how long before arriving it comes
const FIREWORKS_AFTER = 2.5; // seconds after reaching the Green Dragon, the first rockets go up
// Inside to the fire: through the open door off the lane, to stand before the hearth.
const INN = {
  door: [75.1, 128.2],
  // Through the main door, and across the hall between the tables.
  walk: [[73.5, 132.8], [70.5, 134.4], [66.5, 137.4], [64, 138.5]],
  stop: {
    at: [64, 138.5], face: [74.8, 136.1], pitch: 0.0, pan: -0.9, hold: [8, 6],
    title: 'The Green Dragon', line: 'Inside, the fire is lit, the chandeliers are burning, and there’s a table waiting.',
  },
};
// The last shot: Hobbiton by night from above the Party Tree, its lanterns in the foreground.
const FINALE = {
  pts: [[45, 17.4, -43], [50, 19.9, -46]], looks: [[-5, 2, -110], [-5, 2, -110]], hour: 21.3, land: [52, -40],
  step: 'The end of the tour', title: 'Goodnight, Hobbiton', line: 'The lamps are lit, and the Shire settles in for the night.',
};

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
      quote: document.getElementById('tour-quote'),
      quoteText: document.getElementById('tour-quote-text'),
      quoteSource: document.getElementById('tour-quote-source'),
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

    const stops = STOPS;
    // The glide in.
    const landing = route(LAND, stops[0].at);
    const ahead = along(landing, 8);
    const pts = AERIAL.pts.slice(0, -1).concat([[LAND[0], groundAt(...LAND) + EYE, LAND[1]]]);
    const looks = AERIAL.looks.slice(0, -1).concat([[ahead[0], groundAt(...ahead) + EYE * 0.9, ahead[1]]]);
    push({ type: 'fly', dur: full ? 22 : 15, pts, looks, hour0: START_HOUR, hour1: 16.6, line: { title: 'Gandalf’s Cutting', line: 'The way in: over the Bywater and down into the lane through the hill.' } });

    let from = LAND, hour = 16.6, prevStop = null;
    stops.forEach((s, i) => {
      const via = prevStop?.next?.via;
      const cut = prevStop?.next?.cut === kind || prevStop?.next?.cut === true;
      if (cut) {
        push({ type: 'cut', dur: 1.8, hour0: hour, hour1: s.hour, to: s });
      } else {
        const r = i === 0 ? landing : via ? join(route(from, via), route(via, s.at)) : route(from, s.at);
        push({ type: 'walk', dur: this._walkTime(r.length, speed), r, speed, hour0: hour, hour1: s.hour, to: s, from: prevStop, caption: prevStop?.next?.line && !cut ? { title: prevStop.next.title, line: prevStop.next.line } : null });
      }
      push({ type: 'hold', dur: s.hold[full ? 0 : 1], stop: s, index: i, count: stops.length, hour0: s.hour, hour1: s.hourEnd ?? s.hour + 0.02 });
      hour = s.hourEnd ?? s.hour + 0.02;
      from = s.at;
      prevStop = s;
    });
    // In through the door, across the common room, and round to the fire.
    const r = route(from, INN.door);
    const inside = { pts: [...r.pts], length: r.length };
    for (const p of INN.walk) {
      const last = inside.pts[inside.pts.length - 1];
      const d = Math.hypot(p[0] - last[0], p[1] - last[1]), n = Math.max(1, Math.round(d / 0.5));
      for (let k = 1; k <= n; k++) inside.pts.push([last[0] + ((p[0] - last[0]) * k) / n, last[1] + ((p[1] - last[1]) * k) / n]);
      inside.length += d;
    }
    push({ type: 'walk', dur: this._walkTime(inside.length, speed * 0.75), r: inside, speed: speed * 0.75, hour0: hour, hour1: hour + 0.05, to: INN.stop, from: prevStop });
    push({ type: 'hold', dur: INN.stop.hold[full ? 0 : 1], stop: INN.stop, hour0: hour + 0.05, hour1: hour + 0.1 });
    // And a last look over Hobbiton by night, from above the Party Tree, drifting slowly back.
    const fin = { type: 'fly', dur: full ? 18 : 15, pts: FINALE.pts, looks: FINALE.looks, hour0: FINALE.hour, hour1: FINALE.hour + 0.05, line: FINALE, final: true, land: FINALE.land, linear: true };
    push({ type: 'cut', dur: 2.4, hour0: hour + 0.1, hour1: FINALE.hour, pose: fin });
    push(fin);
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
    this._quote(null);
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
    const flying = this.seg?.type === 'fly' || !!this.seg?.pose;
    const [x, z] = flying ? (this.seg.land || this.seg.pose?.land || LAND) : [app.camera.position.x, app.camera.position.z];
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
    this.app.sky.resetHistory();
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
      this._menu('The end of the tour', 'Goodnight, Hobbiton', 'Walk on through the lamplit lanes, or take the tour again.', false);
    }
    const t = Math.min(this.t, total - 1e-3);
    let seg = segs[0];
    for (const g of segs) if (t >= g.t0) seg = g;
    this.seg = seg;
    const u = (t - seg.t0) / seg.dur;
    s.time = seg.type === 'cut' ? (u < 0.5 ? seg.hour0 : seg.hour1) : lerp(seg.hour0, seg.hour1, clamp(u, 0, 1));

    // `smoothT`: how long the view takes to settle on where it should look (a damped spring, so turns
    // ease in and out rather than snapping round); `maxTurn`: the fastest it turns, rad/s.
    let x, y, z, look, walking = false, speed = 0, flying = false, fov = s.fov, smoothT = 0.9, maxTurn = 0.75;
    if (seg.type === 'fly') {
      const e = seg.linear ? u : smooth(u);
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
        ahead[0] += ax / 3; ahead[1] += (groundAt(ax, az) + EYE) / 3; ahead[2] += az / 3;
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
      else if (seg.pose) { [x, y, z] = seg.pose.pts[0]; look = seg.pose.looks[0]; flying = true; }
      else { [x, z] = seg.to.at; look = this._stopLook(seg.to, 0); }
      if (u < 0.5 && this.captionKey) this._hideCaption();
      if (!this.cutting) { this._fade(1, seg.dur * 0.45); this.cutting = seg; }
      if (u >= 0.5 && this.cutting === seg && !this.cutIn) { this._fade(0, seg.dur * 0.45); this.cutIn = true; this.yaw = null; this.camY = null; app.sky.resetHistory(); }
    } else {
      const st = seg.stop;
      [x, z] = st.at;
      // A slow sweep across the view, and a gentle push in where there's something to look closer at.
      look = this._stopLook(st, u);
      if (st.fov) fov = lerp(s.fov, st.fov, smooth(u * 1.4));
      if (st.finale && !this.fireworksFired && t - seg.t0 >= FIREWORKS_AFTER) {
        this.fireworksFired = t;
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
    if (seg.type === 'fly' && this.captionKey !== seg && (!seg.final || u > 0.12)) { this._caption(seg.line.title, seg.line.line, seg.line.step || 'Welcome to the Shire'); this.captionKey = seg; }
    if (seg.type === 'walk' && !seg.caption && this.captionKey?.type === 'hold' && t - seg.t0 > 2.5) this._hideCaption();
    // Tolkien's words, briefly: as you come up to the place they describe (or a little way into a
    // walk they belong to), and once the fireworks are up.
    let quote = null;
    if (seg.type === 'walk' && seg.to.quote) {
      const q = seg.to, left = seg.t0 + seg.dur - t, into = t - seg.t0;
      if (q.quoteOnWalk ? into > 2 && into < 2 + QUOTE_TIME : left < QUOTE_LEAD && !q.finale) quote = q.quote;
    }
    if (seg.type === 'hold' && seg.stop.quote && !seg.stop.quoteOnWalk) {
      const st = seg.stop, into = t - seg.t0;
      if (!st.finale && into < QUOTE_TIME - QUOTE_LEAD) quote = st.quote;
      if (st.finale && this.fireworksFired && t - this.fireworksFired > 3 && t - this.fireworksFired < 3 + QUOTE_TIME) quote = st.quote;
    }
    this._quote(quote);
    this.lastX = x; this.lastZ = z; this.lastLook = look;

    // Where the eye is: on the ground at a hobbit's height when walking, gently smoothed over steps.
    const ground = groundAt(x, z);
    if (!flying) y = ground + EYE;
    if (this.camY === null || flying) this.camY = y;
    // (Quick to rise, so climbing a flight of steps never sinks the eye into them; gentle going down.)
    else this.camY += (y - this.camY) * (1 - Math.exp(-dt * (y > this.camY ? 18 : 6)));
    const p = app.player;
    if (walking) p.bob += speed * dt * 1.25;
    const camY = this.camY + (walking ? Math.sin(p.bob * 2) * 0.012 : 0);

    // Where it looks, turning smoothly.
    const dx = look[0] - x, dy = look[1] - camY, dz = look[2] - z;
    const yaw = Math.atan2(-dx, -dz);
    // On the move, keep the eyes up: never looking down at your feet or up at the sky.
    let pitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (walking) pitch = clamp(pitch, -0.12, 0.5); // (enough to look up a flight of steps)
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

  /** Where a stop's view points `u` (0..1) of the way through its pan: onto its composed frame. */
  _stopLook(st, u) {
    const [x, z] = st.at, y = groundAt(x, z) + EYE, D = 60;
    if (!st.face) {
      const look = this._target(st);
      return st.pan ? panLook(st.at, look, st.pan * (smooth(u) - 1)) : look;
    }
    const yaw = Math.atan2(x - st.face[0], z - st.face[1]) + (st.pan || 0) * (1 - smooth(u));
    return [x - Math.sin(yaw) * D, y + Math.tan(st.pitch) * D, z - Math.cos(yaw) * D];
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

  _quote(q) {
    if (q === this.quoteShown) return;
    this.quoteShown = q;
    const el = this.el;
    el.quote.classList.remove('on');
    clearTimeout(this.quoteTimer);
    if (!q) return;
    this.quoteTimer = setTimeout(() => {
      el.quoteText.textContent = `“${q[0]}”`;
      el.quoteSource.textContent = `J.R.R. Tolkien, ${q[1]}`;
      el.quote.classList.add('on');
    }, 900);
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
