// ── bot.js ──────────────────────────────────────────────────────────────────
// A headless player that wanders, so there is someone to meet.
//
//   npm run bot                      (joins ws://127.0.0.1:8080 as "Wanderer")
//   node server/bot.js ws://host:8090 Morag
//
// Not an AI and not pretending to be — it walks a slow figure of eight and
// occasionally says something. Its job is to be a second body on the wire so
// the client, the interpolation and the avatars can be looked at without
// needing two people and two machines.
//
// It is also the shape a Phase 8 LLM mind plugs into: something that is not a
// human, holding a socket, producing intents. The simulation cannot tell the
// difference, which was the entire point of the intent seam.

import { PROTOCOL_VERSION, C_HELLO, C_INTENT, C_CHAT, S_WELCOME, S_CHAT, S_SNAPSHOT,
         encode, decode } from '../src/net/protocol.js';

const URL = process.argv[2] ?? 'ws://127.0.0.1:8080';
const NAME = process.argv[3] ?? 'Wanderer';

const ws = new WebSocket(URL);
let id = null;
let t = 0;
const intent = { forward: 0, strafe: 0, lookYaw: 0, sprint: false, crouch: false };

ws.onopen = () => ws.send(encode(C_HELLO, { name: NAME, version: PROTOCOL_VERSION }));

ws.onmessage = (ev) => {
  const msg = decode(ev.data);
  if (!msg) return;
  if (msg.type === S_WELCOME) {
    id = msg.data.id;
    console.log(`  ${NAME} joined as #${id} on seed ${msg.data.seed}`);
  } else if (msg.type === S_CHAT && msg.data.id !== id) {
    console.log(`  <${msg.data.n}> ${msg.data.m}`);
  }
};

ws.onerror = (e) => console.error(`  socket error: ${e.message ?? e}`);
ws.onclose = () => {
  console.log('  disconnected');
  process.exit(0);
};

// A figure of eight at walking pace, so it is always somewhere slightly
// different and always visible from the spawn.
setInterval(() => {
  if (id === null) return;
  t += 1 / 30;
  intent.forward = 1;
  intent.lookYaw = Math.sin(t * 0.35) * 0.02;
  intent.sprint = Math.sin(t * 0.11) > 0.6;
  intent.crouch = Math.sin(t * 0.07) < -0.75;
  ws.send(encode(C_INTENT, { i: intent }));
}, 1000 / 30);

const LINES = [
  'cold up here',
  'there are lights on the ridge',
  'do not open the barrow',
  'I heard something in the gorge',
];
let line = 0;
setInterval(() => {
  if (id === null) return;
  ws.send(encode(C_CHAT, { m: LINES[line++ % LINES.length] }));
}, 25000);

process.on('SIGINT', () => {
  ws.close();
  process.exit(0);
});
