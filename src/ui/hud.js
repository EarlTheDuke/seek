// ── hud.js ──────────────────────────────────────────────────────────────────
// Deliberately almost nothing: a start screen, a keybind list that gets out of
// the way after ten seconds, and an optional frame counter. No crosshair, no
// minimap, no meters. You are here to look at the place, not at an interface.

import { SHOW_FPS } from '../config.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Everything this HUD prints comes from our own tables today, so nothing here
// is hostile yet. It stops being true the moment a panel shows another
// player's name — and in a game that already has other players on a socket,
// that is a change away, not a redesign away.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

/* Choosing your companion. Sits under the mode buttons because it is the
   second decision, not the first — you pick how you want to play, then who
   comes with you. Each one says what it is FOR, because a choice between six
   animals you know nothing about is a coin toss. */
/* How dangerous. A second axis rather than a third mode — "survival, and no
   bears" is a sentence people mean, and folding it into the mode list would
   double the rows the moment anyone wants a peaceful sandbox too. */
#hl-danger { display: flex; gap: 8px; align-items: center; margin-top: 24px;
  flex-wrap: wrap; justify-content: center; }
#hl-danger .lbl { font-size: 10px; letter-spacing: .22em; text-transform: uppercase;
  opacity: .4; margin-right: 6px; }
#hl-danger button { font: inherit; font-size: 11.5px; letter-spacing: .1em; cursor: pointer;
  padding: 6px 13px; color: #e8dcc8; background: rgba(30,22,14,.5);
  border: 1px solid rgba(255,214,150,.2); border-radius: 3px; transition: all .16s; }
#hl-danger button:hover { border-color: rgba(255,214,150,.55); }
#hl-danger button.on { color: #ffe0b0; border-color: rgba(255,214,150,.8);
  background: rgba(60,40,18,.7); }

#hl-pets { margin-top: 26px; }
#hl-pets .lbl { font-size: 10px; letter-spacing: .26em; text-transform: uppercase;
  opacity: .45; margin-bottom: 10px; }
#hl-pets .grid { display: flex; flex-wrap: wrap; gap: 8px; max-width: 640px; }
#hl-pets button {
  font: inherit; color: #f3e6d4; cursor: pointer; text-align: left;
  background: rgba(20,14,9,.4); border: 1px solid rgba(255,220,180,.16);
  border-radius: 6px; padding: 9px 13px; min-width: 196px;
  transition: border-color .16s, background .16s;
}
#hl-pets button:hover { border-color: rgba(255,214,150,.6); background: rgba(44,28,14,.6); }
#hl-pets button.on { border-color: rgba(255,214,150,.9); background: rgba(60,38,18,.75); }
#hl-pets .n { display: block; font-size: 13px; letter-spacing: .12em; color: #ffe0b0; }
#hl-pets .h { display: block; font-size: 10px; opacity: .6; margin-top: 3px; }

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

/* The otter's menu. A real list you pick from, rather than cycling blind
   through a toast at a time — with six tricks that stopped being a keybind and
   started being a guessing game. Shows what it knows, what it is still
   learning, and what it will not do yet and why. */
#hl-menu { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  min-width: 340px; padding: 20px 0 14px; background: rgba(12,14,11,.86);
  border: 1px solid rgba(220,210,190,.18); opacity: 0; pointer-events: none;
  transition: opacity .18s ease; }
#hl-menu.show { opacity: 1; }
#hl-menu h3 { font-size: 12px; letter-spacing: .26em; text-transform: uppercase;
  opacity: .55; text-align: center; margin-bottom: 14px; font-weight: 400; }
#hl-menu .row { display: flex; align-items: baseline; gap: 12px;
  padding: 7px 26px; font-size: 14px; letter-spacing: .04em; }
#hl-menu .row.sel { background: rgba(230,220,200,.11); }
#hl-menu .row .k { opacity: .4; font-size: 12px; min-width: 14px; }
#hl-menu .row .n { flex: 1; }
#hl-menu .row .d { font-size: 11px; opacity: .45; text-align: right; }
#hl-menu .row.off { opacity: .38; }
#hl-menu .row.off .d { color: #e8a07f; }
#hl-menu .foot { margin-top: 12px; padding: 9px 26px 0; font-size: 10px;
  letter-spacing: .16em; text-transform: uppercase; opacity: .38; text-align: center;
  border-top: 1px solid rgba(220,210,190,.1); }

/* The reference book. Two columns because it is a thing you SCAN — you open it
   with a question ("can I afford a lean-to yet?"), find one line, and shut it.
   A single tall column would put half the answers below the fold on a laptop.

   Not a chooser: nothing here is selectable, and that is deliberate. Building
   still happens where you are standing, at the thing you are standing at. A
   reference that also builds would quietly become the way you play, and this
   game is better when you are looking at the hill rather than at a list. */
#hl-book { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  max-width: min(880px, 92vw); max-height: 84vh; overflow-y: auto;
  padding: 22px 30px 16px; background: rgba(12,14,11,.9);
  border: 1px solid rgba(220,210,190,.18); opacity: 0; pointer-events: none;
  transition: opacity .18s ease;
  column-count: 2; column-gap: 34px; column-rule: 1px solid rgba(220,210,190,.08); }
#hl-book.show { opacity: 1; }
#hl-book section { break-inside: avoid; margin-bottom: 18px; }
#hl-book h4 { font-size: 10px; letter-spacing: .24em; text-transform: uppercase;
  opacity: .5; font-weight: 400; margin: 0 0 2px;
  border-bottom: 1px solid rgba(220,210,190,.12); padding-bottom: 5px; }
#hl-book .hint { font-size: 10px; opacity: .34; letter-spacing: .1em; margin: 4px 0 6px; }
#hl-book .row { display: flex; align-items: baseline; gap: 10px; padding: 4px 0;
  font-size: 13px; letter-spacing: .03em; }
#hl-book .row .n { min-width: 116px; }
#hl-book .row .c { font-size: 11px; opacity: .5; flex: 1; }
#hl-book .row .w { font-size: 11px; opacity: .62; text-align: right; max-width: 46%; }
/* Affordable is lit, short is dimmed and the shortfall is the warm colour the
   rest of the HUD already uses for "this is the bit that matters". */
#hl-book .row.no { opacity: .45; }
#hl-book .row.no .w { color: #e8a07f; opacity: .9; }
#hl-book .row.yes .n { color: #ffd9a0; }
#hl-book .foot { font-size: 10px; letter-spacing: .16em; text-transform: uppercase;
  opacity: .32; text-align: center; padding-top: 10px;
  border-top: 1px solid rgba(220,210,190,.1); column-span: all; }

/* Flying. Centre-low, where your eyes already are on the horizon, and only
   while you are actually in the air — a permanent altimeter would make a valley
   you cross once a season feel like a commute. */
#hl-flight { position: absolute; left: 50%; bottom: 21%; transform: translateX(-50%);
  text-align: center; opacity: 0; transition: opacity .3s ease; }
#hl-flight.show { opacity: .9; }
#hl-flight b { display: block; font-size: 15px; letter-spacing: .16em; font-weight: 400;
  color: #ffd9a0; }
#hl-flight.bad b { color: #e8734f; }
#hl-flight span { display: block; font-size: 11px; letter-spacing: .2em; opacity: .5; margin-top: 4px; }

/* The notes box, and the tab that opens it.

   The TAB is not decoration. A keyboard shortcut is invisible to anything that
   is looking at the screen rather than reading the source — a person who has
   not read the controls, and an agent driving the game through a browser — so
   there has to be something on screen to click. It sits out of the way and at
   low opacity until you want it. */
/* pointer-events: auto, because #hl-ui is click-through — the whole HUD sets
   pointer-events: none so that clicking anywhere reaches the game canvas and
   re-acquires the pointer lock. Any control that lives ON the HUD has to opt
   back in, one element at a time. Without it the tab is a picture of a button:
   the click sails through to the canvas, nothing happens, and nothing anywhere
   reports an error. Which is exactly what it did the first time it was clicked
   rather than driven from the console.

   (And no backticks in this block. All of this CSS lives inside a template
   literal, so one in a comment ends the string and takes the whole module with
   it — which is how a stale "dangers is not defined" got chased for a while.) */
#hl-notetab { position: absolute; right: 22px; top: 46px; font: inherit; font-size: 11px;
  letter-spacing: .14em; opacity: .3; cursor: pointer; padding: 5px 10px; color: #f3e6d4;
  border: 1px solid rgba(255,230,200,.18); border-radius: 4px; pointer-events: auto;
  background: rgba(10,8,6,.3); transition: opacity .2s; }
#hl-notetab:hover { opacity: .85; }

#hl-notes { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: min(560px, 92vw); padding: 20px 22px 14px; background: rgba(12,14,11,.94);
  border: 1px solid rgba(220,210,190,.2); opacity: 0; pointer-events: none;
  transition: opacity .18s ease; }
#hl-notes.show { opacity: 1; pointer-events: auto; }
#hl-notes h3 { font-size: 12px; letter-spacing: .26em; text-transform: uppercase;
  opacity: .55; font-weight: 400; margin: 0 0 4px; }
#hl-notes .why { font-size: 11px; opacity: .4; margin-bottom: 12px; line-height: 1.5; }
#hl-notes textarea { width: 100%; height: 128px; resize: vertical; box-sizing: border-box;
  background: rgba(0,0,0,.35); border: 1px solid rgba(220,210,190,.18); color: #f3e6d4;
  font: inherit; font-size: 13px; line-height: 1.55; padding: 10px; outline: none; }
#hl-notes textarea:focus { border-color: rgba(255,217,160,.5); }
#hl-notes .ctx { font-size: 10px; opacity: .34; margin-top: 8px; line-height: 1.5;
  letter-spacing: .04em; }
#hl-notes .row { display: flex; gap: 10px; align-items: center; margin-top: 12px; }
#hl-notes button { font: inherit; font-size: 11px; letter-spacing: .16em;
  text-transform: uppercase; padding: 7px 16px; cursor: pointer; color: #ffd9a0;
  background: rgba(255,217,160,.1); border: 1px solid rgba(255,217,160,.32); }
#hl-notes button:hover { background: rgba(255,217,160,.2); }
#hl-notes button.ghost { color: #f3e6d4; background: none; border-color: rgba(220,210,190,.18); }
#hl-notes .said { font-size: 11px; opacity: .55; margin-left: auto; }

/* The otter. Shown only once it is yours, and each need only once it is
   actually a need — the same rule the body's own gauges follow, for the same
   reason: a permanent row of bars turns a companion into a chore list. */
#hl-pet { position: absolute; right: 24px; bottom: 96px; text-align: right;
  font-size: 11px; letter-spacing: .1em; opacity: 0; transition: opacity .4s ease; }
#hl-pet.show { opacity: .88; }
#hl-pet .who { font-size: 12px; letter-spacing: .18em; text-transform: uppercase; opacity: .6; }
#hl-pet .need { margin-top: 5px; display: flex; align-items: center; gap: 8px;
  justify-content: flex-end; }
#hl-pet .need span { opacity: .55; min-width: 44px; text-align: right; }
#hl-pet .need i { display: block; height: 3px; width: 54px; background: rgba(255,240,220,.13); }
#hl-pet .need i b { display: block; height: 100%; }
#hl-pet .cue { margin-top: 7px; font-size: 10px; opacity: .5; letter-spacing: .16em;
  text-transform: uppercase; }

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
  ['Shift + B', 'what you can build and make, and what you are short of'],
  ['O', 'write a note for the developer — where you are gets attached'],
  ['X', 'put on / take off your cloak'],
  ['Z', 'choose what to ask the otter (Shift+Z back)'],
  ['V', 'tell the otter'],
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
        <div id="hl-danger"></div>
        <div id="hl-pets"><div class="lbl">who comes with you</div><div class="grid"></div></div>
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
      <div id="hl-pet"></div>
      <div id="hl-menu"><h3></h3><div class="rows"></div><div class="foot"></div></div>
      <div id="hl-book"></div>
      <div id="hl-flight"></div>
      <button id="hl-notetab" title="write a note for the developer (O)"
        aria-label="write a note for the developer">✎ note</button>
      <div id="hl-notes">
        <h3>Developer notes</h3>
        <div class="why">Anything you noticed — confusing, broken, boring, or an idea.
          Where you are and what is happening gets attached automatically.</div>
        <textarea placeholder="what happened, and what you expected…"></textarea>
        <div class="ctx"></div>
        <div class="row">
          <button class="send">Send</button>
          <button class="ghost close">Close</button>
          <span class="said"></span>
        </div>
      </div>
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
    this.bookEl = this.root.querySelector('#hl-book');
    this.flightEl = this.root.querySelector('#hl-flight');
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
    this.petEl = this.root.querySelector('#hl-pet');
    this.petKey = '';

    this.menuEl = this.root.querySelector('#hl-menu');
    this.menuTitle = this.menuEl.querySelector('h3');
    this.menuRows = this.menuEl.querySelector('.rows');
    this.menuFoot = this.menuEl.querySelector('.foot');
    this.menu = null; // { items, index, onPick, onClose }
    this.book = false;
    this.heard = []; // every toast this session — see toast()
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
  /**
   * @param {{id,name,helps}[]} companions  who you may bring
   * @param {(id:string)=>void} onCompanion  called as soon as you choose
   */
  wire(modes, resumeText, onBegin, onResume, companions = [], onCompanion = null,
       dangers = [], dangerNow = 'full', onDanger = null) {
    // ── who comes with you ──
    // Chosen BEFORE you start, so the animal exists from the first frame
    // rather than being swapped in afterwards. Each button says what the
    // animal is FOR, because a choice between six creatures you know nothing
    // about is a coin toss rather than a decision.
    if (companions.length) {
      const grid = this.root.querySelector('#hl-pets .grid');
      grid.innerHTML = companions
        .map(
          (c, i) =>
            `<button data-pet="${c.id}"${i === 0 ? ' class="on"' : ''}` +
            ` aria-label="${c.name} — ${c.helps}">` +
            `<span class="n">${c.name}</span><span class="h">${c.helps}</span></button>`
        )
        .join('');
      for (const btn of grid.querySelectorAll('button')) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          for (const b of grid.querySelectorAll('button')) b.classList.remove('on');
          btn.classList.add('on');
          onCompanion?.(btn.dataset.pet);
        });
      }
    } else {
      this.root.querySelector('#hl-pets').style.display = 'none';
    }

    // ── how dangerous ──
    // A row of choices under the modes, because it is genuinely a second axis
    // and not a third mode: "survival, and no bears" is a sentence people mean.
    if (dangers?.length) {
      const wrap = this.root.querySelector('#hl-danger');
      wrap.innerHTML = '<span class="lbl">the world</span>' + dangers
        .map((d) => `<button data-danger="${d.id}"${d.id === dangerNow ? ' class="on"' : ''}` +
          ` aria-label="${d.name} — ${d.tagline}" title="${d.tagline}">${d.name}</button>`).join('');
      for (const btn of wrap.querySelectorAll('button')) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          for (const b of wrap.querySelectorAll('button')) b.classList.remove('on');
          btn.classList.add('on');
          onDanger?.(btn.dataset.danger);
        });
      }
    }

    const begin = (mode, continuing) => {
      this.start.style.opacity = '0';
      setTimeout(() => (this.start.style.display = 'none'), 520);
      this.started = true;
      this.showKeys(10);
      onBegin(mode, continuing);
    };

    // `aria-label` on every start-screen button, because the visible text lives
    // in child spans and an accessibility tree reports the button as blank —
    // which is what a screen reader hears and what an agent driving the game
    // through a browser sees. The whole start screen read as six anonymous
    // buttons until these were added, and picking a companion from six blank
    // rectangles is not a choice, it is a coin toss.
    this.modesEl.innerHTML = modes
      .map((m) => `<button data-mode="${m.id}" aria-label="${m.name} — ${m.tagline}">` +
        `<span class="t">${m.name}</span><span class="d">${m.tagline}</span></button>`)
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
    // RIGHT mouse. The fallback has always been bound to button 2 (see
    // input.js) and this line said "left" — which is the fire button, so
    // following the instruction loosed arrows and never turned the camera. A
    // tester burned two arrows learning that and then drove the camera another
    // way for a whole session. Pointer lock is refused in exactly the automated
    // browsers we playtest in, so this hint is the FIRST thing an agent reads
    // about how to look around, and it was wrong.
    hint.innerHTML = '<td class="k">Right-drag</td><td class="d">hold the RIGHT mouse button to look around</td>';
    row.parentNode.insertBefore(hint, row);
    // The Esc row is meaningless with no lock to escape from.
    const rows = [...this.keys.querySelectorAll('tr')];
    const esc = rows.find((r) => r.textContent.startsWith('Esc'));
    if (esc) esc.remove();
    this.showKeys(12);
    this.toast('pointer lock unavailable here — hold the RIGHT mouse button to look around', 6);
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
    // Everything the game ever said to you, kept.
    //
    // A toast is the game's entire side of the conversation — "you need a
    // branch to build a fire", "not steep enough", "you set down and the wing
    // is still whole" — and it vanishes after two seconds. When somebody
    // reports "I could not work out how to build", the sequence of toasts they
    // saw is the difference between a guess and knowing: it shows what they
    // tried and exactly what the game told them in return.
    this.heard.push({ t: Math.round(performance.now() / 100) / 10, text });
    if (this.heard.length > 200) this.heard.shift();
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
   * Flying, said out loud.
   *
   * There are no instruments in this world and there is not going to be an
   * artificial horizon floating in the corner of a bronze-age valley. So the
   * aircraft talks: "slow — nose down", "stalled", "flying well". Which is
   * genuinely how you fly a hang glider — by the noise and the pressure and
   * what the wing is telling you — and it means the numbers underneath stay
   * honest without ever being shown as numbers.
   */
  setFlight(text, s) {
    this.flightEl.classList.add('show');
    this.flightEl.classList.toggle('bad', /stall|fast|sinking/.test(text));
    this.flightEl.innerHTML = `<b>${esc(text)}</b><span>${Math.round(s.y)} m up</span>`;
  }

  clearFlight() {
    this.flightEl.classList.remove('show');
  }

  // ── developer notes ────────────────────────────────────────────────────────
  //
  // A box you type into that lands in DEV-NOTES.md on disk, with where you were
  // and what was happening stapled on. See the notes sink in vite.config.js.
  //
  // The design decision worth stating: the panel takes the KEYBOARD but does
  // not pause the world. Pausing would be kinder and would also make every note
  // a report about a game that had stopped, which is not the game anybody is
  // complaining about. The cost is that you can be eaten while typing, and that
  // is a fair price and occasionally the note itself.

  wireNotes(getContext, send) {
    this.noteTab = this.root.querySelector('#hl-notetab');
    this.notesEl = this.root.querySelector('#hl-notes');
    this.noteText = this.notesEl.querySelector('textarea');
    this.noteCtx = this.notesEl.querySelector('.ctx');
    this.noteSaid = this.notesEl.querySelector('.said');
    this.getNoteContext = getContext;
    this.sendNote = send;

    this.noteTab.addEventListener('click', (e) => { e.stopPropagation(); this.openNotes(); });
    // Clicking anywhere in the game re-acquires the pointer lock, and a pointer
    // lock while you are typing means the caret is a rumour and your text is
    // going to the world instead. The panel swallows its own clicks.
    this.notesEl.addEventListener('click', (e) => e.stopPropagation());
    this.notesEl.addEventListener('mousedown', (e) => e.stopPropagation());
    this.notesEl.querySelector('.close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeNotes();
    });
    this.notesEl.querySelector('.send').addEventListener('click', (e) => {
      e.stopPropagation();
      this.submitNote();
    });
    // Ctrl+Enter sends, because that is what every box like this does and
    // nobody should have to find the button.
    this.noteText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.submitNote();
      }
    });
  }

  get notesOpen() {
    return !!this.notesEl?.classList.contains('show');
  }

  openNotes() {
    if (!this.notesEl) return;
    // Show the context BEFORE they write, not after. Seeing "Rowan Moor, 03:12,
    // freezing" already attached stops people spending the first line of every
    // note explaining where they are.
    this.noteCtx.textContent = this.getNoteContext?.() ?? '';
    this.notesEl.classList.add('show');
    this.noteSaid.textContent = '';
    // Give up the pointer lock, or the mouse is captured and the caret is a
    // rumour.
    if (document.pointerLockElement) document.exitPointerLock();
    this.noteText.focus();
  }

  closeNotes() {
    this.notesEl?.classList.remove('show');
    this.noteText?.blur();
  }

  async submitNote() {
    const text = this.noteText.value.trim();
    if (!text) return this.closeNotes();
    this.noteSaid.textContent = 'sending…';
    const ok = await this.sendNote?.(text, this.getNoteContext?.() ?? '');
    if (ok) {
      this.noteText.value = '';
      this.noteSaid.textContent = 'written to DEV-NOTES.md';
      setTimeout(() => this.closeNotes(), 700);
    } else {
      // Say so rather than pretending. A note you thought you filed and did not
      // is worse than no notes box at all.
      this.noteSaid.textContent = 'could not write — is `npm run dev` running?';
    }
  }

  // ── the reference book ─────────────────────────────────────────────────────
  //
  // Read-only, and it does not pause anything. Standing still with a book open
  // while the light goes and something walks up behind you is a real decision,
  // and taking that decision away by pausing would make it free.

  get bookOpen() {
    return this.book;
  }

  /**
   * Open, close, or — if it is already open — re-paint with fresh numbers.
   *
   * The refresh matters more than it looks. You open the book, see "need 2
   * branches", and the whole point is that you can now go and pick up two
   * branches; if the line still said "need 2" after you had them, the book
   * would be telling you a small lie every time it was most useful.
   */
  showBook(sections) {
    this.book = true;
    this.bookEl.innerHTML = sections.map((s) => {
      const rows = s.rows.map((r) => {
        const cls = r.can === false ? 'row no' : r.can ? 'row yes' : 'row';
        return `<div class="${cls}"><span class="n">${esc(r.name)}</span>` +
          `<span class="c">${esc(r.cost ?? '')}</span>` +
          `<span class="w">${esc(r.note ?? '')}</span></div>`;
      }).join('');
      return `<section><h4>${esc(s.title)}</h4>` +
        (s.note ? `<div class="hint">${esc(s.note)}</div>` : '') + rows + '</section>';
    }).join('') + '<div class="foot">B or Esc to close</div>';
    this.bookEl.classList.add('show');
  }

  closeBook() {
    this.book = false;
    this.bookEl.classList.remove('show');
  }

  // ── a choosing menu ────────────────────────────────────────────────────────
  //
  // Generic on purpose. It is the otter's today; a fire's recipes or a store's
  // contents would want exactly the same thing, and the alternative is a
  // bespoke overlay per interaction, which is how UI code rots.
  //
  // Keyboard only, and the number keys work directly — a list you have to
  // arrow down through is slower than the cycling it replaced, which would
  // rather defeat the point.

  get menuOpen() {
    return !!this.menu;
  }

  /**
   * @param {string} title
   * @param {{label:string, detail?:string, disabled?:boolean, why?:string, value:any}[]} items
   * @param {(value:any)=>void} onPick
   */
  openMenu(title, items, onPick, onClose = null) {
    // Start on the first thing you can actually choose, so Enter is never a
    // dead press.
    const first = items.findIndex((i) => !i.disabled);
    this.menu = { title, items, index: first < 0 ? 0 : first, onPick, onClose };
    this.menuTitle.textContent = title;
    this.menuFoot.textContent = '1–9 or ↑↓ · Enter to choose · Esc to close';
    this.renderMenu();
    this.menuEl.classList.add('show');
  }

  renderMenu() {
    const { items, index } = this.menu;
    this.menuRows.innerHTML = items
      .map((it, i) => {
        const cls = `row${i === index ? ' sel' : ''}${it.disabled ? ' off' : ''}`;
        const right = it.disabled ? it.why ?? 'not yet' : it.detail ?? '';
        return `<div class="${cls}"><span class="k">${i + 1}</span>` +
          `<span class="n">${it.label}</span><span class="d">${right}</span></div>`;
      })
      .join('');
  }

  closeMenu() {
    if (!this.menu) return;
    const { onClose } = this.menu;
    this.menu = null;
    this.menuEl.classList.remove('show');
    onClose?.();
  }

  /**
   * Feed a keydown to the menu. Returns true if it was consumed, so the caller
   * knows not to also walk, shoot or open the controls with it.
   */
  menuKey(e) {
    if (!this.menu) return false;
    const m = this.menu;
    const step = (d) => {
      // Skip past anything it will not do, in the direction of travel.
      for (let n = 1; n <= m.items.length; n++) {
        const i = (m.index + d * n + m.items.length * n) % m.items.length;
        if (!m.items[i].disabled) {
          m.index = i;
          break;
        }
      }
      this.renderMenu();
    };

    switch (e.code) {
      case 'Escape':
        this.closeMenu();
        return true;
      case 'ArrowDown':
      case 'KeyS':
        step(1);
        return true;
      case 'ArrowUp':
      case 'KeyW':
        step(-1);
        return true;
      case 'Enter':
      case 'Space':
      case 'KeyE': {
        const it = m.items[m.index];
        const pick = m.onPick;
        this.closeMenu();
        if (it && !it.disabled) pick?.(it.value);
        return true;
      }
      default: {
        const digit = /^Digit([1-9])$/.exec(e.code);
        if (!digit) return true; // swallow everything while the menu is up
        const it = m.items[Number(digit[1]) - 1];
        if (!it) return true;
        if (it.disabled) return true;
        const pick = m.onPick;
        this.closeMenu();
        pick?.(it.value);
        return true;
      }
    }
  }

  /**
   * The otter: who it is, what it wants, and what Z has selected.
   *
   * A need only appears once it IS a need. An otter that is fed, played with
   * and warm shows its name and nothing else, because a permanent row of bars
   * turns a companion into a chore list.
   */
  setPet(pet) {
    if (!pet) {
      this.petEl.classList.remove('show');
      this.petKey = '';
      return;
    }
    const rows = [
      ['fed', pet.fed, '#c9b070'],
      ['play', pet.played, '#9fc08a'],
      ['warm', pet.warmth, '#8fc6c0'],
    ].filter(([, v]) => v < 0.72);

    // Rebuild only when something visibly changed — this runs every frame.
    const key = `${pet.name}|${pet.mood}|${pet.trick}|${pet.known}|${rows
      .map(([k, v]) => `${k}${Math.round(v * 12)}`)
      .join()}`;
    if (key === this.petKey) return;
    this.petKey = key;

    const bars = rows
      .map(
        ([label, v, colour]) =>
          `<div class="need"><span>${label}</span><i><b style="width:${Math.round(
            v * 100
          )}%;background:${v < 0.3 ? '#e8836f' : colour}"></b></i></div>`
      )
      .join('');
    this.petEl.innerHTML =
      `<div class="who">${pet.name} · ${pet.mood}</div>${bars}` +
      `<div class="cue">Z ${pet.trick}${pet.known ? '' : ' (learning)'} · V tell</div>`;
    this.petEl.classList.add('show');
  }

  /**
   * What you learn standing in a stone circle. Shown, read, and gone — the
   * point is that you have to remember it, or walk back and look again.
   */
  showSurvey(title, lines, seconds = 11) {
    // The caller supplies the whole phrase. It used to prepend "from", which
    // read fine for a stone circle ("from Ring of Thrawn") and absurdly for a
    // bird ("from the parrot climbs and looks").
    this.surveyTitle.textContent = title;
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
    // Nothing to interact with until you are actually in the world. The sim
    // runs behind the title screen — that is what makes the menu background a
    // living hillside rather than a picture — and the interaction prompt went
    // with it, so "E pick up Branch" floated over the companion picker on the
    // first screen anybody ever sees.
    if (!this.started) text = null;
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
