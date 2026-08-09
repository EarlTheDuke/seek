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

/**
 * Wall clock, for the browser's pointer-lock cooldown only.
 *
 * Nothing here reaches the simulation — this is the input layer deciding when
 * it is allowed to ask for the mouse again, and the cooldown it is waiting on
 * is itself measured in real time by the browser. The determinism rule is about
 * world state, and no world state is computed from this.
 */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// Chrome enforces about 1.25 s after Escape. A little over, to be sure.
const LOCK_COOLDOWN_MS = 1400;

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
    // ── LOSING THE MOUSE FOR THE REST OF THE SESSION ──
    //
    // `lockUnavailable` used to be a ONE-WAY LATCH: any single rejected
    // `requestPointerLock()` set `lockSupported = false` for ever, `requestLock`
    // returned immediately from then on, and the cursor became `grab` — a hand.
    // Keys still worked, so the game looked alive and could not be steered, and
    // only a page reload brought it back.
    //
    // The usual cause is not an unsupported browser. Chrome REFUSES a re-lock
    // for about 1.25 s after the user presses Escape to leave one, so pressing
    // Esc and having the game ask for the mouse straight back is enough to kill
    // it. A transient refusal is now transient: the lock is simply not held, and
    // the next click on the canvas asks again.
    this.lockRefused = false;
    this.unlockedAt = 0;
    this.relockClick = false;
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
      // CLICK TO TAKE THE MOUSE BACK. Left button, only when the lock is
      // supported and not currently held — which is the state that used to be
      // a dead end. Flagged so the trigger handler can swallow this one click.
      if (this.lockSupported && !this.locked && e.button === 0) {
        this.relockClick = true;
        this.requestLock();
        e.preventDefault();
        return;
      }
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
      const was = this.locked;
      this.locked = document.pointerLockElement === this.dom;
      if (!this.locked) {
        this.keys.clear();
        // WHEN it was lost, because the browser's re-lock cooldown is measured
        // from here and asking inside it is what used to be fatal.
        if (was) this.unlockedAt = now();
        this.dom.style.cursor = 'grab';
      } else {
        this.lockRefused = false;
        this.dom.style.cursor = '';
      }
    };
    // A `pointerlockerror` is a refusal, not a verdict on the browser.
    this.onLockError = () => this.lockRefusedNow(new Error('pointerlockerror'));
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
    // The browser has no such API at all — the only PERMANENT reason to give up.
    if (typeof this.dom.requestPointerLock !== 'function') {
      return this.lockUnavailable(new Error('no pointer lock in this browser'));
    }
    // Chrome refuses a re-lock for ~1.25 s after Escape released one. Asking
    // inside that window is what used to kill the mouse for good; wait it out
    // and ask again instead.
    const since = now() - this.unlockedAt;
    if (since < LOCK_COOLDOWN_MS) {
      clearTimeout(this._relockTimer);
      this._relockTimer = setTimeout(() => this.requestLock(), LOCK_COOLDOWN_MS - since + 30);
      return;
    }
    let result;
    try {
      result = this.dom.requestPointerLock();
    } catch (err) {
      return this.lockRefusedNow(err);
    }
    if (result && typeof result.catch === 'function') {
      result.catch((err) => this.lockRefusedNow(err));
    }
  }

  /**
   * Refused THIS TIME. Not the same as unsupported, and the difference is the
   * whole bug: one is "click to try again", the other is "use the right button
   * from now on". Conflating them cost a session's mouse-look every time.
   */
  lockRefusedNow(err) {
    this.lockRefused = true;
    this.locked = false;
    this.dom.style.cursor = 'grab';
    this.onLockRefused?.(err);
  }

  lockUnavailable(err) {
    if (!this.lockSupported) return;
    this.lockSupported = false;
    this.locked = false;
    this.dom.style.cursor = 'grab';
    this.onLockUnavailable?.(err);
  }

  /**
   * Did the last click exist only to take the mouse back?
   *
   * Read and cleared by the trigger handler, so clicking into the game to
   * regain the mouse does not also loose an arrow.
   */
  consumeRelockClick() {
    const was = this.relockClick;
    this.relockClick = false;
    return was;
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
