// ── hud.js ──────────────────────────────────────────────────────────────────
// Deliberately almost nothing: a start screen, a keybind list that gets out of
// the way after ten seconds, and an optional frame counter. No crosshair, no
// minimap, no meters. You are here to look at the place, not at an interface.

import { SHOW_FPS } from '../config.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

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
#hl-start .note { margin-top: 14px; opacity: .38; font-size: 11px; }
@keyframes hl-pulse { 0%,100% { opacity: .45 } 50% { opacity: 1 } }

#hl-modes { display: flex; gap: 14px; margin-top: 30px; }
#hl-modes button {
  font: inherit; color: #f3e6d4; cursor: pointer; text-align: left;
  background: rgba(20,14,9,.5); border: 1px solid rgba(255,220,180,.22);
  border-radius: 7px; padding: 13px 20px; min-width: 210px;
  transition: border-color .18s, background .18s, transform .18s;
}
#hl-modes button:hover { border-color: rgba(255,214,150,.75); background: rgba(44,28,14,.66); transform: translateY(-2px); }
#hl-modes .t { display: block; font-size: 15px; letter-spacing: .16em; color: #ffe0b0; }
#hl-modes .d { display: block; font-size: 10.5px; opacity: .55; margin-top: 5px; line-height: 1.45; }

#hl-continue {
  margin-top: 20px; cursor: pointer; font-size: 12px; letter-spacing: .1em;
  color: #ffd9a0; opacity: .85; border-bottom: 1px dashed rgba(255,217,160,.4);
  padding-bottom: 3px; transition: opacity .18s;
}
#hl-continue:hover { opacity: 1; }
#hl-continue .when { display: block; font-size: 10px; opacity: .5; letter-spacing: .06em;
  color: #f3e6d4; border: 0; margin-top: 4px; }

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

/* A permanent breadcrumb where the panel sits, shown whenever it is closed.
   Without it the controls vanish after the opening peek and there is nothing
   left on screen telling you how to get them back. */
#hl-hint { position: absolute; left: 24px; bottom: 22px; font-size: 11px;
  letter-spacing: .14em; opacity: 0; transition: opacity .6s ease; }
#hl-hint.show { opacity: .3; }
#hl-hint b { color: #ffd9a0; font-weight: 400; }

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

/* Crosshair: four ticks that open up with spread and brighten as you draw.
   No centre dot on purpose — the gap IS the accuracy readout. */
#hl-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0;
  opacity: 0; transition: opacity .18s ease; }
#hl-cross.show { opacity: .9; }
#hl-cross i { position: absolute; display: block; background: #fff;
  box-shadow: 0 0 3px rgba(0,0,0,.95); }
#hl-cross i.v { width: 2px; height: 7px; left: -1px; }
#hl-cross i.h { height: 2px; width: 7px; top: -1px; }
#hl-cross.full i { background: #ffe2ac; }

#hl-hot { position: absolute; left: 50%; bottom: 20px; transform: translateX(-50%);
  display: flex; gap: 8px; }
#hl-hot .s { min-width: 76px; padding: 6px 12px; border-radius: 6px;
  background: rgba(10,8,6,.38); border: 1px solid rgba(255,230,200,.1);
  text-align: center; opacity: .55; transition: opacity .15s, border-color .15s; }
#hl-hot .s.on { opacity: 1; border-color: rgba(255,214,150,.55); background: rgba(34,22,10,.55); }
#hl-hot .n { display: block; font-size: 10px; letter-spacing: .1em;
  text-transform: uppercase; opacity: .65; }
#hl-hot .c { display: block; font-size: 15px; color: #ffd9a0; }
#hl-hot .k { position: absolute; margin: -4px 0 0 -6px; font-size: 9px; opacity: .4; }

#hl-prompt { position: absolute; left: 50%; top: 57%; transform: translateX(-50%);
  background: rgba(10,8,6,.5); border: 1px solid rgba(255,230,200,.15);
  border-radius: 6px; padding: 6px 15px; opacity: 0;
  transition: opacity .16s ease; white-space: nowrap; }
#hl-prompt.show { opacity: 1; }
#hl-prompt b { color: #ffd9a0; font-weight: 400; }

/* Full-screen red wash on a hit. Pointer-events off so it never blocks input. */
#hl-hurt { position: absolute; inset: 0; pointer-events: none; opacity: 0;
  background: radial-gradient(ellipse at 50% 50%, rgba(150,0,0,0) 35%, rgba(150,10,10,.92) 100%); }

#hl-health { position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%);
  width: 180px; height: 4px; background: rgba(10,8,6,.55); border-radius: 3px;
  overflow: hidden; opacity: 0; transition: opacity .35s ease;
  border: 1px solid rgba(255,230,200,.12); }
#hl-health.show { opacity: .9; }
#hl-health i { display: block; height: 100%; width: 100%;
  background: linear-gradient(90deg, #c2453a, #e08a5a); transition: width .18s ease; }

#hl-dead { position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 10px; background: rgba(6,3,3,.86);
  opacity: 0; visibility: hidden; transition: opacity .7s ease; }
#hl-dead.show { opacity: 1; visibility: visible; }
#hl-dead h2 { margin: 0; font-size: 28px; font-weight: 300; letter-spacing: .34em;
  text-indent: .34em; color: #e8bfb0; }
#hl-dead p { margin: 0; opacity: .5; font-size: 12px; letter-spacing: .12em; }

/* Survival gauges. Deliberately thin, low-contrast and bottom-left, and each
   one hidden until it has something to say — a screen full of bars would work
   directly against a game about looking at the light. */
#hl-needs { position: absolute; left: 24px; bottom: 62px; display: flex;
  flex-direction: column; gap: 5px; opacity: 0; transition: opacity .5s ease; }
#hl-needs.show { opacity: .92; }
#hl-needs .row { display: flex; align-items: center; gap: 8px; }
#hl-needs .lbl { width: 52px; font-size: 9.5px; letter-spacing: .14em;
  text-transform: uppercase; opacity: .5; text-align: right; }
#hl-needs .bar { width: 116px; height: 3px; border-radius: 2px;
  background: rgba(255,240,220,.13); overflow: hidden; }
#hl-needs .bar i { display: block; height: 100%; transition: width .3s ease, background .5s ease; }
#hl-needs .val { font-size: 10px; opacity: .55; min-width: 46px; }
#hl-needs .row.hide { display: none; }

#hl-cond { position: absolute; left: 24px; bottom: 44px; font-size: 11px;
  letter-spacing: .1em; opacity: 0; transition: opacity .4s ease; }
#hl-cond.show { opacity: .9; }
#hl-cond .bad { color: #e8836f; }
#hl-cond .mid { color: #e8c07f; }

/* Crouch is a toggle, so it needs to say so. Without a readout the only cue is
   two thirds of a metre of eye height, which is easy to miss and impossible to
   tell from "the key did nothing". */
#hl-stance { position: absolute; left: 24px; bottom: 26px; font-size: 10px;
  letter-spacing: .22em; text-transform: uppercase; color: #9fc08a;
  opacity: 0; transition: opacity .25s ease; }
#hl-stance.show { opacity: .75; }

/* The survey: what you learn standing in a stone circle. Deliberately a thing
   that appears, is read, and goes away again — not a map you can keep open.
   You remember where the Black Moss was or you walk back and look again. */
#hl-survey { position: absolute; left: 50%; top: 22%; transform: translateX(-50%);
  min-width: 300px; padding: 18px 26px 20px; text-align: center;
  background: rgba(12,14,11,.72); border: 1px solid rgba(220,210,190,.16);
  opacity: 0; transition: opacity .5s ease; pointer-events: none; }
#hl-survey.show { opacity: 1; }
#hl-survey h3 { font-size: 13px; letter-spacing: .26em; text-transform: uppercase;
  opacity: .62; margin-bottom: 14px; font-weight: 400; }
#hl-survey .row { font-size: 13px; line-height: 1.85; letter-spacing: .06em; opacity: .9; }
#hl-survey .row b { font-weight: 400; opacity: .55; }
`;

const KEYS = [
  ['W A S D', 'walk'],
  ['Shift', 'sprint'],
  ['Space', 'jump'],
  ['C', 'crouch — a toggle, not a hold'],
  ['Mouse 1', 'draw the bow — hold to aim, release to loose'],
  ['E', 'pick up · cut · quarry · cook · use · take bearings'],
  ['G', 'light a fire (costs a branch)'],
  ['B', 'build — whatever your camp is still missing'],
  ['X', 'put on / take off your cloak'],
  ['R', 'eat'],
  ['Q', 'drop what you are holding'],
  ['1 2 / wheel', 'change item'],
  ['F', 'free-fly camera'],
  ['[ ]', 'move the sun'],
  ['P', 'save a screenshot'],
  ['H', 'hide this interface'],
  ['M', 'mute'],
  ['Tab or ?', 'show / hide this list'],
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
        <div id="hl-modes"></div>
        <div id="hl-continue" style="display:none"></div>
        <div class="note">mouse to look &middot; W A S D to walk &middot; <b>Tab</b> for controls</div>
      </div>
      <div id="hl-keys"><h2>Controls</h2><table>${KEYS.map(
        ([k, d]) => `<tr><td class="k">${k}</td><td class="d">${d}</td></tr>`
      ).join('')}</table></div>
      <div id="hl-hint"><b>Tab</b> &nbsp;controls</div>
      <div id="hl-cross"><i class="v"></i><i class="v"></i><i class="h"></i><i class="h"></i></div>
      <div id="hl-prompt"></div>
      <div id="hl-hot"></div>
      <div id="hl-needs">
        <div class="row" data-need="warmth"><span class="lbl">warmth</span><span class="bar"><i></i></span><span class="val"></span></div>
        <div class="row" data-need="food"><span class="lbl">food</span><span class="bar"><i></i></span><span class="val"></span></div>
        <div class="row" data-need="wind"><span class="lbl">breath</span><span class="bar"><i></i></span><span class="val"></span></div>
      </div>
      <div id="hl-cond"></div>
      <div id="hl-stance">crouched</div>
      <div id="hl-survey"><h3></h3><div class="rows"></div></div>
      <div id="hl-health"><i></i></div>
      <div id="hl-fps"></div>
      <div id="hl-toast"></div>
      <div id="hl-hurt"></div>
      <div id="hl-dead"><h2>KILLED</h2><p>the highlands are not empty</p></div>
      <div id="hl-resume">click to resume</div>`;
    document.body.appendChild(this.root);

    this.start = this.root.querySelector('#hl-start');
    this.modesEl = this.root.querySelector('#hl-modes');
    this.continueEl = this.root.querySelector('#hl-continue');
    this.keys = this.root.querySelector('#hl-keys');
    this.fps = this.root.querySelector('#hl-fps');
    this.toastEl = this.root.querySelector('#hl-toast');
    this.resume = this.root.querySelector('#hl-resume');
    this.hint = this.root.querySelector('#hl-hint');
    this.cross = this.root.querySelector('#hl-cross');
    this.crossTicks = [...this.cross.querySelectorAll('i')];
    this.prompt = this.root.querySelector('#hl-prompt');
    this.hotbar = this.root.querySelector('#hl-hot');
    this.hurt = this.root.querySelector('#hl-hurt');
    this.healthBar = this.root.querySelector('#hl-health');
    this.healthFill = this.healthBar.querySelector('i');
    this.deadScreen = this.root.querySelector('#hl-dead');
    this.needsEl = this.root.querySelector('#hl-needs');
    this.condEl = this.root.querySelector('#hl-cond');
    this.stanceEl = this.root.querySelector('#hl-stance');
    this.surveyEl = this.root.querySelector('#hl-survey');
    this.surveyTitle = this.surveyEl.querySelector('h3');
    this.surveyRows = this.surveyEl.querySelector('.rows');
    this.surveyTimer = 0;
    this.needRows = {};
    for (const row of this.needsEl.querySelectorAll('.row')) {
      this.needRows[row.dataset.need] = {
        row,
        fill: row.querySelector('.bar i'),
        val: row.querySelector('.val'),
      };
    }
    this.promptText = null;

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

  /**
   * Build the start screen.
   *
   * @param {object[]} modes    [{ id, name, tagline }]
   * @param {string|null} resumeText  summary of a save, or null if there isn't one
   * @param {(mode, continuing) => void} onBegin
   * @param {() => void} onResume  re-acquire pointer lock after Esc
   */
  wire(modes, resumeText, onBegin, onResume) {
    const begin = (mode, continuing) => {
      this.start.style.opacity = '0';
      setTimeout(() => (this.start.style.display = 'none'), 520);
      this.started = true;
      this.showKeys(10);
      onBegin(mode, continuing);
    };

    this.modesEl.innerHTML = modes
      .map((m) => `<button data-mode="${m.id}"><span class="t">${m.name}</span><span class="d">${m.tagline}</span></button>`)
      .join('');
    for (const btn of this.modesEl.querySelectorAll('button')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        begin(btn.dataset.mode, false);
      });
    }

    if (resumeText) {
      this.continueEl.style.display = '';
      this.continueEl.innerHTML = `continue your run<span class="when">${resumeText}</span>`;
      this.continueEl.addEventListener('click', (e) => {
        e.stopPropagation();
        begin('survival', true);
      });
    }

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

  /**
   * Opened by hand, the panel STAYS open until dismissed.
   *
   * The timed version is only for the automatic peek at the start of a session.
   * Someone who deliberately asked to see the controls is reading them, and
   * having the list evaporate mid-read is precisely the wrong behaviour.
   */
  toggleKeys() {
    if (this.keys.classList.contains('show')) {
      this.keys.classList.remove('show');
      this.keysTimer = 0;
    } else {
      this.showKeys(Infinity);
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

  // ── combat / items ───────────────────────────────────────────────────────

  /**
   * The crosshair gap IS the accuracy readout: wide when your shot would
   * scatter, tight at full draw. Hidden entirely when you hold no weapon,
   * so the clean view is the default state.
   */
  setCrosshair(state, spreadHint) {
    const show = state !== null;
    this.cross.classList.toggle('show', show);
    if (!show) return;

    const charge = state.charge ?? 0;
    const gap = 5 + spreadHint * 26;
    this.cross.classList.toggle('full', charge > 0.985);

    // vertical ticks above/below, horizontal ticks left/right
    this.crossTicks[0].style.transform = `translateY(${-gap - 7}px)`;
    this.crossTicks[1].style.transform = `translateY(${gap}px)`;
    this.crossTicks[2].style.transform = `translateX(${-gap - 7}px)`;
    this.crossTicks[3].style.transform = `translateX(${gap}px)`;

    const bright = 0.55 + 0.45 * charge;
    for (const t of this.crossTicks) t.style.opacity = bright;
  }

  /**
   * Health, the red hit wash, and the death screen.
   *
   * The bar only appears once you are actually hurt — an untouched player sees
   * nothing, which keeps the clean view that the rest of this interface is
   * built around.
   */
  setVitals(vitals) {
    this.hurt.style.opacity = (vitals.hurtFlash * 0.85).toFixed(3);
    const show = vitals.wounded || vitals.dead;
    this.healthBar.classList.toggle('show', show);
    if (show) this.healthFill.style.width = `${(vitals.fraction * 100).toFixed(1)}%`;
    this.deadScreen.classList.toggle('show', vitals.dead);
  }

  /** Remember which mode we are in, so the fps line can say so. */
  setMode(ruleset) {
    this.modeName = ruleset.name;
  }

  /**
   * Survival gauges.
   *
   * Each row appears only once it matters — warmth when you are outside the
   * comfortable band, food below three quarters, breath when you have spent
   * some. An untroubled player sees nothing at all, which is the point.
   */
  setNeeds(body, enabled) {
    if (!enabled) {
      this.needsEl.classList.remove('show');
      this.condEl.classList.remove('show');
      return;
    }

    const rows = [
      {
        key: 'warmth',
        show: body.coreC < 36.6 || body.coreC > 37.6,
        // Centre 37 C in the bar so both directions read as "off comfortable".
        frac: clamp01((body.coreC - 33) / 8),
        colour: body.coreC < 35 ? '#6fa8e8' : body.coreC > 38.6 ? '#e8836f' : '#8fc6c0',
        text: `${body.coreC.toFixed(1)}°`,
      },
      {
        key: 'food',
        show: body.hunger < 75,
        frac: body.hungerFraction,
        colour: body.hunger < 25 ? '#e8836f' : '#c9b070',
        text: `${Math.round(body.hunger)}%`,
      },
      {
        key: 'wind',
        show: body.stamina < 92,
        frac: body.staminaFraction,
        colour: body.stamina < 15 ? '#e8836f' : '#9fc08a',
        text: `${Math.round(body.stamina)}%`,
      },
    ];

    let any = false;
    for (const r of rows) {
      const el = this.needRows[r.key];
      el.row.classList.toggle('hide', !r.show);
      if (!r.show) continue;
      any = true;
      el.fill.style.width = `${(r.frac * 100).toFixed(1)}%`;
      el.fill.style.background = r.colour;
      el.val.textContent = r.text;
    }
    this.needsEl.classList.toggle('show', any);

    const conds = body.conditions;
    if (conds.length) {
      this.condEl.innerHTML = conds
        .slice(0, 2)
        .map((c) => `<span class="${c.bad ? 'bad' : 'mid'}">${c.text}</span>`)
        .join(' &middot; ');
      this.condEl.classList.add('show');
    } else {
      this.condEl.classList.remove('show');
    }
  }

  /**
   * Standing or crouched, and what you have on.
   *
   * Both are toggled states with no other cue — a crouch is two thirds of a
   * metre of eye height and a cloak is a number you cannot see — so this is the
   * only way to tell either from "the key did nothing".
   */
  setStance(crouching, worn = []) {
    const bits = [];
    if (crouching) bits.push('crouched');
    for (const w of worn) bits.push(w.toLowerCase());
    const text = bits.join(' · ');
    if (text !== this.stanceText) {
      this.stanceText = text;
      this.stanceEl.textContent = text;
    }
    this.stanceEl.classList.toggle('show', bits.length > 0);
  }

  /**
   * What you learn standing in a stone circle. Shown, read, and gone — the
   * point is that you have to remember it, or walk back and look again.
   */
  showSurvey(title, lines, seconds = 11) {
    this.surveyTitle.textContent = `from ${title}`;
    this.surveyRows.innerHTML = lines
      .map((l) => {
        const [name, rest] = l.split(' · ');
        return `<div class="row">${name} <b>${rest ?? ''}</b></div>`;
      })
      .join('');
    this.surveyEl.classList.add('show');
    this.surveyTimer = seconds;
  }

  setPrompt(text) {
    if (text === this.promptText) return;
    this.promptText = text;
    this.prompt.classList.toggle('show', !!text);
    if (text) this.prompt.innerHTML = text;
  }

  /** Rebuild the hotbar. Called only when the inventory actually changes. */
  setHotbar(inventory, itemName) {
    this.hotbar.innerHTML = inventory.slots
      .map((s, i) => {
        const name = itemName(s.item);
        const count = s.count > 1 ? s.count : '';
        return (
          `<div class="s${i === inventory.equipped ? ' on' : ''}">` +
          `<span class="k">${i + 1}</span>` +
          `<span class="n">${name}</span>` +
          `<span class="c">${count || '&nbsp;'}</span></div>`
        );
      })
      .join('');
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
    // The breadcrumb is the panel's complement — exactly one of them is up, so
    // there is always something on screen saying how to get the controls back.
    this.hint.classList.toggle('show', this.started && !this.keys.classList.contains('show'));
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    if (this.surveyTimer > 0) {
      this.surveyTimer -= dt;
      if (this.surveyTimer <= 0) this.surveyEl.classList.remove('show');
    }

    if (!SHOW_FPS) return;
    this.frames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.fpsValue = Math.round(this.frames / this.fpsAccum);
      this.frames = 0;
      this.fpsAccum = 0;
      const mode = this.modeName ? `${this.modeName} · ` : '';
      this.fps.textContent = `${mode}${this.fpsValue} fps · ${info}`;
    }
  }
}
