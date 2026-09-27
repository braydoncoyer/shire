// The settings panel (Tab): quality presets and their individual knobs, time and weather, view
// and mouse, and sound. Quality and preferences are remembered between visits (Settings.save).

import { PRESETS, QUALITY_KEYS } from '../core/Settings.js';

const clock = (t) => {
  const h = Math.floor(t), m = Math.floor((t - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const pct = (v) => `${Math.round(v * 100)}%`;

// Each control: key (a Settings property), label, and kind: range (min, max, step, fmt), select
// (options [value, label]), or check.
const SECTIONS = [
  {
    title: 'Graphics',
    preset: true,
    controls: [
      { key: 'renderScale', label: 'Render scale', kind: 'range', min: 0.5, max: 1.25, step: 0.05, fmt: pct },
      { key: 'maxDpr', label: 'Sharpness on high-DPI screens', kind: 'select', options: [[1, 'Standard'], [1.5, 'Sharp'], [2, 'Full']] },
      { key: 'msaa', label: 'Anti-aliasing (4× MSAA)', kind: 'check' },
      { key: 'shadowSize', label: 'Shadow detail', kind: 'select', options: [[1024, 'Low'], [2048, 'Medium'], [4096, 'High']] },
      { key: 'grassReach', label: 'Grass reach', kind: 'select', options: [['near', 'Near'], ['full', 'Far']] },
      { key: 'treeDetail', label: 'Tree detail distance', kind: 'range', min: 0.5, max: 1.6, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
      { key: 'skyRes', label: 'Sky and clouds', kind: 'select', options: [[0.35, 'Low'], [0.5, 'Medium'], [0.75, 'High']] },
      { key: 'reflectionRes', label: 'Lake reflections', kind: 'select', options: [[0.25, 'Low'], [0.35, 'Medium'], [0.5, 'High'], [1, 'Full']] },
    ],
  },
  {
    title: 'Time and weather',
    controls: [
      { key: 'time', label: 'Time of day', kind: 'range', min: 0, max: 23.95, step: 0.05, fmt: clock },
      { key: 'timeSpeed', label: 'Time passing', kind: 'select', options: [[0, 'Stopped'], [1, 'Slowly'], [10, 'Steadily'], [60, 'Quickly']] },
      { key: 'clouds', label: 'Cloud cover', kind: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'haze', label: 'Haze', kind: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'windSpeed', label: 'Wind', kind: 'range', min: 0, max: 12, step: 0.5, fmt: (v) => `${v} m/s` },
    ],
  },
  {
    title: 'View and controls',
    controls: [
      { key: 'fov', label: 'Field of view', kind: 'range', min: 45, max: 95, step: 1, fmt: (v) => `${v}°` },
      { key: 'sensitivity', label: 'Mouse sensitivity', kind: 'range', min: 0.3, max: 2.5, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
      { key: 'invertY', label: 'Invert mouse Y', kind: 'check' },
      { key: 'showFps', label: 'Show frame rate', kind: 'check' },
    ],
  },
  {
    title: 'Sound',
    controls: [
      { key: 'volume', label: 'Volume', kind: 'range', min: 0, max: 1, step: 0.01, fmt: pct },
      { key: 'muted', label: 'Mute', kind: 'check' },
    ],
  },
];

const WEATHER = new Set(['time', 'clouds', 'haze']);

export class Panel {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('settings');
    this.body = document.getElementById('settings-body');
    this.isOpen = false;
    this.inputs = new Map();
    this._build();
    this.el.querySelector('[data-close]').addEventListener('click', () => this.close());
    document.getElementById('settings-reset').addEventListener('click', () => this.reset());
    addEventListener('keydown', (e) => {
      if (this.isOpen && e.code === 'Escape') this.close();
    });
    this.sync();
  }

  _build() {
    let n = 0;
    for (const sec of SECTIONS) {
      const h = document.createElement('h3');
      h.textContent = sec.title;
      this.body.append(h);
      if (sec.preset) {
        const seg = (this.presetSeg = document.createElement('div'));
        seg.className = 'seg';
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Quality preset');
        for (const p of Object.keys(PRESETS)) {
          const b = document.createElement('button');
          b.textContent = p[0].toUpperCase() + p.slice(1);
          b.dataset.preset = p;
          b.addEventListener('click', () => {
            this.app.settings.setPreset(p);
            this._changed(true);
          });
          seg.append(b);
        }
        this.body.append(seg);
        const hint = (this.presetHint = document.createElement('p'));
        hint.className = 'hint';
        this.body.append(hint);
      }
      for (const c of sec.controls) {
        const row = document.createElement('div');
        row.className = 'row';
        const id = `set-${n++}`;
        const label = document.createElement('label');
        label.htmlFor = id;
        label.textContent = c.label;
        row.append(label);
        let input, out;
        if (c.kind === 'range') {
          out = document.createElement('output');
          out.htmlFor = id;
          input = Object.assign(document.createElement('input'), { type: 'range', min: c.min, max: c.max, step: c.step, id });
          row.append(out, input);
          input.addEventListener('input', () => this._set(c, parseFloat(input.value)));
        } else if (c.kind === 'select') {
          input = Object.assign(document.createElement('select'), { id });
          for (const [v, l] of c.options) input.append(new Option(l, String(v)));
          row.append(input);
          input.addEventListener('change', () => {
            const v = c.options.find(([o]) => String(o) === input.value)[0];
            this._set(c, v);
          });
        } else {
          input = Object.assign(document.createElement('input'), { type: 'checkbox', id });
          row.append(input);
          input.addEventListener('change', () => this._set(c, input.checked));
        }
        this.inputs.set(c.key, { c, input, out });
        this.body.append(row);
      }
    }
  }

  _set(c, v) {
    const s = this.app.settings;
    s[c.key] = v;
    if (WEATHER.has(c.key)) this.app.sky.resetHistory();
    const quality = QUALITY_KEYS.includes(c.key);
    if (quality) s.preset = s.matchingPreset();
    this._changed(quality || ['fov', 'sensitivity', 'invertY'].includes(c.key));
  }

  _changed(apply) {
    const app = this.app;
    if (apply) app.applyQuality();
    app.settings.save();
    app.hud.refresh();
    this.sync();
  }

  /** Put the current settings into the controls. */
  sync() {
    const s = this.app.settings;
    for (const { c, input, out } of this.inputs.values()) {
      const v = s[c.key];
      if (c.kind === 'check') input.checked = !!v;
      else input.value = String(v);
      if (out) out.textContent = c.fmt(v);
    }
    const preset = s.matchingPreset();
    for (const b of this.presetSeg.children) b.setAttribute('aria-pressed', String(b.dataset.preset === preset));
    this.presetHint.textContent = preset === 'custom'
      ? 'Custom: adjusted from a preset.'
      : { low: 'For integrated graphics and older laptops.', medium: 'A balance for most laptops.', high: 'The intended look, for recent machines.', ultra: 'Sharper shadows and more detail at a distance. Needs a strong GPU.' }[preset];
  }

  reset() {
    const s = this.app.settings;
    s.setPreset('high');
    Object.assign(s, { fov: 62, sensitivity: 1, invertY: false, showFps: false, volume: 0.7, muted: false });
    this._changed(true);
  }

  open() {
    if (this.app.photo.active) this.app.photo.exit();
    this.isOpen = true;
    this.sync();
    document.exitPointerLock?.();
    this.el.classList.remove('closed');
    this.el.setAttribute('aria-hidden', 'false');
    this.app.hud.refresh();
  }

  close() {
    this.isOpen = false;
    // Hand the keyboard back to the walk (keys typed inside a panel stay in it).
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    this.el.classList.add('closed');
    this.el.setAttribute('aria-hidden', 'true');
    this.app.hud.refresh();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }
}
