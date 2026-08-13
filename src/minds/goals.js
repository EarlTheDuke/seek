// ── goals.js ────────────────────────────────────────────────────────────────
// What a mind is allowed to want.
//
// VISION.md §6b: "Constrained output. The model chooses among world-legal
// intents. It can want anything; it can only DO what the rules permit."
//
// So the vocabulary is a closed table, exactly like the species table and the
// buildables table. A mind returns one of these, with parameters, and anything
// it returns that is not in here is discarded rather than interpreted. That is
// the whole safety story for putting a language model behind a body: it is not
// sandboxed by prompt engineering, it is sandboxed by only having these verbs.
//
// The other half of the design is that NONE of these drive a body directly.
// Each one is a standing intention that the reflex layer — the existing state
// machines, running every tick — carries out. If the mind is slow, absent or
// wrong, the body still behaves like a competent animal doing the last sensible
// thing it was told.

export const GOALS = {
  wander: {
    id: 'wander',
    // What it means, in a sentence, for the prompt and the debug view.
    describe: () => 'walk the country and see what is about',
    params: [],
  },

  // The labels a mind hands back already carry their own article — "a deer",
  // "someone" — so these must not add another. "hunt the a deer" is the sort
  // of thing that reads as a bug in a chat log even when nothing is wrong.
  hunt: {
    id: 'hunt',
    describe: (p) => `hunt ${p.quarry ?? 'something'}`,
    params: ['quarry'], // a species id it has actually perceived
  },

  approach: {
    id: 'approach',
    describe: (p) => `go toward ${p.target ?? 'that'}`,
    params: ['target'],
  },

  avoid: {
    id: 'avoid',
    describe: (p) => `keep away from ${p.target ?? 'that'}`,
    params: ['target'],
  },

  hold: {
    id: 'hold',
    describe: () => 'stay still and watch',
    params: [],
  },

  // The first verb in this table that TOUCHES anything.
  //
  // Every other goal here resolves to a place to walk to, which is why for a
  // long time no agent in this project ever picked anything up, ate, or built:
  // the intent on the wire has `interact`, `place` and `eat` fields and the
  // agent set none of them, ever. It had a body that could walk and shoot and
  // no hands at all. A fleet of them reported 88% "wander" and it read like
  // incurious minds; it was a missing limb.
  //
  // Deliberately not "gather wood" — the verb is the act of picking a thing up
  // off the ground, and what is on the ground is the world's business.
  gather: {
    id: 'gather',
    // The noun, when they name one. `gather venison` is a different errand from
    // `gather wood` and the minds have been trying to say so for the life of
    // this project.
    describe: (p) => (p?.item ? `pick up ${p.item}` : 'pick up what is lying about'),
    // ── THE PARAMETER THAT WAS NEVER DECLARED ──
    //
    // This read `params: []`, so `sanitiseGoal` stripped `item` off every reply
    // any model ever sent — silently, because a dropped key looks exactly like
    // a key that was never there. Meanwhile `providers.js` tells all six models
    // that `gather venison` walks them to a carcass, and `agent.js` reads
    // `g.item`, a field no mind could set. Three files, one missing word.
    //
    // Measured over eight session logs: `gather` is the most-issued goal in the
    // project at 281 uses, and of 972 gather deeds ever recorded, 866 were wood
    // and 15 were venison. Watched live on 2026-08-10, three starving minds
    // spent 83 minutes issuing "pick up what is lying about — take the carcass,
    // I need meat" and being handed branches.
    //
    // Eighth instance in this project of the model looking worse than the
    // instrument, and the most expensive one: it is most of "the models cannot
    // feed themselves".
    params: ['item'],
    // ── AND THE NOUN IS OPTIONAL, WHICH HAD TO BE SAID OUT LOUD ──
    //
    // Declaring `item` did not only teach `gather` a noun; it made the noun
    // COMPULSORY, because the rule at the bottom of `sanitiseGoal` turns any
    // goal whose every declared param is missing into `wander`. So a bare
    // {"kind":"gather"} — the plainest way to say "pick something up", and what
    // every mind in this project sent for its entire life before the noun
    // existed — became a walk with a refusal attached.
    //
    // Third face of one bug now. Giving a verb a parameter created a new way to
    // answer it badly, and each way was found separately and late: the word
    // "none" (fixed 2026-08-11), the singular "branch" (fixed with it), and
    // this one, the field simply left out.
    //
    // A bare gather is not an incomplete goal. It MEANS "whatever is nearest",
    // `describe` has always said so, and `resolve` has always handled `want`
    // being empty. The vocabulary just had no way to distinguish "this verb
    // takes a parameter" from "this verb requires one".
    optional: true,
  },

  // ── THE VERB THAT WAS MISSING, AND IT IS THE ONE THE WORLD IS ABOUT ──
  //
  // This is a survival world and until now **no mind in it had a word for
  // eating.** Not a bug in a code path — an absence from the vocabulary, which
  // is a far quieter thing to have wrong. `world.js` honours `intent.eat` and
  // has since the day agents got hands; the only setter in the whole codebase
  // was a KEYPRESS. A human could eat. A model could not say it wanted to.
  //
  // That absence is most of "the models cannot feed themselves", and it is why
  // every fix aimed at the FOOD end of the chain — the carcass, the noun, the
  // pickup radius, the inventory field — kept not being the answer. The chain
  // was: see the deer, kill the deer, gather the venison, and then nothing. The
  // 110-minute run of 2026-08-11 ended 635 decisions, 0 meals; fixing `gather`
  // alone would have produced minds that starve holding meat.
  //
  // Ninth instance of WHEN A MODEL LOOKS INCAPABLE, SUSPECT THE HARNESS FIRST,
  // and the purest one yet: there was no channel at all.
  //
  // NO PARAMETERS, deliberately. The world's handler takes none — it eats the
  // best thing in the pack off the shared `EDIBLE` order — and a parameter the
  // world ignores is a promise to the mind that gets quietly broken. It would
  // also be actively harmful here: `sanitiseGoal` turns a goal whose every
  // param is missing into `wander`, so an optional `item` would mean a bare
  // {"kind":"eat"} from a starving mind became a walk.
  eat: {
    id: 'eat',
    describe: () => 'eat the best thing in your pack',
    params: [],
  },

  // ── THE VERB THAT LETS A MIND ARM ITSELF ──
  //
  // Fifteen verbs, and until now not one of them made anything. A mind holding
  // wood and no arrows could not say *"make arrows"*; a mind holding raw meat
  // at a fire could not say *"cook"*. The reflex did both, on its own terms and
  // only on its own terms, and a mind that disagreed with those terms had no
  // way to say so.
  //
  // **It is the `eat` bug exactly, one economy over.** Both were a channel that
  // did not exist, and both read from outside as a model too stupid to look
  // after itself. Quoted from the run that caused this, 2026-08-12: Fingal
  // asked the others out loud, twice — *"Who has arrows? Need arrows by dawn"*
  // — while carrying six wood, which is three fletches. He could not have
  // fletched them if he had thought of it, and he did think of it.
  //
  // The noun is OPTIONAL and `optional: true` says so, because `sanitiseGoal`
  // turns a goal whose every declared param is missing into `wander` — the trap
  // `gather` fell into for a day. A bare `craft` means "make whatever is most
  // useful", which is what the reflex already decides.
  craft: {
    id: 'craft',
    describe: (p) => (p?.thing ? `make ${p.thing}` : 'make something useful'),
    // Named by what comes OUT, not by the recipe id: a model says "arrows" and
    // "cooked venison", never `fletch_arrows`. Resolved through the same
    // `resolveItemId` the nouns go through, which is the lesson `gather` paid
    // for — the registry already knew the words, and the one caller that needed
    // it never asked.
    params: ['thing'],
    optional: true,
  },

  makeCamp: {
    id: 'makeCamp',
    describe: () => 'find shelter and settle for the night',
    params: [],
  },

  goTo: {
    id: 'goTo',
    // Named places only. A mind may not name coordinates, because it does not
    // have any — it has been told where it is in words, and words are what it
    // may answer with.
    describe: (p) => `make for ${p.place ?? 'somewhere else'}`,
    params: ['place'],
  },

  say: {
    id: 'say',
    describe: (p) => `say: ${p.text ?? ''}`,
    params: ['text'],
  },

  // ── THE FIRST VERB THAT MOVES SOMETHING BETWEEN TWO PEOPLE ──
  //
  // Until this existed, three of the six written characters had no way to
  // behave differently from each other. A hoarder who "will trade for meat", a
  // generous soul "slow to notice she is being used", and a liar were all
  // identical in what they could DO — the personality lived entirely in what
  // they said, and talk is cheap in a way that giving away your last venison
  // is not.
  //
  // `item` is optional on purpose: a mind that wants to be generous should not
  // also have to be right about item ids. Left out, the server picks something
  // sensible. Naming it is how a mind is SPECIFIC — "give Morag the venison"
  // rather than "give Morag something".
  // ── THE VERB THAT LETS A MIND PICK A FIGHT WITH A PERSON ──
  //
  // `hunt` takes quarry and a player is not quarry, so until this existed no
  // mind could CHOOSE to shoot anybody. PvP damage has been fully built for
  // months — `canHarm`, the hit geometry, the refusal event — and no agent
  // could reach it. The rule stays exactly where it was: party members never
  // hurt each other, and between strangers it depends on where you are
  // standing. A mind may aim; the world still decides whether the arrow counts.
  attack: {
    id: 'attack',
    describe: (p) => `go for ${p.target ?? 'them'}`,
    params: ['target'],
  },

  // ── A PRICE, WHICH IS WHAT TURNS A COIN INTO MONEY ──
  //
  // `give` is one-way and it made generosity legible. It cannot make a BARGAIN,
  // and a hoarder written to "trade hard for something you want" needs one.
  //
  // Two verbs rather than one negotiation protocol: `offer` is a standing
  // promise anybody can hear, `accept` is somebody taking it. Nothing is
  // reserved and nothing is escrowed — an offer is words, and it only becomes a
  // swap at the instant the other person agrees and both still have the goods.
  // That is also why a liar can offer what he does not have and be found out.
  offer: {
    id: 'offer',
    describe: (p) => `offer ${p.item ?? 'something'} to ${p.target ?? 'someone'} for ${p.want ?? 'something'}`,
    params: ['target', 'item', 'want'],
  },

  accept: {
    id: 'accept',
    describe: (p) => `take ${p.target ?? 'their'} offer`,
    params: ['target'],
  },

  give: {
    id: 'give',
    describe: (p) => `give ${p.item ?? 'something'} to ${p.target ?? 'someone'}`,
    params: ['target', 'item'],
  },

  // ── standing orders ────────────────────────────────────────────────────────
  //
  // Everything above is one-shot: decided, carried out, replaced. These persist
  // until something better comes along, and that difference is what turns a
  // crowd of individuals into a company. You cannot hunt a troll with people
  // who each independently decide where to stand.
  //
  // Named targets only, and the name has to be somebody it has actually
  // perceived — the same rule `hunt` and `approach` follow. A mind may not
  // follow a person it has never seen.
  follow: {
    id: 'follow',
    describe: (p) => `stay with ${p.target ?? 'them'}`,
    params: ['target'],
  },

  // Follow, and go for whatever hurts them. The difference between company and
  // an escort, and the only verb in the table that commits a mind to a fight it
  // did not pick.
  guard: {
    id: 'guard',
    describe: (p) => `keep ${p.target ?? 'them'} from harm`,
    params: ['target'],
  },
};

export const GOAL_IDS = Object.keys(GOALS);

/**
 * Take whatever came back and return something the world can act on, or null.
 *
 * The same job `sanitiseIntent` does for a network packet, and for the same
 * reason: this is a boundary, and everything arriving at it is untrusted —
 * whether it came from a socket, a rule set, or a model that hallucinated a
 * verb. Being strict here is what lets everything downstream be simple.
 */
export function sanitiseGoal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const spec = GOALS[raw.kind];
  if (!spec) return null;

  const out = { kind: spec.id };
  for (const key of spec.params) {
    const v = raw[key];
    if (typeof v !== 'string') continue;
    // Length-capped and stripped: speech ends up in front of other players.
    out[key] = v.replace(/[ -]/g, '').trim().slice(0, key === 'text' ? 160 : 40);
  }
  // ── A DROPPED FIELD MUST NOT BE SILENT ──
  //
  // `gather` carried `params: []` for the life of this project, so every `item`
  // a model ever sent was deleted here without a word — and a key that was
  // removed is indistinguishable, downstream, from a key that was never sent.
  // That is why it survived eight session logs and a live run of three starving
  // minds asking for meat and being handed branches.
  //
  // The verbs are a CLOSED table on purpose and an unknown field must still not
  // reach the world. But refusing QUIETLY is what made the bug invisible, so it
  // now leaves a mark: anything a mind said that this function threw away is
  // named on the goal, where a report or the board can print it.
  //
  // Deliberately not a throw and not a console line. It is data about the
  // conversation and it belongs with the goal.
  const ignored = [];
  for (const key of Object.keys(raw)) {
    if (key === 'kind' || key === 'why' || key === 'say' || key === 'text') continue;
    if (spec.params.includes(key)) continue;
    ignored.push(key);
  }
  if (ignored.length) out.dropped = ignored.slice(0, 4);

  // ── the reason, which was being thrown away at the door ──
  //
  // `systemPrompt` has asked for `"why":"<a few words>"` since the day models
  // were added, and this function built its answer out of `spec.params` alone —
  // so every mind in this project has been explaining itself into a void. It is
  // the single most watchable thing a mind produces: "hunt a deer" is what,
  // and only the why tells you three models apart when all three are hunting.
  //
  // Cleaned like any other string off a socket. Not a param on the goal spec
  // because it belongs to EVERY verb, and a goal is still a goal without one.
  if (typeof raw.why === 'string') {
    const why = raw.why.replace(/[ -]/g, '').trim().slice(0, 90);
    if (why) out.why = why;
  }

  // ── SPEECH IS A CHANNEL, NOT A CHOICE ──
  //
  // `say` was a KIND, so a mind that wanted to speak had to give up acting to
  // do it — and the spoken goal then BECAME the standing goal and pinned the
  // body. One mind spent nine real minutes stuck on "Eachann, that deer is
  // mine", repeating it, doing nothing else. Across two days and six models,
  // this world produced exactly ONE sentence between them.
  //
  // A person talks while they walk. So `say` now rides along on ANY verb —
  // {"kind":"hunt","quarry":"deer","say":"that one is mine"} — and the kind
  // `say` survives only for compatibility, where it now means "speak and carry
  // on doing whatever you were already doing".
  //
  // Same cleaning and the same cap as the `text` param it rides beside: this
  // ends up in front of other players.
  if (typeof raw.say === 'string') {
    const say = raw.say.replace(/[ -]/g, '').trim().slice(0, 160);
    if (say) out.say = say;
  }

  // ── A PLAN THAT SURVIVES THE DECISION THAT MADE IT ──
  //
  // Every decision used to start from nothing but a one-line goal, so a mind
  // that formed a multi-step intention had nowhere to put step two. The
  // clearest case on record: "go toward Eachann — offer branches for some of
  // that meat". Step one was chosen. Step two existed only in the reason field
  // and was gone by the next tick.
  //
  // Up to three short lines, written by the mind and handed back to it. OMITTED
  // MEANS KEEP — `undefined` and `[]` have to mean different things, or every
  // decision that forgets to restate the plan silently destroys it, which is the
  // exact failure this is here to fix. An explicit `[]` clears it.
  if (Array.isArray(raw.plan)) {
    out.plan = raw.plan
      .filter((l) => typeof l === 'string')
      .map((l) => l.replace(/[ -]/g, '').trim().slice(0, 70))
      .filter(Boolean)
      .slice(0, 3);
  }

  // ── A PAGE OF ITS OWN ──
  //
  // One field a mind writes and reads back: somewhere to keep a grudge, a
  // price, or a promise. Longer than a plan line and completely unstructured on
  // purpose — the world never reads it and never acts on it.
  //
  // Same rule: omitted keeps what is there, an empty string clears it.
  if (typeof raw.note === 'string') {
    out.note = raw.note.replace(/[ -]/g, '').trim().slice(0, 300);
  }

  // ── A GOAL THAT NEEDS A PARAMETER AND DID NOT GET ONE IS NOT A GOAL ──
  //
  // ...but it used to become `wander` IN SILENCE, which is the same disease as
  // everything else fixed on 2026-08-08: the mind chose something, the world did
  // something else, and nothing told it. A model that asks for `hunt` with no
  // quarry and is quietly sent wandering cannot learn to send a quarry.
  //
  // `refused` is carried on the substitute goal and turned into an outcome line
  // by the caller. It also matters for reading a run: a verb being REACHED FOR
  // AND REFUSED looks identical to a verb nobody wants, and six of fifteen verbs
  // have gone unused with no way to tell those two apart.
  //
  // ...and a verb whose parameters are genuinely OPTIONAL is exempt, or this
  // rule eats the verb it was meant to protect. `gather` is the case: the noun
  // narrows the errand and its absence is a perfectly good instruction. See the
  // note on the spec — a bare gather spent a day silently becoming a wander.
  if (!spec.optional && spec.params.length && spec.params.every((k) => !out[k])) {
    if (spec.params.includes('text')) return null;
    return {
      kind: 'wander',
      ...(out.why ? { why: out.why } : {}),
      refused: `"${spec.id}" needs ${spec.params.join(' and ')} — you sent none, so you wandered instead`,
    };
  }
  return out;
}

export function describeGoal(goal) {
  if (!goal) return 'nothing in particular';
  return GOALS[goal.kind]?.describe(goal) ?? goal.kind;
}
