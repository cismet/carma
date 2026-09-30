import * as THREE from "three";

export const REFERENCE_ATMOSPHERE_MODE = {
  OFF: "off",
  AERIAL_PERSPECTIVE: "aerial-perspective",
  OPTICAL_DEPTH: "optical-depth",
} as const;

export type ReferenceAtmosphereMode =
  (typeof REFERENCE_ATMOSPHERE_MODE)[keyof typeof REFERENCE_ATMOSPHERE_MODE];

export type ReferenceAtmosphereOptions = Readonly<{
  mode: ReferenceAtmosphereMode;
  visibilityMeters: number;
  scaleHeightMeters: number;
  observerEllipsoidalHeightMeters: number;
  color: THREE.ColorRepresentation;
}>;

export type AtmosphereShaderBinding = Readonly<{
  atmosphereMode: { value: number };
  atmosphereVisibility: { value: number };
  atmosphereScaleHeight: { value: number };
  atmosphereObserverHeight: { value: number };
  atmosphereColor: { value: THREE.Color };
}>;

const atmosphereModeNumber = (mode: ReferenceAtmosphereMode) =>
  mode === REFERENCE_ATMOSPHERE_MODE.AERIAL_PERSPECTIVE
    ? 1
    : mode === REFERENCE_ATMOSPHERE_MODE.OPTICAL_DEPTH
    ? 2
    : 0;

export const atmosphereVertexVarying = /* glsl */ `
varying float vCarmaViewDistance;`;

export const atmosphereVertexDistance = /* glsl */ `
#include <project_vertex>
vCarmaViewDistance = length(mvPosition.xyz);`;

export const atmosphereFragmentCommon = /* glsl */ `
uniform float uCarmaAtmosphereMode;
uniform float uCarmaAtmosphereVisibility;
uniform float uCarmaAtmosphereScaleHeight;
uniform float uCarmaAtmosphereObserverHeight;
uniform vec3 uCarmaAtmosphereColor;
varying float vCarmaViewDistance;`;

export const atmosphereFragmentOutput = (
  ellipsoidalHeightVarying: string,
  unlitElevationColor: string
) => /* glsl */ `
#include <opaque_fragment>
// Elevation is a quantitative display variable. Write it after the Lambert
// lighting pass so identical heights retain identical, saturated viridis
// colours regardless of surface orientation.
gl_FragColor.rgb = ${unlitElevationColor};
if (uCarmaAtmosphereMode > 0.5) {
  // Analytic single-segment optical-depth approximation. Both endpoint
  // heights are referenced to the WGS84 ellipsoid, so the density field bends
  // with the same planetary surface as the corrected scene.
  float carmaMeanEllipsoidalHeight = max(
    0.0,
    0.5 * (uCarmaAtmosphereObserverHeight + ${ellipsoidalHeightVarying})
  );
  float carmaDensity = exp(
    -carmaMeanEllipsoidalHeight / max(1.0, uCarmaAtmosphereScaleHeight)
  );
  float carmaOpticalDepth =
    vCarmaViewDistance * carmaDensity /
    max(1.0, uCarmaAtmosphereVisibility);
  float carmaTransmittance = exp(-carmaOpticalDepth);
  if (uCarmaAtmosphereMode > 1.5) {
    gl_FragColor.rgb = carmaViridisLinear(clamp(carmaOpticalDepth / 2.5, 0.0, 1.0));
  } else {
    gl_FragColor.rgb = mix(
      uCarmaAtmosphereColor,
      gl_FragColor.rgb,
      carmaTransmittance
    );
  }
}`;

export const createAtmosphereShaderBindings = (
  atmosphere: ReferenceAtmosphereOptions
) => ({
  atmosphereMode: { value: atmosphereModeNumber(atmosphere.mode) },
  atmosphereVisibility: { value: atmosphere.visibilityMeters },
  atmosphereScaleHeight: { value: atmosphere.scaleHeightMeters },
  atmosphereObserverHeight: {
    value: atmosphere.observerEllipsoidalHeightMeters,
  },
  atmosphereColor: { value: new THREE.Color(atmosphere.color) },
});

export const updateAtmosphereShaderBindings = (
  binding: AtmosphereShaderBinding,
  atmosphere: ReferenceAtmosphereOptions
) => {
  binding.atmosphereMode.value = atmosphereModeNumber(atmosphere.mode);
  binding.atmosphereVisibility.value = atmosphere.visibilityMeters;
  binding.atmosphereScaleHeight.value = atmosphere.scaleHeightMeters;
  binding.atmosphereObserverHeight.value =
    atmosphere.observerEllipsoidalHeightMeters;
  binding.atmosphereColor.value.set(atmosphere.color);
};

export const atmosphereShaderUniforms = (binding: AtmosphereShaderBinding) => ({
  uCarmaAtmosphereMode: binding.atmosphereMode,
  uCarmaAtmosphereVisibility: binding.atmosphereVisibility,
  uCarmaAtmosphereScaleHeight: binding.atmosphereScaleHeight,
  uCarmaAtmosphereObserverHeight: binding.atmosphereObserverHeight,
  uCarmaAtmosphereColor: binding.atmosphereColor,
});
