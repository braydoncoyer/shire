// Minimal HUD for now: the click-to-explore prompt, an FPS readout (backquote), and time-of-day
// nudges with [ and ]. The full config panel and photo mode arrive in M5.

export class Hud {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('hud');
    this.prompt = document.getElementById('prompt');
    this.fps = document.getElementById('fps');
    this.frames = 0;
    this.acc = 0;
    if (app.settings.shot) this.prompt.hidden = true;
    app.input.onLockChange((locked) => {
      if (!app.settings.shot) this.prompt.hidden = locked;
    });
  }

  handleKeys(input) {
    const s = this.app.settings;
    if (input.wasPressed('BracketLeft')) s.time = (s.time - 0.25 + 24) % 24;
    if (input.wasPressed('BracketRight')) s.time = (s.time + 0.25) % 24;
    if (input.wasPressed('Backquote')) this.fps.hidden = !this.fps.hidden;
  }

  update(dt) {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 0.5) {
      const s = this.app.settings;
      const hh = Math.floor(s.time), mm = Math.floor((s.time - hh) * 60);
      this.fps.textContent = `${Math.round(this.frames / this.acc)} fps · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      this.frames = 0;
      this.acc = 0;
    }
  }
}
