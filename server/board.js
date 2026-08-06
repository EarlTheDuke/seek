// ── board.js ────────────────────────────────────────────────────────────────
// A LIVE BOARD, not a chat column. Rung 5's second mile.
//
//   BOARD=on  npm run agents          the board at http://127.0.0.1:8090
//   BOARD=8090 npm run agents         the same thing, said with a port
//
// NARRATE was the first mile: each mind says its goal, its reason and its
// persona into the world's chat as it changes its mind. That works, and it has
// the flaw every chat column has — it SCROLLS. Six minds narrating push each
// other off the top in seconds, you cannot see the state of the fleet at a
// glance, and three of the four things every agent has been recording since the
// day minds were added never appear at all:
//
//   intentions   what it MEANT, with the reason it gave        ← chat has this
//   deeds        what it actually DID                          ← invisible
//   shots        every arrow, and how far off it went          ← invisible
//   refusals     the shots it would NOT take, and why          ← invisible
//
// The last one is the one that explains a quiet hunter. A body that stalks a
// deer for two minutes and never looses is either broken or being careful, and
// nothing on screen has ever been able to tell you which.
//
// So: a page, one card per mind, repainting once a second. Who it is, what it
// is doing, WHY, and the four threads underneath. A watcher should be able to
// say "the hoarder is sitting on wood while the generous one freezes" without
// reading a log afterwards.
//
// THREE RULES THIS FILE KEEPS.
//
//   It reads and never writes. Same rule the renderer lives by: the board may
//   not touch an agent, a socket or the world. `boardState` takes agents and
//   returns a plain object, and that is the whole of its power.
//
//   It is pure, so it is testable. Agents in, JSON out — no fs, no clock, no
//   network in `boardState`. `boardcheck` builds a board out of invented agents
//   as well as real ones, exactly the way `reportcheck` does with playreport.
//
//   It is off unless asked for, binds to loopback only, and CANNOT kill the run
//   that hosts it. A port already taken logs one line and the fleet plays on.

import http from 'node:http';

/** How much of each thread a card shows. The logs themselves are longer. */
const SHOW = { intentions: 5, deeds: 5, strays: 5, refusals: 4, said: 3 };

/** The board's own default port. Deliberately not one of the check ports. */
export const BOARD_PORT = 8090;

/**
 * `BOARD=on` / `BOARD=8090` / absent -> a port, or null for off.
 *
 * Same shape as every other knob in this project: off by default, and a bare
 * `on` means "yes, with the sensible number".
 */
export function boardPortFromEnv(env = process.env) {
  const raw = String(env.BOARD ?? '').trim();
  if (!raw) return null;
  if (/^(on|yes|1|true)$/i.test(raw)) return BOARD_PORT;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}

/**
 * "3 m short and 2 m left at 24 m, into the ground". Where a stray arrow went.
 *
 * EVERY ENTRY IN `Agent.shots` IS A MISS. It is filled from one place only —
 * `howItMissed`, called from the `'miss'` event — and `hit` on that event is
 * NOT a boolean, it is the SURFACE the shaft buried itself in: 'ground',
 * 'water', 'solid', a tree's tag. `projectiles.js` says so in as many words:
 * "a creature or a player hit never reaches here".
 *
 * Worth the paragraph because the first version of this file read that field as
 * a boolean, and a truthy string turned seven consecutive misses into "7 hits,
 * 7 of 7". A board that manufactures a green number out of a red one is worse
 * than no board, and it passed its own check — because the check's fixture was
 * written from the same wrong assumption. Arrows that go HOME are counted
 * somewhere else entirely: `wounds` (it stayed up) and `kills` (it did not).
 */
function strayWords(s) {
  if (!s) return '';
  const into = s.hit ? `, into ${s.hit === 'solid' ? 'something solid' : `the ${s.hit}`}` : '';
  const bits = [];
  if (Math.abs(s.along ?? 0) >= 1.5) bits.push(`${Math.abs(s.along).toFixed(0)} m ${s.along < 0 ? 'short' : 'long'}`);
  if (Math.abs(s.across ?? 0) >= 1.5) bits.push(`${Math.abs(s.across).toFixed(0)} m ${s.across < 0 ? 'left' : 'right'}`);
  if (!bits.length) return `a hand's width off at ${Math.round(s.dist ?? 0)} m${into}`;
  return `${bits.join(' and ')} at ${Math.round(s.dist ?? 0)} m${into}`;
}

/**
 * The whole fleet, as one plain object.
 *
 * PURE. Nothing in here reads a clock, a file or a socket — `seconds` and the
 * spend are handed in by the caller, the same way `buildReport` is handed its
 * meta. That is what lets a check assert the board's content without standing
 * a server up first.
 *
 * Every field is defensive. An Agent that has not received a snapshot yet has
 * no `health`, no `food` and no `carrying`, and a board that throws on the
 * first second of a run is worse than no board.
 *
 * @param {object[]} agents  live Agent instances
 * @param {object} meta      { seconds, minds, model, spend, url }
 */
export function boardState(agents, meta = {}) {
  const live = (agents ?? []).filter(Boolean);
  return {
    at: Math.round(meta.seconds ?? 0),
    minds: meta.minds ?? 'scripted',
    model: meta.model ?? null,
    url: meta.url ?? null,
    spend: meta.spend ?? null,
    players: live.map((a) => {
      // `status` is the agent's own summary and already carries goal, why and
      // persona — it was built for "anything drawing a live board", and this is
      // that thing. Everything else here is a thread it does not include.
      const s = a.status ?? {};
      // Three separate logs, and the board must not confuse them. `releases` is
      // every time the string went slack — meant or not — and its `loosed` flag
      // says whether a shaft actually left. `shots` is the strays. `wounds` and
      // `kills` are the ones that went home. Loosed is the honest denominator:
      // "seven astray" is a very different session from "seven astray out of
      // eight", and only `releases` knows the second number.
      const strays = a.shots ?? [];
      const loosed = (a.releases ?? []).filter((r) => r.loosed).length;
      const wounds = (a.wounds ?? []).length;
      const kills = (a.kills ?? []).length;
      return {
        id: s.id ?? a.id ?? null,
        name: s.name ?? a.name ?? '?',
        provider: s.provider ?? a.provider?.name ?? 'scripted',
        model: a.provider?.model ?? null,
        // The disposition travels with the label. A watcher who cannot remember
        // what "loner" was told to be cannot attribute anything to it, and the
        // whole point of a persona run is attribution — so the character itself
        // hangs off the tag rather than living in a table nobody has open.
        persona: a.persona
          ? { id: a.persona.id, name: a.persona.name ?? a.persona.id, character: a.persona.character ?? null }
          : null,

        // ── the headline ──
        goal: s.goal ?? null,
        why: s.why ?? null,
        thinking: !!s.thinking,

        // ── how it is ──
        // The agent's own words for its own body, straight off `brief` — the
        // board says what the MIND believes, because that is what explains the
        // decision on the line above it. A card that showed the server's truth
        // next to a mind's reasoning would be quietly comparing two things.
        health: a.health,
        food: a.food,
        where: a.where?.() ?? null,
        hours: a.hours === undefined ? null : +a.hours.toFixed(1),
        carrying: Object.entries(a.carrying ?? {})
          .filter(([, n]) => n > 0)
          .map(([id, n]) => ({ id, n })),

        // ── tallies ──
        decisions: s.decisions ?? 0,
        tokens: s.tokens ?? 0,
        kills,
        wounds,
        loosed,
        astray: strays.length,
        lastError: s.lastError ?? null,

        // ── the four threads, newest last ──
        intentions: (a.intentions ?? []).slice(-SHOW.intentions),
        // WHAT REACHES `deeds`, exactly: killed, ate, ate raw, cooked, lit a
        // fire. Those are the five `did()` calls in agent.js and there are no
        // others — notably GATHERING IS NOT ONE. So a card can honestly read
        // "nothing worth telling yet" beside a pack that has gained two wood,
        // and the `carrying` line is the truthful record of that: it comes off
        // the snapshot, which is the server's word.
        //
        // Recording a gather here from the keypress would be a LIE. The agent
        // presses `interact` on arrival and `arriveWithin` is 6 m while
        // `PICKUP.radius` is 2.2 — a body can press E thirty-five times at
        // nothing, and a check has already been fooled by exactly that. The
        // honest signal is the inventory going up. Wiring that into a deed is
        // its own job; it is in STATE.md's queue rather than guessed at here.
        deeds: (a.deeds ?? []).slice(-SHOW.deeds),
        strays: strays.slice(-SHOW.strays).map((x) => ({ into: x.hit ?? null, text: strayWords(x) })),
        refusals: (a.refusals ?? []).slice(-SHOW.refusals),
        said: (a.said ?? []).slice(-SHOW.said),
      };
    }),
  };
}

/**
 * The page. One file, no network of its own, no build step.
 *
 * It fetches `/board.json` once a second and repaints. Deliberately not a
 * WebSocket: the board is a watcher and must never be a reason the fleet is
 * slower, and one small GET a second from one tab is beneath measurement.
 */
export function boardHtml() {
  return `<!doctype html>
<meta charset="utf-8">
<title>Highlands — the minds</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#0e1113; color:#d7d3c8;
         font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  header { padding:14px 18px; border-bottom:1px solid #23282c; display:flex;
           gap:18px; align-items:baseline; flex-wrap:wrap; }
  h1 { margin:0; font-size:15px; font-weight:600; letter-spacing:.04em; color:#e8e3d6; }
  .meta { color:#6d7680; font-size:12px; }
  main { display:grid; gap:12px; padding:14px 18px;
         grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); }
  .card { background:#14181b; border:1px solid #23282c; border-radius:6px; padding:12px 13px; }
  .card.thinking { border-color:#3a4a3c; }
  .who { display:flex; gap:8px; align-items:baseline; flex-wrap:wrap; margin-bottom:9px; }
  .name { font-weight:600; color:#e8e3d6; }
  .tag { font-size:11px; padding:1px 6px; border-radius:9px; background:#20262a; color:#8a949e; }
  .tag.persona { background:#2c2418; color:#c9a86a; }
  .tag.model { background:#182028; color:#7fa3c0; }
  .goal { font-size:15px; color:#a8d5a2; margin:0 0 2px; }
  .why { color:#9aa4ae; font-style:italic; margin:0 0 9px; }
  .why:empty { display:none; }
  .body { color:#7c858e; font-size:12px; margin-bottom:9px; }
  .body b { color:#c8c2b4; font-weight:400; }
  .hurt { color:#d08b74; }
  h2 { font-size:11px; text-transform:uppercase; letter-spacing:.09em;
       color:#5d666e; margin:9px 0 3px; font-weight:600; }
  ul { margin:0; padding:0; list-style:none; }
  li { padding:1px 0; color:#9aa4ae; font-size:12.5px; }
  li .h { color:#5d666e; }
  li.miss { color:#a8767a; }
  li.hit { color:#a8d5a2; }
  li.said { color:#c9a86a; }
  .empty { color:#4a5259; font-style:italic; }
  footer { padding:10px 18px 24px; color:#4a5259; font-size:12px; }
</style>
<header>
  <h1>THE MINDS</h1>
  <span class="meta" id="meta">connecting…</span>
</header>
<main id="board"></main>
<footer>Reading only. This page never touches the world — it watches the fleet that does.</footer>
<script>
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const hour = (h) => h === undefined || h === null ? '' : '<span class="h">' + String(Math.floor(h)).padStart(2,'0') + ':00</span> ';
const words = (v, table, dflt) => {
  if (v === undefined || v === null) return dflt;
  for (const [limit, word] of table) if (v < limit) return word;
  return dflt;
};
const list = (items, render, empty) => items && items.length
  ? '<ul>' + items.map(render).join('') + '</ul>'
  : '<ul><li class="empty">' + empty + '</li></ul>';

function card(p) {
  const health = words(p.health, [[30,'nearly finished'],[60,'badly hurt'],[90,'hurt']], 'unhurt');
  const food = words(p.food, [[1,'starving'],[25,'hungry']], 'fed');
  const carrying = (p.carrying || []).map((c) => c.n + ' ' + esc(c.id)).join(', ');
  return '<div class="card' + (p.thinking ? ' thinking' : '') + '">'
    + '<div class="who">'
      + '<span class="name">' + esc(p.name) + '</span>'
      + '<span class="tag">#' + esc(p.id) + '</span>'
      + (p.persona ? '<span class="tag persona" title="' + esc(p.persona.character || p.persona.name) + '">'
          + esc(p.persona.id) + '</span>' : '')
      + '<span class="tag model">' + esc(p.model || p.provider) + '</span>'
    + '</div>'
    + '<p class="goal">' + esc(p.goal || 'thinking…') + '</p>'
    + '<p class="why">' + (p.why ? '“' + esc(p.why) + '”' : '') + '</p>'
    + '<div class="body">'
      + hour(p.hours)
      + '<b class="' + (health === 'unhurt' ? '' : 'hurt') + '">' + health + '</b>, '
      + '<b class="' + (food === 'fed' ? '' : 'hurt') + '">' + food + '</b>'
      + (p.where ? ' · ' + esc(p.where) : '')
      + (carrying ? ' · carrying ' + esc(carrying) : ' · empty-handed')
      + '<br>' + p.decisions + ' decisions · ' + p.loosed + ' loosed, ' + p.astray + ' astray · '
      + p.wounds + ' wounded, ' + p.kills + ' killed'
      + (p.tokens ? ' · ' + p.tokens + ' tokens' : '')
      + (p.lastError ? '<br><span class="hurt">' + esc(p.lastError) + '</span>' : '')
    + '</div>'
    + '<h2>meant</h2>' + list(p.intentions,
        (i) => '<li>' + hour(i.h) + esc(i.goal) + (i.why ? ' — <i>' + esc(i.why) + '</i>' : '') + '</li>',
        'has not decided anything yet')
    + '<h2>did</h2>' + list(p.deeds,
        (d) => '<li>' + hour(d.h) + esc(d.text) + '</li>', 'nothing worth telling yet')
    // Headed "went astray" and not "arrows", because that is what this log is.
    // Every entry is a shaft in a hillside; the ones that went home are in the
    // wounded/killed tally above and never appear here.
    + '<h2>went astray</h2>' + list(p.strays,
        (s) => '<li class="miss">' + esc(s.text) + '</li>', 'nothing wasted')
    + '<h2>would not shoot</h2>' + list(p.refusals,
        (r) => '<li>' + r.d + ' m — ' + esc(r.why) + '</li>', 'no refusals')
    + (p.said && p.said.length
        ? '<h2>said</h2><ul>' + p.said.map((s) => '<li class="said">“' + esc(s) + '”</li>').join('') + '</ul>'
        : '')
  + '</div>';
}

async function tick() {
  try {
    const s = await (await fetch('/board.json', { cache: 'no-store' })).json();
    document.getElementById('meta').textContent =
      s.players.length + ' minds · ' + s.at + ' s · ' + s.minds
      + (s.model ? ' · ' + s.model : '')
      + (s.spend ? ' · ' + s.spend.calls + '/' + s.spend.of + ' calls' : '');
    document.getElementById('board').innerHTML = s.players.map(card).join('');
  } catch (err) {
    document.getElementById('meta').textContent = 'the fleet has gone (' + err.message + ')';
  }
}
tick();
setInterval(tick, 1000);
</script>
`;
}

/**
 * Serve it, and never let serving it be the thing that breaks the run.
 *
 * Loopback only. This is a watching aid for the machine the fleet is running
 * on, and a process that quietly opens a port to the network because somebody
 * wanted to see what their agents were thinking is not a trade anybody agreed
 * to. A port already in use logs one line and returns null; the fleet plays on
 * without a board, which is exactly what it did yesterday.
 *
 * @param {object} opts { port, state: () => object, log }
 * @returns {Promise<{url:string, close:function}|null>}
 */
export function serveBoard({ port = BOARD_PORT, state, log = console.log } = {}) {
  return new Promise((resolve) => {
    const html = boardHtml();
    const server = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      if (path === '/board.json') {
        let body;
        try {
          body = JSON.stringify(state());
        } catch (err) {
          // A board that throws must say so in the board, not in the fleet.
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: err.message, players: [] }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(body);
        return;
      }
      if (path === '/' || path === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('the board has two pages: / and /board.json\n');
    });

    // ── every socket, so shutting down actually shuts down ──
    //
    // `server.close()` STOPS ACCEPTING AND THEN WAITS for every connection
    // already open to end on its own. A watcher's browser holds a keep-alive
    // socket between polls and `fetch` pools one for minutes, so the callback
    // simply never fires: the port stops listening, the process sits idle at
    // half a second of CPU, and it looks for all the world like a hang
    // somewhere else entirely. It cost this session twenty minutes of hunting
    // a spin loop that did not exist — the check that closed its own board was
    // waiting on a socket its own `fetch` was holding open.
    //
    // So the connections are tracked and destroyed outright. A board is a
    // read-only view; there is nothing in flight worth draining.
    const sockets = new Set();
    server.on('connection', (s) => {
      sockets.add(s);
      s.once('close', () => sockets.delete(s));
    });

    server.once('error', (err) => {
      log(`  board: could not listen on ${port} — ${err.code ?? err.message}. Carrying on without one.`);
      resolve(null);
    });
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}`;
      resolve({
        url,
        close: () => new Promise((done) => {
          for (const s of sockets) s.destroy();
          sockets.clear();
          server.close(() => done());
        }),
      });
    });
  });
}
