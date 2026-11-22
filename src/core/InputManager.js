// =============================================================
// InputManager - turns raw keyboard / touch events into simple
// game commands. The Game never needs to know WHICH key was
// pressed, only what the player wants.
//
// Keys:  ← → / A D  lanes      ↓ / S  brake (hold)
//        Shift / N  nitro (hold) H  horn     L  headlights
//        C  camera view          Space / P / Esc  pause
// =============================================================

const SWIPE_DISTANCE = 35; // pixels a finger must travel to count as a swipe

export class InputManager {
  constructor(handlers) {
    this.h = handlers;
    this.touch = null;

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.h.onBrake?.(false);
      this.h.onNitro?.(false);
    });
    window.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: true });
    window.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: true });
    window.addEventListener('touchend', () => { this.touch = null; }, { passive: true });
  }

  onKey(e, down) {
    // hold-type controls
    switch (e.code) {
      case 'ArrowDown':
      case 'KeyS':
        e.preventDefault();
        this.h.onBrake?.(down);
        return;
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'KeyN':
        this.h.onNitro?.(down);
        return;
      default:
    }
    if (!down || e.repeat) return; // holding a key should not skip several lanes
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        this.h.onLeft?.();
        break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault();
        this.h.onRight?.();
        break;
      case 'Space':
      case 'KeyP':
      case 'Escape':
        e.preventDefault();
        this.h.onPause?.();
        break;
      case 'KeyH':
        this.h.onHorn?.();
        break;
      case 'KeyL':
        this.h.onHeadlights?.();
        break;
      case 'KeyC':
        this.h.onCamera?.();
        break;
      case 'Enter':
        this.h.onConfirm?.();
        break;
      default:
    }
  }

  onTouchStart(e) {
    // ignore touches that start on buttons (brake/nitro/HUD controls)
    if (e.target.closest && e.target.closest('button')) {
      this.touch = null;
      return;
    }
    const t = e.touches[0];
    this.touch = { x: t.clientX, y: t.clientY, fired: false };
  }

  // Fire as soon as the finger moved far enough - feels more responsive
  // than waiting for the finger to lift.
  onTouchMove(e) {
    if (!this.touch || this.touch.fired) return;
    const t = e.touches[0];
    const dx = t.clientX - this.touch.x;
    const dy = t.clientY - this.touch.y;
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.2) {
      this.touch.fired = true;
      if (dx < 0) this.h.onSwipeLeft?.();
      else this.h.onSwipeRight?.();
    }
  }
}
