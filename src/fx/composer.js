// ── composer.js ─────────────────────────────────────────────────────────────
// Post-processing chain. Order matters:
//
//   render -> bloom -> output(ACES tonemap + sRGB) -> SMAA -> grain/vignette
//
// Bloom must run *before* tone mapping, on the raw HDR values, or you are
// blooming already-compressed colour and the sun's glow looks like a grey smear
// instead of light spilling. The grain and vignette come last, after the image
// is in display space, because that is where those artefacts belong.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { POST, Q } from '../config.js';

/** Vignette + animated film grain, in display space. */
const GrainVignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: POST.vignette },
    uGrain: { value: POST.grain },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);

      // Vignette, measured from the centre so it stays circular at any aspect.
      float d = length(vUv - 0.5) * 1.414213;
      c.rgb *= 1.0 - uVignette * pow(d, 2.4);

      // Cheap hash grain. Animated, or it reads as dirt on the lens.
      float n = fract(sin(dot(vUv * vec2(1024.0, 731.0) + uTime * 37.0,
                             vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * uGrain;

      gl_FragColor = c;
    }`,
};

export class Composer {
  constructor(renderer, scene, camera) {
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      POST.bloomStrength,
      POST.bloomRadius,
      POST.bloomThreshold
    );
    this.bloom.enabled = Q.bloom;
    this.composer.addPass(this.bloom);

    // Applies the renderer's ACES tone mapping and the sRGB conversion.
    this.composer.addPass(new OutputPass());

    this.smaa = new SMAAPass(size.x, size.y);
    this.smaa.enabled = Q.smaa;
    this.composer.addPass(this.smaa);

    this.grain = new ShaderPass(GrainVignetteShader);
    this.composer.addPass(this.grain);
  }

  /**
   * `w`/`h` are CSS pixels; `pixelRatio` is the backing-store scale.
   *
   * EffectComposer caches the pixel ratio it was CONSTRUCTED with and multiplies
   * every pass's target by it, so a DPR change has to be handed over explicitly
   * or the render targets stay at the old scale while the canvas moves on.
   *
   * The bloom pass is deliberately not sized here any more: `composer.setSize`
   * already calls `setSize` on every pass it owns, with the ratio-multiplied
   * size. Passing it the CSS size afterwards re-shrank bloom's targets by the
   * pixel ratio — invisible at DPR 1, half-resolution glow on a scaled display.
   */
  setSize(w, h, pixelRatio) {
    if (pixelRatio !== undefined) this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(w, h);
  }

  render(dt, time) {
    this.grain.uniforms.uTime.value = time;
    this.composer.render(dt);
  }

  /** Individually toggleable, as promised. */
  toggle(name) {
    const pass = { bloom: this.bloom, smaa: this.smaa, grain: this.grain }[name];
    if (pass) pass.enabled = !pass.enabled;
    return pass?.enabled;
  }
}
