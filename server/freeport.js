// ── freeport.js ─────────────────────────────────────────────────────────────
// "Is anybody already listening here?" — asked before a check stages its world.
//
// Three checks start a REAL server on a fixed port and then connect to it:
// bitecheck (8099), shotcheck (8099) and herdcheck (8098). If something is
// already on that port the child dies instantly with EADDRINUSE — and because
// its stdio is ignored, nobody sees that. The check then connects happily to
// WHOEVER IS THERE, which is a server with none of its staging: no warband, no
// staged hour, no banned species.
//
// What that looks like from the outside is a product bug. bitecheck reported
// 3/10 with "0 goblins in Bob's snapshots" and "nothing ever hit her", and it
// was read as "companion defence is untested in multiplayer" and written into
// a summary as a known defect. Nothing was wrong with the game: a stray server
// left over from an earlier shotcheck run was holding 8099. The moment the port
// was cleared the same file passed 10/10, unchanged.
//
// A test that silently talks to the wrong server is worse than one that fails,
// because it manufactures evidence for bugs that do not exist. So: look first,
// and say so plainly.

import net from 'node:net';

/**
 * Resolve once the port is free, or throw with something worth reading.
 *
 * Probed by CONNECTING rather than by binding. Binding to test a port and then
 * releasing it leaves a window where the real server races something else into
 * the slot; a connection attempt has no such side effect. A refused connection
 * is the good answer here.
 *
 * @param {number} port
 * @param {string} who  the check's name, for the message
 */
export async function requireFreePort(port, who) {
  const answered = await new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    // ── A TCP CONNECT, NOT A WEBSOCKET HANDSHAKE ──
    //
    // This probed with `new WebSocket(...)` and therefore only ever detected a
    // WEBSOCKET server. The BOARD is a plain HTTP server, so the handshake
    // failed against it, `onerror` fired, and the port was reported FREE while
    // something was plainly listening on it.
    //
    // The cost, on 2026-08-14: a live run held 8090, `boardcheck` sailed past
    // this guard, `serveBoard` logged "could not listen — carrying on without
    // one", and the file reported "the board binds — it did not". I read that
    // as a regression TWICE and diagnosed it twice. Adding a `requireFreePort`
    // call to boardcheck did nothing, because the guard itself was blind.
    //
    // A TCP connection answers the actual question — is anything accepting on
    // this port — regardless of what protocol it speaks. Still CONNECTING and
    // not binding, for the reason above: binding to test and then releasing
    // leaves a window for something else to race into the slot.
    const sock = net.connect({ port, host: '127.0.0.1' });
    sock.setTimeout(700);
    sock.on('connect', () => { done(true); sock.destroy(); });
    sock.on('error', () => { done(false); sock.destroy(); });
    sock.on('timeout', () => { done(false); sock.destroy(); });
  });

  if (answered) {
    throw new Error(
      `${who}: something is ALREADY listening on ${port}.\n\n` +
        `  This check starts its own server and stages the world inside it —\n` +
        `  a warband, an hour of the night, a banned species. Connecting to a\n` +
        `  server it did not stage produces failures that look like game bugs\n` +
        `  and are not. Refusing rather than lying.\n\n` +
        `  Close whatever is on ${port} and run it again:\n` +
        `    powershell "Get-NetTCPConnection -LocalPort ${port} -State Listen | ` +
        `ForEach-Object { Stop-Process -Id \\$_.OwningProcess -Force }"\n`
    );
  }
}
