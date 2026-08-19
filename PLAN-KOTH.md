# PLAN — King of the Hill, as an OPTION beside the game that exists

Greenlit by Ben 2026-08-18: "build it as an added feature so we have options and
the user can select game modes we have now OR the PVP world." This file is the
design; the commit that lands beside it is the build.

## The one rule over everything

**`MODE=koth` is opt-in, and OFF is byte-identical.** Same discipline as
personas, same reason: every run in `runs/` stays valid, and every survival
check stays a check of the same game. A default server carries no match state,
sends no match fields, and behaves exactly as before — `matchcheck`'s first
arm asserts the absence.

## What already existed (why this is a small build, not a big one)

- **Teams**: `Player.party` on the wire as `g`; friendly fire already refused
  (`same party → never hurt each other`); avatars anticipated team colours.
- **A war zone with a geography**: fighting is refused on settled ground and
  legal in the strange country (`pvpAboveStrangeness`). The hill goes OUT
  THERE, so the settled lowland stays a refuge — no new zone system.
- **Named ground**: the gazetteer names the hill for free.
- **Death that costs position, not progress**: pack drops where you fell, bow
  stays, nothing destroyed.
- **Event-driven attention** (2026-08-18): a match is EVENTS — hill taken,
  hill lost, match point — and minds can now be woken by them. Without this,
  every match moment would wait its turn behind a 60-second metronome.

## What this build adds

1. **`src/sim/match.js`** — the match, deterministic, no wall clock:
   - Hill: `HILL_AT=x,z` / `HILL_AT=spawn`, or a seeded outward search for the
     first ground strange enough to fight on. Radius `HILL_RADIUS` (default 28
     m — wider than a bowshot, so holding means controlling approaches).
   - Two teams, red and blue. A joiner asks for one in its hello (`t`), or is
     assigned to the smaller side. Assignment is join-order deterministic.
   - Score: a team earns a point per second it holds the ring ALONE — bodies
     of both teams inside means contested, nobody scores. First to
     `POINTS_TO_WIN` (default 120) or best when the clock caps
     (`MATCH_MINUTES`, default 30 real minutes, tracked in game hours).
   - Respawn — the one genuinely new mechanic, KotH-only: a death in match
     mode revives at your team's muster point after `RESPAWN_SECONDS`
     (default 25). The pack still drops where you fell (`onPlayerDied`
     untouched): death costs TIME and POSITION and the walk back, never the
     match. Muster points sit opposite each other outside the ring.
   - Events: `hill` (taken/contested/clear), `score` (each quarter of the
     target), `win`, `respawn`. These are the match's whole voice.
2. **The world knows the least it can**: `world.match` is null by default;
   `step()` ticks it when present; the snapshot carries `m` only then;
   `onPlayerDied` tells it about deaths. `canHarm` is UNTOUCHED — parties
   already protect teammates, geography already gates the rest.
3. **Telling the minds** — the part that decides whether this is a game or a
   scoreboard over a survival sim. The brief gains a match block, stated the
   way `deals` and `asked` are: your team and teammates by name, the score,
   first-to-what, where the hill is and how far, who holds it, whether you are
   in the ring. Hill events wake a mind (the refractory still rations). The
   SYSTEM PROMPT is untouched — match facts ride the brief, so `personacheck`'s
   control baseline holds and off stays byte-identical.
4. **Telling the human**: hill/score/win/respawn land in the chat column;
   join a team with `&team=red` on the URL.
5. **`matchcheck`** — off-is-off first, then the mode over real sockets:
   contested scores nothing, a sole holder scores, the win fires, teams land
   in `g`, and the respawn cycle runs at unit level against a stub world.
6. **`roster-koth.json` + `PLAY-KOTH.cmd`** — 2v2, fast cheap seats
   (KotH favours quick thinkers; the 12-second seat was the best benchmark
   seat this project has had), Jack auto-balanced in when he joins.

## Decisions taken (so they are not re-litigated mid-build)

- **Survival stays ON, gentle.** Cold and hunger during a match are the
  interesting decisions — leave the hill to eat, or hold it shivering. No
  hard winter in the default match world.
- **The hill is in the strange country** — the existing gate makes the war
  zone, and the settled land remains a place to run to.
- **A scripted control seat stays in the roster** — when a flank looks
  brilliant, Iseabail is how you tell the model from the terrain.
- **Matches are long relative to cadence** (30 min against 12–30 s seats), or
  they are a dice roll between two thinks.

## What is deliberately NOT in v1

Team colours on avatars (anticipated in the code, cosmetic, next pass);
capture-progress bars; more than two teams; tribe persistence between
matches; gold bounties per kill (Tier 2.75 wants gold to matter first).

## The measurement this enables

TRAJECTORY's arc-1 bar — "two seats reach an outcome neither could reach
alone" — is exactly what holding a contested ring is. And per-model aggregate
score across seat rotations is the same benchmark shape as NewSimClaude's
melee. A KotH hour is both a game and an instrument.
