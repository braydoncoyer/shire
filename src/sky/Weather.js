// Weather that changes by itself: the sky drifts between clear, fair, cloudy, overcast and rain,
// holding each for a while and easing into the next. It drives the cloud, haze and wind settings,
// and keeps its own rain amount, how wet the ground is, and the morning mist. The shaders read
// those from `weatherU`.
//
// Settings.weather picks the mode: 'changing' (the default), one fixed kind of weather, or
// 'custom' (hands off, e.g. after moving the cloud slider, and in headless shots).

import { uniform } from 'three/tsl';

export const weatherU = {
  rain: uniform(0), // 0..1, how hard it's raining
  wet: uniform(0), // 0..1, how wet the ground and roofs are
  mist: uniform(0), // 0..1, low ground mist
};

export const WEATHER = {
  clear: { clouds: 0.08, cloudDensity: 0.9, cirrus: 0.3, haze: 0.2, windSpeed: 2.5, rain: 0 },
  fair: { clouds: 0.35, cloudDensity: 1, cirrus: 0.55, haze: 0.35, windSpeed: 4, rain: 0 },
  cloudy: { clouds: 0.6, cloudDensity: 1.05, cirrus: 0.45, haze: 0.45, windSpeed: 5.5, rain: 0 },
  overcast: { clouds: 0.9, cloudDensity: 1.3, cirrus: 0.2, haze: 0.6, windSpeed: 6.5, rain: 0 },
  rain: { clouds: 1, cloudDensity: 1.5, cirrus: 0.1, haze: 0.75, windSpeed: 7.5, rain: 1 },
};
// Where each kind of weather tends to go next. Mostly fine, as on film; rain only comes out of
// overcast skies.
const NEXT = {
  clear: [['clear', 0.35], ['fair', 0.65]],
  fair: [['clear', 0.3], ['fair', 0.3], ['cloudy', 0.4]],
  cloudy: [['fair', 0.45], ['cloudy', 0.2], ['overcast', 0.35]],
  overcast: [['cloudy', 0.45], ['rain', 0.55]],
  rain: [['rain', 0.2], ['overcast', 0.55], ['cloudy', 0.25]],
};
const KEYS = ['clouds', 'cloudDensity', 'cirrus', 'haze', 'windSpeed', 'rain'];
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const rand = (a, b) => a + Math.random() * (b - a);

export class Weather {
  constructor(settings) {
    this.settings = settings;
    // A fixed choice of weather starts as it means to go on; otherwise a fair afternoon.
    const start = WEATHER[settings.weather] ? settings.weather : 'fair';
    this.state = start;
    this.from = { ...WEATHER[start] };
    this.to = { ...WEATHER[start] };
    this.cur = { ...WEATHER[start] };
    this.blend = 1;
    this.blendTime = 1;
    this.hold = rand(90, 150); // a fair start before anything changes
    this.rain = WEATHER[start].rain;
    this.wet = this.rain;
    this.mist = 0;
    this.windDrift = 0;
  }

  /** Ease from wherever the sky is now toward `state`, over `seconds`. */
  goTo(state, seconds) {
    this.from = { ...this.cur };
    this.to = { ...WEATHER[state] };
    this.state = state;
    this.blend = 0;
    this.blendTime = seconds;
  }

  update(dt) {
    const s = this.settings;
    const mode = s.weather;
    if (mode !== 'custom') {
      if (mode === 'changing') {
        this.hold -= dt;
        if (this.hold <= 0 && this.blend >= 1) {
          let r = Math.random(), next = this.state;
          for (const [k, p] of NEXT[this.state]) if ((r -= p) <= 0) { next = k; break; }
          if (next !== this.state) this.goTo(next, rand(35, 60));
          this.hold = next === 'rain' ? rand(45, 90) : rand(60, 150);
        }
      } else if (mode !== this.state) this.goTo(mode, 8);

      if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / this.blendTime);
      const k = smooth(0, 1, this.blend);
      for (const key of KEYS) this.cur[key] = this.from[key] + (this.to[key] - this.from[key]) * k;
      // Rain holds off until the cloud has thickened, and stops early as it breaks up.
      this.rain = this.to.rain > this.from.rain
        ? this.from.rain + (this.to.rain - this.from.rain) * smooth(0.55, 1, this.blend)
        : this.to.rain + (this.from.rain - this.to.rain) * (1 - smooth(0, 0.4, this.blend));
      for (const key of ['clouds', 'cloudDensity', 'cirrus', 'haze']) s[key] = this.cur[key];
      // Gusts and a slowly veering wind.
      this.windDrift += dt * 0.05;
      s.windSpeed = this.cur.windSpeed * (0.85 + 0.15 * Math.sin(this.windDrift * 2.3));
      s.windDir = 225 + 35 * Math.sin(this.windDrift * 0.37);
    } else {
      this.rain = s.rain ?? 0;
    }

    // Ground wets through quickly in rain and dries slowly after, faster in sunshine.
    const sun = smooth(-0.05, 0.3, this.sunY ?? 0.3) * (1 - s.clouds * 0.7);
    if (this.rain > 0.05) this.wet = Math.min(1, this.wet + dt * this.rain / 15);
    else this.wet = Math.max(0, this.wet - dt * (0.004 + 0.012 * sun));

    // Mist lies in the low ground around dawn, thicker after rain and on still mornings, and a
    // little in the evening; rain itself brings a thin murk.
    const t = s.time;
    const dawn = smooth(3.5, 5.5, t) * (1 - smooth(7.5, 10, t));
    const dusk = smooth(20, 22.5, t) * 0.25 + (1 - smooth(1, 4, t)) * 0.25;
    const still = 1 - smooth(3, 9, s.windSpeed);
    const target = Math.min(1, Math.max(dawn * (0.45 + 0.55 * this.wet), dusk) * (0.4 + 0.6 * still) + this.rain * 0.3);
    this.mist += (target - this.mist) * (1 - Math.exp(-dt * 0.3));

    weatherU.rain.value = this.rain;
    weatherU.wet.value = this.wet;
    weatherU.mist.value = s.mist ?? this.mist;
  }
}
