import { SKY_RENDER_ORDER, SkyMaterial } from "@takram/three-atmosphere";
import * as THREE from "three";

import type {
  AtmosphericSkyFrame,
  AtmosphericSkyTextures,
} from "./atmospheric-sunlight";

export const ATMOSPHERIC_SKY_NAME = "shadow-simulation-atmospheric-sky";

export type AtmosphericSky = Readonly<{
  mesh: THREE.Mesh<THREE.PlaneGeometry, SkyMaterial>;
  update: (
    frame: AtmosphericSkyFrame,
    textures: AtmosphericSkyTextures | null
  ) => void;
  updateGroundAlbedo: (color: THREE.Color) => void;
  dispose: () => void;
}>;

export const buildAtmosphericSky = (
  groundAlbedo: THREE.Color
): AtmosphericSky => {
  const material = new SkyMaterial({
    groundAlbedo,
    moon: false,
    photometric: false,
    sun: true,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = ATMOSPHERIC_SKY_NAME;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = SKY_RENDER_ORDER;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return {
    mesh,
    update(frame, textures) {
      mesh.visible = textures !== null;
      if (!textures) return;
      material.irradianceTexture = textures.irradianceTexture;
      material.scatteringTexture = textures.scatteringTexture;
      material.transmittanceTexture = textures.transmittanceTexture;
      material.sunDirection.copy(frame.directionToSunECEF);
      material.ellipsoidCenter.copy(frame.observerECEF).negate();
      material.ellipsoidMatrix.copy(frame.ecefToSceneMatrix);
    },
    updateGroundAlbedo(color) {
      material.groundAlbedo.copy(color);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
};
