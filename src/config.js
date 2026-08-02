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

// ── Sun, sky, atmosphere ────────────────────────────────────────────────────
export const SKY = {
  // 6.5 degrees is as low as this can go. It is the warmest, richest light in
  // the range — but shadow length is object height x cot(elevation), so a 12 m
  // tree already throws a 105 m shadow, and `shadowExtent` is 115. Drop the sun
  // further and shadows start clipping against the edge of the shadow camera.
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
  bobDistanceFreq: 0.62, // bob cycles per metre travelled — NOT per second, so
  bobAmpVertical: 0.052, // it stays in sync at walk, sprint and crouch alike
  bobAmpLateral: 0.038,
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
  windBase: 0.1,
  windSpeedGain: 0.16,
  windAltitudeGain: 0.1,
  // Level at the water's edge. Was 0.34, which is three times the resting wind
  // and dominated everything — a lake is a quiet thing to stand next to.
  waterGain: 0.11,
  // Metres from the SHORELINE (not the lake centre) over which it fades in.
  waterRange: 40,
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
  maxAlive: 26,
  minSpawnDistance: 55, // never pop into existence in your face
  // Distance bands for update rate. Far creatures still move, just coarsely.
  lodNear: 90,
  lodFar: 220,

  // Testing aid: put a herd on the lake shore in front of the spawn point, so
  // there is always something to stalk without going looking for it. Set to 0
  // to turn it off and rely purely on natural spawning.
  testHerdAtLake: 5,
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

  hearingRange: 42, // metres at noise 1.0; scales linearly with noise
  scentRange: 70, // metres directly downwind
  scentCone: 0.55, // how tightly scent follows the wind direction
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
