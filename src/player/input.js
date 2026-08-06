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

/**
 * Is this key going into a text field rather than into the world?
 *
 * Asked of the event's target, so it is true for any input, textarea or
 * contenteditable — including ones added long after this file was last read.
 * The alternative is a "a panel is open" flag that every new panel has to
 * remember to set, and the say box proved how that ends: it set one, main.js
 * honoured it, and this listener never heard about it.
 */
function isTyping(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

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
    this.pressedAlternate = false;
    this.pendingSlot = -1;
    // Crouch is a state, not a held key. See the note on `onKeyDown`.
    this.crouchToggled = false;

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
    // ── on crouch, and why it is C and not Ctrl ──────────────────────────────
    //
    // Two things were wrong with binding crouch to Ctrl, and they compound.
    //
    // 1. A keydown for the Control key ITSELF reports `ctrlKey === true`. The
    //    modifier guard that used to sit at the top of this handler therefore
    //    dropped the very key crouch was bound to, and crouch had never once
    //    worked in a real browser. It passed my tests because those dispatched
    //    a synthetic `KeyboardEvent('keydown', { code: 'ControlLeft' })`
    //    WITHOUT the modifier flag a real keyboard sets — the test was not
    //    reproducing the event it claimed to.
    //
    // 2. Worse, the same guard dropped W A S D while Ctrl was held, and Ctrl+W
    //    closes the browser tab. A page cannot preventDefault that outside of
    //    fullscreen keyboard-lock. So in a game where you crouch-WALK, Ctrl is
    //    a button that deletes your session — that is not a binding to fix, it
    //    is a binding to remove.
    //
    // Crouch now toggles on C. A toggle also happens to suit the game: you
    // stalk a deer for minutes at a time, and holding a key that long is a
    // chore rather than a decision.
    this.onKeyDown = (e) => {
      // ── are you typing? ──
      // This listener is on `window`, independently of the one in main.js, so a
      // panel that "takes the keyboard" by returning early from ITS handler does
      // nothing whatsoever to this one. Both fire. The say box was unusable
      // because of it: every letter you typed also played the game — W walked,
      // E picked things up — and Space did not reach the field at all, because
      // of the preventDefault below that exists to stop the page scrolling.
      //
      // Asking the EVENT where it is going is the fix that keeps working. Any
      // text field added later is covered without knowing this file exists,
      // which is the opposite of the flag-per-panel arrangement that let this
      // through in the first place.
      if (isTyping(e.target)) return;

      // Meta and Alt belong to the OS. Ctrl no longer blanket-blocks — holding
      // it used to freeze every movement key the game reads.
      if (e.metaKey || e.altKey) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      // Edge-triggered actions are latched here and cleared on the next poll,
      // so a tap is never lost between ticks. Ctrl+<key> is a browser shortcut
      // — Ctrl+R must reload rather than eat your venison.
      if (e.repeat || e.ctrlKey) return;
      if (e.code === 'KeyC') this.crouchToggled = !this.crouchToggled;
      if (e.code === 'KeyE') this.pressedInteract = true;
      if (e.code === 'KeyQ') this.pressedDrop = true;
      // "I meant the OTHER one." E resolves by distance and urgency, which is
      // the right default and was previously the only option: standing at a
      // fire holding raw meat, two presses of E silently burned two branches
      // feeding the fire before it would cook anything, because a fire below
      // 35% fuel outranks a workbench. That rule is correct. Being unable to
      // overrule it is not.
      if (e.code === 'KeyF') this.pressedAlternate = true;
      if (e.code === 'KeyG') this.pressedPlace = true;
      if (e.code === 'KeyR') this.pressedEat = true;
      if (/^Digit[1-5]$/.test(e.code)) this.pendingSlot = Number(e.code.slice(5)) - 1;
    };
    // Keyup is NOT gated on isTyping. If you hold W, then click into the say
    // box, the keyup arrives with the field focused — gate it and the key stays
    // latched down for ever and you walk north until you close the game.
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
    this.crouchToggled = false;
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
    i.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    // Sprinting or jumping stands you up. Without this a forgotten toggle
    // leaves you shuffling at 2 m/s wondering what is wrong with the game.
    if (i.sprint || i.jump) this.crouchToggled = false;
    i.crouch = this.crouchToggled;
    i.primary = this.primaryHeld === true;

    i.lookYaw = this.pendingYaw;
    i.lookPitch = this.pendingPitch;
    this.pendingYaw = 0;
    this.pendingPitch = 0;

    i.interact = this.pressedInteract;
    i.drop = this.pressedDrop;
    i.place = this.pressedPlace;
    i.eat = this.pressedEat;
    i.alternate = this.pressedAlternate;
    i.selectSlot = this.pendingSlot;
    this.pressedInteract = false;
    this.pressedDrop = false;
    this.pressedPlace = false;
    this.pressedEat = false;
    this.pressedAlternate = false;
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
