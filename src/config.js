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
  spawnCell: 110, // hash grid for deterministic herd sites
  // What fraction of cells are candidate sites at all. Raised from 0.42 once
  // the spawner started leaving thin sites genuinely empty (weight as absolute
  // rarity rather than a share): with more sites declining to produce anything,
  // the same density gate left the world at ~9 creatures in a 320 m radius,
  // which reads as a dead hillside. This restores ~14 without touching the
  // rarity model — more places where something COULD be, same odds that it is.
  siteDensity: 0.66,
  maxAlive: 26,
  minSpawnDistance: 55, // never pop into existence in your face
  // Distance bands for update rate. Far creatures still move, just coarsely.
  lodNear: 90,
  lodFar: 220,

  // Darkness (0..1, from the sun's altitude) at which the night shift starts.
  // 0.6 lands shortly after sunset rather than at it — dusk is the hour things
  // start moving, not the moment they do.
  nightThreshold: 0.6,

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
  fireWarmthC: 22,
  fireWarmRadius: 6.5, // and the range over which that falls off
  fireLightRange: 26,
  fireBurnPerSec: 0.34, // fuel units consumed
  fireFuelPerWood: 45, // seconds of burn per branch
  fireMaxFuel: 240,
  cookSeconds: 22, // per item, standing beside it

  // ── nutrition ──
  // Keys are ITEM IDS. They have to match items/registry.js exactly or eating
  // silently does nothing.
  food: {
    venison: { fills: 16, spoils: true }, // raw: edible, but poor
    venison_cooked: { fills: 34, spoils: false },
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
