"""Turn a melee sample file into the numbers worth arguing about.

    python analyse.py runs/melee-1.jsonl "Run 1"

Reads a JSONL of board snapshots and writes markdown to stdout. Every number
here is de-duplicated across snapshots on a natural key, because the board is a
DASHBOARD sampled repeatedly and not an event log — counting rows counts how
often we looked, which is the single mistake this project keeps making with it.
"""
import json, sys, collections, io

# Windows console is cp1252 and the write-up is full of em-dashes and arrows.
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else path

rows = [json.loads(l) for l in open(path, encoding='utf-8') if l.strip()]
if not rows:
    print(f"# {label}\n\nNo samples.")
    sys.exit(0)

first, last = rows[0], rows[-1]
board = last['board']
minutes = (last['realMs'] - first['realMs']) / 60000

# ── de-duplicate everything on a natural key ────────────────────────────────
intents, deeds, talk = {}, {}, {}
for r in rows:
    for p in r['board']['players']:
        n = p['name']
        for it in (p.get('intentions') or []):
            intents[(n, round(it.get('h', 0), 3), it.get('goal', ''))] = it
        for d in (p.get('deeds') or []):
            if isinstance(d, dict):
                deeds[(n, round(d.get('h', 0), 3), d.get('what', ''), d.get('text', ''))] = d
        for src in ((p.get('intentions') or []) + [p]):
            s = src.get('said')
            for one in ([s] if isinstance(s, str) else
                        [x if isinstance(x, str) else (x or {}).get('text', '') for x in (s or [])]):
                if one and one.strip():
                    talk[(n, round(src.get('h', p.get('hours', 0)) or 0, 3), one.strip())] = None

SOCIAL = ('offer', 'give', 'accept', 'follow', 'guard', 'attack', 'take ')
goals = collections.Counter(g for (_, _, g) in intents)
social = {k: v for k, v in intents.items() if any(w in k[2].lower() for w in SOCIAL)}

out = []
w = out.append
w(f"# {label}")
w("")
w(f"{minutes:.0f} minutes of wall clock · game hour {first['board']['players'][0]['hours']:.1f} "
  f"→ {board['players'][0]['hours']:.1f} · {len(rows)} samples")
w("")
sp = board['spend']
w(f"**Spend.** {sp['calls']} calls of {sp['of']} · {sp['tokensIn']:,} tokens in · "
  f"{sp['tokensOut']:,} out · exhausted: {sp['exhausted']}")
w("")

# ── the seats ───────────────────────────────────────────────────────────────
w("## The seats")
w("")
w("| who | model | answered | failed | share | decisions | gold | kills | carrying |")
w("|---|---|--:|--:|--:|--:|--:|--:|---|")
for p in board['players']:
    m = p['mind']
    a, f = m.get('answered', 0), m.get('failures', 0)
    share = f"{100*a/(a+f):.0f}%" if (a + f) else "—"
    carry = ", ".join(f"{c['n']} {c['id']}" for c in (p.get('carrying') or [])) or "—"
    w(f"| {p['name']} | `{p.get('model') or 'SCRIPTED'}` | {a} | {f} | {share} | "
      f"{p.get('decisions', 0)} | {p.get('gold', 0)} | {p.get('kills', 0)} | {carry} |")
w("")
w("A seat below ~80% answered is measuring the scripted fallback, not the model.")
w("")

# ── errors, named ───────────────────────────────────────────────────────────
errs = {p['name']: p['mind'].get('lastError') for p in board['players'] if p['mind'].get('lastError')}
if errs:
    w("### What went wrong, per seat")
    w("")
    for n, e in errs.items():
        w(f"- **{n}** — `{str(e)[:150]}`")
    w("")

# ── what they chose ─────────────────────────────────────────────────────────
w("## What they actually chose")
w("")
w(f"{len(intents)} decisions.")
w("")
w("| n | share | goal |")
w("|--:|--:|---|")
for g, n in goals.most_common(20):
    w(f"| {n} | {100*n/len(intents):.1f}% | {g} |")
w("")
w(f"**Social verbs: {len(social)} of {len(intents)} = {100*len(social)/len(intents):.1f}%.**")
if social:
    for (n, h, g) in sorted(social, key=lambda k: k[1]):
        w(f"- `{h:5.2f}` **{n}** — {g}")
w("")

refused = {p['name']: p.get('refusedVerbs') for p in board['players'] if p.get('refusedVerbs')}
w(f"**Verbs refused:** {json.dumps(refused) if refused else 'none, by anybody'} — "
  "an empty column means the verbs were never REACHED FOR, which is a different "
  "finding from being refused.")
w("")

# ── what actually happened ──────────────────────────────────────────────────
kinds = collections.Counter(d.get('what') for d in deeds.values())
w("## What actually happened")
w("")
w(f"{len(deeds)} deeds: " + " · ".join(f"**{k}** {n}" for k, n in kinds.most_common()))
w("")
trades = sorted([d for d in deeds.values() if d.get('what') == 'trade'], key=lambda d: d.get('h', 0))
w(f"### Things that changed hands: {len(trades)}")
w("")
for d in trades:
    w(f"- `{d.get('h', 0):5.2f}` {d.get('text', '')}")
w("")

# ── the talk ────────────────────────────────────────────────────────────────
w("## The talk")
w("")
w(f"{len(talk)} distinct things said.")
w("")
per = collections.Counter(n for (n, _, _) in talk)
w(" · ".join(f"**{n}** {c}" for n, c in per.most_common()))
w("")
w("### The last of it")
w("")
w("```")
for n, h, s in sorted(talk, key=lambda k: k[1])[-25:]:
    w(f"{h:5.2f}  {n:<10} {s[:100]}")
w("```")
w("")

print("\n".join(out))
