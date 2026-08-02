// ── water.js ────────────────────────────────────────────────────────────────
// The lake. Three's Water object gives real planar reflection, refraction and a
// sun specular streak — and that streak raking across the surface at golden
// hour is the single best shot in this world, so the spawn view is composed
// around it.
//
// It costs an extra scene render into a 512² target each frame, which is why we
// switch it off entirely once you walk out of range.

import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { LAKE, Q, WATER_LEVEL } from '../config.js';
import { makeWaterNormals } from '../util/textures.js';

export class Lake {
  constructor(scene) {
    // A disc sized to the basin. Its rim lands on ground that is already above
    // the waterline, so the edge is buried in the terrain and never visible.
    const geometry = new THREE.CircleGeometry(LAKE.radius * LAKE.planeOversize, 96);
    this.water = new Water(geometry, {
      textureWidth: Q.waterRT,
      textureHeight: Q.waterRT,
      waterNormals: makeWaterNormals(256),
      sunDirection: new THREE.Vector3(0, 1, 0),
      sunColor: 0xffd9a8,
      waterColor: 0x16242e,
      distortionScale: 3.4,
      fog: scene.fog !== undefined,
      alpha: 1,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
    // `size` sets the ripple scale. The default of 1 gives ~100 m swells, which
    // on a lake looks like a bad ocean; 6 brings it down to a few metres.
    this.water.material.uniforms.size.value = 6;
    scene.add(this.water);

    this.center = new THREE.Vector3(LAKE.x, WATER_LEVEL, LAKE.z);
  }

  update(dt, cameraPos, sunDirection) {
    // Cull by distance — this is the most expensive object in the scene.
    const d = Math.hypot(cameraPos.x - LAKE.x, cameraPos.z - LAKE.z);
    this.water.visible = d < LAKE.visibleRange;
    if (!this.water.visible) return;

    this.water.material.uniforms.time.value += dt;
    this.water.material.uniforms.sunDirection.value.copy(sunDirection).normalize();
  }
}
