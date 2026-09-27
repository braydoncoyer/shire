// Photo mode (P): a free camera with the interface hidden, time held still, and controls for field
// of view, roll, time of day, exposure and depth of field. Saves the frame as a PNG, optionally
// rendered at twice the resolution.

import * as THREE from 'three/webgpu';
import { heightAt } from '../world/Layout.js';
import { EYE } from '../player/Player.js';

/** Color a slider's track up to its thumb. */
const fill = (el) => el.style.setProperty('--pct', `${((el.value - el.min) / (el.max - el.min)) * 100}%`);

const clock = (t) => {
  const h = Math.floor(t), m = Math.floor((t - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
// Focus slider runs on a log scale, 0.5 m to 400 m.
const F0 = Math.log(0.5), F1 = Math.log(400);
const toFocus = (t) => Math.exp(F0 + (F1 - F0) * t);
const fromFocus = (d) => (Math.log(d) - F0) / (F1 - F0);
const MAX_CAPTURE = 8192; // px, the longest side of a saved photo

const CONTROLS = [
  { key: 'fov', label: 'Field of view', min: 15, max: 100, step: 1, fmt: (v) => `${v}°` },
  { key: 'roll', label: 'Tilt', min: -30, max: 30, step: 0.5, fmt: (v) => `${v}°` },
  { key: 'time', label: 'Time of day', min: 0, max: 23.95, step: 0.05, fmt: clock },
  { key: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.05, fmt: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV` },
  { key: 'dof', label: 'Depth of field', check: true },
  { key: 'focus', label: 'Focus distance', min: 0, max: 1, step: 0.002, fmt: (t) => `${toFocus(t) < 10 ? toFocus(t).toFixed(1) : Math.round(toFocus(t))} m`, dof: true },
  { key: 'depth', label: 'In-focus depth', min: 0.2, max: 60, step: 0.1, fmt: (v) => `${v.toFixed(1)} m`, dof: true },
  { key: 'bokeh', label: 'Blur', min: 0.5, max: 8, step: 0.1, fmt: (v) => v.toFixed(1), dof: true },
  { key: 'scale', label: 'Photo size', options: [[1, 'Screen size'], [2, 'Double']] },
];

export class PhotoMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.state = { fov: 50, roll: 0, time: 0, exposure: 0, dof: false, focus: fromFocus(20), depth: 12, bokeh: 3, scale: 1 };
    this.el = document.getElementById('photo');
    this.hint = document.getElementById('photo-hint');
    this.flash = document.getElementById('photo-flash');
    this.inputs = new Map();
    this._build();
    this.el.querySelector('[data-close]').addEventListener('click', () => this.exit());
    document.getElementById('photo-leave').addEventListener('click', () => this.exit());
    document.getElementById('photo-capture').addEventListener('click', () => this.capture());
    addEventListener('keydown', (e) => {
      if (!this.active || (e.target instanceof Element && e.target.closest('input, select'))) return;
      if (e.code === 'Enter') { e.preventDefault(); this.capture(); }
      if (e.code === 'KeyH') this.el.classList.toggle('closed');
    });
    this.raycaster = new THREE.Raycaster();
  }

  _build() {
    const body = document.getElementById('photo-body');
    let n = 0;
    for (const c of CONTROLS) {
      const row = document.createElement('div');
      row.className = 'row';
      if (c.dof) row.dataset.dof = '';
      const id = `photo-${n++}`;
      const label = Object.assign(document.createElement('label'), { htmlFor: id, textContent: c.label });
      row.append(label);
      let input, out;
      if (c.check) {
        input = Object.assign(document.createElement('input'), { type: 'checkbox', id });
        row.append(input);
        input.addEventListener('change', () => this._set(c.key, input.checked));
      } else if (c.options) {
        input = Object.assign(document.createElement('select'), { id });
        for (const [v, l] of c.options) input.append(new Option(l, String(v)));
        row.append(input);
        input.addEventListener('change', () => this._set(c.key, parseFloat(input.value)));
      } else {
        out = Object.assign(document.createElement('output'), { htmlFor: id });
        input = Object.assign(document.createElement('input'), { type: 'range', min: c.min, max: c.max, step: c.step, id });
        row.append(out, input);
        input.addEventListener('input', () => this._set(c.key, parseFloat(input.value)));
      }
      this.inputs.set(c.key, { c, input, out });
      body.append(row);
      if (c.key === 'dof') {
        const b = Object.assign(document.createElement('button'), { className: 'pill small block', textContent: 'Focus on the centre of the view' });
        b.style.margin = '4px 0 8px';
        b.dataset.dofRow = '';
        b.addEventListener('click', () => this.autofocus());
        this.focusButton = b;
        body.append(b);
      }
    }
    const hint = Object.assign(document.createElement('p'), { className: 'hint' });
    hint.textContent = 'Photos save as PNG to your downloads. Time stands still while you compose.';
    body.append(hint);
  }

  _set(key, v) {
    const st = this.state, app = this.app;
    st[key] = v;
    if (key === 'time') { app.settings.time = v; app.sky.resetHistory(); }
    if (key === 'exposure') app.settings.exposure = v;
    if (key === 'dof') app.post.configure({ dof: v });
    this.sync();
  }

  sync() {
    for (const { c, input, out } of this.inputs.values()) {
      const v = this.state[c.key];
      if (c.check) input.checked = v;
      else input.value = String(v);
      if (out) out.textContent = c.fmt(v);
      if (input.type === 'range') fill(input);
    }
    for (const r of this.el.querySelectorAll('[data-dof]')) r.hidden = !this.state.dof;
    this.focusButton.hidden = !this.state.dof;
  }

  toggle() {
    if (this.active) this.exit();
    else this.enter();
  }

  enter() {
    const app = this.app, s = app.settings, p = app.player;
    if (app.panel.isOpen) app.panel.close();
    this.active = true;
    this.saved = { fly: p.fly, timeSpeed: s.timeSpeed, exposure: s.exposure };
    if (!p.fly) {
      p.fly = true;
      p.pos.y += EYE;
      p.vel.set(0, 0, 0);
    }
    s.timeSpeed = 0;
    Object.assign(this.state, { fov: s.fov, time: s.time, exposure: s.exposure, roll: 0 });
    app.post.configure({ dof: this.state.dof });
    this.sync();
    this.el.classList.remove('closed');
    this.el.setAttribute('aria-hidden', 'false');
    this.hint.hidden = false;
    app.hud.refresh();
  }

  exit() {
    if (!this.active) return;
    const app = this.app, s = app.settings, p = app.player;
    this.active = false;
    // Hand the keyboard back to the walk (keys typed inside a panel stay in it).
    if (this.el.contains(document.activeElement)) document.activeElement.blur();
    if (!this.saved.fly) {
      p.fly = false;
      p.pos.y = heightAt(p.pos.x, p.pos.z);
      p.vel.set(0, 0, 0);
    }
    s.timeSpeed = this.saved.timeSpeed;
    s.exposure = this.saved.exposure;
    app.post.configure({ dof: false });
    app.camera.fov = s.fov;
    app.camera.updateProjectionMatrix();
    this.el.classList.add('closed');
    this.el.setAttribute('aria-hidden', 'true');
    this.hint.hidden = true;
    app.hud.refresh();
  }

  /** Focus on whatever is at the centre of the view: the ground, a building or a tree. */
  autofocus() {
    const cam = this.app.camera;
    const o = cam.getWorldPosition(new THREE.Vector3()), d = cam.getWorldDirection(new THREE.Vector3());
    let hit = 400;
    for (let t = 0.3; t < 400; t += t < 20 ? 0.1 : 0.5) {
      if (o.y + d.y * t < heightAt(o.x + d.x * t, o.z + d.z * t)) { hit = t; break; }
    }
    const app = this.app;
    this.raycaster.set(o, d);
    this.raycaster.far = hit;
    this.raycaster.layers.enableAll();
    const targets = [app.holes.group, app.greenDragon.group, app.buildings.group, app.surroundings.group, app.vegetation.group, app.boundaries.group];
    const hits = this.raycaster.intersectObjects(targets, true).filter((h) => h.object.visible);
    if (hits.length) hit = hits[0].distance;
    // Focus is measured along the view axis.
    this._set('focus', THREE.MathUtils.clamp(fromFocus(Math.max(hit, 0.5)), 0, 1));
    app.hud.toast(`Focused at ${hit < 10 ? hit.toFixed(1) : Math.round(hit)} m`, 1200);
  }

  update() {
    if (!this.active) return;
    const app = this.app, st = this.state, cam = app.camera;
    if (cam.fov !== st.fov) {
      cam.fov = st.fov;
      cam.updateProjectionMatrix();
    }
    if (st.roll) {
      cam.rotation.z = (st.roll * Math.PI) / 180;
      cam.updateMatrixWorld();
    }
    app.post.focus.value = toFocus(st.focus);
    app.post.focalLength.value = st.depth;
    app.post.bokeh.value = st.bokeh;
    // A double-size photo renders this one frame at twice the pixel ratio.
    if (this.pending && st.scale > 1 && !this.upscaled) {
      const r = app.renderer, pr = r.getPixelRatio();
      const k = Math.min(st.scale, MAX_CAPTURE / (Math.max(innerWidth, innerHeight) * pr));
      this.upscaled = pr;
      r.setPixelRatio(pr * k);
      app.resize();
    }
  }

  capture() {
    if (!this.active) this.enter();
    this.pending = true;
  }

  /** Called right after a frame is drawn, while the canvas still holds it. */
  afterRender() {
    if (!this.pending) return;
    this.pending = false;
    const app = this.app;
    const canvas = app.renderer.domElement;
    const w = canvas.width, h = canvas.height;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    canvas.toBlob((blob) => {
      if (!blob) return app.hud.toast('Could not save the photo');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `shire-${stamp}.png` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      app.hud.toast(`Saved shire-${stamp}.png (${w}×${h})`);
    }, 'image/png');
    if (this.upscaled) {
      app.renderer.setPixelRatio(this.upscaled);
      app.resize();
      this.upscaled = null;
    }
    this.flash.classList.add('on');
    requestAnimationFrame(() => this.flash.classList.remove('on'));
  }
}
