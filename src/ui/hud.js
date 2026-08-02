// ── hud.js ──────────────────────────────────────────────────────────────────
// Deliberately almost nothing: a start screen, a keybind list that gets out of
// the way after ten seconds, and an optional frame counter. No crosshair, no
// minimap, no meters. You are here to look at the place, not at an interface.

import { SHOW_FPS } from '../config.js';

const CSS = `
#hl-ui, #hl-ui * { box-sizing: border-box; }
#hl-ui {
  position: fixed; inset: 0; pointer-events: none; z-index: 10;
  font: 13px/1.6 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color: #f3e6d4; text-shadow: 0 1px 3px rgba(0,0,0,.75);
  -webkit-font-smoothing: antialiased;
}
#hl-start {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 4px;
  background: radial-gradient(ellipse at 50% 55%, rgba(20,12,6,.55), rgba(8,6,4,.9));
  pointer-events: auto; cursor: pointer; transition: opacity .5s ease;
}
#hl-start h1 {
  margin: 0; font-size: clamp(34px, 7vw, 72px); font-weight: 300;
  letter-spacing: .42em; text-indent: .42em; color: #ffe9c9;
}
#hl-start .sub { opacity: .62; letter-spacing: .2em; text-transform: uppercase; font-size: 11px; }
#hl-start .go { margin-top: 26px; opacity: .9; letter-spacing: .1em; animation: hl-pulse 2.4s ease-in-out infinite; }
#hl-start .note { margin-top: 6px; opacity: .38; font-size: 11px; }
@keyframes hl-pulse { 0%,100% { opacity: .45 } 50% { opacity: 1 } }

#hl-keys {
  position: absolute; left: 22px; bottom: 20px;
  background: rgba(10,8,6,.34); border: 1px solid rgba(255,230,200,.1);
  border-radius: 6px; padding: 12px 16px; opacity: 0; transition: opacity .6s ease;
  backdrop-filter: blur(3px);
}
#hl-keys.show { opacity: .82; }
#hl-keys table { border-collapse: collapse; }
#hl-keys td { padding: 1px 0; vertical-align: top; }
#hl-keys td.k { color: #ffd9a0; padding-right: 14px; white-space: nowrap; }
#hl-keys td.d { opacity: .78; }
#hl-keys h2 { margin: 0 0 8px; font-size: 10px; letter-spacing: .22em;
  text-transform: uppercase; opacity: .5; font-weight: 400; }

#hl-fps { position: absolute; right: 18px; top: 14px; opacity: .5; font-size: 12px; text-align: right; }
#hl-toast {
  position: absolute; left: 50%; bottom: 13%; transform: translateX(-50%);
  background: rgba(10,8,6,.5); border: 1px solid rgba(255,230,200,.13);
  border-radius: 20px; padding: 7px 20px; opacity: 0; transition: opacity .3s ease;
  letter-spacing: .06em;
}
#hl-toast.show { opacity: .95; }
#hl-resume {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(8,6,4,.45); pointer-events: auto; cursor: pointer;
  letter-spacing: .16em; text-transform: uppercase; font-size: 12px;
  opacity: 0; visibility: hidden; transition: opacity .3s ease;
}
#hl-resume.show { opacity: 1; visibility: visible; }
#hl-ui.hidden > *:not(#hl-toast) { opacity: 0 !important; visibility: hidden !important; }
`;

const KEYS = [
  ['W A S D', 'walk'],
  ['Shift', 'sprint'],
  ['Space', 'jump'],
  ['Ctrl', 'crouch'],
  ['F', 'free-fly camera'],
  ['[ ]', 'move the sun'],
  ['P', 'save a screenshot'],
  ['H', 'hide this interface'],
  ['M', 'mute'],
  ['?', 'show these again'],
  ['Esc', 'release the mouse'],
];

export class Hud {
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.id = 'hl-ui';
    this.root.innerHTML = `
      <div id="hl-start">
        <h1>HIGHLANDS</h1>
        <div class="sub">a golden hour, somewhere high up</div>
        <div class="go">click to explore</div>
        <div class="note">mouse to look &middot; W A S D to walk</div>
      </div>
      <div id="hl-keys"><h2>Controls</h2><table>${KEYS.map(
        ([k, d]) => `<tr><td class="k">${k}</td><td class="d">${d}</td></tr>`
      ).join('')}</table></div>
      <div id="hl-fps"></div>
      <div id="hl-toast"></div>
      <div id="hl-resume">click to resume</div>`;
    document.body.appendChild(this.root);

    this.start = this.root.querySelector('#hl-start');
    this.keys = this.root.querySelector('#hl-keys');
    this.fps = this.root.querySelector('#hl-fps');
    this.toastEl = this.root.querySelector('#hl-toast');
    this.resume = this.root.querySelector('#hl-resume');

    this.started = false;
    this.dragLook = false;
    this.keysTimer = 0;
    this.toastTimer = 0;
    this.hidden = false;
    this.pendingShot = false;

    this.frames = 0;
    this.fpsAccum = 0;
    this.fpsValue = 0;

    if (!SHOW_FPS) this.fps.style.display = 'none';
  }

  /** `onBegin` fires on the first click; `onResume` on every later one. */
  wire(onBegin, onResume) {
    this.start.addEventListener('click', () => {
      this.start.style.opacity = '0';
      setTimeout(() => (this.start.style.display = 'none'), 520);
      this.started = true;
      this.showKeys(10);
      onBegin();
    });
    this.resume.addEventListener('click', () => onResume());
  }

  setLocked(locked) {
    if (!this.started || this.dragLook) return;
    this.resume.classList.toggle('show', !locked);
  }

  /**
   * Pointer lock was refused — usually because the page is embedded in an
   * iframe without `allow="pointer-lock"`. Swap the controls hint over to the
   * drag fallback and make sure the "click to resume" curtain, which exists
   * only to re-acquire a lock we are never going to get, stays out of the way.
   */
  useDragLook() {
    if (this.dragLook) return;
    this.dragLook = true;
    this.resume.classList.remove('show');
    const row = this.keys.querySelector('tr');
    const hint = document.createElement('tr');
    hint.innerHTML = '<td class="k">Drag</td><td class="d">hold left mouse to look</td>';
    row.parentNode.insertBefore(hint, row);
    // The Esc row is meaningless with no lock to escape from.
    const rows = [...this.keys.querySelectorAll('tr')];
    const esc = rows.find((r) => r.textContent.startsWith('Esc'));
    if (esc) esc.remove();
    this.showKeys(12);
    this.toast('pointer lock unavailable here — hold the left mouse button to look', 5);
  }

  showKeys(seconds) {
    this.keys.classList.add('show');
    this.keysTimer = seconds;
  }

  toggleKeys() {
    if (this.keys.classList.contains('show')) {
      this.keys.classList.remove('show');
      this.keysTimer = 0;
    } else {
      this.showKeys(12);
    }
  }

  toast(text, seconds = 1.6) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  /** H — hide everything, for looking at the world properly. */
  toggleHidden() {
    this.hidden = !this.hidden;
    this.root.classList.toggle('hidden', this.hidden);
    this.toast(this.hidden ? 'interface hidden — H to restore' : 'interface shown');
    return this.hidden;
  }

  requestScreenshot() {
    this.pendingShot = true;
  }

  /**
   * Must be called immediately after the final render, in the same frame: the
   * drawing buffer is cleared before the next one, and we deliberately do not
   * enable `preserveDrawingBuffer` just for this (it costs frame time always).
   */
  captureIfPending(renderer) {
    if (!this.pendingShot) return;
    this.pendingShot = false;
    try {
      const url = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `highlands-${Date.now()}.png`;
      a.click();
      this.toast('screenshot saved');
    } catch (err) {
      this.toast('screenshot failed');
      console.warn('Screenshot failed:', err);
    }
  }

  update(dt, info) {
    if (this.keysTimer > 0) {
      this.keysTimer -= dt;
      if (this.keysTimer <= 0) this.keys.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }

    if (!SHOW_FPS) return;
    this.frames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.fpsValue = Math.round(this.frames / this.fpsAccum);
      this.frames = 0;
      this.fpsAccum = 0;
      this.fps.textContent = `${this.fpsValue} fps · ${info}`;
    }
  }
}
