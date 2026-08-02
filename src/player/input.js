// ── input.js ────────────────────────────────────────────────────────────────
// Keyboard and mouse, turned into intents.
//
// This is the only file in the player path that knows a browser exists. It
// produces the same intent object a network packet or an LLM agent would, and
// the simulation cannot tell the difference — which is the entire point of
// splitting it out of the controller.
//
// Mouse movement is accumulated between polls rather than applied immediately,
// so a 200 Hz mouse and a 60 Hz tick agree about how far you turned.

import { PLAYER } from '../config.js';
import { createIntent, clearIntent } from '../sim/intents.js';

export class PlayerInput {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.intent = createIntent();

    // Accumulated since the last poll.
    this.pendingYaw = 0;
    this.pendingPitch = 0;
    // Edge-triggered, consumed by the next poll.
    this.pressedInteract = false;
    this.pressedDrop = false;
    this.pressedPlace = false;
    this.pressedEat = false;
    this.pendingSlot = -1;

    this.locked = false;
    // Pointer lock is refused inside an iframe without `allow="pointer-lock"`.
    // When that happens we fall back to hold-right-button-and-drag.
    this.lockSupported = true;
    this.dragging = false;
    this.onLockUnavailable = null;
    this.enabled = true;

    this.bind();
  }

  bind() {
    this.onKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      // Edge-triggered actions are latched here and cleared on the next poll,
      // so a tap is never lost between ticks.
      if (e.repeat) return;
      if (e.code === 'KeyE') this.pressedInteract = true;
      if (e.code === 'KeyQ') this.pressedDrop = true;
      if (e.code === 'KeyG') this.pressedPlace = true;
      if (e.code === 'KeyR') this.pressedEat = true;
      if (/^Digit[1-5]$/.test(e.code)) this.pendingSlot = Number(e.code.slice(5)) - 1;
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);

    this.onMouseMove = (e) => {
      if (!this.locked && !this.dragging) return;
      this.pendingYaw += e.movementX * PLAYER.mouseSensitivity;
      this.pendingPitch += e.movementY * PLAYER.mouseSensitivity;
    };
    this.onMouseDown = (e) => {
      if (this.lockSupported || e.button !== 2) return;
      this.dragging = true;
      this.dom.style.cursor = 'grabbing';
      e.preventDefault();
    };
    this.onMouseUp = () => {
      if (!this.dragging) return;
      this.dragging = false;
      this.dom.style.cursor = 'grab';
    };
    this.onContextMenu = (e) => {
      if (!this.lockSupported) e.preventDefault();
    };
    this.onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) this.keys.clear();
    };
    this.onLockError = () => this.lockUnavailable(new Error('pointerlockerror'));
    this.onBlur = () => {
      this.keys.clear();
      this.onMouseUp();
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    this.dom.addEventListener('mousedown', this.onMouseDown);
    this.dom.addEventListener('contextmenu', this.onContextMenu);
  }

  requestLock() {
    if (!this.lockSupported) return;
    let result;
    try {
      result = this.dom.requestPointerLock?.();
    } catch (err) {
      return this.lockUnavailable(err);
    }
    if (result && typeof result.catch === 'function') {
      result.catch((err) => this.lockUnavailable(err));
    }
  }

  lockUnavailable(err) {
    if (!this.lockSupported) return;
    this.lockSupported = false;
    this.locked = false;
    this.dom.style.cursor = 'grab';
    this.onLockUnavailable?.(err);
  }

  /** Everything held down is released — used on death, and on losing focus. */
  releaseAll() {
    this.keys.clear();
    this.pendingYaw = 0;
    this.pendingPitch = 0;
    this.pressedInteract = false;
    this.pressedDrop = false;
    this.pendingSlot = -1;
  }

  /** Collapse the current input state into one intent for this tick. */
  poll() {
    const i = clearIntent(this.intent);
    if (!this.enabled) return i;

    const k = this.keys;
    i.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    i.strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    i.jump = k.has('Space');
    i.crouch = k.has('ControlLeft') || k.has('ControlRight');
    i.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    i.primary = this.primaryHeld === true;

    i.lookYaw = this.pendingYaw;
    i.lookPitch = this.pendingPitch;
    this.pendingYaw = 0;
    this.pendingPitch = 0;

    i.interact = this.pressedInteract;
    i.drop = this.pressedDrop;
    i.place = this.pressedPlace;
    i.eat = this.pressedEat;
    i.selectSlot = this.pendingSlot;
    this.pressedInteract = false;
    this.pressedDrop = false;
    this.pressedPlace = false;
    this.pressedEat = false;
    this.pendingSlot = -1;

    return i;
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    this.dom.removeEventListener('mousedown', this.onMouseDown);
    this.dom.removeEventListener('contextmenu', this.onContextMenu);
  }
}
