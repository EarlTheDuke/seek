// ── claude.js ───────────────────────────────────────────────────────────────
// A presence in the world for the Claude that writes the code.
//
//   npm run claude            joins as "Claude" and stays
//
// Not an agent and not a puppet: it has no mind and does not play. It stands
// there, writes everything anybody says into CHAT.log, and speaks whatever
// appears in SAY.txt. That is the whole thing.
//
// It exists because the two halves of this project could not talk in the place
// the project actually happens. Findings went through DEV-NOTES.md, orders
// through MISSION.md, and a person standing in the game had no way to ask a
// question and get an answer. Now they do — asynchronously, which is honest,
// because the other end only exists when it is invoked.

import { writeFileSync, appendFileSync, existsSync, readFileSync, watch } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROTOCOL_VERSION, C_HELLO, C_CHAT, C_INTENT, C_PING,
  S_WELCOME, S_CHAT, S_JOIN, S_LEAVE, S_SNAPSHOT, encode, decode,
} from '../src/net/protocol.js';
import { createIntent } from '../src/sim/intents.js';

const URL = process.argv[2] ?? 'ws://127.0.0.1:8080';
const ROOT = resolve(import.meta.dirname, '..');
const CHAT = resolve(ROOT, 'CHAT.log');
const SAY = resolve(ROOT, 'SAY.txt');

const stamp = () => new Date().toTimeString().slice(0, 8);
const log = (line) => {
  console.log(`  ${line}`);
  appendFileSync(CHAT, `${stamp()}  ${line}\n`, 'utf8');
};

console.log(`\n  Claude, joining ${URL}\n`);
appendFileSync(CHAT, `\n${stamp()}  ── joined ──\n`, 'utf8');

const ws = new WebSocket(URL);
let id = null;
const names = new Map();
const idle = createIntent();

ws.onerror = () => {
  console.error('  could not connect — is `npm run serve` up?\n');
  process.exit(1);
};
ws.onopen = () => ws.send(encode(C_HELLO, { name: 'Claude', version: PROTOCOL_VERSION }));
ws.onclose = () => {
  log('── the socket closed ──');
  process.exit(0);
};

ws.onmessage = (ev) => {
  const m = decode(ev.data);
  if (!m) return;
  switch (m.type) {
    case S_WELCOME:
      id = m.data.id;
      for (const p of m.data.players) names.set(p.id, p.n);
      log(`joined as #${id}. here already: ${[...names.values()].join(', ') || 'nobody'}`);
      break;
    case S_JOIN:
      names.set(m.data.id, m.data.n);
      log(`${m.data.n} arrived`);
      break;
    case S_LEAVE:
      log(`${names.get(m.data.id) ?? 'someone'} left`);
      names.delete(m.data.id);
      break;
    case S_CHAT:
      if (m.data.id === id) break;
      log(`${m.data.n}: ${m.data.m}`);
      break;
    case S_SNAPSHOT:
      // Where everybody is, and — since the fix — where I am. Without `me`
      // this body would dead-reckon into the next county, which is exactly the
      // bug the puppet turned up an hour ago.
      if (m.data.me) {
        me.x = m.data.me.p[0]; me.z = m.data.me.p[2];
        if (m.data.me.y !== undefined) yaw = m.data.me.y;   // the server is the truth
        if (m.data.me.t !== undefined) lastPitch = m.data.me.t;
      }
      players.clear();
      for (const p of m.data.pl ?? []) {
        players.set(p.id, { name: names.get(p.id) ?? `#${p.id}`, x: p.p[0], z: p.p[2], h: p.h });
      }
      break;
    default:
      break;
  }
};

// ── a body ────────────────────────────────────────────────────────────────
//
// Driven from DO.txt, one command a line, same idea as SAY.txt:
//
//   go 340 280        walk to a point
//   face Ben          turn to look at somebody
//   shoot Ben         face them, draw to full, loose
//   follow Ben        walk to twelve metres of them and hold there
//   stop              stand still
//   where             report positions into CHAT.log
//
// This is not a mind. There is no deliberation and no goal table — it does
// exactly what the last line said and nothing else, which is the point: when
// something goes wrong the only suspect is the game.

const DO = resolve(ROOT, 'DO.txt');
let me = { x: 0, z: 0 };
let yaw = 0;
let order = { kind: 'stop' };
let drawFor = 0;

const players = new Map(); // id -> { name, x, z, h }

function facing(tx, tz) {
  return Math.atan2(-(tx - me.x), -(tz - me.z));
}
function findPlayer(name) {
  const n = String(name).toLowerCase();
  for (const p of players.values()) if (p.name.toLowerCase().startsWith(n)) return p;
  return null;
}

// Everything a player can press. `pulse` is for the edge-triggered ones — the
// server edge-detects them from the intent, so they must be true for exactly
// one tick or E collects on every frame you stand there.
let pulse = null;
let crouching = false;
let pitch = 0;
let strafe = 0;
let slot = -1; // -1 = leave the hotbar alone; 0..4 selects
let lastPitch = 0;

function step() {
  if (ws.readyState !== 1) return;
  const i = createIntent();
  i.crouch = crouching;
  i.strafe = strafe;
  i.selectSlot = slot;
  slot = -1; // one tick, like the real hotbar keys
  // Pitch is absolute here, not a delta — this body has no mouse, so it holds
  // an aim rather than nudging one. Sent as the difference from where the
  // server has us looking, which the controller integrates the same way it
  // integrates mouse movement.
  i.lookPitch = pitch - lastPitch;
  lastPitch = pitch;
  if (pulse) {
    i[pulse] = true;
    log(`pressed ${pulse}`);
    pulse = null;
  }

  if (order.kind === 'go' || order.kind === 'follow') {
    let tx = order.x, tz = order.z;
    let stopAt = 2.5;
    if (order.kind === 'follow') {
      const p = findPlayer(order.who);
      if (!p) { log(`I cannot see ${order.who}`); order = { kind: 'stop' }; }
      else { tx = p.x; tz = p.z; stopAt = 12; }
    }
    if (order.kind !== 'stop') {
      const d = Math.hypot(tx - me.x, tz - me.z);
      if (d > stopAt) {
        const want = facing(tx, tz);
        let diff = ((want - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const turn = Math.max(-0.12, Math.min(0.12, diff));
        i.lookYaw = -turn;
        yaw += turn;
        i.forward = 1;
        i.sprint = d > 40;
      } else if (order.kind === 'go') {
        log(`arrived at ${tx.toFixed(0)},${tz.toFixed(0)}`);
        order = { kind: 'stop' };
      }
    }
  }

  if (order.kind === 'face' || order.kind === 'shoot') {
    const p = findPlayer(order.who);
    if (!p) {
      log(`I cannot see ${order.who}`);
      order = { kind: 'stop' };
    } else {
      const want = facing(p.x, p.z);
      let diff = ((want - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const turn = Math.max(-0.2, Math.min(0.2, diff));
      i.lookYaw = -turn;
      yaw += turn;
      if (order.kind === 'shoot' && Math.abs(diff) < 0.05) {
        drawFor += 1 / 10;
        i.primary = drawFor < 1.3; // hold to draw, release to loose
        if (drawFor >= 1.3) {
          const d = Math.hypot(p.x - me.x, p.z - me.z);
          log(`loosed at ${p.name} — ${d.toFixed(0)} m`);
          drawFor = 0;
          order = { kind: 'stop' };
        }
      } else if (order.kind === 'face' && Math.abs(diff) < 0.05) {
        log(`facing ${p.name}`);
        order = { kind: 'stop' };
      }
    }
  }

  ws.send(encode(C_INTENT, { i }));
}
setInterval(step, 1000 / 10);

function drainDo() {
  try {
    if (!existsSync(DO)) return;
    const text = readFileSync(DO, 'utf8').trim();
    if (!text) return;
    writeFileSync(DO, '', 'utf8');
    for (const raw of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [cmd, a, b] = raw.split(/\s+/);
      switch (cmd) {
        case 'go': order = { kind: 'go', x: Number(a), z: Number(b) }; log(`> going to ${a},${b}`); break;
        case 'face': order = { kind: 'face', who: a }; log(`> facing ${a}`); break;
        case 'shoot': order = { kind: 'shoot', who: a }; drawFor = 0; log(`> shooting at ${a}`); break;
        case 'follow': order = { kind: 'follow', who: a }; log(`> following ${a}`); break;
        case 'stop': order = { kind: 'stop' }; strafe = 0; log('> stopping'); break;

        // ── the rest of the keyboard ──
        // Everything a person can press, so this body is not a crippled
        // version of a player. Anything the game can refuse, it can now be
        // asked to refuse — which is most of what testing is.
        case 'take': pulse = 'interact'; break;          // E — pick up, cut, quarry, cook
        case 'fire': pulse = 'place'; break;             // G — light a fire
        case 'eat': pulse = 'eat'; break;                // R
        case 'drop': pulse = 'drop'; break;              // Q
        case 'jump': pulse = 'jump'; break;
        case 'slot': slot = Number(a) - 1; log(`> slot ${a}`); break;
        case 'crouch': crouching = a !== 'off'; log(`> crouch ${crouching ? 'on' : 'off'}`); break;
        case 'strafe': strafe = a === 'left' ? -1 : a === 'right' ? 1 : 0; log(`> strafe ${a}`); break;
        case 'pitch': pitch = Number(a) * Math.PI / 180; log(`> pitch ${a} degrees`); break;
        case 'say': {
          const text = raw.slice(4).trim();
          if (text) { ws.send(encode(C_CHAT, { m: text.slice(0, 160) })); log(`Claude: ${text}`); }
          break;
        }
        case 'where':
          log(`I am at ${me.x.toFixed(0)},${me.z.toFixed(0)}`);
          for (const p of players.values()) {
            log(`  ${p.name} at ${p.x.toFixed(0)},${p.z.toFixed(0)} — ` +
              `${Math.hypot(p.x - me.x, p.z - me.z).toFixed(0)} m away, ${p.h} health`);
          }
          break;
        default: log(`> I do not know "${cmd}"`);
      }
    }
  } catch { /* mid-write; the next tick gets it */ }
}
writeFileSync(DO, '', 'utf8');
setInterval(drainDo, 400);
setInterval(() => {
  if (ws.readyState === 1) ws.send(encode(C_PING, {}));
}, 5000);

// ── speaking ──
// Write a line into SAY.txt and it goes out, then the file is emptied. A file
// rather than stdin because the thing driving this only exists in bursts and
// cannot hold a terminal open between them.
function drainSay() {
  try {
    if (!existsSync(SAY)) return;
    const text = readFileSync(SAY, 'utf8').trim();
    if (!text) return;
    writeFileSync(SAY, '', 'utf8');
    for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
      ws.send(encode(C_CHAT, { m: line.slice(0, 160) }));
      log(`Claude: ${line}`);
    }
  } catch { /* the file is mid-write; the next tick gets it */ }
}
writeFileSync(SAY, '', 'utf8');
try {
  watch(SAY, () => setTimeout(drainSay, 60));
} catch { /* no watcher on this platform — the poll below covers it */ }
setInterval(drainSay, 1000);

process.on('SIGINT', () => {
  log('── left ──');
  ws.close();
  process.exit(0);
});
