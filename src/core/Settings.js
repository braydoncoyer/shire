// Live-tweakable settings. The config panel (M5) binds to these; URL parameters override the
// defaults, e.g. ?time=6.2&clouds=0.7&haze=0.8&cam=10,5,40,-2.6,0.05&fly

export const DEFAULTS = {
  time: 17.9, // hours, local solar time
  timeSpeed: 0, // in-game minutes per real second
  sunAzimuth: 0, // degrees added to the true solar azimuth
  clouds: 0.35,
  cloudDensity: 1,
  cirrus: 0.55,
  haze: 0.35,
  windSpeed: 4, // m/s
  windDir: 225, // degrees, direction the wind blows toward
  exposure: 0, // EV compensation on top of auto exposure
  bloom: 0.12,
};

export class Settings {
  constructor() {
    Object.assign(this, DEFAULTS);
    const q = new URLSearchParams(location.search);
    const map = { time: 'time', clouds: 'clouds', cirrus: 'cirrus', haze: 'haze', ev: 'exposure', az: 'sunAzimuth', speed: 'timeSpeed' };
    for (const [k, prop] of Object.entries(map)) if (q.has(k)) this[prop] = parseFloat(q.get(k));
    this.cam = q.has('cam') ? q.get('cam').split(',').map(parseFloat) : null;
    this.fly = q.has('fly');
    this.shot = q.has('shot'); // headless screenshot mode: no pointer-lock prompt
  }
}
