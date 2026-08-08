// ── config.js ───────────────────────────────────────────────────────────────
// Every tunable constant in the world lives here. Reshape the place by editing
// this one file — nothing else needs touching.

/** World seed. Same seed => identical world, every launch, forever. */
export const SEED = 'highlands-01';

/** 'low' | 'medium' | 'high' — scales view distance, density, shadows, post. */
export const QUALITY = 'high';

const PRESETS = {
  low: {
    viewChunks: 4, // terrain chunks in each direction from the player
    lodSegments: [48, 32, 20, 12, 8], // grid resolution by ring distance
    grassRadius: 28, // metres of grass around the player
    grassDensity: 4.0, // blades per square metre at full density
    grassMax: 16000,
    scatterRadius: 300, // metres of trees + rocks around the player
    treeMax: 320, // per variant
    rockMax: 260, // per variant
    motes: 900,
    shadowMap: 1024,
    shadowExtent: 70,
    waterRT: 256,
    bloom: true,
    smaa: false,
    mistPlanes: 3,
  },
  medium: {
    viewChunks: 5,
    lodSegments: [64, 48, 32, 20, 12],
    grassRadius: 36,
    grassDensity: 5.4,
    grassMax: 26000,
    scatterRadius: 380,
    treeMax: 480,
    rockMax: 380,
    motes: 1800,
    shadowMap: 2048,
    shadowExtent: 85,
    waterRT: 512,
    bloom: true,
    smaa: true,
    mistPlanes: 4,
  },
  high: {
    viewChunks: 6,
    lodSegments: [80, 64, 40, 24, 12],
    grassRadius: 30,
    grassDensity: 20,
    grassMax: 38000,
    scatterRadius: 440,
    treeMax: 620,
    rockMax: 460,
    motes: 3000,
    shadowMap: 2048,
    shadowExtent: 115,
    waterRT: 512,
    bloom: true,
    smaa: true,
    mistPlanes: 5,
  },
};

/** Resolved quality preset. */
export const Q = { ...PRESETS[QUALITY] };

// ── Terrain shape ───────────────────────────────────────────────────────────
export const TERRAIN = {
  chunkSize: 160, // metres per terrain chunk
  skirtDepth: 18, // how far chunk edges hang down, to hide LOD cracks
  // Chunk builds per frame. At 2 the far ring lags a row behind when you sprint
  // across a boundary; 4 keeps the full set resident without a visible hitch.
  maxBuildsPerFrame: 4,

  // Domain warping. This is the single line that turns "lumpy noise" into
  // landscape: we distort the sample coordinates before reading the height,
  // which bends smooth hills into ridgelines and carved valleys.
  warpFreq: 0.00105,
  warpAmp: 105,

  baseFreq: 0.0016, // broad valley form
  baseAmp: 34,
  baseOffset: 24, // lifts the average land well clear of the water

  ridgeFreq: 0.0034, // sharp peaks (ridged noise)
  ridgeAmp: 52,
  ridgeMaskFreq: 0.00058, // where peaks are allowed to exist at all
  ridgeMaskLo: 0.12,
  ridgeMaskHi: 0.72,

  detailFreq: 0.021, // hummocks and small undulation you feel underfoot
  detailAmp: 2.6,

  tintFreq: 0.004, // low-frequency colour variation across the ground
};

// ── The lake ────────────────────────────────────────────────────────────────
export const LAKE = {
  x: 300,
  z: 130,
  radius: 235, // where the carved basin fades out
  floorDrop: 19, // how deep the middle of the basin sits below the waterline
  // The water is a disc barely wider than the carved basin, NOT a big square.
  // A square plane turns every unrelated dip in the terrain that happens to sit
  // below the waterline into a stray puddle of reflective water.
  planeOversize: 1.03,
  visibleRange: 900, // beyond this the (costly) reflective water switches off
};

/** Sea level. Everything below this is underwater. */
export const WATER_LEVEL = 7.0;

// ── Time of day ─────────────────────────────────────────────────────────────
export const TIME = {
  startHour: 7.2, // where a fresh world begins — early morning light
  dayMinutes: 26, // real minutes for one full 24-hour cycle
  running: true, // false freezes the clock where it stands
  scrubStep: 0.35, // hours moved per press of [ or ]

  // The sun's path is real solar geometry rather than a tilted circle, so
  // latitude and date genuinely change the arc — a high latitude gives long
  // raking light and short nights, which is exactly the look this world wants.
  latitude: 57, // degrees north; roughly the Scottish highlands
  dayOfYear: 196, // mid-July: long days, low golden sun morning and evening

  // Below this altitude the sun is treated as set and the moon takes over.
  civilTwilight: -6,
};

// ── Sun, sky, atmosphere ────────────────────────────────────────────────────
export const SKY = {
  // Elevation and azimuth are now COMPUTED from the time of day (see TIME and
  // solarPosition() in world/sky.js). These remain only as the fallback used
  // before the first update and by anything that wants a nominal reference.
  elevation: 6.5,
  azimuth: 152, // degrees
  elevationMin: -2,
  elevationMax: 42,
  elevationStep: 0.6, // per press of [ or ]

  // Turbidity is haze. Cranking it is what turns a clean blue sky into a warm
  // golden one, because haze scatters the low sun's light forward across the
  // whole lower sky. Mie scattering does the halo around the sun itself.
  // 7 is the ceiling before the sky opposite the sun turns into a dark grey
  // wedge. Higher looks hazier near the sun but ugly everywhere else.
  turbidity: 7,
  rayleigh: 2.4, // higher => more orange scattering at the horizon
  mieCoefficient: 0.009,
  mieDirectionalG: 0.88,

  // The Preetham sky emits values in the hundreds. Exposure has to come right
  // down or ACES clips the whole sky to white and you lose every bit of colour;
  // the sun's intensity is raised to compensate (see sky.js).
  exposure: 0.26,
  fogDensity: 0.00092, // FogExp2 — visibility lands around 900 m
  sunHazeSize: 620, // additive glow disc around the sun (feeds the bloom)
  sunHazeOpacity: 0.1,
};

// ── Weather ─────────────────────────────────────────────────────────────────
export const WEATHER = {
  enabled: true,
  startState: 'clear',
  // Real minutes a weather state holds before it considers changing.
  minHold: 2.2,
  maxHold: 6.5,
  // How long a transition takes. Long, because weather that snaps is jarring
  // and half the pleasure is watching it come in over the ridge.
  blendSeconds: 26,

  // Each state is a set of targets everything else lerps toward.
  //   cloud     0..1  drives how much the sun is smothered
  //   fog       multiplier on SKY.fogDensity
  //   wind      multiplier on the base wind strength
  //   rain      0..1  particle density and audio level
  //   weight    relative likelihood of being picked next
  states: {
    clear:    { cloud: 0.05, fog: 0.85, wind: 0.7,  rain: 0,    weight: 3 },
    fair:     { cloud: 0.3,  fog: 1.0,  wind: 1.0,  rain: 0,    weight: 3 },
    overcast: { cloud: 0.78, fog: 1.35, wind: 1.35, rain: 0,    weight: 2 },
    drizzle:  { cloud: 0.85, fog: 1.7,  wind: 1.2,  rain: 0.35, weight: 1.6 },
    rain:     { cloud: 0.95, fog: 2.2,  wind: 1.9,  rain: 1.0,  weight: 1.2 },
    mist:     { cloud: 0.55, fog: 3.2,  wind: 0.35, rain: 0,    weight: 1 },
  },

  // Wind direction drifts continuously, which matters more here than in most
  // games: scent tracking reads it, so a stalk can go wrong halfway through.
  windTurnRate: 0.9, // degrees per second, maximum
  windWanderScale: 0.05, // how fast the underlying direction noise evolves

  // `weather.wind` is a multiplier (0.35 in mist, 1.9 in rain), not a speed.
  // The glider is the first thing that needs it in real units, and this is the
  // conversion: fair weather is 9 m/s, a mist is 3, and rain is 17. Which makes
  // the weather a flying forecast as well as a hunting one — you can soar a
  // ridge in a blow and you cannot in a mist, and now you have a reason to look
  // at the sky before carrying a wing uphill.
  windSpeedScale: 9,
};

// ── Wind (shared by grass, trees, reeds, mist and motes) ────────────────────
export const WIND = {
  dirX: 0.82,
  dirZ: 0.57,
  grassStrength: 0.42, // fraction of blade height of lateral bend
  grassFreq: 1.55,
  grassPhaseScale: 0.075, // how tight the travelling ripple is
  treeStrength: 0.035,
  treeFreq: 0.62,
  treePhaseScale: 0.02,
};

// ── Vegetation placement rules ──────────────────────────────────────────────
export const SCATTER = {
  grassCell: 1.0, // metres — grass placement grid
  grassRebuildDist: 10, // player travel before grass is re-placed
  grassMaxSlope: 0.62,
  grassMinHeight: WATER_LEVEL - 0.3,
  grassMaxHeight: 92,

  treeCell: 13,
  treeRebuildDist: 55,
  treeClumpFreq: 0.0042, // noise mask — real forests grow in copses
  treeClumpLo: 0.14,
  treeClumpHi: 0.62,
  treeMaxSlope: 0.5,
  treeMinHeight: WATER_LEVEL + 1.2,
  treeMaxHeight: 76, // treeline

  rockCell: 17,
  rockShoreBonus: 0.18, // rocks cluster along the waterline
};

// ── Player feel ─────────────────────────────────────────────────────────────
export const PLAYER = {
  eyeHeight: 1.72,
  crouchHeight: 1.05,
  walkSpeed: 4.2,
  sprintSpeed: 8.6,
  crouchSpeed: 2.1,
  wadeFactor: 0.45, // speed multiplier in shallow water
  // These are exponential-approach rates, so they read as "1/seconds to settle".
  // ~9 gives a 110 ms ramp: you feel the push-off without the controls feeling
  // laggy. Crank toward 40 for instant arcade response, down to 4 for heavy.
  accel: 9,
  airAccel: 2.4,
  friction: 12,
  gravity: 26,
  jumpSpeed: 7.4,
  maxWadeDepth: 1.5, // deeper than this and you stop sinking (chest-deep)
  groundSmooth: 26, // critically-damped follow of the terrain surface
  mouseSensitivity: 0.0022,
  mouseSmoothing: 0.42, // 0 = raw, 1 = syrup
  flySpeed: 34,
  flySprintMul: 3.2,
  physicsStep: 1 / 120,

  // ── how big a person is ──
  //
  // These two lived as private consts in sim/world.js, used by exactly one
  // thing — the capsule an arrow is tested against — under a comment saying
  // "the controller has no collider of its own". That comment was accurate and
  // it was the bug: the movement path had no radius at all. They are stated
  // here now because two different systems need the same body.
  bodyRadius: 0.42,
  bodyHeight: 1.8,
  // Most a solid may shove a body in one 1/120 s substep. A body that starts
  // deep inside something (spawned in a boulder, a wall built round it) oozes
  // out over a few ticks rather than being flung across the hillside.
  maxPushPerStep: 0.5,
  // How far apart two people stand. Slightly under twice `bodyRadius`, so
  // shoulders may brush without either of them being shoved.
  personalSpace: 0.78,
};

export const FEEL = {
  // Distance covered per footfall, in metres. THE knob for how the walk feels.
  //
  // Everything about the gait derives from this one number — the head bob rate,
  // the lateral sway, the viewmodel sway and when footstep sounds fire — so
  // they cannot drift apart. And because it is keyed to distance rather than
  // time, the cadence stays correct at walk, sprint and crouch alike.
  //
  // 2.4 m is a long, loping stride. A literal human stride is nearer 0.8 m, but
  // this world moves you at 4.2 m/s at a walk, and 0.8 m there means five
  // footfalls a second — a frantic patter that reads as scurrying. Longer
  // strides at the same speed feel like covering ground.
  strideMetres: 2.4,
  // Crouched movement is short and shuffling, not long and loping. Without
  // this a crouch-walk gives a footfall every 1.1 s, which reads as limping.
  crouchStrideScale: 0.62,
  // Deeper than before, because a longer stride genuinely displaces the head
  // further. Shallow bob over a long stride reads as gliding.
  bobAmpVertical: 0.085,
  bobAmpLateral: 0.058,
  fovBase: 70,
  fovSprint: 78.5,
  fovLerp: 3.4,
  strafeRoll: 0.026, // radians of camera lean when strafing
  rollLerp: 5.0,
  landDipMax: 0.34,
  landDipSpring: 74,
  landDipDamp: 12,
};

// ── Ambient life ────────────────────────────────────────────────────────────
export const LIFE = {
  birds: 16,
  birdHeight: 155,
  birdRadius: 190,
  butterflies: 26,
  butterflyRadius: 26,
  moteBox: 95, // motes live in a box this wide, centred on the player
  moteHeight: 42,
  moteSize: 0.5,
};

// ── Post-processing ─────────────────────────────────────────────────────────
export const POST = {
  bloomStrength: 0.42,
  bloomRadius: 0.75,
  bloomThreshold: 0.82, // high — only the sun, its glint and the bright sky bloom
  vignette: 0.42,
  grain: 0.035,
  maxPixelRatio: 1.5,
};

// ── Audio (all synthesized — there are no sound files) ──────────────────────
export const AUDIO = {
  master: 0.55,
  // Send level into the generated convolution reverb. Distant sounds get more
  // of it automatically; this is the ceiling.
  reverb: 0.28,
  windBase: 0.1,
  windSpeedGain: 0.16,
  windAltitudeGain: 0.1,
  // Level at the water's edge. Was 0.34, which is three times the resting wind
  // and dominated everything — a lake is a quiet thing to stand next to.
  waterGain: 0.11,
  // Metres from the SHORELINE (not the lake centre) over which it fades in.
  waterRange: 40,
  rainGain: 0.26, // level at full downpour
  footstepGain: 0.3,
  birdCallGain: 0.1,
  birdCallChance: 0.0055, // per frame

  // ── fire ──
  // A fire had no sound of any kind: `fires.js` called `audio.fireLit?.()` and
  // no such method has ever existed, so the optional call swallowed it and the
  // first thing you build in this world was silent.
  //
  // Two layers, because a fire is not one sound either: a soft roar that tells
  // you it is there while you are looking elsewhere, and the pops that make it
  // a fire rather than a heater. The roar is deliberately below the water wash
  // — at 0.11 the lake dominates a room, and a campfire should sit under it
  // until you are close.
  fireGain: 0.085, // the roar, at the fire's edge
  fireRange: 14, // metres over which the roar fades out
  fireCrackleGain: 0.16,
  fireCracklePerSec: 3.4, // pops per second at full intensity
};

// ── Combat / items ──────────────────────────────────────────────────────────

export const BOW = {
  drawTime: 0.92, // seconds from slack to full draw
  minCharge: 0.16, // release below this and the arrow just flops out
  // Launch speed at zero and full charge. Real hunting bows sit around
  // 80–95 m/s; the low end here exists so a panicked half-draw is punished.
  // These interact directly with ARROW.gravity — see the note there.
  minSpeed: 26,
  maxSpeed: 74,
  // Spread in radians. Tightens as you draw, opens up if you are moving —
  // which is what makes standing still and taking your time feel worthwhile.
  spreadLoose: 0.055,
  spreadFull: 0.0022,
  spreadMovePenalty: 0.03, // added at full sprint
  moveSlow: 0.42, // movement speed multiplier while drawing
  fovPull: 4.5, // degrees of FOV narrowing at full draw — a subtle "focus"
  cooldown: 0.22, // seconds after a shot before you can draw again
  holdFatigue: 3.2, // seconds at full draw before your aim starts to shake

  // ── where the shaft actually starts, which is NOT the eye ──
  //
  // `Bow.fire` spawns the arrow this far along the aim line rather than at the
  // camera, so it clears a capsule 0.4 m wide instead of striking the archer in
  // the first frame. It was a bare 0.55 in two places in bow.js and nowhere
  // else, so every model of the bow launched from the eye — half a metre short
  // and, on a downward hold, a few centimetres high.
  //
  // Measured rather than supposed, over a socket: twelve arrows compared
  // against `predictLanding` all landed LONG of it, +0.05 to +0.91 m, twelve
  // signs out of twelve. Small, but a sign that never flips is a bias and not
  // scatter. Honouring it moves the solved pitch by about 1.4 mrad and takes
  // 1.5 cm at 10 m to 8.5 cm at 60 m off the top of the arc — under
  // `spreadFull`, so it is a correction and not a transformation. Named here so
  // the bow and every model of it read the SAME number. See
  // `server/ballisticscheck.js`.
  muzzle: 0.55,
};

// ── The mark ────────────────────────────────────────────────────────────────
// Where the arrow will actually land, drawn on the world while you hold a draw.
//
// What this fixes, in plain terms: on this terrain the line of sight to a
// grazing deer clears the ground by only 0.2–0.9 m, while the arrow drops
// 0.5 m at 20 m and about 1.1 m at 30 m. The drop is bigger than the clearance,
// so a shot that looks completely clear is stopped by a rise you cannot see —
// measured at 12 stands on a 35 m ring around one deer, 12 of 12 arrows into
// the dirt, 8 of those 12 with the animal in plain view.
//
// A smooth heightfield gives the eye no texture gradient to read at that scale,
// so there was no way to know. The mark is the honest fix: it does not make the
// arrow fly straighter, it tells you the truth about where it goes, and the
// answer to a blocked shot stays what it always was — move.
export const AIM = {
  enabled: true,
  // Ring radius = tan(spread) * distance — literally your shot group on the
  // ground. Clamped so it stays visible up close and readable far off.
  minRadius: 0.1,
  maxRadius: 2.4,
  lift: 0.05, // metres along the surface normal, so it does not z-fight
  // A mark on an animal faces the shooter and stands this far toward them —
  // a deer is 0.55 m of solid body and a 5 cm offset simply sank into it.
  fleshStandoff: 0.5,
  // A mark on flesh never shrinks below this on screen, or the one shot you
  // actually want becomes a dot at forty metres.
  minFleshRadius: 0.3,
  // How fast the mark slides to a new reading. Instant is jittery on rough
  // ground, slow lies about where you are pointing.
  followRate: 18,
  segments: 32,
};

export const ARROW = {
  // Arrows get their OWN gravity, separate from the player's stylised 26 m/s².
  // The player's number exists to make jumping feel snappy; an arrow has to
  // fall like an arrow.
  //
  // Tuned against BOW.maxSpeed, because drop is ½g(d/v)² — the two numbers only
  // mean anything together. At 74 m/s this gives roughly:
  //     20 m -> 0.5 m      40 m -> 1.8 m      60 m -> 4 m      80 m -> 7 m
  // which is close range point-and-shoot, a little hold-over at mid range, and
  // genuine judgement past 60 m. Slightly heavier than Earth's 9.81 so the drop
  // is legible on screen rather than something you have to be told about.
  gravity: 12.5,
  drag: 0.0021, // quadratic: a = -drag * |v| * v. Steepens the arc as it slows.
  substep: 1 / 240, // fine enough that a 62 m/s arrow cannot tunnel
  maxFlightTime: 12,
  embedDepth: 0.16, // how far the head buries itself on impact
  length: 0.72,
  maxInWorld: 64, // landed arrows beyond this despawn oldest-first
  stickToWater: false, // arrows are lost in the lake

  // Damage at `refSpeed`, scaled linearly by actual impact speed — so a
  // half-drawn shot at long range genuinely wounds rather than kills. Against a
  // 42 hp deer this means: vitals (x1.9) or head (x3.0) drops it in one, body
  // (x1.0) takes two, a leg hit (x0.45) takes four. Shot placement matters.
  damage: 26,
  refSpeed: 74,
};

export const PICKUP = {
  radius: 2.2, // how close you must be for the prompt to appear
  autoCollect: false, // false = press E, true = walk over it
  bobHeight: 0.12,
  bobRate: 1.7,
  spinRate: 0.9,
  dropForward: 1.1, // where a dropped item lands relative to you
  dropUp: 0.5,
  // Deterministic loot scattered through the world, hash-placed like the trees.
  lootCell: 95, // metres between candidate loot sites
  lootChance: 0.3,
  lootRadius: 420, // spawned within this range of the player
  arrowsPerBundle: [3, 7], // inclusive range

  // ── HOW FAR DROPPED LOOT TRAVELS ON THE WIRE ──
  //
  // Deadfall does not need to be sent — it is a pure function of the seed and
  // both ends compute it. DROPPED things are not: a carcass exists because
  // something died there. So nothing ever shipped them, and a mind could be
  // told "a deer went down near 320,-140" and then have no way to see or take
  // it. One starved with three kills to its name.
  //
  // Comfortably past `AGENTS.noticeRange` (140), because a body walks toward a
  // kill it heard about before it can see it, and a carcass that pops into
  // existence at 140 m is worse than one that was there all along.
  wireRadius: 260,

  // Deadfall firewood. Denser than quivers because you need a lot of it, and
  // placed by the woodland mask — so the sheltered valleys have fuel and the
  // cold, exposed tops do not.
  woodCell: 17,
  woodRadius: 130,
  woodChance: 0.55,
};

export const LOADOUT = {
  // What the explorer starts with. Slot order is hotbar order.
  slots: [
    { item: 'bow', count: 1 },
    { item: 'arrow', count: 12 },
  ],
  equipped: 0,
};

// ── Creatures ───────────────────────────────────────────────────────────────

export const WILDLIFE = {
  spawnRadius: 320, // creatures exist within this range of you
  despawnRadius: 400, // and are removed past this (hysteresis, so no flicker)
  // ...unless you have wounded it, in which case it stays loaded so the damage
  // sticks. See the note in creatures/manager.js: a troll that leashes at 300 m
  // and culls at 400 m came back whole, so a fight could never be finished.
  // Long enough that walking away to re-arm does not reset the fight, short
  // enough that the world is not full of limping survivors of old skirmishes.
  woundForgetSeconds: 240,
  spawnCell: 110, // hash grid for deterministic herd sites
  // What fraction of cells are candidate sites at all. Raised from 0.42 once
  // the spawner started leaving thin sites genuinely empty (weight as absolute
  // rarity rather than a share): with more sites declining to produce anything,
  // the same density gate left the world at ~9 creatures in a 320 m radius,
  // which reads as a dead hillside. This restores ~14 without touching the
  // rarity model — more places where something COULD be, same odds that it is.
  siteDensity: 0.66,
  // How many creatures ONE player's hillside is worth. It is a budget per
  // player, not a global total: measured on a server, six players spread a
  // kilometre apart drew 26 between them and the first two took all of it —
  // players 3 to 6 stood 612 to 805 m from the nearest living thing. A shared
  // cap makes the world emptier the more people are in it, which is precisely
  // backwards.
  maxAlive: 26,
  // The server's ceiling, because a budget per player is unbounded and the
  // machine is not. At 60 Hz with distance LOD this is the point where the
  // wildlife tick stops being free.
  maxAliveTotal: 120,
  minSpawnDistance: 55, // never pop into existence in your face
  // Distance bands for update rate. Far creatures still move, just coarsely.
  lodNear: 90,
  lodFar: 220,

  // Darkness (0..1, from the sun's altitude) at which the night shift starts.
  // 0.6 lands shortly after sunset rather than at it — dusk is the hour things
  // start moving, not the moment they do.
  nightThreshold: 0.6,

  // A cave is a warren: goblins live in the holes in the ground whatever the
  // surrounding country is like, so a spawn site inside one is treated as at
  // least this strange. Sits just inside the goblin's [0.55, 1] band.
  warrenStrangeness: 0.58,

  // How far a creature fleeing the sunrise has to get before it is retired.
  // Comfortably beyond the distance you could follow it at a walk, so it always
  // reads as "it got away into the crags" rather than "it vanished".
  retreatDespawn: 190,

  // Testing aid: put a herd on the lake shore in front of the spawn point, so
  // there is always something to stalk without going looking for it. Set to 0
  // to turn it off and rely purely on natural spawning.
  testHerdAtLake: 5,

  // Metres from the spawn point to place a bear, off to one side of your
  // opening view. Far enough outside its 72 m aggro range that you get to see
  // it before it sees you, and decide whether to take it on. 0 turns it off.
  testBearAt: 86,
};

// ── Fish ────────────────────────────────────────────────────────────────────
//
// The lake has been the best-looking thing here and the least useful. See
// world/fish.js. The rule: you can SEE the shoals, stillness is the skill, and
// the otter is better at it than you are.
export const FISH = {
  cellSize: 24, // shoals are close together — a lake is full of them
  density: 0.42,
  visibleRange: 90,
  maxDrawn: 320,

  // Anywhere there is water over them.
  //
  // The first version confined shoals to a wadeable 0.7–3.4 m band, on the
  // reasoning that a fish you cannot reach is no use. Measured, that is 8.5%
  // of the lake — a thin ring at the rim, because the basin drops to 21 m —
  // and it produced ONE shoal in 420 cells.
  //
  // It was also the wrong idea. Fish should be everywhere and REACH should be
  // what limits you, which it already does: you can only stand where you can
  // wade. So now you can see shoals out in the deep water, want them, and not
  // be able to have them. That is texture rather than a shortage.
  minDepth: 0.6,
  maxDepth: 16,

  shoalMin: 4,
  shoalMax: 11,
  shoalRadius: 1.5,

  // Disturbance. Fed from the player's own stealth noise, so the model that
  // has governed every stalk since the deer governs this too.
  spookRange: 9,
  calmRate: 0.22, // per second
  spookedSpeed: 2.6,

  reach: 2.6, // how close you stand to try

  // The odds. Bare-handed and careless is close to hopeless; crouched, still,
  // with a well-kept otter beside you is close to certain.
  baseChance: 0.16,
  crouchBonus: 0.22,
  noisePenalty: 0.35,
  spookedPenalty: 0.4,
  shoalBonus: 0.14,
  // The otter's help. At 0.18-0.42 a devoted one put you at 79% for a
  // renewable 19-fill meal every few seconds, which solved hunger outright and
  // made the STALK — the thing this game is actually about — the inefficient
  // way to eat. It should be a good living, not a solved problem.
  otterBonusMin: 0.12,
  otterBonusMax: 0.28,
  // And it catches its own less often, so a doubled haul stays a moment
  // rather than the norm.
  doubleChance: 0.28,
  maxChance: 0.88, // never a certainty
};

// ── The axe ─────────────────────────────────────────────────────────────────
//
// The first melee weapon, and deliberately not a worse bow. Its whole decision
// is TIMING: the wind-up is long enough that a charging animal reaches you
// during it, so you either swing early and miss or swing late and get hit.
// See weapons/axe.js.
// ── the glider ──────────────────────────────────────────────────────────────
//
// Aerodynamics, and they are the real ones — see world/glider.js for why that
// is cheaper than faking it rather than more expensive.
//
// These numbers are not tuned by feel, they are DERIVED, and they hang together
// as one aircraft. Pick a glide ratio and the rest follows:
//
//   best L/D = ½·√(1 / (k·Cd0))          → 6.0 with the values below
//   Cl at that glide = √(Cd0 / k)        → 0.72
//   speed there, from L = W              → 11.8 m/s
//
// So: six metres forward per metre down at about 12 m/s, which is 26 mph and
// exactly what a braced wooden wing under a hanging man does. Change Cd0 or k
// and you have changed the aircraft — check what it does before you keep it,
// because `npm run glidercheck` measures the glide rather than trusting it.
export const GLIDER = {
  // ── the air and the machine ──
  rho: 1.225,      // kg/m³, sea-level air
  wingArea: 16,    // m² of stretched hide
  mass: 100,       // kg — the machine and the person hanging off it
  gravity: 9.81,

  // ── the wing ──
  // clAlpha is 2π/(1+2/AR) for an aspect ratio near 3.2: a short, deep,
  // heavily braced wing, because a long thin one made of branches snaps.
  cl0: 0.05,
  clAlpha: 3.88,     // per radian
  alphaStall: 0.262, // 15°, where the flow lets go
  // Fraction of the critical angle at which the wing starts complaining. The
  // margin IS the warning — see the stick-shaker note in glider.js.
  stallWarnAt: 0.72,
  clStall: 1.07,
  cd0: 0.06,         // struts, bracing, and a person in the breeze
  k: 0.1157,         // induced drag factor, 1/(π·e·AR)

  // ── the pilot ──
  // The stick commands an angle of attack and the airframe flies it, which is
  // what being trimmed MEANS — see the long note in glider.js about the deep
  // stall that happens when you leave this out.
  alphaTrim: 0.173,      // 9.9°, where Cl = 0.72 and the glide is flattest
  pitchAuthority: 0.19,  // full back reaches 21°, past the 15° stall, on purpose
  pitchRate: 0.9,   // rad/s of nose authority — you shift your weight, slowly
  rollRate: 2.2,    // how fast the bank follows your input
  maxBank: 0.72,    // 41°, past which a wooden wing is a bad idea

  // ── beginning and ending ──
  launchSpeed: 9.5,      // m/s, the run off the edge
  // The ground ahead has to fall away this steeply, and keep falling — see
  // canLaunch. Not a guess: measured against this world's actual terrain, 0.26
  // made 59% of the map a runway and 0.7 makes it 6%, which is what a hill
  // ought to be. Finding an edge is now a thing you go and do.
  minLaunchSlope: 0.7,
  // ── the air going up ──
  // Ridge lift, and it is the reason the aircraft is worth building. The
  // terrain here tops out at 80 m: a 6:1 glide off the highest point in the
  // world lands you 130 m away, measured, which is a hop and not an aeroplane.
  // The height was never going to come from the hills. It comes from the wind
  // blowing over them — which is exactly where real glider pilots get it.
  // How much of the wind's deflection you actually get. Measured against this
  // world's real slopes rather than picked: at 0.55 the only flyable weather
  // was RAIN, because a fair-weather 9 m/s over a top-10% face still left you
  // sinking. That is a feature nobody would ever see. At 0.78 a good windward
  // face soars in fair wind, a typical slope still puts you down, and a storm
  // will lift you almost anywhere steep — so the sky becomes a forecast you
  // read before carrying a wing uphill.
  liftEfficiency: 0.78,
  liftBandHeight: 60,    // metres of usable lift above the slope, then nothing

  // ── carrying it ──
  // Nine metres of span on one shoulder. Slow, but slow is the whole cost —
  // the alternative that shipped for months was that a wing landed in the
  // wrong place became scenery, and a season's work with no way to pick it up
  // is not a difficulty, it is a bug. The blurb has always said "carry it up a
  // hill"; this is the first version where you can.
  carrySpeed: 0.55,      // movement multiplier with the wing on your shoulder
  carryFindRadius: 150,  // how far the "where would this fly from" search looks

  crashSpeed: 21,        // arriving this fast breaks it
  crashSink: 6.5,        // so does arriving this hard
  crashDamage: 34,
  // What it costs to build, in the same units as everything else, and it is
  // meant to be the most expensive thing in the game — a season's work.
  cost: { wood: 14, hide: 10 },
};

export const AXE = {
  // Wind-up. Long on purpose — this is the window the fight happens in.
  windupFull: 0.62, // seconds to a full-power blow
  windupMoveScale: 0.55, // you cannot run flat out with it over your head
  windupFov: 3, // degrees, a slight pull-in as you load

  swingTime: 0.42,
  contactAt: 0.16, // when in the swing the blade actually bites
  recoverTime: 0.34,

  reach: 2.9, // metres, measured to the surface of the target
  arc: 1.5, // radians, total — a swung axe is a wide thing
  strikeHeight: 0.55, // where on the body a level swing lands, 0..1

  // A full blow kills a deer outright and takes a serious bite out of a bear;
  // a panicked poke does not. That gap is the reward for holding your nerve.
  // A full blow kills a deer and takes a serious bite out of a bear; a
  // panicked poke does not. That gap is the reward for holding your nerve.
  //
  // 52 was a 2.4x overshoot: 99 against a deer's 42 hit points, and two blows
  // to kill a bear. That made the axe the better answer to the commonest kill
  // in the game AND to the encounter the bow was designed around. At 34 it is
  // a clean one-shot on a deer and four blows on a bear — which is the stand
  // and fight arithmetic the bear was actually built for.
  damageLight: 10,
  damageFull: 34,

  // As a TOOL. This is most of why you want one: chopping by hand is pulling
  // at deadfall, and with an axe it is chopping.
  chopSpeed: 2.4, // multiplier on how fast you work
  chopBonus: 2, // extra wood per tree
  quarryBonus: 1, // and it is a passable hammer
};

// ── The otter ───────────────────────────────────────────────────────────────
//
// Every other creature here is a problem to be solved. This one is a
// relationship, and TRUST is the only thing that buys obedience — you cannot
// command an otter that does not know you. See creatures/otter.js.
export const OTTER = {
  tameAt: 0.3, // trust at which it will take a command
  namesAt: 0.18, // ...and at which it feels like yours enough to have a name

  // What it will eat, and how much good it does. Fish would be better and
  // there are no fish yet, so it is venison — raw for preference, because it
  // is an otter.
  // Fish first, and by a long way. It is an otter. Feeding it a trout it
  // helped you catch is the best moment this animal has to offer.
  foods: { fish: 0.55, fish_cooked: 0.4, venison: 0.42, venison_cooked: 0.3, hide: 0.05 },
  playValue: 0.34,
  playSeconds: 4,

  // Trust is bought with care, in small amounts, repeatedly. No single act
  // should tame it — that is the difference between a pet and a pickup.
  trustPerFeed: 0.1,
  trustPerPlay: 0.07,
  trustPerHome: 0.12,
  trustPerTrick: 0.05,

  // Needs fall over in-game days, not minutes. The guard rail from NORTH-STAR
  // applies to a pet as much as to hunger: if you cannot stand still for two
  // minutes and watch the light, the numbers are wrong.
  hungerPerHour: 0.028,
  borednessPerHour: 0.038,

  // Trust rises slowly when it is well kept and falls FASTER when it is not.
  // An animal forgives, but not instantly, and undoing a week of neglect with
  // one fish would make the whole thing decorative.
  contentAbove: 0.55,
  trustGain: 0.004, // per second at full care
  trustLoss: 0.011, // per second when neglected
  willWorkAbove: 0.35, // below this it is too miserable to learn anything new
  forgetBelow: 0.22,
  forgetSeconds: 90, // of sustained neglect before a trick goes

  // Warmth. An otter is small and it gets wet, so it loses heat fast.
  warmthRate: 0.35,
  homeWarmth: 0.85,
  fireWarmth: 0.7,
  wetChill: 0.3,
  homeRadius: 3.2,

  // Movement. It is quick over short distances and cannot keep it up.
  walkSpeed: 2.2,
  runSpeed: 5.4,
  playSpeed: 1.2,
  followRange: 4.5,
  runRange: 13,
  shyRange: 9, // how close a WILD one lets you get

  // Fighting. Not a damage source — a distraction, which is what a 9 kg animal
  // actually is. A goblin with an otter attached is a goblin not swinging.
  biteDamage: 6,
  biteRange: 1.9,
  attackSeconds: 14,
  giveUpRange: 34,

  // Seeking. RELIABILITY IS THE POINT: it never rolls dice about whether it
  // finds the food, only about how far it can cast. A hint you cannot trust is
  // worse than no hint.
  seekRangeMin: 45,
  seekRangeMax: 130,

  // Performing. A spin is a counted rotation rather than "spin until the timer
  // runs out", so it finishes cleanly facing you instead of stopping wherever
  // it happened to be.
  spinRate: 6.2, // radians a second
  spinTurns: 2,
  chirpEvery: 0.34, // seconds between chirrups while speaking

  anim: { strideRate: 3.4, legSwing: 0.34, bodyBob: 0.035 },
};

// ── Agents: players that are not people ─────────────────────────────────────
//
// See src/net/agent.js. An agent holds a real socket and sends real intents;
// the server cannot tell it from a person, which is the architecture arriving
// where Phase 1 pointed it.
//
// COST IS THE CONSTRAINT that shapes every number here. A model call is money,
// so the cadence is slow, the brief is small, and the reflex layer is good
// enough that a slow or absent model costs nothing but initiative.
export const AGENTS = {
  cadenceSeconds: 8, // how often an agent reconsiders
  // How often it LOOKS, which is a different and much cheaper thing than
  // reconsidering. Memory used to be written only while deliberating, so a mind
  // remembered the world as a handful of stills taken eight seconds apart and
  // anything that walked past between two thoughts had never happened. Two
  // seconds is often enough to keep a story continuous and slow enough that
  // `Memory.add`'s repeat-drop does the rest of the work.
  noticeSeconds: 2,
  retargetSeconds: 2.5,

  // ── drawing a bow ──
  // The numbers the reflex layer hunts by. Judgement stays with the mind, which
  // only ever says WHICH animal; everything here is the body's half.
  //
  // 45 m and not `noticeRange`: an agent can see a deer at 120 m and has no
  // business shooting at one. Past about 60 m the hold-over is 4°+ and the arc
  // spends long enough in the air that a grazing animal has moved out from
  // under it — see the drop table in ARROW.
  // TUNED DOWN FROM 45, on measurement rather than taste. At 45 the body spent
  // its time considering shots the ground would never allow — 19 refusals to 2
  // arrows in one run, all of them "ground in the way" at roughly half the
  // distance to the animal. A crest at 17 m of a 36 m shot is not a geometry
  // problem to be solved with a cleverer sightline; it is a hill, and the
  // answer to a hill is to walk. Cutting the range makes the body stop
  // deliberating at distance and close until the shot is honest.
  shootRange: 26,
  aimAboveFeet: 0.75, // the middle of a deer, not the ground it stands on
  // How close it will walk while trying to get a clear line. A bow is not a
  // spear: past this the shot is a steep plunge onto an animal that is already
  // running, and the measured result was arrows landing 2 m from the archer.
  standOff: 12,
  drawMargin: 0.35,   // held past BOW.drawTime, well under BOW.holdFatigue
  betweenShots: 1.1,  // a pause after loosing, so it does not machine-gun
  arriveWithin: 6,

  // ── STEPPING ASIDE, AND MEANING IT ──
  //
  // `clearSpotNear` names a place to walk to when the ground is in the way, and
  // for months the body re-solved it FROM SCRATCH thirty times a second. A
  // twenty-metre sideways probe over rolling ground is exquisitely sensitive to
  // the origin it is cast from, so as the body took its first six centimetres
  // the answer flickered: 13% of ground ticks came back null, which is plenty to
  // kill a walk that would have taken eight seconds. Measured over sixteen
  // episodes: twenty metres walked in TOTAL, one metre each, not one completed.
  // The body picked a knoll, took one step toward it, forgot, and refused the
  // shot again.
  //
  // A person picks the knoll and GOES to it. So the spot is remembered in world
  // coordinates and walked to without re-solving. These are the four things
  // that end that walk.
  //
  // Two metres is arrival: `clearSpotNear`'s nearest candidate is six metres
  // out, so a third of the way is not it, and standing exactly on a computed
  // point is not something a walking body does.
  detourArrive: 2,
  // ── HOW FAR UP THE LINE OF SIGHT A STEP ASIDE ALSO WALKS ──
  //
  // A fraction of the sideways offset, so a six-metre step also closes about
  // four metres and a twenty-metre one closes fourteen. Set against the numbers
  // that made this necessary: the body is refused at 20-26 m, `shootRange` is
  // 26, and a bare six-metre sidestep at 24 m LENGTHENS the slant to 24.7 — so
  // `too far` fires, and it ends 54-64% of every step aside this project has
  // measured. Four metres of closing at that range takes the slant to 20.7 and
  // leaves eight metres of margin above `standOff` for the animal to drift into.
  //
  // 0.7 rather than 1.0 because the point is to close WHILE going round, not to
  // charge diagonally at a deer. Only read when the close arm is on; see
  // `clearSpotNear`.
  detourAdvance: 0.7,
  // ...and this is how long it may take. Twenty metres is the furthest offset
  // offered and the body is crouched while it stalks, so `PLAYER.crouchSpeed`
  // covers it in about ten seconds. Twelve leaves room for the ground; past
  // that, a walk that has not arrived is a walk that is not going to.
  detourHoldSeconds: 12,
  // How often the held spot is re-checked — as one sightline from the FIXED
  // spot, not six from wherever the body now stands. That is the whole point:
  // the origin no longer moves, so the answer only changes when the ANIMAL
  // does, which is exactly when it should. Every tick is affordable at one
  // sightline; the flicker was never the cost, it was the origin.
  // ── HOW MUCH OF THE CONVERSATION A MIND IS HOLDING ──
  //
  // `hears` is how many recent lines go into the brief; `remembersHeard` is the
  // ring behind it. Three and six were the old numbers and three is less than
  // one exchange with six agents and a human on a single channel — a mind would
  // answer a question that had already scrolled out of its own memory, and two
  // of them could never get past hello.
  //
  // Eight lines is a few dozen tokens per call, which is the cheapest thing in
  // the whole design and buys the one behaviour a watcher actually reads: bodies
  // talking TO each other rather than merely near each other.
  hears: 8,
  remembersHeard: 16,
  roamDistance: 60,
  stalkWithin: 45,
  turnRate: 1.7,
  speakEveryHours: 0.5,

  // ── staying alive, which is not a decision ──
  //
  // The reflex layer's half of survival. A mind chooses where to go and what to
  // hunt; NOBODY chooses to be hungry, and a body that waits for permission to
  // eat is a body that starves between two thoughts eight seconds apart. Same
  // split the bow already uses: the mind names the deer, the reflex draws.
  //
  // `hunger` runs 100 (fed) down to 0 (starving). Cooked venison fills 34, so a
  // body that eats at 45 finishes its meal comfortably under the ceiling and
  // wastes nothing — eating at 80 would throw away half of every deer.
  eatBelow: 45,
  // ...and this is the line where cooking stops being worth waiting for. Raw
  // venison fills 16 against cooked's 34, so eating it is a real loss and a
  // body should only take it when the alternative is dying with meat in its
  // pack. Below this it stops holding out for a fire.
  eatRawBelow: 18,
  // How long a meal takes to register. `me.f` is the server's answer and it
  // arrives at 20 Hz against a body running at 30, so without a pause here a
  // hungry agent eats everything in its pack in the third of a second before
  // the first mouthful is acknowledged — measured, two steaks, 44 to 100 with
  // the ceiling at 100 and most of a deer thrown away.
  swallowSeconds: 2.5,
  // How long after a cook or a craft the pack's own changes belong to that make
  // rather than to a pickup. `Agent.notePack` reads gathering off the inventory
  // RISING on the server's snapshot — a confirmed outcome, unlike a keypress —
  // and a cook makes the cooked line rise in exactly the same way. The server
  // resolves the craft on its own tick, so the new item can land several
  // snapshots after the intent went out; one snapshot of suppression is not
  // enough. Seconds of real time, not game hours: the clock wraps at midnight.
  makeOwnsPackFor: 1.5,
  // Core temperature, in degrees. `Body` starts shivering at 35.6; this is the
  // point at which warming up stops being something to fit around the day.
  warmBelow: 35.4,
  // How far it will walk to a fire that is already burning rather than lighting
  // its own. Beyond this, a branch of its own is cheaper than the walk.
  fireWalkRange: 45,
  // ...and how close a fire has to be before lighting another is silly. Under
  // this, `place` would land on top of the fire already there and simply feed
  // it — which burns the branch you were saving for the next camp.
  //
  // RAISED FROM 9. Nine metres is the distance at which laying a second fire is
  // ABSURD; it is not the distance at which it is WASTEFUL. A body that wanders
  // — which is what a body does — clears nine metres constantly, so the guard
  // almost never fired: 106 fires went down in one run with this in place. At
  // 35 m a fire you laid a moment ago is still yours to walk back to, which is
  // what `fireWalkRange` (45) already assumes about somebody else's.
  fireNearby: 35,
  // A pause after asking for a fire, so a body does not lay six of them while
  // the snapshot that would have told it about the first is still in flight.
  relightSeconds: 4,
  // How many of its own fires a body keeps track of. `nearestFire` reads the
  // snapshot, which cannot know about a fire laid a moment ago — that gap is
  // what `relightSeconds` was meant to cover and plainly did not.
  firesRemembered: 12,
  // Fletching is fuel spent on arrows, so it only happens with fuel to spare:
  // below this many branches in the pack, the wood is for the fire.
  //
  // RAISED WITH `SURVIVAL.woodToLight`, in the same commit and for one reason:
  // at 4 this meant "keep enough for a fire" back when a fire cost one branch.
  // Leaving it there while lighting costs ten would have a body fletching away
  // the very wood it needs to get warm, which is the failure mode this number
  // exists to prevent. Kept a little above the fire's price so there is
  // something spare rather than exactly enough.
  spareWood: 14,
  // ...and only when the quiver is genuinely low. A body that fletches at 11
  // arrows spends its whole night at the fire making arrows it already has.
  lowArrows: 5,

  // ── standing orders ──
  // Station-keeping for `follow` and `guard`. Twelve metres is close enough to
  // be company and far enough not to be underfoot — a companion that walks into
  // your back while you are drawing a bow is worse than one you have to glance
  // over your shoulder for.
  followWithin: 12,
  // How close something hostile gets to the person you are guarding before you
  // break off for it. Wide enough to intercept rather than react: a guard that
  // waits until the troll is swinging is an usher.
  guardRange: 45,

  // What goes in a brief. Small on purpose: a decision needs the nearest few
  // things, not an inventory of the county.
  noticeRange: 140,
  maxContacts: 6,

  // How many "what your last action did" lines a decision is shown. Small on
  // purpose: an outcome list longer than the rest of the brief is noise with a
  // new name, and consecutive duplicates collapse into "(4 times)" anyway.
  outcomesKept: 6,

  logSize: 400,

  // ── the ceiling ──
  // A hard cap on how much a session may spend, checked before every call.
  // Not a suggestion: the harness stops asking and every agent falls back to
  // its scripted brain, which is a fully playable outcome rather than a
  // failure. Nothing here should ever be able to run up a bill unattended.
  maxCallsPerAgent: 400,
  maxCallsTotal: 4000,
};

// ── Minds ───────────────────────────────────────────────────────────────────
//
// The deliberation layer. See src/minds/ and VISION.md §6b. Two rules govern
// every number here: the world must never wait for a mind, and the game must
// be fully playable with no model at all.
export const MINDS = {
  // How often a mind reconsiders. Seconds, not ticks — deliberation is slow by
  // design, and a hunter that re-plans sixty times a second is not thinking,
  // it is twitching.
  cadenceSeconds: 6,
  // How often the reflex layer re-resolves a goal into a place on the ground.
  retargetSeconds: 2.5,
  arriveWithin: 6,
  roamDistance: 55,
  stalkWithin: 45, // start crouching this far from quarry
  speakEveryHours: 0.4, // in-game hours between remarks

  // Memory, in words rather than coordinates.
  memorySize: 40, // kept — the flat ring, used only by MEMORY=flat
  memoryRecall: 5, // handed to a decision, ditto
  memoryHours: 24, // how long something still feels recent

  // ── TWO STREAMS, BECAUSE PERCEPTION WAS EATING EVERYTHING ──
  //
  // Measured 2026-08-08: a memory in this game had a half-life of exactly ONE
  // decision. `Memory` was a single 40-entry ring handing the model its last 5
  // entries, and perception wrote ~26 entries between two thoughts — two
  // sightings every `AGENTS.noticeSeconds`, plus `maxContacts` more at each
  // deliberation. So "I brought down a deer" and "Eachann offers me venison for
  // wood" were visible for one decision and then gone, and four of the five
  // lines a model ever saw were "a deer, somewhere, walking".
  //
  // That single fact explains most of a seven-hour run: a mind said the same
  // sentence three times because it had no memory of saying it, a barter died
  // between step one and step two, and an apparent sustained grudge turned out
  // to be the same thought had forty times, re-derived from what was in front
  // of it. The code already half-knew — see the comment on `intentions` in
  // agent.js, which moved the DECISION log out of this ring for the report
  // while leaving what the MODEL sees alone.
  //
  // So: sightings go in one ring and things that HAPPENED go in another, and
  // the second is never evicted by the first. This is the cheap half of the
  // Generative Agents design (recency + importance); relevance and reflection
  // are deliberately not here yet.
  eventsKept: 60, // things that happened — kills, trades, shots, speech
  noticedKept: 12, // sightings — cheap, disposable, overwritten constantly
  eventsRecalled: 6, // events handed to a decision, best-scoring first
  noticedRecalled: 3, // and this many recent sightings, for situational sense

  // Scoring is `importance × 0.5^(age / halfLife)`, so a 9 stays ahead of a 1
  // for about three half-lives. In GAME hours: a day is 26 real minutes, so 6
  // game-hours is about six and a half real minutes of relevance for a middling
  // memory and most of an hour for being shot.
  memoryHalfLife: 6,

  // The table. Hand-written on purpose: the full Generative Agents version asks
  // the model to rate its own memories 1-10 when they are written, which costs
  // a call per memory. A table is free and captures most of the benefit — and
  // being wrong about the weights is cheap to fix, whereas having no weights at
  // all is the thing that lost every event in the run above.
  weight: {
    shot: 9, // somebody put an arrow in me
    trade: 8, // an offer, a gift, a bargain struck
    kill: 7, // meat exists somewhere, mine or not
    spoke: 7, // what I said, so I do not say it again
    heard: 6, // what somebody said to me
    hurt: 6, // an arrow of mine hit something
    decided: 5, // "I decided to ..." — the thread of my own intent
    refused: 4, // an act the world would not allow
    event: 3, // anything else that HAPPENED. The default: fail toward
    //           remembering, because an unweighted event scored as a sighting
    //           is exactly the bug this table exists to kill.
    sighting: 1, // "a deer, close, walking"
  },

  // The decision log, which is what makes a run with a model in it replayable.
  logSize: 500,

  // A rival hunter perceives the world about as well as you do.
  hunterSenses: { sightRange: 85, sightFov: 2.1, hearingRange: 70 },
};

// ── Building ────────────────────────────────────────────────────────────────
//
// See world/structures.js. The rule: a structure must change a DECISION. A
// windbreak makes a ridge survivable, a lean-to turns a night from a fight into
// a rest, a store means you need not carry everything, a palisade decides where
// a warband can reach you. Anything that only looks like something is
// furniture, and furniture can wait.
export const STRUCTURES = {
  useRange: 3.2, // how close you stand to use one
  placeRange: 3.4, // how far in front of you a new one lands
  // Minimum gap between two structures, as a fraction of their summed radii.
  // Below 1.0 they may visually crowd, which is what a camp looks like; the
  // point of a windbreak is to be right next to the thing it is sheltering.
  spacing: 0.7,
  // Gathering. Trees and rocks already exist as scattered objects with
  // colliders; these are how long you stand there and what you get.
  chopSeconds: 3.2,
  chopYield: 3, // wood per tree
  quarrySeconds: 4.0,
  quarryYield: 2, // stone per boulder
  // A gathered tree or rock is gone for this long before the world regrows it.
  // In-game hours, so it tracks the day/night cycle rather than wall time.
  regrowHours: 30,
};

// ── Company: parties, PvP and what dying costs ──────────────────────────────
//
// The rules for being in a world with other people. See src/sim/world.js.
//
// The design idea worth keeping: PvP is not a toggle or a coloured zone map,
// it is THE STRANGENESS GRADIENT. Danger from other people belongs where danger
// already lives. The same walk that gets more dangerous because of what lives
// out there gets more dangerous because of who does — and the place names
// already tell you how far out you are.
export const SOCIAL = {
  defaults: {
    pvp: true,
    // Below this strangeness, strangers cannot hurt each other at all. 0.45 is
    // "lonely" — past the settled country and the quiet country, out where the
    // deer are already thinning out.
    pvpAboveStrangeness: 0.45,
    // For a server that wants a straight brawl.
    pvpEverywhere: false,
  },
  // How close two people have to be to count as standing together, for the
  // purpose of a pack sizing you up.
  groupRange: 26,

  // ── HOW CLOSE YOU STAND TO HAND SOMETHING OVER ──
  //
  // Arm's length plus a step, and deliberately much shorter than `groupRange`:
  // shouting at somebody across a clearing is not the same act as putting food
  // in their hands, and the whole point of `give` is that it costs a walk. A
  // generous mind has to go to the hungry one.
  //
  // Comfortably wider than `PLAYER.personalSpace` (0.78) so two bodies pushed
  // apart by SOLID can still trade — a rule that made people unable to reach
  // each other the moment collision was switched on would be a fine bug.
  giveRange: 3.0,
};

// ── Networking ──────────────────────────────────────────────────────────────
//
// See src/net/ and server/server.js. The world is generated from a seed on
// every machine, so terrain, trees, caves, barrows and place names never cross
// the wire — only what moved.
export const NET = {
  defaultPort: 8080,
  // How often the client tells the server what it wants. The server holds the
  // last intent it was given, so this only costs input latency, not fidelity —
  // and sending at frame rate would be 144 packets a second to describe 60
  // ticks, most of them identical.
  intentHz: 30,
  // How far in the past other players and creatures are drawn. Two snapshots
  // at 20 Hz is 100 ms, so 110 leaves a little slack for a late packet before
  // the interpolator runs out of future and has to hold still.
  interpolationMs: 110,
};

// ── Caves ───────────────────────────────────────────────────────────────────
//
// A heightfield cannot express an overhang, so a cave here is a BOWL carved
// into the heightfield (which gives real collision for free) plus a separate
// roof shell laid over it (which gives the overhang). See world/caves.js.
export const CAVES = {
  cellSize: 520, // hash grid for placement
  density: 0.28, // fraction of cells holding one
  visibleRange: 420,

  radiusMin: 11,
  radiusMax: 18,
  // How far the hollow is driven down. Kept modest against the radius: depth
  // over run IS the gradient, and a cave you cannot walk into is a hole.
  depthMin: 3.0,
  depthMax: 4.8,
  // Where the floor bottoms out, as a fraction of the radius. Small means the
  // fall is spread across nearly the whole bowl. At 0.28 the walls came out at
  // gradient 1.26 — unclimbable — and the whole thing was a pit.
  floorFraction: 0.08,

  // The mouth. `mouthStart` is how much of the facing side opens up, and
  // `mouthCut` is how much of the bowl's depth is taken back out there — the
  // difference between an entrance you walk into and a pit you fall into.
  mouthStart: -0.15,
  mouthCut: 0.96,
  mouthDrop: 0.55, // how far the roof is carried away below the rim

  roofDetail: 3,
  roofHeightScale: 0.62, // a hemisphere reads as a bubble; squash it
  roofLift: 0.4,
  // Inside this fraction of the radius you are properly under the roof, which
  // is what shelter and darkness key off.
  roofFraction: 0.72,

  // What being inside does. A cave is the best shelter in the world, and the
  // whole reason to want one.
  shelter: 0.95,
  // Degrees the rock holds against the night. Caves are cold by day and warm
  // by night relative to outside, which is what real rock does.
  thermalMassC: 5.5,
  // The rock settles at the DAILY MEAN, which is above sea-level-minus-lapse
  // because the sun only adds heat while it is up. See the note in
  // environment.js — without this the night-time gain measured +0.1 C.
  meanBiasC: 3.4,
  // How much of the sky's light reaches you. Near zero: a cave at night is
  // genuinely dark and you will want a fire.
  skyOcclusion: 0.9,
};

// ── Built sites: barrows and stone circles ──────────────────────────────────
//
// The only evidence anyone was ever here before you. Both must change a
// decision — a circle is a survey point and a windbreak, a barrow is loot with
// a consequence. See world/sites.js.
export const SITES = {
  cellSize: 340, // hash grid for placement
  density: 0.2, // fraction of cells holding anything at all
  visibleRange: 460,
  maxSlope: 0.3,
  useRange: 4.5, // how close you stand to use one

  // Barrows want lonely ground: they are where people did NOT live.
  barrowStrangeness: 0.4,
  barrowRadius: 4.6,
  barrowHeightScale: 0.52,
  barrowGoodsMax: 4,
  // Above this strangeness, something is still in there.
  barrowGuardianAt: 0.55,

  // Circles want a view, so they prefer high open ground.
  circleMinHeight: 26,
  circleRadius: 5.2,
  circleStones: 9,
  // How far the survey reaches, in district cells. Two rings is about 1.9 km —
  // enough to plan a journey, not enough to hand you the whole map.
  surveyRings: 2,
  // The stones break the wind, like any ring of standing stones.
  circleShelter: 0.55,
};

// ── Place names ─────────────────────────────────────────────────────────────
//
// A world of coordinates is a world you cannot talk about. See
// world/placenames.js for why this is Phase 4's done-when rather than polish.
export const NAMES = {
  // How big a named district is. Big enough that crossing one is a walk (about
  // two and a half minutes at a jog), small enough that "I am in the Black
  // Moss" actually narrows you down.
  districtSize: 620,
  // Features are anchored on a rounded grid this size, so the same spring keeps
  // its name whichever system asks about it and from wherever.
  featureAnchor: 40,
  // How often a name takes a possessive or "X of Y" form instead of the plain
  // "Adjective Noun". Rare on purpose — it is seasoning, and at high rates
  // every place in the world sounds like a ballad.
  ofFormChance: 0.22,
};

// ── Regions: what kind of ground this is ────────────────────────────────────
//
// Derived entirely from fields the world already has, so nothing is stored and
// it works at any coordinate. See world/regions.js.
//
// The rule: every region must change a DECISION. A bog is slower, wetter,
// colder and louder to cross; snow is cold and crunches; a gorge is out of the
// wind but hems you in; a spring is the only warm place on the tops. A region
// that does not change what you would do has no business existing.
export const REGIONS = {
  // Shore: how far above the waterline still counts as beach.
  shoreBand: 2.2,

  // Gorge: pure slope. `minSlope` on the troll already uses 0.26, so the
  // visible gorge starts a little below that — the habitat should be inside
  // the thing you can see, not the other way round.
  // Measured: 16.8% of the world is steeper than 0.22 and only 0.9% steeper
  // than 0.5, so a "full" gorge at 0.62 existed essentially nowhere.
  gorgeSlope: 0.24,
  gorgeSlopeFull: 0.45,

  // Snow line, in metres. The land runs to 78 m, so this puts snow on the top
  // quarter of the relief — visible from the valley, and a real destination.
  snowLine: 58,
  snowLineFull: 70,
  snowWobble: 7, // so it is not a perfect contour ring around every hill

  // Bog: needs all three of low, flat, and the right place. Without the mask
  // every hollow in the world is marsh and none of them is memorable.
  // Both masks run smoothstep(threshold -> thresholdFull) over simplex noise.
  // Ramping all the way to 1 was the mistake: simplex almost never reaches its
  // extremes, so "full strength" happened essentially nowhere and bogs covered
  // 0.5% of the world. The FULL value is what actually sets how much ground a
  // feature claims; the threshold only sets where it starts.
  bogFreq: 0.0011,
  bogThreshold: 0.02,
  bogThresholdFull: 0.42,
  bogHighest: 34, // fades out above this
  bogLowest: 11, // full strength at and below this
  bogFlat: 0.11, // full strength up to here...
  bogFlatMax: 0.28, // ...gone by here

  // Hot springs: rare and small. Finding one should be an event — but at a
  // threshold of 0.72->1 the nearest one to the lake was 1.26 km away, which
  // means most players would never see one at all. Rare has to stay findable.
  springFreq: 0.0026,
  // 0.58->0.82 overshot the other way: 4.4% of the world and one within 146 m
  // of the lake, which makes it scenery rather than an oasis. This lands ~1.5%
  // with the nearest a few hundred metres out — worth the walk, and findable.
  springThreshold: 0.68,
  springThresholdFull: 0.9,

  // Woodland, from the existing clump field. THE CLUMP FIELD SATURATES HIGH —
  // measured, 86% of the world is above 0.34 and 44% sits in the top decile,
  // so the obvious-looking [0.34, 0.72] made 71% of the world "woodland" and
  // buried every other region underneath it. These thresholds are set against
  // the actual distribution rather than against what 0..1 looks like it means.
  woodStart: 0.88,
  woodFull: 0.97,

  // ── what the ground does to you ──
  bogSpeed: 0.52, // wading through it, and it is the point of a bog
  snowSpeed: 0.78,
  gorgeSpeed: 0.86,

  bogNoise: 2.1, // squelch — a quiet crossing has to be a SLOW crossing
  snowNoise: 1.5, // crunch

  gorgeShelter: 0.75, // the only place on a high ridge you survive a gale
  woodShelter: 0.35,

  springWarmthC: 15, // enough to reverse hypothermia, which is the whole idea
  snowChillC: 3.2,
  bogChillC: 2.0,

  bogWetRate: 0.16, // per second, standing in it
  springWetRate: 0.1, // warm, but you still get wet
};

// ── The Strangeness Gradient ────────────────────────────────────────────────
//
// The spine of the fantasy pivot. The lowlands are mundane, the high country is
// dangerous, the deep places barely obey physics — and it rises with distance,
// altitude and darkness. See world/strangeness.js for the shape, and VISION.md
// for why this one idea is load-bearing.
//
// In plain terms: the "how far from town are you" dial every folk tale runs on.
export const STRANGENESS = {
  // Distance from the lake, which is the settled centre of the world.
  //
  // `remoteFar` is deliberately much further than you are likely to walk. Set
  // to 1100 it saturated at 1 across most of the sampled world (mean 0.81), so
  // remoteness stopped discriminating between "a fair way out" and "genuinely
  // lost" — and nearly half the map ended up sharing one strangeness value.
  // A slow ramp keeps every extra kilometre worth something.
  remoteNear: 260, // still within sight of the water — ordinary
  remoteFar: 2200, // genuinely out on your own

  // Altitude, in metres. Measured relief runs -14 m (lake bed) to 78 m on the
  // highest crests, with a mean of 37, so this covers the shoulder to the tops
  // and leaves most of the world firmly in the low half.
  lowGround: 24,
  highGround: 78,

  // The blight: slow noise, so some ground is simply wrong regardless of how
  // far or high it is. At a 0.38 threshold it fired essentially nowhere (mean
  // 0.02 across 5,000 samples) and contributed nothing at all; this puts it on
  // a real minority of the map, which is what makes it legible as an exception.
  blightFreq: 0.00042,
  blightThreshold: 0.12,

  // How the three terrain terms combine. They SUM and deliberately total more
  // than 1, so no single term can reach the top of the scale but a combination
  // can: the deep places are high AND remote AND blighted, all at once, at
  // night. At a total of 1.08 nothing in the world ever exceeded 0.8, which
  // left the top band — the one the whole gradient exists to point at — empty.
  //
  // Altitude carries the most weight because it is the term you can SEE from
  // the valley floor. That is what makes the difficulty curve readable without
  // a single number on screen: the dangerous ground is the ground that looks
  // dangerous.
  weightRemote: 0.34,
  weightHigh: 0.58,
  weightBlight: 0.3,

  // Darkness is a MULTIPLIER, not a fourth term: night does not create
  // strangeness, it lets what is already there come out. Daylight keeps this
  // much of it, so a bad place is still a bad place at noon — just survivable.
  dayScale: 0.45,
  // Sun altitude in degrees. Civil twilight (-6) is full dark, because that is
  // where a person can no longer work outdoors without a light.
  nightBelow: -6,
  dayAbove: 8,

  // Weather, applied only at night — mist at noon is atmosphere, mist at
  // midnight is a summoner.
  mistBonus: 0.16,
  rainBonus: 0.05,
};

// ── Alarm ───────────────────────────────────────────────────────────────────
//
// When one animal panics, the ones around it find out. In the real world this
// is the single most important thing about hunting a herd: you do not get one
// chance per deer, you get one chance per hillside. Miss, and everything with
// ears knows where you are.
//
// The mechanism is deliberately a CHAIN rather than a broadcast — a deer at the
// edge of the herd spots you, the ones beside it react to *the deer*, and it
// ripples inward. That means cover and spacing matter: a strung-out herd raises
// the alarm slowly and a tight one goes up all at once.
export const ALARM = {
  // Each retelling is weaker than the last, and after this many hops it stops.
  // Without a cap the chain is a feedback loop that pins the whole map at
  // awareness 1 the instant anything anywhere gets startled.
  generationDecay: 0.55,
  maxGenerations: 3,
  // Alarm never *lowers* an animal's awareness, and it never fully panics one
  // on its own — being told is not the same as seeing. Something has to be left
  // for the animal's own senses to confirm, or a distant rumour is as decisive
  // as an arrow past the ear.
  ceiling: 0.92,
};

export const STEALTH = {
  // Noise you make, 0..1, by movement state. Feeds creature hearing.
  noiseStill: 0.0,
  noiseCrouch: 0.08,
  noiseWalk: 0.38,
  noiseSprint: 1.0,
  noiseWade: 0.55, // splashing about is loud
  noiseSmoothing: 6, // how fast your noise level settles when you change pace

  // How visible you are, 0..1. Crouching and standing still both help.
  visStand: 1.0,
  visCrouch: 0.45,
  visMovingBonus: 0.35, // added when moving — motion catches the eye
  // Tall grass breaks up your outline, but only if you are low in it.
  coverCrouchBonus: 0.35,
  // Trees break your outline whether or not you are crouched — which is why
  // woodland is the good approach and open moor is not.
  coverWoodBonus: 0.22,
  // Above the snow line you are a dark shape on a white field, and there is no
  // grass to get down into. The tops are exposed in every sense of the word.
  visSnowPenalty: 0.4,

  hearingRange: 42, // metres at noise 1.0; scales linearly with noise
  scentRange: 70, // metres directly downwind
  scentCone: 0.55, // how tightly scent follows the wind direction

  // What heavy rain does for you. Multipliers applied at rain = 1.
  rainNoiseMask: 0.3, // your footsteps carry 30% as far
  rainScentMask: 0.25, // and your scent barely reaches at all
};

// ── Survival: the body and the elements ─────────────────────────────────────
//
// Temperature is modelled in real degrees rather than an abstract "warmth" bar,
// because "34.1 C — shivering" tells you something a half-empty blue bar never
// will, and because it makes every input (altitude, wind, rain, fire, clothing)
// combine in a way you can reason about instead of tune blindly.
export const SURVIVAL = {
  // ── ambient temperature ──
  seaLevelC: 15, // air temperature at the waterline at solar noon, clear sky
  // Real lapse rate is 6.5 C per 1000 m, which across this world's 110 m of
  // relief would be under a degree — invisible. Exaggerated hard on purpose so
  // that going up genuinely means going cold.
  lapsePerMetre: 0.105,
  diurnalSwingC: 9, // how much colder night is than afternoon
  // The ground holds heat, so the coldest hour trails sunrise and the warmest
  // trails noon. Without this lag, dawn is wrongly the warmest part of night.
  thermalLagHours: 2.4,

  cloudDaySuppressC: 4.5, // cloud caps the afternoon high
  cloudNightBlanketC: 3.0, // ...and stops the night falling as far
  rainChillC: 3.5,
  mistChillC: 1.5,

  // ── wind chill ──
  windChillMax: 7.5, // degrees stolen at full gale, dry
  windChillWetBonus: 6.0, // ...and again on top of that when soaked

  // ── sun on your back ──
  sunWarmthMax: 6.0, // direct sun at a high angle, clear sky

  // ── wetness, 0..1 ──
  wetRainRate: 0.055, // per second in full downpour
  wetWadeRate: 0.5, // per second standing in water
  // Drying is SLOW. At 0.012 a soaking dried out in under ninety seconds, which
  // meant rain never actually cost you anything. Four minutes standing in the
  // wind, or under one beside a fire, is the difference between weather as
  // decoration and weather as a decision.
  wetDryRate: 0.0035,
  wetDryFireBonus: 0.008,
  wetDrySunBonus: 0.008,
  wetDryWindBonus: 0.007,
  wetChillC: 8.0, // degrees stolen when fully soaked

  // ── the body ──
  neutralC: 19, // effective ambient below which a body starts losing heat
  // ...and how far ABOVE neutral it can go before it starts gaining. Real
  // thermoregulation is lopsided: you sweat off a surplus far more effectively
  // than you generate a deficit. Without this band, sitting by a fire in a
  // cloak slowly cooks you to 41 C, which is absurd.
  comfortBandC: 14,
  // How fast a comfortable body climbs back to 37. About four minutes to thaw
  // out from properly hypothermic, so getting cold costs you real time.
  rewarmRate: 0.0075,
  coreStartC: 37,
  coreMinC: 28,
  coreMaxC: 42.5,
  // Degrees of core change per second, per degree of imbalance against
  // `neutralC`. Small, and it has to be: an exposed ridge at night sits around
  // 20 degrees of imbalance, so this puts you at the shivering threshold in
  // about five real minutes and in danger in ten. An earlier value of 0.0125
  // meant 0.24 C per SECOND — hypothermia in under twenty seconds, which is not
  // weather, it is a trap.
  thermalRate: 0.00023,
  exertionWarmthC: 5.5, // moving hard warms you — a real survival tactic
  shiverWarmthC: 2.2, // involuntary, and it costs you food

  coldShiverC: 35.6, // below this you shiver: aim sways, hunger burns faster
  coldSlowC: 34.5, // below this you slow down
  coldDamageC: 33.0, // below this it starts killing you
  coldDamagePerSec: 1.6,

  hotSweatC: 38.4, // above this stamina drains faster and aim sways
  hotDamageC: 40.0,
  hotDamagePerSec: 1.4,

  // ── hunger, 0..100 ──
  hungerStart: 85,
  // Roughly two in-world days from full to empty at rest. Deliberately slow:
  // a survival meter that interrupts you every few minutes is a chore, and
  // this game is about standing still and watching the light.
  hungerPerHour: 2.1,
  hungerExertionMul: 2.4, // at a full sprint
  hungerColdMul: 1.9, // shivering burns fuel fast
  hungerWeakBelow: 25, // stamina ceiling starts dropping
  hungerDamageBelow: 0, // and then it kills you
  hungerDamagePerSec: 0.55,

  // ── stamina, 0..100 ──
  staminaStart: 100,
  staminaSprintDrain: 11, // per second sprinting
  staminaDrawDrain: 4.5, // per second at full draw — holding a bow is work
  staminaRecover: 9.5, // per second at rest
  staminaWalkRecover: 4.0,
  staminaSprintFloor: 12, // below this you cannot start a sprint
  staminaHotMul: 1.5,

  // ── fire ──
  // Enough to lift you clear of `neutralC` on a cold, windy ridge — at 16 it
  // fell just short, so a fire slowed you freezing but could never actually
  // warm you back up, which defeats the entire point of building one.
  //
  // 22 was set when a fire was the ONLY protection in the game. Since then it
  // has been joined by a 9-degree cloak, a camp at 94% shelter, caves and hot
  // springs — and stacked, they put you at 32.3 C felt on the coldest ground
  // in the world, which is not a survival model, it is a sauna. At 13 a fire
  // still saves you outright on its own; it just no longer makes everything
  // else you built irrelevant.
  fireWarmthC: 13,
  fireWarmRadius: 6.5, // and the range over which that falls off

  // How far in front of you a new fire is laid, in metres.
  //
  // MEASURED, not guessed. At the old 1.6 m the fire was under your chin: with
  // an eye 1.72 m up, the ground 1.6 m ahead sits 47 degrees below level and
  // the vertical half-FOV is 35, so the pit — stones, ash, logs, the light
  // itself — was a metre BELOW the bottom edge of the screen. Projected onto a
  // 1280x720 frame the base landed at y=927 of 720. The only part of the fire
  // that was ever on screen was the top 40 cm of flame, at y=606, and the
  // hotbar starts at y≈656 and is centred on exactly that column. You lit a
  // fire and saw a sliver behind your inventory.
  //
  // In the real world you do not build a fire on your toes; you lay it a couple
  // of paces out, far enough to sit around and not kick into. Three paces puts
  // the whole flame in the lower middle of the view, clear of the hotbar, while
  // staying inside the 3.4 m reach at which E feeds and cooks — so you can
  // still tend it without taking a step. Raising this past that reach would
  // mean lighting a fire you then cannot touch.
  firePlaceDistance: 3,
  // How near you must be for E to feed or cook at a fire. Was a bare 3.4 in
  // main.js; it is here because `firePlaceDistance` has to stay under it and a
  // relationship between two numbers cannot be checked while one is anonymous.
  fireReach: 3.4,
  fireLightRange: 26,
  fireBurnPerSec: 0.34, // fuel units consumed
  fireFuelPerWood: 45, // seconds of burn per branch

  // ── WHAT IT COSTS TO LAY A FIRE, AS OPPOSED TO FEEDING ONE ──
  //
  // Lighting cost ONE branch, the same as feeding, and that was the whole
  // problem. `place` was the cheapest action in the game, and a body that finds
  // a cheap action repeats it: 106 fires in a seven-hour run, five of them
  // inside twenty real seconds, laid across a hillside like breadcrumbs.
  //
  // It is also why firewood was worthless. Deadfall is the one thing in this
  // world that is both abundant and useful, and a hoarder with infinite
  // firewood takes the same actions as a generous one — which is the reason
  // `SCARCE` exists at all. At ten branches a fire, wood becomes the first real
  // currency here: something you can run out of on a cold night, something
  // worth asking for, and something for gold to be priced AGAINST.
  //
  // Ten is Ben's number and it is about right in real terms: a night's fire is
  // an armful of wood, not a stick. Feeding stays at one, which is what makes
  // keeping a fire alive cheaper than walking away and lighting another — the
  // opposite of the old arrangement, where both cost the same and nobody ever
  // bothered to feed one.
  woodToLight: 10,
  fireMaxFuel: 240,
  cookSeconds: 22, // per item, standing beside it

  // ── nutrition ──
  // Keys are ITEM IDS. They have to match items/registry.js exactly or eating
  // silently does nothing.
  food: {
    venison: { fills: 16, spoils: true }, // raw: edible, but poor
    venison_cooked: { fills: 34, spoils: false },
    // A trout is a smaller meal than a deer and a much easier one to get.
    // That trade — reliable and small against occasional and large — is the
    // whole reason to put fish in the lake rather than more deer on the hill.
    fish: { fills: 9, spoils: true },
    fish_cooked: { fills: 19, spoils: false },
  },
  spoilHours: 30, // raw food goes off after this long in the pack

  // ── clothing ──
  // Insulation is expressed in degrees of effective ambient added. Wet clothing
  // keeps far less, which is what makes rain genuinely dangerous rather than
  // merely atmospheric.
  wetInsulationLoss: 0.65,
};

export const VITALS = {
  maxHealth: 100, // a bear swipe is 38, so three of them kill you
  regenDelay: 9, // seconds unhurt before you start recovering
  regenRate: 4.5, // health per second after that
  respawnDelay: 3.4, // seconds on the ground before you wake at the spawn point
  flashFade: 1.8, // how fast the red hit flash falls away
};

/** Show the frame-rate readout. */
export const SHOW_FPS = true;
