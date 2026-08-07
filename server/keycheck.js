// ── keycheck.js ─────────────────────────────────────────────────────────────
// Is every seat in the roster actually going to think tonight?
//
//   npm run keycheck            (or double-click CHECK-KEYS.cmd)
//
// WHY THIS EXISTS. A seat can fail in two ways that look identical from the
// outside and are invisible until the evening has started:
//
//   1. THE KEY IS MISSING OR WRONG. The seat quietly becomes SCRIPTED. It still
//      plays, still walks, still hunts — it just has no model behind it. The
//      startup header says so, in one line, among twenty.
//   2. THE MODEL NAME IS WRONG. Worse, because there is no fallback: every
//      single call errors and the seat shows FAILED on the board.
//
// Both are one typo. Both are cheap to catch here and expensive to discover
// with six people watching.
//
// THIS SPENDS NO TOKENS. It asks each provider to LIST ITS MODELS — which
// validates the key and the model name in one unauthenticated-if-wrong,
// zero-cost request. It never sends a prompt and never generates a word.
//
// It reads the keys out of the environment by NAME, exactly the way the game
// does, and it prints no key material — a key is only ever reported as present
// or absent, and errors are truncated in case a provider echoes one back.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoster } from './roster.js';

// `new URL(...).pathname` percent-encodes the spaces in this repo's own path
// and node cannot open the result. This is the trap, written down.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

const ROSTER = process.env.MINDS_ROSTER ?? 'roster.json';
const TIMEOUT = 20000;

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/**
 * Where to ask a provider for its list of models, and how to prove who we are.
 *
 * Anthropic wants `x-api-key` plus a version header; everything
 * OpenAI-compatible wants `Authorization: Bearer`. Both answer the same shape
 * — `{ data: [{ id }] }` — which is why one function covers all of them.
 */
function modelsRequest(entry) {
  const kind = entry.provider;
  if (kind === 'anthropic' || kind === 'claude') {
    return {
      url: `${entry.baseUrl ?? 'https://api.anthropic.com'}/v1/models`,
      headers: { 'x-api-key': entry.key, 'anthropic-version': '2023-06-01' },
    };
  }
  const base = (entry.baseUrl ?? VENDOR[kind] ?? '').replace(/\/$/, '');
  if (!base) return null;
  return { url: `${base}/models`, headers: { authorization: `Bearer ${entry.key}` } };
}

// Only the ones a roster is likely to name without a baseUrl. A seat with its
// own `baseUrl` never reaches this table.
const VENDOR = {
  xai: 'https://api.x.ai/v1',
  grok: 'https://api.x.ai/v1',
  moonshot: 'https://api.moonshot.ai/v1',
  kimi: 'https://api.moonshot.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  openai: 'https://api.openai.com/v1',
};

async function listModels(entry) {
  const req = modelsRequest(entry);
  if (!req) {
    return { ok: false, why: `provider "${entry.provider}" has no address and the seat gives no baseUrl` };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const res = await fetch(req.url, { headers: req.headers, signal: ctl.signal });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 160);
      return { ok: false, why: `HTTP ${res.status} — ${body || res.statusText}`, status: res.status };
    }
    const data = await res.json();
    const ids = (data?.data ?? data?.models ?? [])
      .map((m) => m?.id ?? m?.name)
      .filter(Boolean)
      .map(String);
    return { ok: true, ids };
  } catch (err) {
    return { ok: false, why: err.name === 'AbortError' ? `no answer in ${TIMEOUT / 1000}s` : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Plain-English repair instructions, because the person reading this is not a
 * programmer.
 *
 * ── DO NOT MATCH ON THE STATUS CODE ALONE ──
 *
 * A rejected key is not reliably a 401. Measured against the three providers
 * this roster actually uses: Anthropic answers 401 `invalid x-api-key`, Open
 * WebUI answers 401 `token is invalid`, and **xAI answers 400** `Incorrect API
 * key provided`. Keying the advice off 401/403 silently dropped the hint for
 * exactly one of the three, which is the worst possible hit rate — right often
 * enough to look correct. So the body is read too.
 */
function advise(entry, result) {
  const body = String(result.why ?? '');
  const looksLikeKey = /api[- ]?key|unauthor|not authenticated|token is invalid|session has expired|invalid.*credential/i;
  if (result.status === 401 || result.status === 403 || looksLikeKey.test(body)) {
    return `the key in ${entry.keyEnv} was refused. Check it is pasted whole, with no spaces around the = sign.`;
  }
  if (result.status === 404) {
    return `that address answered, but not with a model list. The baseUrl in roster.json is probably wrong.`;
  }
  if (/no answer|fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(body)) {
    return `could not reach it at all. Is the machine on, and is the address right?`;
  }
  return null;
}

async function main() {
  const file = path.isAbsolute(ROSTER) ? ROSTER : path.join(ROOT, ROSTER);
  if (!fs.existsSync(file)) {
    console.log(`\n  There is no ${ROSTER} to check.\n`);
    process.exit(1);
  }
  const roster = loadRoster(file);

  console.log(`\n  Checking every seat in ${ROSTER}`);
  console.log(`  ${dim('no prompts are sent and no tokens are spent — this only asks each provider what it offers')}\n`);

  let bad = 0;
  let scripted = 0;

  for (const p of roster.players) {
    const label = `  ${p.name.padEnd(12)}`;

    if (!p.provider || p.provider === 'scripted') {
      console.log(`${label}${dim('scripted on purpose — no key needed')}`);
      scripted++;
      continue;
    }

    const key = p.keyEnv ? process.env[p.keyEnv] : undefined;
    if (!key) {
      console.log(`${label}${red('WILL BE SCRIPTED')} — ${p.keyEnv ?? 'no keyEnv'} is empty in keys.cmd`);
      bad++;
      continue;
    }

    const result = await listModels({ ...p, key });
    if (!result.ok) {
      console.log(`${label}${red('FAILED')} — ${result.why}`);
      const fix = advise(p, result);
      if (fix) console.log(`${' '.repeat(14)}${dim('→ ' + fix)}`);
      bad++;
      continue;
    }

    // The key works. Now: does the model name in the roster actually exist?
    const known = result.ids.includes(p.model);
    if (known) {
      console.log(`${label}${green('OK')}  ${p.model}`);
    } else {
      console.log(`${label}${red('BAD MODEL NAME')} — "${p.model}" is not one this provider offers.`);
      console.log(`${' '.repeat(14)}${dim('→ the key is fine. Put one of these in roster.json instead:')}`);
      const show = result.ids.slice(0, 12);
      for (const id of show) console.log(`${' '.repeat(16)}${id}`);
      if (result.ids.length > show.length) {
        console.log(`${' '.repeat(16)}${dim(`…and ${result.ids.length - show.length} more`)}`);
      }
      bad++;
    }
  }

  console.log('');
  if (bad === 0) {
    console.log(`  ${green('Every seat is ready.')} ${scripted} scripted on purpose. Double-click PLAY.cmd.\n`);
  } else {
    console.log(`  ${red(`${bad} seat${bad === 1 ? '' : 's'} will not think tonight.`)} Fix the lines above, then run this again.`);
    console.log(`  ${dim('The game still runs — those players just fall back to scripted behaviour.')}\n`);
  }
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error(`\n  could not run: ${err.message}\n`);
  process.exit(1);
});
