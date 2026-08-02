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
  waterGain: 0.34,
  waterRange: 120, // metres over which lake sound fades in
  footstepGain: 0.3,
  birdCallGain: 0.1,
  birdCallChance: 0.0055, // per frame
};

/** Show the frame-rate readout. */
export const SHOW_FPS = true;
