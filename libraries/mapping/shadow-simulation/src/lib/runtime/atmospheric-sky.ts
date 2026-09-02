import { SKY_RENDER_ORDER, SkyMaterial } from "@takram/three-atmosphere";
import * as THREE from "three";

import type {
  AtmosphericSkyFrame,
  AtmosphericSkyTextures,
} from "./atmospheric-sunlight";
import { getAtmosphericSkyFrameValidationError } from "./atmospheric-sunlight";

export const ATMOSPHERIC_SKY_NAME = "shadow-simulation-atmospheric-sky";
export const ATMOSPHERIC_DISPLAY_EXPOSURE = 2;

const OUTPUT_ENCODING_UNIFORM = "carmaOutputToSrgb";
const DISPLAY_EXPOSURE_UNIFORM = "carmaDisplayExposure";

const addDisplayTransform = (material: SkyMaterial) => {
  material.uniforms[OUTPUT_ENCODING_UNIFORM] = new THREE.Uniform(false);
  material.uniforms[DISPLAY_EXPOSURE_UNIFORM] = new THREE.Uniform(
    ATMOSPHERIC_DISPLAY_EXPOSURE
  );
  material.fragmentShader = material.fragmentShader
    .replace(
      "precision highp sampler3D;",
      `precision highp sampler3D;

uniform bool ${OUTPUT_ENCODING_UNIFORM};
uniform float ${DISPLAY_EXPOSURE_UNIFORM};

vec4 carmaLinearToSrgb(vec4 value) {
  return vec4(
    mix(
      pow(value.rgb, vec3(0.41666)) * 1.055 - vec3(0.055),
      value.rgb * 12.92,
      vec3(lessThanEqual(value.rgb, vec3(0.0031308)))
    ),
    value.a
  );
}`
    )
    .replace(
      "outputColor.a = 1.0;",
      `outputColor.rgb *= ${DISPLAY_EXPOSURE_UNIFORM};
  outputColor.a = 1.0;
  if (${OUTPUT_ENCODING_UNIFORM}) {
    outputColor = carmaLinearToSrgb(outputColor);
  }`
    );
};

export type AtmosphericSky = Readonly<{
  mesh: THREE.Mesh<THREE.BufferGeometry, SkyMaterial>;
  update: (
    frame: AtmosphericSkyFrame,
    textures: AtmosphericSkyTextures | null
  ) => boolean;
  updateGroundAlbedo: (color: THREE.Color) => void;
  dispose: () => void;
}>;

export const buildAtmosphericSky = (
  groundAlbedo: THREE.Color
): AtmosphericSky => {
  const material = new SkyMaterial({
    groundAlbedo,
    moon: false,
    photometric: true,
    side: THREE.DoubleSide,
    sun: true,
  });
  addDisplayTransform(material);
  material.depthTest = false;
  material.depthWrite = false;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = ATMOSPHERIC_SKY_NAME;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = -SKY_RENDER_ORDER;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.onBeforeRender = (renderer) => {
    material.uniforms[OUTPUT_ENCODING_UNIFORM].value =
      renderer.getRenderTarget() === null;
  };

  return {
    mesh,
    update(frame, textures) {
      if (!textures) {
        mesh.visible = false;
        return false;
      }
      if (getAtmosphericSkyFrameValidationError(frame)) return false;
      mesh.visible = true;
      material.irradianceTexture = textures.irradianceTexture;
      material.scatteringTexture = textures.scatteringTexture;
      material.transmittanceTexture = textures.transmittanceTexture;
      material.sunDirection.copy(frame.directionToSunECEF);
      material.ellipsoidCenter.copy(frame.ellipsoidCenterECEF);
      material.ellipsoidMatrix.copy(frame.ecefToSceneMatrix);
      return true;
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
