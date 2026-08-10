// ── ordercheck2.js ──────────────────────────────────────────────────────────
// Is an order an order, and is ordinary talk left alone?
//
//   npm run ordercheck2
//
// THE 199-STEP SESSION THAT CAUSED THIS FILE. A playtester was set the task of
// recruiting the agents to help kill a troll. He recruited them — four of them
// followed him a kilometre across the map and stood with him on the ground he
// picked — and then nothing happened, and he could not work out why.
//
// This is why. The order tally from that session's log:
//
//     stay still and watch   156
//     stay with Jack         120
//     hunt a troll            16
//     hunt a is/from/to       36
//
// THE PARSER TESTED THE WHOLE SENTENCE FOR A KEYWORD ANYWHERE IN IT. So his
// own tactical chatter kept halting his war band:
//
//     "hold on, the troll is to the north"   -> everybody stop
//     "wait for me"                          -> everybody stop
//     "I will stop it with arrows"           -> everybody stop
//     "shoot from the ridge, not from here"  -> everybody hunt a `from`
//
// He froze his own band TEN TIMES more often than he pointed it at the troll,
// and sent it after prepositions in between. He then read the source, saw the
// `obeys` gate, and concluded the order path was switched off — while the log
// recorded 428 orders taken. The game was not telling anyone what it was doing.
//
// Two rules now, and they are the whole file:
//
//   AN ORDER OPENS THE SENTENCE. Optionally after a name or a filler word.
//   Anything else is talk, and talk goes to the mind exactly as it always did.
//
//   AN ORDER NAMES ONE BODY OR ALL OF THEM. "Ailsa, follow me" is Ailsa's.
//   "kill the troll" is everybody's. Before, both were everybody's.

import { Agent } from '../src/net/agent.js';
import { SPECIES } from '../src/creatures/registry.js';

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** An agent with just enough on it for `takeOrder`. */
function ear(name = 'Ailsa', others = [[2, 'Jack'], [3, 'Morag']]) {
  const a = Object.create(Agent.prototype);
  a.name = name;
  a.others = new Map(others);
  a.goalCounts = {};
  a.memory = { add() {} };
  a.hours = 0;
  a.taken = [];
  a.setOrder = (g) => { a.taken.push(g); };
  return a;
}

/** Returns the goal taken, or null for talk. */
function say(text, name = 'Ailsa') {
  const a = ear(name);
  return a.takeOrder('Jack', text) ? a.taken[0] : null;
}

function main() {
  console.log('\n  Is an order an order, and is ordinary talk left alone?\n');

  // ── 1. THE FOUR SENTENCES THAT COST HIM THE SESSION ──────────────────────
  {
    const talk = [
      'hold on, the troll is to the north',
      'wait for me',
      'I will stop it with arrows',
      'shoot from the ridge, not from here',
      'we should hunt it together at the scaur',
      'stand back, I will hold it here',
      'Tormod, I have arrows to trade',
      'the deer is to the west, I am going to hunt before dark',
    ];
    const ordered = talk.filter((t) => say(t));
    check('ORDINARY TALK IS NOT AN ORDER',
      ordered.length === 0,
      ordered.length ? ordered.map((t) => `"${t}" -> ${JSON.stringify(say(t))}`).join(' · ')
                     : `${talk.length} sentences, none of them a command`);
  }

  // ── 2. ...AND THE SENTINEL, or the above is just a dead parser ───────────
  {
    const orders = {
      'follow me': 'follow',
      'stay with me': 'follow',
      'guard me': 'guard',
      'watch my back': 'guard',
      wait: 'hold',
      stop: 'hold',
      'kill the troll': 'hunt',
      'attack that bear': 'hunt',
      'shoot the deer': 'hunt',
      'carry on': 'wander',
    };
    const wrong = Object.entries(orders).filter(([t, kind]) => say(t)?.kind !== kind);
    check('SENTINEL: a plain order is still taken, every one of them',
      wrong.length === 0,
      wrong.length ? wrong.map(([t]) => `"${t}" -> ${JSON.stringify(say(t))}`).join(' · ')
                   : `${Object.keys(orders).length} orders, all taken`);
  }

  // ── 3. AN ORDER NAMES ONE BODY, OR ALL OF THEM ───────────────────────────
  {
    check('AN ORDER ADDRESSED TO ME IS MINE',
      say('Ailsa, follow me')?.kind === 'follow',
      'the name is read now — it never used to be');

    check('  …and one addressed to somebody else is NOT',
      say('Morag, follow me') === null,
      '"Ailsa, follow me" used to be obeyed by all eight bodies at once');

    check('  …while an unaddressed order is for the whole band',
      say('kill the troll')?.kind === 'hunt' && say('kill the troll', 'Fingal')?.kind === 'hunt',
      'which is what you want when there is a troll in front of you');

    check('  …and a leading word that is nobody\'s name is just filler',
      say('Right, follow me')?.kind === 'follow' && say('Ok, wait')?.kind === 'hold',
      '"Right" and "Ok" are how people actually talk');
  }

  // ── 4. THE QUARRY HAS TO BE A REAL CREATURE ──────────────────────────────
  //
  // 36 orders in one session sent eight bodies after `is`, `from` and `to`.
  // The reflex layer can only refuse those, quietly, for ever.
  {
    const nonsense = ['hunt is', 'shoot from', 'kill to', 'attack the dragon', 'hunt a'];
    const taken = nonsense.filter((t) => say(t));
    check('A QUARRY THIS WORLD DOES NOT HAVE IS NOT AN ORDER',
      taken.length === 0,
      taken.length ? taken.join(', ') : 'no more hunting prepositions');

    const real = Object.keys(SPECIES).filter((id) => say(`kill the ${id}`)?.quarry === `a ${id}`);
    check('  …and every creature that DOES exist can be named',
      real.length === Object.keys(SPECIES).length,
      real.join(', '));
  }

  // ── 5. AND THE HALT, WHICH DID MOST OF THE DAMAGE ────────────────────────
  {
    check('"wait" halts and "wait for me" does not',
      say('wait')?.kind === 'hold' && say('wait for me') === null,
      '156 halts against 16 troll orders is what the old rule produced');
    check('  …and "hold" halts while "hold on, ..." is conversation',
      say('hold')?.kind === 'hold' && say('hold on, there is a troll') === null);

    // A place word is still an order — "wait here" is unambiguous where "wait
    // for me" is a request TO the speaker. The first anchoring was too tight
    // and broke this; the older `ordercheck` caught it, which is exactly what
    // an older check is for.
    const placed = ['wait here', 'hold here', 'stay here', 'stay put', 'stop there', 'hold position'];
    const missed = placed.filter((t) => say(t)?.kind !== 'hold');
    check('  …and "wait HERE" is an order, where "wait FOR ME" is a request',
      missed.length === 0 && say('stay here and I will draw it off') === null,
      missed.length ? missed.join(', ') : `${placed.length} phrasings, all halts`);
  }

  // ── 6. AN ORDER TAKEN IS AN ORDER YOU CAN SEE TAKEN ──────────────────────
  //
  // He could not tell. That is the whole reason the session was lost: 428
  // orders were being taken around him and nothing on any screen said so, so
  // he read the source and reported the feature switched off.
  {
    // The REAL `setOrder` this time — `ear` stubs it out so the earlier
    // sections can read the goal, and stubbing it would hide the very thing
    // this section is about.
    const a = ear();
    delete a.setOrder;
    a.goalCounts = {};
    const spoken = [];
    a.send = (type, data) => spoken.push(data?.m);
    a.takeOrder('Jack', 'follow me');

    check('AN AGENT SAYS SO WHEN IT TAKES AN ORDER',
      spoken.length === 1 && /following/i.test(spoken[0] ?? ''),
      spoken[0] ? `"${spoken[0]}"` : 'silence — which is what cost him the session');

    check('  …and the board can say who is under orders, and to do what',
      a.orderedTo === 'stay with Jack' && a.orderedBy === 'Jack' && a.ordered === true,
      `${JSON.stringify(a.orderedTo)} by ${JSON.stringify(a.orderedBy)}`);
  }

  {
    // AND NO FEEDBACK LOOP. Every agent hears every other agent, so an
    // acknowledgement that is itself an order would set eight bodies ringing
    // off each other for ever. None of them starts with an order verb, and
    // this is the assertion that keeps it that way when the wording changes.
    const nods = [
      'right, following you', 'right, watching your back', 'right, holding here',
      'right, going for a troll', 'right, back to my own business',
    ];
    const loops = nods.filter((n) => say(n));
    check('AN ACKNOWLEDGEMENT IS NEVER ITSELF AN ORDER',
      loops.length === 0,
      loops.length ? loops.join(' · ') : `${nods.length} nods, none of them a command`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n  ${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
