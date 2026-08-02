// ── soundscape.js ───────────────────────────────────────────────────────────
// Wind, water, footsteps and bird calls — all synthesized from noise buffers and
// oscillators. There are no audio files in this project.
//
// The whole graph is built once on the first click (browsers require a gesture
// before audio can start) and then only has its gains nudged, so it costs
// essentially nothing per frame.

import { AUDIO, LAKE, PLAYER } from '../config.js';
import { makeRandom } from '../world/noise.js';
import { clamp, lerp, smoothstep } from '../util/math.js';

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.rand = makeRandom('audio');
    this.callCooldown = 0;
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

  /** Called every frame with the player's state. */
  update(dt, ctrl, altitude) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;

    // Wind rises with speed and with height — exposed ridges are loud places.
    const speedTerm = clamp(ctrl.horizontalSpeed / PLAYER.sprintSpeed, 0, 1);
    const altTerm = smoothstep(20, 95, altitude);
    const wind =
      AUDIO.windBase + AUDIO.windSpeedGain * speedTerm + AUDIO.windAltitudeGain * altTerm;
    this.windGain.gain.setTargetAtTime(wind, now, 0.35);

    // Lake wash fades in as you approach the shore.
    const d = Math.hypot(ctrl.position.x - LAKE.x, ctrl.position.z - LAKE.z);
    const edge = Math.max(0, d - LAKE.radius * 0.85);
    const water = AUDIO.waterGain * (1 - smoothstep(0, AUDIO.waterRange, edge));
    this.waterGain.gain.setTargetAtTime(water, now, 0.4);

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
