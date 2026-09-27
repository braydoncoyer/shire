// Live-tweakable settings. The settings panel (ui/Panel.js) binds to these and remembers them in
// localStorage; URL parameters override both, e.g.
// ?time=6.2&clouds=0.7&haze=0.8&cam=10,5,40,-2.6,0.05&fly&quality=low

export const DEFAULTS = {
  time: 16.5, // hours, local solar time
  timeSpeed: 2.4, // in-game minutes per real second: 2.4 makes a day pass in 10 minutes
  weather: 'changing', // 'changing', a fixed kind of weather (sky/Weather.js), or 'custom'
  fireworks: true, // Gandalf's fireworks over the lake every clear night at ten
  sunAzimuth: 0, // degrees added to the true solar azimuth
  clouds: 0.35,
  cloudDensity: 1,
  cirrus: 0.55,
  haze: 0.35,
  windSpeed: 4, // m/s
  windDir: 225, // degrees, direction the wind blows toward
  exposure: 0, // EV compensation on top of auto exposure
  bloom: 0.12,
  fov: 62,
  sensitivity: 1,
  invertY: false,
  showFps: false,
  volume: 0.7,
  muted: false,
};

/**
 * Quality presets. renderScale multiplies the device pixel ratio (capped by maxDpr); the rest are
 * shadow map size per cascade, MSAA, how far the grass reaches, tree detail distance, and the
 * resolution of the sky/cloud and lake reflection buffers.
 */
export const PRESETS = {
  low: { renderScale: 0.75, maxDpr: 1, shadowSize: 1024, msaa: false, grassReach: 'near', treeDetail: 0.6, skyRes: 0.35, reflectionRes: 0.25 },
  medium: { renderScale: 1, maxDpr: 1, shadowSize: 2048, msaa: true, grassReach: 'full', treeDetail: 0.8, skyRes: 0.5, reflectionRes: 0.35 },
  high: { renderScale: 1, maxDpr: 1.5, shadowSize: 2048, msaa: true, grassReach: 'full', treeDetail: 1, skyRes: 0.5, reflectionRes: 0.5 },
  ultra: { renderScale: 1, maxDpr: 2, shadowSize: 4096, msaa: true, grassReach: 'full', treeDetail: 1.4, skyRes: 0.75, reflectionRes: 1 },
};
export const QUALITY_KEYS = Object.keys(PRESETS.high);

// Everything the settings panel sets is remembered between visits. The sky's own values are kept
// only when it was set by hand, and the hour only when time stands still (otherwise each visit
// starts on a fair afternoon).
const SAVED = ['preset', ...QUALITY_KEYS, 'timeSpeed', 'weather', 'fireworks', 'fov', 'sensitivity', 'invertY', 'showFps', 'volume', 'muted'];
const SKY = ['clouds', 'haze', 'windSpeed'];
const STORE = 'shire.settings.v3';

export class Settings {
  constructor() {
    Object.assign(this, DEFAULTS);
    this.preset = 'high';
    Object.assign(this, PRESETS.high);
    try {
      let saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!saved) {
        // Carried over from before the day slowed down, minus the old day length.
        saved = JSON.parse(localStorage.getItem('shire.settings.v2') || '{}');
        delete saved.timeSpeed;
      }
      for (const k of [...SAVED, ...SKY, 'time']) if (k in saved) this[k] = saved[k];
    } catch {}

    const q = new URLSearchParams(location.search);
    const map = { time: 'time', clouds: 'clouds', cirrus: 'cirrus', haze: 'haze', ev: 'exposure', az: 'sunAzimuth', speed: 'timeSpeed', fov: 'fov' };
    for (const [k, prop] of Object.entries(map)) if (q.has(k)) this[prop] = parseFloat(q.get(k));
    if (PRESETS[q.get('quality')]) this.setPreset(q.get('quality'));
    if (q.has('weather')) this.weather = q.get('weather');
    // Setting the sky by hand (or rain and mist, for shots) holds the weather still.
    if (['clouds', 'cirrus', 'haze', 'rain', 'mist'].some((k) => q.has(k)) && !q.has('weather')) this.weather = 'custom';
    if (q.has('rain')) this.rain = parseFloat(q.get('rain'));
    if (q.has('mist')) this.mist = parseFloat(q.get('mist'));
    this.cam = q.has('cam') ? q.get('cam').split(',').map(parseFloat) : null;
    this.fly = q.has('fly');
    this.shot = q.has('shot'); // headless screenshot mode: no pointer-lock prompt, no audio
    // Start a fireworks show on load, optionally already `fwt` seconds in (for screenshots).
    this.fireworksNow = q.has('fireworks') ? parseFloat(q.get('fwt') || '0') : null;
    // Headless shots keep the look they were tuned with, whatever this browser saved.
    if (this.shot && !q.has('quality')) { this.preset = 'high'; Object.assign(this, PRESETS.high); }
    // ...and hold the hour and the sky still, unless asked otherwise.
    if (this.shot && !q.has('speed')) this.timeSpeed = 0;
    if (this.shot && !q.has('weather')) this.weather = 'custom';
    if (this.shot && !q.has('time')) this.time = 17.9;
  }

  setPreset(name) {
    this.preset = name;
    Object.assign(this, PRESETS[name]);
  }

  /** The preset the current quality values match, or 'custom'. */
  matchingPreset() {
    return Object.keys(PRESETS).find((p) => QUALITY_KEYS.every((k) => PRESETS[p][k] === this[k])) || 'custom';
  }

  save() {
    if (this.shot) return;
    try {
      const out = Object.fromEntries(SAVED.map((k) => [k, this[k]]));
      if (this.weather === 'custom') for (const k of SKY) out[k] = this[k];
      if (this.timeSpeed === 0) out.time = this.time;
      localStorage.setItem(STORE, JSON.stringify(out));
    } catch {}
  }

  /** Back to the defaults, and forget what was saved. */
  reset() {
    Object.assign(this, DEFAULTS);
    this.setPreset('high');
    try {
      localStorage.removeItem(STORE);
    } catch {}
  }
}
