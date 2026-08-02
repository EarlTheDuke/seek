// ── soundscape.js ───────────────────────────────────────────────────────────
// Wind, water, footsteps and bird calls — all synthesized from noise buffers and
// oscillators. There are no audio files in this project.
//
// The whole graph is built once on the first click (browsers require a gesture
// before audio can start) and then only has its gains nudged, so it costs
// essentially nothing per frame.

import { AUDIO, LAKE, PLAYER, WATER_LEVEL } from '../config.js';
import { heightAt, makeRandom } from '../world/noise.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.rand = makeRandom('audio');
    this.callCooldown = 0;
    this.draw = null; // the currently-sounding bow creak, if any
    this.listener = null; // player position, for distance attenuation
    this.waterDist = Infinity; // metres to the water's edge
    this.waterProbe = 0; // countdown to the next shoreline lookup
  }

  /** Build the graph. Must be called from a user gesture. */
  start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // no audio available; the world still works
    this.ctx = new Ctx();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.master;
    this.master.connect(ctx.destination);

    // A few seconds of noise, looped. Everything textural is built from this.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = this.rand() * 2 - 1;

    // ── wind: noise through a band-pass whose centre drifts ──
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windGain.connect(this.master);

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 520;
    this.windFilter.Q.value = 0.75;
    this.windFilter.connect(this.windGain);

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.noise;
    windSrc.loop = true;
    windSrc.connect(this.windFilter);
    windSrc.start();

    // Slow LFO on the filter centre — this is what turns flat hiss into wind.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.075;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 230;
    lfo.connect(lfoDepth).connect(this.windFilter.frequency);
    lfo.start();

    // ── water: the same noise, low-passed into a soft wash ──
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    this.waterGain.connect(this.master);

    const waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'lowpass';
    waterFilter.frequency.value = 430;
    waterFilter.Q.value = 0.5;
    waterFilter.connect(this.waterGain);

    const waterSrc = ctx.createBufferSource();
    waterSrc.buffer = this.noise;
    waterSrc.loop = true;
    waterSrc.playbackRate.value = 0.7;
    waterSrc.connect(waterFilter);
    waterSrc.start();

    this.ready = true;
  }

  get running() {
    return this.ready && !this.muted && this.ctx?.state === 'running';
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : AUDIO.master, this.ctx.currentTime, 0.08);
    }
    return this.muted;
  }

  /**
   * A footstep: a short filtered noise burst. Timbre follows the surface, pitch
   * and level are jittered, because identical footsteps are instantly fake.
   */
  footstep(surface) {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = lerp(0.8, 1.35, this.rand());

    const filter = ctx.createBiquadFilter();
    // Grass is a soft rustle, rock is a bright click, water is a low splash.
    if (surface === 'water') {
      filter.type = 'lowpass';
      filter.frequency.value = lerp(500, 900, this.rand());
      filter.Q.value = 1.2;
    } else if (surface === 'rock') {
      filter.type = 'bandpass';
      filter.frequency.value = lerp(1600, 3000, this.rand());
      filter.Q.value = 1.4;
    } else {
      filter.type = 'bandpass';
      filter.frequency.value = lerp(700, 1500, this.rand());
      filter.Q.value = 0.9;
    }

    const gain = ctx.createGain();
    const peak = AUDIO.footstepGain * lerp(0.6, 1, this.rand()) * (surface === 'water' ? 1.5 : 1);
    const dur = surface === 'water' ? 0.22 : 0.09;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  /** Two quick pitched blips — reads as a distant bird without any sample. */
  birdCall() {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const base = lerp(1400, 2600, this.rand());
    const notes = this.rand() < 0.5 ? 2 : 3;

    for (let i = 0; i < notes; i++) {
      const t = now + i * lerp(0.08, 0.16, this.rand());
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f = base * lerp(0.9, 1.25, this.rand());
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * lerp(1.05, 1.4, this.rand()), t + 0.05);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(AUDIO.birdCallGain * lerp(0.5, 1, this.rand()), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  // ── bow and impacts ──────────────────────────────────────────────────────

  /**
   * Distance from a point to the water's edge, in metres.
   *
   * March from the player toward the lake centre until the ground drops below
   * the waterline. The shoreline is NOT a circle — the basin is carved into
   * real terrain, so the edge sits anywhere from about 130 m to 180 m from the
   * centre depending on which way you approach. Keying the sound off a fixed
   * fraction of `LAKE.radius`, as this used to, meant the wash played at full
   * volume while you were still 60 m inland.
   *
   * Sampled every quarter second rather than every frame; it is a handful of
   * height lookups and the answer barely changes as you walk.
   */
  distanceToWater(pos) {
    const dx = LAKE.x - pos.x;
    const dz = LAKE.z - pos.z;
    const toCentre = Math.hypot(dx, dz);
    if (toCentre < 1) return 0;
    if (heightAt(pos.x, pos.z) < WATER_LEVEL) return 0; // standing in it

    const reach = Math.min(toCentre, AUDIO.waterRange + 25);
    const step = 4;
    const ux = dx / toCentre;
    const uz = dz / toCentre;
    for (let t = step; t <= reach; t += step) {
      if (heightAt(pos.x + ux * t, pos.z + uz * t) < WATER_LEVEL) return t - step * 0.5;
    }
    return Infinity;
  }

  /** Attenuate a world sound by how far away it happened. */
  distanceGain(pos) {
    if (!pos || !this.listener) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
    return 1 / (1 + (d / 11) ** 1.6);
  }

  /**
   * The creak of a bow coming to full draw: noise through a band-pass whose
   * centre climbs as the limbs load up. Held in `this.draw` so releasing or
   * relaxing can cut it off cleanly.
   */
  bowDraw(duration) {
    if (!this.running) return;
    this.bowRelax();
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.55;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 5.5;
    filter.frequency.setValueAtTime(280, now);
    filter.frequency.linearRampToValueAtTime(760, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + duration * 0.75);

    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    this.draw = { src, gain };
  }

  bowRelax() {
    if (!this.draw) return;
    const { src, gain } = this.draw;
    this.draw = null;
    const now = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    src.stop(now + 0.16);
  }

  /** The twang: a pitched limb thump plus the hiss of the string letting go. */
  bowRelease(charge) {
    if (!this.running) return;
    this.bowRelax();
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const level = lerp(0.1, 0.34, charge);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const f = lerp(120, 210, charge);
    osc.frequency.setValueAtTime(f, now);
    osc.frequency.exponentialRampToValueAtTime(f * 0.45, now + 0.16);
    const og = ctx.createGain();
    og.gain.setValueAtTime(level, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);
    osc.connect(og).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.22);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(level * 0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    src.connect(hp).connect(ng).connect(this.master);
    src.start(now);
    src.stop(now + 0.13);
  }

  /** Arrow landing. Timbre depends on what it hit. */
  impact(surface, pos) {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const near = this.distanceGain(pos);
    if (near < 0.02) return;

    const kind =
      surface === 'water'
        ? { type: 'lowpass', freq: 700, q: 1.2, dur: 0.3, gain: 0.3, rate: 0.8 }
        : surface === 'tree'
          ? { type: 'bandpass', freq: 420, q: 3.2, dur: 0.16, gain: 0.42, rate: 1.1 }
          : surface === 'rock' || surface === 'stone'
            ? { type: 'bandpass', freq: 2100, q: 2.4, dur: 0.1, gain: 0.38, rate: 1.5 }
            : { type: 'lowpass', freq: 900, q: 1, dur: 0.13, gain: 0.34, rate: 1 };

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = kind.rate * lerp(0.9, 1.15, this.rand());

    const filter = ctx.createBiquadFilter();
    filter.type = kind.type;
    filter.frequency.value = kind.freq;
    filter.Q.value = kind.q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(kind.gain * near, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + kind.dur);

    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + kind.dur + 0.03);
  }

  /**
   * A bear. Low sawtooth stack with a slow wobble, pushed through a lowpass —
   * the wobble is what makes it read as an animal rather than an engine.
   * `intent` 0 is a warning grunt, 1 is a committed roar.
   */
  growl(pos, intent = 0) {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const near = this.distanceGain(pos);
    if (near < 0.02) return;

    const dur = lerp(0.5, 1.15, intent);
    const level = lerp(0.16, 0.42, intent) * near;
    const base = lerp(62, 88, intent);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(level, now + 0.09);
    out.gain.setValueAtTime(level, now + dur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(lerp(420, 900, intent), now);
    lp.frequency.exponentialRampToValueAtTime(260, now + dur);
    lp.Q.value = 3;
    lp.connect(out).connect(this.master);

    for (const mul of [1, 1.5, 2.51]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base * mul, now);
      osc.frequency.linearRampToValueAtTime(base * mul * lerp(0.82, 0.68, intent), now + dur);
      const g = ctx.createGain();
      g.gain.value = 1 / mul;
      osc.connect(g).connect(lp);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    }

    // Slow wobble on the pitch — the growl "grain".
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lerp(11, 19, intent);
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = lerp(60, 190, intent);
    lfo.connect(lfoAmt).connect(lp.frequency);
    lfo.start(now);
    lfo.stop(now + dur + 0.05);

    // Breath noise underneath.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.45;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, now);
    ng.gain.linearRampToValueAtTime(level * 0.5, now + 0.1);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bp).connect(ng).connect(this.master);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  /** Taking a hit: a dull thud and a short breath knocked out of you. */
  playerHurt(severity = 1) {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.24);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4 * severity, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(g).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.32);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.3 * severity, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    src.connect(lp).connect(ng).connect(this.master);
    src.start(now);
    src.stop(now + 0.24);
  }

  /** Two soft rising blips — unmistakably "you got the thing". */
  pickup() {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    [660, 990].forEach((f, i) => {
      const t = now + i * 0.07;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.16);
    });
  }

  /** Nothing to shoot: a dry, disappointing click. */
  dryFire() {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 2.1;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1700;
    filter.Q.value = 4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    src.connect(filter).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + 0.07);
  }

  /** Called every frame with the player's state. */
  update(dt, ctrl, altitude) {
    if (!this.ready) return;
    this.listener = ctrl.position;
    const now = this.ctx.currentTime;

    // Wind rises with speed and with height — exposed ridges are loud places.
    const speedTerm = clamp(ctrl.horizontalSpeed / PLAYER.sprintSpeed, 0, 1);
    const altTerm = smoothstep(20, 95, altitude);
    const wind =
      AUDIO.windBase + AUDIO.windSpeedGain * speedTerm + AUDIO.windAltitudeGain * altTerm;
    this.windGain.gain.setTargetAtTime(wind, now, 0.35);

    // Lake wash, keyed off the distance to the actual water's edge.
    this.waterProbe -= dt;
    if (this.waterProbe <= 0) {
      this.waterProbe = 0.25;
      this.waterDist = this.distanceToWater(ctrl.position);
    }
    const water = AUDIO.waterGain * (1 - smoothstep(0, AUDIO.waterRange, this.waterDist));
    this.waterGain.gain.setTargetAtTime(water, now, 0.5);

    if (ctrl.steppedThisFrame) {
      const surface =
        ctrl.wadeDepth > 0.15 ? 'water' : altitude > 70 || ctrl.horizontalSpeed > 7.5 ? 'rock' : 'grass';
      this.footstep(surface);
    }

    this.callCooldown -= dt;
    if (this.callCooldown <= 0 && this.rand() < AUDIO.birdCallChance) {
      this.birdCall();
      this.callCooldown = lerp(1.5, 6, this.rand());
    }
  }
}
