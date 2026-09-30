import { getWgs84PrincipalCurvatureRadii } from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
import type { Gcg2016ShaderField } from "./reference-gcg2016-field";
import { sampleGcg2016Field } from "./reference-gcg2016-field";
import { type ReferenceFrame } from "./reference-surface-frame";

/** Colour datum is independent of geometry: bending must not change H or h. */
export const ELEVATION_COLOR_DATUM = {
  SCENE: "scene-plane",
  ELLIPSOIDAL: "ellipsoidal",
  DHHN2016: "dhhn2016",
  UNDULATION: "h-minus-H",
  RELATIVE_DHHN2016: "H-relative-to-anchor",
  RELATIVE_ELLIPSOIDAL: "h-relative-to-anchor",
  DATUM_DIFFERENCE: "datum-difference-from-anchor",
  MOUNT_DROP: "naive-mount-drop",
} as const;
export type ElevationColorDatum =
  (typeof ELEVATION_COLOR_DATUM)[keyof typeof ELEVATION_COLOR_DATUM];
export const elevationColorDatumNumber = (datum: ElevationColorDatum) =>
  datum === ELEVATION_COLOR_DATUM.SCENE
    ? 0
    : datum === ELEVATION_COLOR_DATUM.ELLIPSOIDAL
    ? 1
    : datum === ELEVATION_COLOR_DATUM.DHHN2016
    ? 2
    : datum === ELEVATION_COLOR_DATUM.UNDULATION
    ? 3
    : datum === ELEVATION_COLOR_DATUM.RELATIVE_DHHN2016
    ? 4
    : datum === ELEVATION_COLOR_DATUM.RELATIVE_ELLIPSOIDAL
    ? 5
    : datum === ELEVATION_COLOR_DATUM.DATUM_DIFFERENCE
    ? 6
    : 7;

export const VIRIDIS_GLSL = /* glsl */ `
vec3 carmaViridis(float value) {
  float x = clamp(value, 0.0, 1.0);
  vec3 c0 = vec3(0.2777273272, 0.0054073445, 0.3340998053);
  vec3 c1 = vec3(0.1050930431, 1.4046135299, 1.3845901626);
  vec3 c2 = vec3(-0.3308618287, 0.2148475595, 0.0950951630);
  vec3 c3 = vec3(-4.6342304989, -5.7991009734, -19.3324409563);
  vec3 c4 = vec3(6.2282699363, 14.1799333668, 56.6905526007);
  vec3 c5 = vec3(4.7763849977, -13.7451453777, -65.3530326334);
  vec3 c6 = vec3(-5.4354558559, 4.6458526122, 26.3124352496);
  return clamp(c0 + x * (c1 + x * (c2 + x * (c3 + x * (c4 + x * (c5 + x * c6))))), 0.0, 1.0);
}
`;

// The polynomial coefficients describe display-referred sRGB values. Patched
// Three standard materials still run <colorspace_fragment> after our output,
// so convert the ramp to linear light first and let Three encode it once.
export const VIRIDIS_LINEAR_GLSL = /* glsl */ `
${VIRIDIS_GLSL}
vec3 carmaSrgbToLinear(vec3 color) {
  vec3 low = color / 12.92;
  vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
  return mix(low, high, step(vec3(0.04045), color));
}
vec3 carmaViridisLinear(float value) {
  return carmaSrgbToLinear(carmaViridis(value));
}
uniform bool uCarmaElevationIsolines;
uniform float uCarmaColorDatum;
varying vec3 vCarmaReferencePosition;
float carmaContour(float height, float spacing, float widthPixels) {
  float scaled = height / spacing;
  float footprint = max(fwidth(scaled), 0.000001);
  float distanceToLine = abs(fract(scaled + 0.5) - 0.5);
  float line = 1.0 - smoothstep(max(0.0, widthPixels - 0.5) * footprint,
    (widthPixels + 0.5) * footprint, distanceToLine);
  // Fade unresolved intervals independently; major lines remain at distance.
  return line * (1.0 - smoothstep(0.25, 0.75, footprint));
}
vec3 carmaElevationColor(float height, float minimum, float maximum) {
  if (!uCarmaElevationIsolines) {
    return carmaViridisLinear((height - minimum) / max(0.0001, maximum - minimum));
  }
  // A reflected ramp closes continuously every 100 m, including below zero.
  float cycle = 1.0 - abs(2.0 * fract(height / 100.0) - 1.0);
  // Residuals need a metre-scale legend, not a nearly constant 100 m cycle.
  bool differenceMetric = uCarmaColorDatum > 5.5 || (uCarmaColorDatum > 2.5 && uCarmaColorDatum < 3.5);
  vec3 color = carmaViridisLinear(differenceMetric
    ? clamp((height - minimum) / max(0.0001, maximum - minimum), 0.0, 1.0)
    : cycle);
  if (differenceMetric) {
    // Residuals deliberately remove relief. A restrained normal cue keeps the
    // actual mesh/terrain recognizable without adding its height to the metric.
    vec3 normal = normalize(cross(dFdx(vCarmaReferencePosition), dFdy(vCarmaReferencePosition)));
    color *= 0.55 + 0.45 * abs(dot(normal, normalize(vec3(0.3, 0.9, 0.2))));
  }
  float line = differenceMetric
    ? max(0.55 * carmaContour(height, 0.1, 0.45), carmaContour(height, 1.0, 1.1))
    : carmaContour(height, 1.0, 1.0);
  return mix(color, vec3(0.0), line);
}
`;

export const elevationReferenceUniforms = (
  frame: ReferenceFrame,
  field: Gcg2016ShaderField
) => {
  const radii = getWgs84PrincipalCurvatureRadii(
    degToRadNumeric(frame.originLngLat[1])
  );
  return {
    uCarmaAnchorNormalHeight: { value: frame.anchorNormalHeightMeters },
    uCarmaAnchorUndulation: {
      value: sampleGcg2016Field(field, frame, ...frame.originLngLat),
    },
    uCarmaGcgSize: { value: field.size },
    uCarmaPrimeVerticalRadius: { value: radii.primeVerticalMeters },
    uCarmaMeridionalRadius: { value: radii.meridionalMeters },
  };
};

export const elevationReferenceGlsl = /* glsl */ `
uniform float uCarmaAnchorNormalHeight;
uniform float uCarmaAnchorUndulation;
uniform float uCarmaGcgSize;
// Quadratic local ellipsoid sag; no subtraction of megametre float coordinates.
float carmaMountDrop(vec2 eastSouth) {
  return -eastSouth.x * eastSouth.x / (2.0 * uCarmaPrimeVerticalRadius)
    - eastSouth.y * eastSouth.y / (2.0 * uCarmaMeridionalRadius);
}
float carmaReferenceElevation(float normalHeight, float ellipsoidHeight, float localUp, float undulation, float drop) {
  if (uCarmaColorDatum > 6.5) return drop;
  if (uCarmaColorDatum > 5.5) return undulation - uCarmaAnchorUndulation;
  if (uCarmaColorDatum > 4.5) return ellipsoidHeight - uCarmaAnchorNormalHeight - uCarmaAnchorUndulation;
  if (uCarmaColorDatum > 3.5) return normalHeight - uCarmaAnchorNormalHeight;
  if (uCarmaColorDatum > 2.5) return undulation;
  if (uCarmaColorDatum > 1.5) return normalHeight;
  if (uCarmaColorDatum > 0.5) return ellipsoidHeight;
  return localUp;
}
`;
