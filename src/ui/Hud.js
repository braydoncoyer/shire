// The on-screen basics: the start/paused overlay, the FPS readout, and the global keys (time of
// day, settings, photo mode, mute).

export class Hud {
  constructor(app) {
    this.app = app;
    this.start = document.getElementById('start');
    this.eyebrow = document.getElementById('start-eyebrow');
    this.go = document.getElementById('start-go');
    this.fps = document.getElementById('fps');
    this.toastEl = document.getElementById('toast');
    this.frames = 0;
    this.acc = 0;
    this.started = false;

    const canvas = app.renderer.domElement;
    const lock = () => {
      app.audio.resume();
      canvas.requestPointerLock?.()?.catch?.(() => {});
    };
    this.start.addEventListener('click', (e) => {
      if (!e.target.closest('button') || e.target.id === 'start-go') lock();
    });
    canvas.addEventListener('click', () => app.audio.resume());
    document.getElementById('start-settings').addEventListener('click', () => app.panel.open());
    document.getElementById('start-photo').addEventListener('click', () => app.photo.enter());
    app.input.onLockChange((locked) => {
      if (locked) this.started = true;
      this.refresh();
    });
    // Whatever was last set is kept when the page closes (e.g. the hour, when time stands still).
    addEventListener('pagehide', () => app.settings.save());
    this.refresh();
  }

  /** Show the start overlay whenever the mouse is free and nothing else is open. */
  refresh() {
    const app = this.app;
    this.start.hidden = app.settings.shot || app.input.locked || app.panel?.isOpen || app.photo?.active;
    this.eyebrow.textContent = this.started ? 'Paused' : 'A walk in Hobbiton';
    this.go.textContent = this.started ? 'Carry on walking' : 'Enter the Shire';
    this.fps.hidden = !app.settings.showFps || app.photo?.active;
  }

  toast(msg, ms = 2200) {
    const t = this.toastEl;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }

  handleKeys(input) {
    const app = this.app, s = app.settings;
    if (input.wasPressed('BracketLeft') || input.wasPressed('BracketRight')) {
      s.time = (s.time + (input.wasPressed('BracketLeft') ? -0.25 : 0.25) + 24) % 24;
      s.save();
    }
    if (input.wasPressed('Backquote')) {
      s.showFps = !s.showFps;
      s.save();
      this.refresh();
      app.panel.sync();
    }
    if (input.wasPressed('Tab')) app.panel.toggle();
    if (input.wasPressed('KeyP')) app.photo.toggle();
    if (input.wasPressed('KeyM')) {
      s.muted = !s.muted;
      s.save();
      app.panel.sync();
      this.toast(s.muted ? 'Sound off' : 'Sound on', 1200);
    }
  }

  update(dt) {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      const s = this.app.settings;
      // Once, a few seconds into a walk: suggest a lighter preset if frames are slow.
      if (this.started && !this.slowHinted && !s.shot && document.hasFocus()) {
        this.slowFrames = (this.slowFrames || 0) + (this.acc / this.frames > 1 / 28 ? 1 : -1);
        if (this.slowFrames >= 8 && s.preset !== 'low') {
          this.slowHinted = true;
          this.toast('Running slowly? Press Tab and try a lighter graphics preset.', 6000);
        }
        if (this.slowFrames < -40) this.slowHinted = true;
      }
      const hh = Math.floor(s.time), mm = Math.floor((s.time - hh) * 60);
      this.fps.textContent = `${Math.round(this.frames / this.acc)} fps · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      this.frames = 0;
      this.acc = 0;
    }
  }
}
