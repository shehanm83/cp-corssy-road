// Keyboard + touch input. Calls onHop(dx, dz) for discrete hop intents.

export class Input {
  constructor(onHop) {
    this.onHop = onHop;
    this._enabled = false;
    window.addEventListener('keydown', this._onKey);

    // touch state
    this._touchStart = null;
    window.addEventListener('touchstart', this._onTouchStart, { passive: true });
    window.addEventListener('touchend', this._onTouchEnd, { passive: true });
  }

  enable()  { this._enabled = true; }
  disable() { this._enabled = false; }

  // Public hop trigger for on-screen D-pad buttons. Honors the enabled gate.
  fireHop(dx, dz) {
    if (!this._enabled) return;
    this.onHop(dx, dz);
  }

  _onKey = (e) => {
    if (!this._enabled) return;
    const k = e.key;
    let dx = 0, dz = 0;
    // Note: the chase camera looks along +Z, which mirrors world-X relative to
    // the screen. We map screen-right to world -X so visual movement matches the key.
    if (k === 'ArrowUp'    || k === 'w' || k === 'W') dz =  1;
    else if (k === 'ArrowDown'  || k === 's' || k === 'S') dz = -1;
    else if (k === 'ArrowLeft'  || k === 'a' || k === 'A') dx =  1;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') dx = -1;
    else return;
    e.preventDefault();
    this.onHop(dx, dz);
  };

  _onTouchStart = (e) => {
    if (!this._enabled) return;
    if (e.touches.length === 0) return;
    const t = e.touches[0];
    this._touchStart = { x: t.clientX, y: t.clientY, time: Date.now() };
  };

  _onTouchEnd = (e) => {
    if (!this._enabled || !this._touchStart) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - this._touchStart.x;
    const dy = t.clientY - this._touchStart.y;
    this._touchStart = null;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // Lower threshold for mobile — short flicks should still register.
    const SWIPE_THRESHOLD = 18;

    if (absX < SWIPE_THRESHOLD && absY < SWIPE_THRESHOLD) {
      // treat as tap — hop forward
      this.onHop(0, 1);
      return;
    }
    if (absX > absY) {
      // screen-right swipe (dx > 0) → world -X so the character visibly goes right.
      this.onHop(dx > 0 ? -1 : 1, 0);
    } else {
      // screen Y inverted vs world Z forward: swipe-up = forward (+z)
      this.onHop(0, dy < 0 ? 1 : -1);
    }
  };
}
