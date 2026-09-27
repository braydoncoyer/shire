// Ambient sound, synthesized with Web Audio (no recordings are downloaded, like everything else
// here). Rain, wind in the grass and leaves, birdsong by day with a dawn chorus, crickets and the odd owl
// at night, lapping water by the lake, the stream and the mill wheel, the fire in the Green
// Dragon's hearth, and footsteps that change with the ground underfoot. Outdoor sounds pass through
// a filter that muffles them indoors.
//
// Browsers only allow sound after a click, so the audio graph is built on the first click (resume).

import { lakeDist, streamMask, laneMask, surfaceAt, BRIDGE } from '../world/Layout.js';
import { weatherU } from '../sky/Weather.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rand = (a, b) => a + Math.random() * (b - a);

export class Ambience {
  constructor(app) {
    this.app = app;
    this.ctx = null;
    this.gust = 0.5;
    this.gustTarget = 0.5;
    this.gustTimer = 0;
    this.probeTimer = 0;
    this.near = { lake: 99, stream: 99, mill: 99, hearth: 99 };
    this.stepPhase = 0;
    this.wasOnGround = true;
    this.crickets = Array.from({ length: 6 }, () => ({ next: rand(0, 2), f: rand(4100, 4900), period: rand(0.5, 1.1), pan: rand(-0.9, 0.9), gain: rand(0.25, 1) }));
    this.nextBird = 1;
    this.nextOwl = rand(20, 50);
  }

  /** Start (or unpause) the sound; call from a click. */
  resume() {
    if (this.app.settings.shot) return;
    if (!this.ctx) {
      try {
        this._build();
      } catch (e) {
        console.warn('Audio unavailable', e);
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _noise(seconds, brown) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else d[i] = w;
      }
    }
    return buf;
  }

  _loop(buf, ...chain) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    let node = src;
    for (const c of chain) {
      node.connect(c);
      node = c;
    }
    src.start(0, Math.random() * buf.duration);
    return node;
  }

  _filter(type, frequency, Q = 0.7) {
    return new BiquadFilterNode(this.ctx, { type, frequency, Q });
  }

  _gain(v = 0) {
    return new GainNode(this.ctx, { gain: v });
  }

  _build() {
    const ctx = (this.ctx = new AudioContext());
    this.white = this._noise(4, false);
    this.brown = this._noise(6, true);

    this.master = this._gain(0);
    const comp = new DynamicsCompressorNode(ctx, { threshold: -14, knee: 12, ratio: 3, attack: 0.01, release: 0.3 });
    this.master.connect(comp).connect(ctx.destination);
    // Outdoor sounds are muffled by walls when you're in the inn.
    this.outdoor = this._gain(1);
    this.muffle = this._filter('lowpass', 18000, 0.5);
    this.outdoor.connect(this.muffle).connect(this.master);

    // Wind: a low roar that rises and falls with the gusts, and a rustle of leaves and grass on top.
    this.windLow = this._gain(0);
    this.windLowF = this._filter('lowpass', 400, 0.6);
    this._loop(this.brown, this.windLowF, this.windLow).connect(this.outdoor);
    this.rustle = this._gain(0);
    this.rustleF = this._filter('bandpass', 3200, 0.5);
    this._loop(this.white, this._filter('highpass', 1200), this.rustleF, this.rustle).connect(this.outdoor);

    // Water: gentle lapping at the lake shore, and running water along the stream and at the mill.
    this.lap = this._gain(0);
    this.lapF = this._filter('bandpass', 500, 0.9);
    this._loop(this.brown, this.lapF, this.lap).connect(this.outdoor);
    this.run = this._gain(0);
    this._loop(this.white, this._filter('highpass', 350), this._filter('lowpass', 2600), this.run).connect(this.outdoor);

    // The hearth: a low flutter of flame; crackles are scheduled in update.
    this.fire = this._gain(0);
    this._loop(this.brown, this._filter('lowpass', 220), this.fire).connect(this.master);
    this.crackleBus = this._gain(0);
    this.crackleBus.connect(this.master);

    // Rain: a broad hiss outside, and a low drumming on the roof that carries indoors.
    this.rainHiss = this._gain(0);
    this._loop(this.white, this._filter('highpass', 900), this._filter('lowpass', 7500), this.rainHiss).connect(this.outdoor);
    this.rainRoof = this._gain(0);
    this._loop(this.brown, this._filter('lowpass', 420), this.rainRoof).connect(this.master);

    this.birdBus = this._gain(0.9);
    this.birdBus.connect(this.outdoor);
    this.nightBus = this._gain(0);
    this.nightBus.connect(this.outdoor);
    this.stepBus = this._gain(0.55);
    this.stepBus.connect(this.master);
  }

  // --- one-shot sounds -------------------------------------------------------------------------

  /** A short burst of noise through a filter, with a quick attack and decay. */
  _burst(t, { dest, type = 'bandpass', f = 2000, Q = 0.8, dur = 0.08, gain = 0.3, attack = 0.004, pan = 0, brown = false }) {
    const ctx = this.ctx;
    const src = new AudioBufferSourceNode(ctx, { buffer: brown ? this.brown : this.white });
    const flt = this._filter(type, f, Q);
    const g = this._gain(0);
    const p = new StereoPannerNode(ctx, { pan });
    src.connect(flt).connect(g).connect(p).connect(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t + attack + dur);
    src.start(t, Math.random() * 3, attack + dur + 0.05);
  }

  /** One sung note: a sine gliding between pitches, with its own envelope. */
  _note(t, dest, { f0, f1, dur, gain, vib = 0, type = 'sine' }) {
    const ctx = this.ctx;
    const o = new OscillatorNode(ctx, { type, frequency: f0 });
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (vib) {
      const lfo = new OscillatorNode(ctx, { frequency: rand(18, 34) });
      const lg = this._gain(f0 * vib);
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    const g = this._gain(0);
    o.connect(g).connect(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.015, dur * 0.3));
    g.gain.setValueAtTime(gain, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A bird somewhere nearby sings one phrase. */
  _bird(t) {
    const ctx = this.ctx;
    const pan = new StereoPannerNode(ctx, { pan: rand(-0.95, 0.95) });
    const far = rand(0.15, 1);
    const tone = this._filter('lowpass', 3000 + far * 6000);
    const out = this._gain(0.11 * far);
    out.connect(tone).connect(pan).connect(this.birdBus);
    const kind = Math.random();
    if (kind < 0.35) {
      // A blackbird's fluting: a few slow, gliding whistles.
      const base = rand(1500, 2300);
      for (let i = 0, n = 3 + (Math.random() * 5) | 0; i < n; i++) {
        const d = rand(0.08, 0.24);
        this._note(t, out, { f0: base * rand(0.8, 1.35), f1: base * rand(0.8, 1.4), dur: d, gain: 1, vib: 0.01 });
        t += d + rand(0.03, 0.12);
      }
    } else if (kind < 0.65) {
      // Sparrow chatter: quick down-swept chirps.
      const top = rand(4200, 6000);
      for (let i = 0, n = 5 + (Math.random() * 8) | 0; i < n; i++) {
        const d = rand(0.03, 0.06);
        this._note(t, out, { f0: top, f1: top * rand(0.5, 0.7), dur: d, gain: 0.8 });
        t += d + rand(0.04, 0.09);
      }
    } else if (kind < 0.85) {
      // A wren-like trill: one bright warbling note held.
      const f = rand(3800, 5200);
      this._note(t, out, { f0: f, f1: f * rand(0.9, 1.1), dur: rand(0.6, 1.4), gain: 0.55, vib: 0.06 });
    } else {
      // A wood pigeon in the distance: coo-COO-coo, coo-coo.
      out.gain.value = 0.16 * far;
      const f = rand(460, 560);
      const pattern = [[0.3, 0.7], [0.55, 1], [0.3, 0.8], [0.35, 0.6], [0.45, 0.7]];
      for (const [d, g] of pattern) {
        this._note(t, out, { f0: f * 1.02, f1: f * 0.94, dur: d, gain: g, type: 'triangle' });
        t += d + 0.12;
      }
    }
  }

  _cricketChirp(t, c) {
    const pan = new StereoPannerNode(this.ctx, { pan: c.pan });
    const g = this._gain(0.035 * c.gain);
    g.connect(pan).connect(this.nightBus);
    for (let k = 0; k < 3; k++) this._note(t + k * 0.032, g, { f0: c.f, f1: c.f * 0.995, dur: 0.02, gain: 1 });
  }

  _owl(t) {
    const pan = new StereoPannerNode(this.ctx, { pan: rand(-0.8, 0.8) });
    const g = this._gain(0.09);
    g.connect(this._filter('lowpass', 900)).connect(pan).connect(this.nightBus);
    // A tawny owl: a hoot, a pause, then a long wavering hoo-oo-oo.
    this._note(t, g, { f0: 420, f1: 380, dur: 0.45, gain: 1, type: 'triangle' });
    this._note(t + 1.4, g, { f0: 400, f1: 360, dur: 1.1, gain: 0.9, type: 'triangle', vib: 0.02 });
  }

  _step(t, surface, hard) {
    const pan = (this.stepSide = -(this.stepSide || 0.12)) * 1;
    const k = hard ? 1.8 : 1;
    const dest = this.stepBus;
    if (surface === 'gravel') {
      // Crunch: a scatter of tiny grains.
      for (let i = 0; i < 5; i++) this._burst(t + rand(0, 0.07), { dest, f: rand(2500, 5000), Q: 1.4, dur: rand(0.012, 0.03), gain: 0.22 * k, pan });
      this._burst(t, { dest, type: 'lowpass', f: 500, dur: 0.06, gain: 0.25 * k, pan, brown: true });
    } else if (surface === 'stone') {
      this._burst(t, { dest, type: 'lowpass', f: 700, dur: 0.05, gain: 0.5 * k, pan, brown: true });
      this._burst(t + 0.008, { dest, f: 2800, Q: 2, dur: 0.02, gain: 0.08 * k, pan });
    } else {
      // Grass: a soft swish.
      this._burst(t, { dest, f: rand(1600, 2400), Q: 0.6, dur: rand(0.09, 0.14), attack: 0.03, gain: 0.07 * k, pan });
      this._burst(t, { dest, type: 'lowpass', f: 300, dur: 0.05, gain: 0.12 * k, pan, brown: true });
    }
  }

  // --- per frame ----------------------------------------------------------------------------------

  _probe() {
    const app = this.app, p = app.camera.position;
    const n = this.near;
    n.lake = Math.max(0, lakeDist(p.x, p.z));
    let s = 99;
    for (const r of [0, 4, 8, 14, 22, 32]) {
      for (let a = 0; a < 6.28 && s === 99; a += r ? 0.8 : 7) if (streamMask(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r) > 0.5) s = r;
      if (s < 99) break;
    }
    n.stream = s;
    const w = app.buildings.wheel.getWorldPosition(this._v || (this._v = p.clone()));
    n.mill = Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z);
    const [hx, hz] = app.greenDragon.interior.hearthXZ();
    n.hearth = Math.hypot(hx - p.x, hz - p.z);
  }

  _surface() {
    const app = this.app, p = app.player.pos;
    if (app.lighting.indoor) return 'stone';
    if (surfaceAt(p.x, p.z) > -Infinity && Math.hypot(p.x - BRIDGE.x, p.z - BRIDGE.z) < BRIDGE.half + 4) return 'stone';
    if (laneMask(p.x, p.z) > 0.3) return 'gravel';
    return 'grass';
  }

  update(dt) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const app = this.app, s = app.settings, t = ctx.currentTime;
    const set = (param, v, tc = 0.25) => param.setTargetAtTime(v, t, tc);

    const focused = document.hasFocus() && !document.hidden;
    set(this.master.gain, s.muted || !focused ? 0 : s.volume * s.volume * 4, 0.15);

    this.probeTimer -= dt;
    if (this.probeTimer <= 0) {
      this.probeTimer = 0.25;
      this._probe();
    }
    const n = this.near;
    const sunY = app.lighting.sun[1];
    const day = smooth(-0.06, 0.08, sunY);
    const night = 1 - smooth(-0.12, -0.02, sunY);
    const indoor = app.lighting.indoorMix;
    const height = Math.max(0, app.camera.position.y - app.player.pos.y - 1.62);

    // Indoors the world outside goes quiet and dull.
    set(this.outdoor.gain, 1 - indoor * 0.8);
    set(this.muffle.frequency, 18000 * Math.pow(0.03, indoor), 0.2);

    // Gusts wander between calm and blowy; the wind is louder up high.
    this.gustTimer -= dt;
    if (this.gustTimer <= 0) {
      this.gustTimer = rand(1.5, 5);
      this.gustTarget = rand(0.25, 1);
    }
    this.gust += (this.gustTarget - this.gust) * (1 - Math.exp(-dt * 0.8));
    const wind = Math.min(1.6, s.windSpeed / 7) * (0.55 + this.gust * 0.6) * (1 + smooth(5, 60, height));
    set(this.windLow.gain, 0.2 * wind, 0.6);
    set(this.windLowF.frequency, 180 + 420 * this.gust * Math.min(1, wind), 0.6);
    set(this.rustle.gain, 0.022 * wind * (1 - smooth(10, 50, height)), 0.5);
    set(this.rustleF.frequency, 2600 + 1600 * this.gust, 0.5);

    // Water.
    const lap = (1 - smooth(2, 28, n.lake)) * (0.6 + 0.4 * Math.sin(t * 0.7) * Math.sin(t * 0.23));
    set(this.lap.gain, 0.16 * lap);
    set(this.lapF.frequency, 380 + 220 * Math.sin(t * 1.3), 0.3);
    const run = Math.max(0.05 * (1 - smooth(1, 26, n.stream)), 0.12 * (1 - smooth(3, 45, n.mill)));
    set(this.run.gain, run);

    // The fire, only heard inside or right by the inn's door.
    const fire = (1 - smooth(3, 18, n.hearth)) * (0.35 + indoor * 0.65);
    set(this.fire.gain, 0.22 * fire);
    set(this.crackleBus.gain, fire);
    if (fire > 0.02 && Math.random() < dt * 5) {
      const pop = Math.random() < 0.15;
      this._burst(t + rand(0, 0.05), { dest: this.crackleBus, type: 'highpass', f: pop ? 800 : 2200, Q: 0.5, dur: pop ? 0.05 : rand(0.005, 0.02), gain: pop ? 0.25 : rand(0.05, 0.14), pan: rand(-0.4, 0.4) });
    }

    // Rain, with drops pattering close by.
    const rain = weatherU.rain.value;
    set(this.rainHiss.gain, 0.09 * rain, 0.8);
    set(this.rainRoof.gain, 0.25 * rain * indoor, 0.5);
    if (Math.random() < dt * 40 * rain) {
      this._burst(t + rand(0, 0.03), { dest: this.outdoor, f: rand(2500, 6000), Q: 2, dur: rand(0.008, 0.02), gain: rand(0.02, 0.08) * rain, pan: rand(-0.9, 0.9) });
    }

    // Birdsong by day, busiest at dawn and in the evening, quieter under heavy cloud.
    const morning = s.time < 12 ? 1 : 0;
    const chorus = 1 + 2.5 * morning * (1 - smooth(0.05, 0.3, sunY)) * smooth(-0.08, 0, sunY);
    const birdRate = day * chorus * 0.9 * (1 - s.clouds * 0.5) * (1 - smooth(8, 25, s.windSpeed)) * (1 - smooth(0.1, 0.4, rain));
    this.nextBird -= dt * birdRate;
    if (this.nextBird <= 0 && indoor < 0.5) {
      this._bird(t + 0.05);
      this.nextBird = rand(0.6, 3.5);
    }

    // Crickets and the occasional owl after dark.
    set(this.nightBus.gain, night * (1 - smooth(6, 12, s.windSpeed) * 0.6) * (1 - smooth(0.1, 0.5, rain)), 1);
    if (night > 0.05) {
      for (const c of this.crickets) {
        c.next -= dt;
        if (c.next <= 0) {
          this._cricketChirp(t + 0.02, c);
          c.next = c.period * rand(0.9, 1.15);
        }
      }
      this.nextOwl -= dt;
      if (this.nextOwl <= 0) {
        this._owl(t + 0.05);
        this.nextOwl = rand(25, 70);
      }
    }

    // Footsteps, in time with the head bob, and a thump on landing.
    const pl = app.player;
    if (!pl.fly && !app.photo.active) {
      const phase = Math.floor(pl.bob / (Math.PI * 0.72));
      if (phase !== this.stepPhase && pl.onGround && Math.hypot(pl.vel.x, pl.vel.z) > 0.6) this._step(t + 0.01, this._surface(), false);
      this.stepPhase = phase;
      if (pl.onGround && !this.wasOnGround) this._step(t + 0.01, this._surface(), true);
    }
    this.wasOnGround = pl.onGround;
  }
}
