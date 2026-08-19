# PLAN — putting Highlands online, in plain steps

Written 2026-08-18 at Ben's ask: "make a plan to build this game out so we can
host it on line... We are not ready just yet to ship but i would like to know
how." This is the how. Nothing here is built yet; each phase is small and the
game stays playable locally throughout.

## What the game already has going for it

The hard parts of "online" are DONE. The server is authoritative (one node
process owns the world; browsers are views), the protocol sanitises every
field a client can send, clients download nothing (the world is procedural —
zero asset files, one ~950 KB script), joining is a URL, and the server
banner already says "tell a friend on your network". Hosting is that sentence
with a public address and encryption — not a rewrite.

## Phase 0 — prove it from this PC, cost £0 (an afternoon)

Run the game exactly as today, and put a **tunnel** in front of it: a free
tool (cloudflared or tailscale) that gives your PC a temporary public https
address. A friend opens the link, plays in your world, and every question
about hosting gets answered with zero commitment: does the wire hold up at
internet latency, does a stranger's browser behave, is it fun with a real
second human. **This is the next concrete step, and it needs no code.**

## Phase 1 — a small rented server (a weekend, ~$6-12/month)

1. Rent a small VPS (Hetzner, DigitalOcean — the smallest tier is plenty:
   the world is one node process that idles at almost nothing).
2. Install node, copy the repo, `npm install`, `vite build` once.
3. Run three things under a process manager (pm2 or systemd) so they restart
   themselves: the world (`server.js`), a static file server for `dist/`
   (or let a proxy serve the folder), and — only when wanted — the minds.
4. The game is now at `http://your-ip`. Ugly address, fully playable.

## Phase 2 — a name and a padlock (an evening)

1. Buy a domain (~$10/year), point it at the VPS.
2. Put **Caddy** in front (one config file, ~5 lines): it fetches HTTPS
   certificates automatically and proxies `wss://` websockets to the world.
   Browsers require the padlock for game pages people trust; this is the
   whole of getting it.
3. The client's join URL becomes `wss://play.yourdomain.com` — one parameter.

## Phase 3 — hardening, before strangers arrive (spread over sessions)

- **Money**: API keys live ONLY on the server, never in the client; the
  budget caps (`budgetCalls`, `MAX_CALLS`, the fleet clock's shutdown) are
  already the right shape — add a hard daily ceiling and the minds simply go
  scripted when it is hit.
- **Abuse**: names and chat are already sanitised; add a per-IP connection
  cap and a join rate limit (a dozen lines in server.js). MAX_PLAYERS
  already exists.
- **Ops**: one STOP equivalent on the VPS; logs rotating; the board bound to
  loopback with an SSH tunnel for you — or published read-only later, it is
  already read-only by design.
- **A second world**: the server takes a port argument today, so "two rooms"
  is two processes. Match servers (MODE=koth) and the ordinary world can run
  side by side.

## Phase 4 — the parts that make it a destination (later, optional)

- A landing page: pick a name, pick a world (survival / king of the hill),
  join — the menu the URL parameters already are, drawn as buttons.
- Spectator links: `?watch=1` already exists and eyescheck proves a watcher
  is inert — a shareable "watch the minds play" link is nearly free, and it
  is the best advert this project could have.
- Persistence between restarts (the save/restore plumbing exists — decide
  whether an online world should remember).
- Accounts, if ever needed. Names-only is fine for friends-scale.

## What NOT to do

- No cloud gaming / no server-per-player: one small VPS runs one world for
  sixteen people because the client renders everything from the seed.
- No CDN, no build pipeline services, no kubernetes. One machine, one Caddy,
  pm2. The whole stack should stay explainable in one breath.
- Do not ship the minds publicly spending YOUR keys without the daily
  ceiling from Phase 3. A stranger who finds the board should never be able
  to cost you a dollar.
