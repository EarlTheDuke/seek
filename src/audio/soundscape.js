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
    this.listenerYaw = 0;
  }

  /** Build the graph. Must be called from a user gesture. */
  start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return; // no audio available; the world still works
    this.ctx = new Ctx();
    const ctx = this.ctx;

    // ── output chain: everything -> master -> limiter -> speakers ──
    // The limiter exists because a bear roaring while you loose an arrow into
    // a rock used to clip. It only engages on peaks.
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -9;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.25;
    this.limiter.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = AUDIO.master;
    this.master.connect(this.limiter);

    // ── reverb send ──
    // A generated impulse — noise under an exponential decay — rather than an
    // audio file. Gives the valley some air; without it every sound is glued
    // to the inside of your head.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.1, 3.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = AUDIO.reverb;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

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

    // ── rain: a broadband hiss over a low roar ──
    // Two layers because rain is not one sound. The hiss is drops landing near
    // you; the roar is the whole valley of them, and without it heavy rain
    // sounds like frying rather than weather.
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.master);
    this.rainGain.connect(this.reverbSend);

    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    hiss.playbackRate.value = 1.6;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 1100;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.75;
    hiss.connect(hissFilter).connect(hissGain).connect(this.rainGain);
    hiss.start();

    const roar = ctx.createBufferSource();
    roar.buffer = this.noise;
    roar.loop = true;
    roar.playbackRate.value = 0.5;
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'lowpass';
    roarFilter.frequency.value = 620;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.55;
    roar.connect(roarFilter).connect(roarGain).connect(this.rainGain);
    roar.start();

    this.ready = true;
  }

  /** Rain level, 0..1, from the weather system. */
  setWeather(weather) {
    this.rainLevel = weather.rain;
    this.windGust = weather.wind;
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

  /** Noise under an exponential decay — a serviceable outdoor impulse. */
  makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const n = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        d[i] = (this.rand() * 2 - 1) * (1 - i / n) ** decay;
      }
    }
    return buf;
  }

  /** Attenuate a world sound by how far away it happened. */
  distanceGain(pos) {
    if (!pos || !this.listener) return 1;
    const d = Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
    return 1 / (1 + (d / 11) ** 1.6);
  }

  /**
   * Where a sound sits in the stereo field, -1 to +1.
   *
   * This is the single most useful thing missing from the mix: with everything
   * centred you cannot tell whether the bear is in front of you or behind, and
   * that is precisely the information you need.
   */
  panFor(pos) {
    if (!pos || !this.listener) return 0;
    const dx = pos.x - this.listener.x;
    const dz = pos.z - this.listener.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.001) return 0;
    // Listener right vector for a yaw whose forward is (-sin, -cos).
    const rx = Math.cos(this.listenerYaw);
    const rz = -Math.sin(this.listenerYaw);
    return clamp(((dx / d) * rx + (dz / d) * rz) * 0.9, -1, 1);
  }

  /**
   * Build the chain a positioned sound should play through:
   * caller -> lowpass -> panner -> gain -> master (+ reverb send).
   *
   * The lowpass is distance-driven. Air absorbs high frequencies, so a far-off
   * sound should go dull as well as quiet — dropping the level alone makes
   * things sound small rather than distant.
   */
  spatial(pos, level = 1) {
    const ctx = this.ctx;
    const d = this.listener
      ? Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z)
      : 0;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lerp(17000, 600, smoothstep(6, 110, d));

    const pan = ctx.createStereoPanner();
    pan.pan.value = this.panFor(pos);

    const gain = ctx.createGain();
    gain.gain.value = level * this.distanceGain(pos);

    lp.connect(pan).connect(gain);
    gain.connect(this.master);
    // Distant things are wetter — that is most of what "outdoors" sounds like.
    const send = ctx.createGain();
    send.gain.value = smoothstep(4, 90, d) * 0.9;
    gain.connect(send).connect(this.reverbSend);

    return lp;
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
    gain.gain.linearRampToValueAtTime(kind.gain, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + kind.dur);

    src.connect(filter).connect(gain).connect(this.spatial(pos));
    src.start(now);
    src.stop(now + kind.dur + 0.03);
  }

  /**
   * A deer's alarm: the sharp nasal blow it makes before it goes. Short,
   * cutting, and the sound that tells you the stalk is over.
   */
  creatureAlarm(pos) {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const out = this.spatial(pos, 1);

    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.19;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = lerp(1.5, 2.1, this.rand());
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(lerp(900, 1300, this.rand()), t);
      bp.frequency.exponentialRampToValueAtTime(430, t + 0.13);
      bp.Q.value = 2.4;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.34 * (i ? 0.65 : 1), t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(bp).connect(g).connect(out);
      src.start(t);
      src.stop(t + 0.19);
    }
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
    const level = lerp(0.2, 0.5, intent);
    const base = lerp(62, 88, intent);
    const spatial = this.spatial(pos, 1);

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
    lp.connect(out).connect(spatial);

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
    src.connect(bp).connect(ng).connect(spatial);
    src.start(now);
    src.stop(now + dur + 0.05);
  }

  /**
   * A goblin. Deliberately NOT a small bear — a bear's growl is a warning and
   * this is a conversation. Short, dry, clipped barks with a formant rasp, at a
   * pitch that carries; several of them overlapping from different bearings is
   * the sound of being surrounded, and that is the whole point of the species.
   *
   * `mood` 0 is the chatter of a pack that has not decided, 1 is the shriek of
   * one committing. It also drives the pitch DOWN and the count UP, so a
   * confident pack sounds bigger than a wavering one without anything having to
   * count them.
   */
  goblinCall(pos, mood = 0.5) {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.distanceGain(pos) < 0.02) return;

    const out = this.spatial(pos, 1);
    const barks = 1 + Math.round(mood * 2);
    const level = lerp(0.16, 0.34, mood);

    for (let i = 0; i < barks; i++) {
      const t = now + i * lerp(0.15, 0.09, mood) * (0.8 + this.rand() * 0.5);
      const dur = lerp(0.13, 0.09, mood);
      const base = lerp(340, 250, mood) * (0.85 + this.rand() * 0.35);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level * (i ? 0.7 : 1), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      // A bandpass sweeping downward is what turns a buzz into a throat.
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(base * 4.2, t);
      bp.frequency.exponentialRampToValueAtTime(base * 1.6, t + dur);
      bp.Q.value = 4.5;
      bp.connect(g).connect(out);

      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.72, t + dur);
      osc.connect(bp);
      osc.start(t);
      osc.stop(t + dur + 0.02);

      // Noise burst on the attack — the consonant at the front of the bark.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = 2.6;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(level * 0.8, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      src.connect(ng).connect(out);
      src.start(t);
      src.stop(t + 0.06);
    }
  }

  /**
   * A troll. The lowest thing in the game by a long way: a slow sine stack
   * under 55 Hz that you feel more than hear, with a long rise and a longer
   * fall.
   *
   * It is deliberately almost sub-audible and very slow, because a troll's
   * whole encounter is knowing something is out there before you can locate it.
   * A sound you cannot quite place is worth more here than a good roar.
   */
  trollVoice(pos, intent = 0) {
    if (!this.running) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.distanceGain(pos) < 0.015) return;

    const spatial = this.spatial(pos, 1);
    const dur = lerp(2.6, 1.7, intent);
    const level = lerp(0.3, 0.55, intent);
    const base = lerp(38, 52, intent);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(level, now + dur * 0.35);
    out.gain.setValueAtTime(level, now + dur * 0.55);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(lerp(190, 340, intent), now);
    lp.frequency.exponentialRampToValueAtTime(110, now + dur);
    lp.Q.value = 1.4;
    lp.connect(out).connect(spatial);

    for (const mul of [1, 2, 3.02, 4.97]) {
      const osc = ctx.createOscillator();
      osc.type = mul === 1 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(base * mul, now);
      osc.frequency.linearRampToValueAtTime(base * mul * 0.88, now + dur);
      const g = ctx.createGain();
      g.gain.value = 0.7 / mul;
      osc.connect(g).connect(lp);
      osc.start(now);
      osc.stop(now + dur + 0.06);
    }

    // A very slow wobble. Faster than this and it reads as a machine.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lerp(2.6, 5.2, intent);
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 34;
    lfo.connect(lfoAmt).connect(lp.frequency);
    lfo.start(now);
    lfo.stop(now + dur + 0.06);
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
    this.listenerYaw = ctrl.yaw; // drives stereo placement
    const now = this.ctx.currentTime;

    // Wind rises with speed and with height — exposed ridges are loud places.
    const speedTerm = clamp(ctrl.horizontalSpeed / PLAYER.sprintSpeed, 0, 1);
    const altTerm = smoothstep(20, 95, altitude);
    const wind =
      (AUDIO.windBase + AUDIO.windSpeedGain * speedTerm + AUDIO.windAltitudeGain * altTerm) *
      (this.windGust ?? 1);
    this.windGain.gain.setTargetAtTime(wind, now, 0.35);

    // Rain. Slow ramp so a front arrives rather than switches on.
    this.rainGain.gain.setTargetAtTime(AUDIO.rainGain * (this.rainLevel ?? 0), now, 1.4);

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
