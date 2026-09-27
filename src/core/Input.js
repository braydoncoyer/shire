// Keyboard state, pointer-lock mouse look, and one-shot key presses.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.listeners = new Set();

    addEventListener('keydown', (e) => {
      // Keys typed into a slider or menu belong to it, and in the settings and photo panels Tab,
      // Enter and Space move focus and press buttons. Everything else still walks.
      if (e.target instanceof Element && (e.target.closest('input, select') || (e.target.closest('.panel') && ['Tab', 'Enter', 'Space'].includes(e.code)))) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.locked) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      // Once the mouse is captured, the keyboard belongs to the walk, not a panel button.
      if (this.locked && document.activeElement instanceof HTMLElement) document.activeElement.blur();
      for (const f of this.listeners) f(this.locked);
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  onLockChange(f) { this.listeners.add(f); }
  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  /** Call once per frame after everything has read input. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
