# BUILD PROMPT — "Highlands": a walkable golden-hour world

Build a first-person, browser-based exploration world I can walk around in and simply enjoy.
No objectives, no combat, no menus-as-content. The goal is **a place worth being in**: sweeping
golden-hour highlands, wind-rippled grass to the horizon, a mirror-still lake, and distant stone
monoliths that make me want to walk toward them.

Treat this as a *complete, polished, runnable* project — not a tech demo, not a scaffold.

---

## 0. The one hard rule: zero external assets

Everything is generated in code. **No** downloaded models, textures, HDRIs, audio files, or
runtime CDN fetches. Terrain from noise, sky from an atmospheric-scattering shader, grass and
trees from instanced procedural geometry, sound from WebAudio oscillators and filtered noise.

This is non-negotiable, and it is the main reason the build must succeed on the first run.

---

## 1. Stack & constraints

- **Vite + vanilla JavaScript ES modules.** No TypeScript, no framework, no bundler config beyond
  Vite's defaults. Fewer moving parts = fewer failure modes.
- **Three.js** from npm (latest stable), `WebGLRenderer` — not WebGPU.
- Only these deps are welcome: `three`, `vite`, and a seeded-noise package
  (`simplex-noise` + `alea`, or hand-roll the noise — your call).
- **No physics engine.** Ground collision is an analytic height query against the same noise
  function that built the terrain.
- Must run cleanly with exactly: `npm install && npm run dev`.
- Desktop-first, pointer-lock mouse look. Don't spend effort on mobile.
- **Determinism:** one `SEED` constant in config drives every random placement. The same seed must
  produce the identical world every launch.

---

## 2. The world

### Terrain
Chunked heightfield grid around the player, streamed as I walk so there is no visible world edge.
Build the height with layered simplex noise plus **domain warping** — that's what turns generic
lumpy hills into ridgelines and valleys that read as landscape. Ridged noise for the high peaks,
smooth low-frequency for the broad valley floor, a flattened basin carved for the lake.

Vertex-colour the terrain by **slope and altitude**, not by texture: dry grass gold in the flats,
darker green in sheltered valleys, exposed grey rock where the slope is steep, pale scree near the
peaks. Blend the bands softly. Slope-based colour is what stops procedural terrain looking like
painted plastic.

### The lake
A single large lake in a low basin, positioned so it's visible from spawn. Use Three's `Water`
example object (reflection + refraction + normal-perturbed ripples) with a sun colour matched to
the directional light. At golden hour the sun's specular streak across the water is the single
best shot in the world — compose the spawn view so I see it.

Add a shoreline: wet-darkened terrain colour near the waterline, a scatter of rocks and reeds.

### Scatter — everything instanced
- **Grass:** the hero element. `InstancedMesh` of simple 2–3 segment blades, tens of thousands of
  instances in a radius around the player, re-placed (not re-allocated) as I move. Wind in the
  **vertex shader**: a travelling noise wave that bends blades along a shared wind direction, with
  per-blade phase offset and stiffness so it ripples rather than pulses in unison. Fade blade
  density and height out with distance so the ring boundary is invisible.
- **Trees:** procedural low-poly — tapered trunk, 2–4 noise-displaced icosphere or cone canopies.
  Generate 4–6 distinct variants at load, instance them by the thousand. Sway the canopy in the
  vertex shader on the same wind field as the grass, at lower frequency and higher amplitude.
  Cluster them with a noise mask into copses and treelines — never uniform scatter, real
  vegetation grows in clumps and stops at altitude and slope thresholds.
- **Rocks:** noise-displaced icosahedrons, flat-shaded, instanced, random rotation and non-uniform
  scale. Denser on steep slopes and along the shore.

### Landmarks — the reason to walk
Hand-place (fixed world coordinates, not random) **4–6 authored landmarks** that are silhouetted
against the sky and visible from a long way off:

- A ring or avenue of tall weathered **monoliths** on a ridge.
- A lone enormous tree on a hilltop.
- A natural stone **arch** spanning a gully.
- A cairn at the highest point with a genuine panoramic payoff.
- A half-sunken monolith in the shallows of the lake.

Compose the spawn point deliberately: standing still at spawn, facing forward, I should see the
lake with sun-glint, a treeline, and at least two landmarks at different distances. That layered
depth is what creates the urge to start walking.

---

## 3. Light & atmosphere — this is where the beauty comes from

- **Sky:** Three's `Sky` (Preetham) shader dome, sun elevation held low (~4–8°) for a long warm
  golden-hour cast. Drive the directional light's colour, intensity and position from the same sun
  vector so sky and lighting never disagree.
- **One** directional sun light casting shadows, with a **tight shadow frustum that follows the
  player** — a world-sized shadow camera gives you mud. Plus a hemisphere light for warm sky
  bounce from above and cool ground bounce from below.
- **Exponential-squared fog** tinted to the horizon sky colour. Fog is doing three jobs: aerial
  perspective (distance reads as distance), hiding chunk streaming, and mood. Tune it so the
  farthest landmark is a pale silhouette, not crisp.
- **Post-processing chain:** `EffectComposer` → render → `UnrealBloomPass` (tuned restrained —
  threshold high enough that only the sun, its water glint and sky near the horizon bloom) →
  `OutputPass` with **ACES Filmic** tonemapping → `SMAAPass`. Then a small custom shader pass for
  **subtle** vignette + film grain. Every one of these should be individually toggleable.
- **God rays:** don't attempt true volumetrics. Get 90% of the look from bloom on the sun disc
  plus a handful of large, soft, additive billboard shafts near treelines and the monoliths,
  fading by view angle to the sun. If a cheap screen-space radial-blur godray pass is easy, add it
  behind a flag.
- A slow drift of low **mist** pooling in the valleys and over the lake — a few big scrolling
  additive planes with soft-edged noise alpha, hugging the terrain.

---

## 4. Movement feel — budget real effort here

Most worlds like this fail not on graphics but on feeling like a floating spreadsheet. Get this
right:

- WASD + mouse look under pointer lock. `Shift` sprint, `Space` a small hop, `Ctrl` crouch.
- **Acceleration and friction**, not instant velocity. Slightly lower air control than ground.
- Eye height smoothly follows the terrain height query — critically damped, so slopes feel like
  slopes and small bumps don't jolt the camera.
- **Head bob** driven by *distance travelled*, not time, so it stays in sync at every speed —
  vertical sine plus a half-frequency lateral sway. Scale it up with speed, off when still.
- **Footstep cadence** locked to the same bob phase, firing the footstep sound at the low point.
- **FOV kick:** lerp ~70° → ~78° over the sprint ramp-up. Cheap, and it's most of what "fast"
  feels like.
- **Camera roll lean** of a degree or two when strafing, and a small downward dip on landing.
- Mouse look smoothed a touch, with an adjustable sensitivity — never accumulate pitch past ±89°.

---

## 5. Ambient life

The world must never look frozen.

- **Birds:** a small flock of simple flapping shapes doing lazy boids circles high over the ridge,
  occasionally gliding. Silhouettes against the sky are enough — no detail needed.
- **Butterflies / insects:** a handful near the grass and shoreline, fluttering on jittered noise
  paths, staying within a radius of the player.
- **Pollen and dust motes:** an additive `Points` field drifting in the sun's direction, densest
  in the light shafts, fading in and out. This single effect does an enormous amount for "the air
  feels real."
- Reeds and shoreline plants ripple on the same wind field as the grass.

---

## 6. Soundscape — fully synthesized, opt-in

Gated behind a click-to-start overlay (browsers require a gesture anyway). All WebAudio, no files:

- **Wind:** filtered noise through a slowly-modulated bandpass; louder and brighter with altitude
  and player speed.
- **Water:** a gentler low-passed noise bed that fades in with proximity to the lake.
- **Footsteps:** short filtered noise bursts, pitch and level randomized, timbre varying by
  surface (grass vs rock vs shallow water) inferred from the terrain colour bands.
- Occasional sparse **bird calls** — a couple of pitched blips with a fast envelope, randomized.

Keep it quiet and mixed low. A mute key, and it must never be the reason the frame rate drops.

---

## 7. Player-facing extras

- **Photo mode:** `F` toggles a free-fly camera (no gravity, no collision), `H` hides all UI,
  `P` saves a full-resolution PNG screenshot to disk.
- **Time scrub:** `[` and `]` nudge the sun elevation so I can push toward dawn or dusk. Sky, sun
  colour, fog tint and water all follow. Default sits at golden hour.
- **Minimal HUD:** a small, unobtrusive keybind list that fades out after ~10 seconds and returns
  on `?`. An FPS readout behind a flag. Nothing else — no crosshair, no minimap, no meters.
- A **single `src/config.js`** holding every tuning constant — seed, terrain amplitudes and
  frequencies, view distance, grass count, fog density, bloom strength, walk/sprint speed, bob
  amplitude, sun elevation, audio levels — each with a one-line comment on what it does. I want to
  be able to reshape the world by editing one file.

---

## 8. Performance — a stated budget, not an afterthought

- **Target 60 fps at 1080p on a mid-range discrete GPU.** If a feature can't hold that, cut its
  quality, not the frame rate.
- Cap `devicePixelRatio` at 1.5. Frustum-cull. Instance everything repeated. Reuse vectors and
  matrices — **zero per-frame allocations** in the update loop.
- Distance-based LOD for terrain chunks and scatter density; grass and rocks culled well before
  the fog wall.
- Fixed-timestep simulation with a clamped delta so an alt-tab doesn't launch me into orbit.
- A `QUALITY` preset in config (`low` / `medium` / `high`) scaling view distance, grass count,
  shadow map size and post-processing.

---

## 9. Code organisation

Small, single-purpose modules — no 2000-line `main.js`:

```
index.html
package.json
vite.config.js
README.md
src/
  main.js              — bootstrap, render loop, wiring
  config.js            — every tunable constant, commented
  world/
    noise.js           — seeded noise, domain warping, the height function
    terrain.js         — chunk generation, streaming, vertex colouring, height query
    water.js           — the lake
    scatter.js         — instanced grass / trees / rocks + wind
    landmarks.js       — the authored monoliths, arch, cairn, great tree
    sky.js             — sky dome, sun vector, fog, mist, time-of-day
  fx/
    composer.js        — post-processing chain
    ambientLife.js     — birds, insects, motes
  player/
    controller.js      — input, movement, collision against the height query
    cameraFeel.js      — bob, FOV kick, lean, landing dip
  audio/
    soundscape.js      — synthesized wind, water, footsteps, calls
  ui/
    hud.js             — keybind overlay, photo mode, screenshots
```

Comment the *why* on anything non-obvious, especially the shader maths and the feel constants.

---

## 10. Anti-goals — do not do these

- No downloaded assets, no runtime CDN requests, no `fetch` of anything external.
- No physics library, no ECS, no state-management library, no React.
- No TODOs, stubs, placeholder cubes, or "left as an exercise" gaps. Every module ships working.
- No procedural buildings, NPCs, dialogue, inventory, quests, or combat. This is a **place**.
- No uncapped particle counts, no shadow camera covering the whole world, no `Math.random` in
  world generation (seeded only — the world must be reproducible).

---

## 11. Definition of done

Do not report finished until all of these are true:

1. `npm install` succeeds from a clean checkout, and `npm run dev` serves with **zero** console
   errors or warnings.
2. You have actually **opened it in a browser, walked around, and screenshotted it** — spawn view,
   the lakeside with sun-glint, a ridge-top landmark, and one wide vista. Show me those shots.
3. Frame rate holds ~60 fps at 1080p on the `high` preset while walking; state the number you
   measured.
4. All controls work: WASD, sprint, jump, crouch, free-fly, hide UI, screenshot, time scrub, mute.
5. Same seed → identical world across two launches. Verify it.
6. `README.md` documents the controls, every config knob, and how the world is generated.
7. Walking for two minutes in any direction never hits a world edge, a hole, a seam, or a spot
   where I fall through the terrain.

---

## 12. The bar

Golden-hour highlands, from a standing start at spawn: warm light raking across grass that moves,
a lake throwing the sun back at me, monoliths on the far ridge, dust hanging in the air, and the
immediate urge to start walking toward something.

If it doesn't make me stop and look at it, it isn't done.
