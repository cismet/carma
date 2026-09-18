import type { LngLatArray } from "@carma-geo/data-structures";
import { LANGENBERG_LANDMARKS } from "@carma-commons/resources";
import { getGcg2016Undulations } from "@carma-geo/proj";
import {
  WGS84_A,
  WGS84_B,
  cartographicToEcef,
  ecefToEnuMatrix,
  ecefToEnuOffset,
} from "@carma-geo/proj";
import type { SharedThreeSceneRuntime } from "@carma-mapping/engines/maplibre";
import maplibregl from "maplibre-gl";
import * as THREE from "three";

const GCG_TEXTURE_SIZE = 65;
const GCG_HALF_EXTENT_METERS = 60_000;
const SURFACE_SEGMENTS = 128;

export const TERRAIN_GEOMETRY_MODE = {
  MERCATOR: "mercator",
  WGS84_ECEF: "wgs84-ecef",
  LOCAL_SPHERE: "local-sphere",
} as const;

export type TerrainGeometryMode =
  (typeof TERRAIN_GEOMETRY_MODE)[keyof typeof TERRAIN_GEOMETRY_MODE];

export const TERRAIN_HEIGHT_DATUM = {
  DHHN2016: "dhhn2016",
  ELLIPSOIDAL: "ellipsoidal",
} as const;

export type TerrainHeightDatum =
  (typeof TERRAIN_HEIGHT_DATUM)[keyof typeof TERRAIN_HEIGHT_DATUM];

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

export const REFERENCE_CAMERA_PRESET = {
  MAP_TARGET: "map-target",
  TOELLETURM_TO_NORDHELLE: "toelleturm-to-nordhelle",
  NORDHELLE_TO_TOELLETURM: "nordhelle-to-toelleturm",
  TOELLETURM_TO_LANGENBERG: "toelleturm-to-langenberg",
} as const;

export type ReferenceCameraPreset =
  (typeof REFERENCE_CAMERA_PRESET)[keyof typeof REFERENCE_CAMERA_PRESET];

export type ReferencePhysicalCameraPose = Readonly<{
  label: string;
  eyeLngLat: readonly [longitude: number, latitude: number];
  targetLngLat: readonly [longitude: number, latitude: number];
  eyeNormalHeightMeters: number;
  targetNormalHeightMeters: number;
  bearingDegrees: number;
  pitchDegrees: number;
  distanceMeters: number;
}>;

/**
 * A measured, real-world line of sight used by the horizon presets.
 *
 * The Wuppertal DOM1 resolves the Toelleturm top at 358.35 m DHHN2016. The
 * clipped Nordhelle tile reaches 662.94 m in DGM1 and 686.36 m in DOM1. The
 * camera targets the latter surface pixel: its 40.38 km corridor has at least
 * 24.86 m geometric clearance over the sampled DOM1 profile. The Robert-Kolb
 * and WDR towers are beyond the published coverage polygon and are deliberately
 * not claimed as covered geometry.
 */
export const REFERENCE_PHYSICAL_CAMERA_POSES: Readonly<
  Record<
    Exclude<ReferenceCameraPreset, typeof REFERENCE_CAMERA_PRESET.MAP_TARGET>,
    ReferencePhysicalCameraPose
  >
> = {
  [REFERENCE_CAMERA_PRESET.TOELLETURM_TO_LANGENBERG]: (() => {
    const mast = LANGENBERG_LANDMARKS[0];
    const eyeLngLat = [7.20158, 51.25656] as const;
    const eyeNormalHeightMeters = 361.3477;
    const targetNormalHeightMeters =
      mast.groundNormalHeightMeters + mast.heightMeters;
    const offset = ecefToEnuOffset(
      cartographicToEcef(
        THREE.MathUtils.degToRad(mast.longitudeDegrees),
        THREE.MathUtils.degToRad(mast.latitudeDegrees),
        targetNormalHeightMeters
      ),
      cartographicToEcef(
        THREE.MathUtils.degToRad(eyeLngLat[0]),
        THREE.MathUtils.degToRad(eyeLngLat[1]),
        eyeNormalHeightMeters
      )
    );
    // Approximate heading/distance labels only; the camera recomputes its
    // physical direction with per-location GCG2016 before rendering.
    return {
      label: "Toelleturm DOM top +3 m → Langenberg Hordt mast",
      eyeLngLat,
      eyeNormalHeightMeters,
      targetLngLat: [mast.longitudeDegrees, mast.latitudeDegrees] as const,
      targetNormalHeightMeters,
      bearingDegrees:
        (THREE.MathUtils.radToDeg(Math.atan2(offset.east, offset.north)) +
          360) %
        360,
      pitchDegrees: 89.9,
      distanceMeters: Math.hypot(offset.east, offset.north),
    };
  })(),
  [REFERENCE_CAMERA_PRESET.TOELLETURM_TO_NORDHELLE]: {
    label: "Toelleturm DOM top +3 m → highest covered Nordhelle DOM",
    eyeLngLat: [7.20158, 51.25656],
    targetLngLat: [7.7545505762, 51.1478994995],
    eyeNormalHeightMeters: 361.3477,
    targetNormalHeightMeters: 686.3633,
    bearingDegrees: 107.1966,
    pitchDegrees: 87,
    distanceMeters: 40_376.6,
  },
  [REFERENCE_CAMERA_PRESET.NORDHELLE_TO_TOELLETURM]: {
    label: "Covered Nordhelle DOM +200 m → Toelleturm / Wuppertal",
    eyeLngLat: [7.7545505762, 51.1478994995],
    targetLngLat: [7.20158, 51.25656],
    eyeNormalHeightMeters: 886.3633,
    targetNormalHeightMeters: 358.3477,
    bearingDegrees: 287.6276,
    pitchDegrees: 87,
    distanceMeters: 40_376.6,
  },
};

export const REFERENCE_SURFACE = {
  TANGENT: "tangent",
  SPHERE: "sphere",
  ELLIPSOID: "ellipsoid",
  QUASIGEOID: "quasigeoid",
  TERRAIN: "terrain",
} as const;

export type ReferenceSurface =
  (typeof REFERENCE_SURFACE)[keyof typeof REFERENCE_SURFACE];

const VIRIDIS_GLSL = /* glsl */ `
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
const VIRIDIS_LINEAR_GLSL = /* glsl */ `
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

const atmosphereModeNumber = (mode: ReferenceAtmosphereMode) =>
  mode === REFERENCE_ATMOSPHERE_MODE.AERIAL_PERSPECTIVE
    ? 1
    : mode === REFERENCE_ATMOSPHERE_MODE.OPTICAL_DEPTH
    ? 2
    : 0;

const atmosphereVertexVarying = /* glsl */ `
varying float vCarmaViewDistance;`;

const atmosphereVertexDistance = /* glsl */ `
#include <project_vertex>
vCarmaViewDistance = length(mvPosition.xyz);`;

const atmosphereFragmentCommon = /* glsl */ `
uniform float uCarmaAtmosphereMode;
uniform float uCarmaAtmosphereVisibility;
uniform float uCarmaAtmosphereScaleHeight;
uniform float uCarmaAtmosphereObserverHeight;
uniform vec3 uCarmaAtmosphereColor;
varying float vCarmaViewDistance;`;

const atmosphereFragmentOutput = (
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

const createAtmosphereShaderBindings = (
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

const updateAtmosphereShaderBindings = (
  binding: TerrainShaderBinding | MeshElevationShaderBinding,
  atmosphere: ReferenceAtmosphereOptions
) => {
  binding.atmosphereMode.value = atmosphereModeNumber(atmosphere.mode);
  binding.atmosphereVisibility.value = atmosphere.visibilityMeters;
  binding.atmosphereScaleHeight.value = atmosphere.scaleHeightMeters;
  binding.atmosphereObserverHeight.value =
    atmosphere.observerEllipsoidalHeightMeters;
  binding.atmosphereColor.value.set(atmosphere.color);
};

const atmosphereShaderUniforms = (
  binding: TerrainShaderBinding | MeshElevationShaderBinding
) => ({
  uCarmaAtmosphereMode: binding.atmosphereMode,
  uCarmaAtmosphereVisibility: binding.atmosphereVisibility,
  uCarmaAtmosphereScaleHeight: binding.atmosphereScaleHeight,
  uCarmaAtmosphereObserverHeight: binding.atmosphereObserverHeight,
  uCarmaAtmosphereColor: binding.atmosphereColor,
});

export type Gcg2016ShaderField = Readonly<{
  center: readonly [longitude: number, latitude: number];
  halfExtentMeters: number;
  minimumMeters: number;
  maximumMeters: number;
  size: number;
  values: Float32Array;
  texture: THREE.DataTexture;
}>;

export type ReferenceFrame = Readonly<{
  /** Colour reference only; never changes geometry placement. */
  anchorNormalHeightMeters: number;
  originLngLat: readonly [longitude: number, latitude: number];
  originMercator: maplibregl.MercatorCoordinate;
  mercatorUnitsPerMeter: number;
  originEcef: THREE.Vector3;
  ecefToEnuRotation: THREE.Matrix3;
  sphereRadiusMeters: number;
  originSphereEcef: THREE.Vector3;
}>;

export type ReferenceSurfaceVisibility = Readonly<{
  localTangentPlane: boolean;
  localSphere: boolean;
  ellipsoid: boolean;
  quasigeoid: boolean;
}>;

type NumberUniform = { value: number };

export type TerrainShaderBinding = Readonly<{
  referenceUniforms: ReturnType<typeof elevationReferenceUniforms>;
  colorDatum: NumberUniform;
  elevationIsolines: { value: boolean };
  texture: { value: THREE.Texture };
  minimum: NumberUniform;
  maximum: NumberUniform;
  halfExtent: NumberUniform;
  fieldCenterOffset: { value: THREE.Vector2 };
  colorMinimum: NumberUniform;
  colorMaximum: NumberUniform;
  elevationColorEnabled: NumberUniform;
  geometryMode: NumberUniform;
  heightDatum: NumberUniform;
  sphereRadius: NumberUniform;
  originSphereEcef: { value: THREE.Vector3 };
  atmosphereMode: NumberUniform;
  atmosphereVisibility: NumberUniform;
  atmosphereScaleHeight: NumberUniform;
  atmosphereObserverHeight: NumberUniform;
  atmosphereColor: { value: THREE.Color };
}>;

type TerrainDepthShaderState = Readonly<{
  binding: TerrainShaderBinding;
  material: THREE.MeshDepthMaterial;
}>;

export type MeshElevationShaderBinding = Readonly<{
  colorDatum: NumberUniform;
  encodedHeightDatum: NumberUniform;
  elevationIsolines: { value: boolean };
  colorMinimum: NumberUniform;
  colorMaximum: NumberUniform;
  atmosphereMode: NumberUniform;
  atmosphereVisibility: NumberUniform;
  atmosphereScaleHeight: NumberUniform;
  atmosphereObserverHeight: NumberUniform;
  atmosphereColor: { value: THREE.Color };
}>;

export type DistanceSummary = Readonly<{
  count: number;
  minimumMeters: number;
  maximumMeters: number;
  meanMeters: number;
  rmsMeters: number;
}>;

const mutableLngLat = (value: readonly [number, number]): [number, number] => [
  value[0],
  value[1],
];

const sphericalEcef = (
  longitudeRadians: number,
  latitudeRadians: number,
  radiusMeters: number,
  target = new THREE.Vector3()
) =>
  target.set(
    radiusMeters * Math.cos(latitudeRadians) * Math.cos(longitudeRadians),
    radiusMeters * Math.cos(latitudeRadians) * Math.sin(longitudeRadians),
    radiusMeters * Math.sin(latitudeRadians)
  );

export const createReferenceFrame = (
  originLngLat: readonly [number, number],
  sphereRadiusMeters: number,
  anchorNormalHeightMeters = 0
): ReferenceFrame => {
  const longitudeRadians = THREE.MathUtils.degToRad(originLngLat[0]);
  const latitudeRadians = THREE.MathUtils.degToRad(originLngLat[1]);
  const originEcef = cartographicToEcef(longitudeRadians, latitudeRadians, 0);
  const originMercator = maplibregl.MercatorCoordinate.fromLngLat(
    mutableLngLat(originLngLat),
    0
  );
  return {
    anchorNormalHeightMeters,
    originLngLat,
    originMercator,
    mercatorUnitsPerMeter: originMercator.meterInMercatorCoordinateUnits(),
    originEcef,
    ecefToEnuRotation: new THREE.Matrix3().setFromMatrix4(
      ecefToEnuMatrix(originEcef)
    ),
    sphereRadiusMeters,
    originSphereEcef: sphericalEcef(
      longitudeRadians,
      latitudeRadians,
      sphereRadiusMeters
    ),
  };
};

export const localGroundLngLat = (
  frame: ReferenceFrame,
  eastMeters: number,
  southMeters: number
): LngLatArray.deg => {
  const lngLat = new maplibregl.MercatorCoordinate(
    frame.originMercator.x + eastMeters * frame.mercatorUnitsPerMeter,
    frame.originMercator.y + southMeters * frame.mercatorUnitsPerMeter,
    0
  ).toLngLat();
  return [lngLat.lng, lngLat.lat] as LngLatArray.deg;
};

export const projectMercatorToScene = (
  frame: ReferenceFrame,
  longitude: number,
  latitude: number,
  altitudeMeters: number,
  target = new THREE.Vector3()
) => {
  const coordinate = maplibregl.MercatorCoordinate.fromLngLat(
    [longitude, latitude],
    altitudeMeters
  );
  return target.set(
    (coordinate.x - frame.originMercator.x) / frame.mercatorUnitsPerMeter,
    (coordinate.z - frame.originMercator.z) / frame.mercatorUnitsPerMeter,
    (coordinate.y - frame.originMercator.y) / frame.mercatorUnitsPerMeter
  );
};

const enuToScene = (enu: THREE.Vector3, target: THREE.Vector3) => {
  const east = enu.x;
  const north = enu.y;
  const up = enu.z;
  return target.set(east, up, -north);
};

export const projectGeodeticToScene = (
  frame: ReferenceFrame,
  longitude: number,
  latitude: number,
  ellipsoidalHeightMeters: number,
  geometryMode: TerrainGeometryMode,
  target = new THREE.Vector3()
) => {
  if (geometryMode === TERRAIN_GEOMETRY_MODE.MERCATOR) {
    return projectMercatorToScene(
      frame,
      longitude,
      latitude,
      ellipsoidalHeightMeters,
      target
    );
  }
  const longitudeRadians = THREE.MathUtils.degToRad(longitude);
  const latitudeRadians = THREE.MathUtils.degToRad(latitude);
  const ecef =
    geometryMode === TERRAIN_GEOMETRY_MODE.WGS84_ECEF
      ? cartographicToEcef(
          longitudeRadians,
          latitudeRadians,
          ellipsoidalHeightMeters,
          target
        )
      : sphericalEcef(
          longitudeRadians,
          latitudeRadians,
          frame.sphereRadiusMeters + ellipsoidalHeightMeters,
          target
        );
  ecef
    .sub(
      geometryMode === TERRAIN_GEOMETRY_MODE.WGS84_ECEF
        ? frame.originEcef
        : frame.originSphereEcef
    )
    .applyMatrix3(frame.ecefToEnuRotation);
  return enuToScene(ecef, target);
};

const fieldCenterOffsetFromOrigin = (
  originLngLat: readonly [number, number],
  fieldCenter: readonly [number, number]
) => {
  const origin = maplibregl.MercatorCoordinate.fromLngLat(
    mutableLngLat(originLngLat),
    0
  );
  const field = maplibregl.MercatorCoordinate.fromLngLat(
    mutableLngLat(fieldCenter),
    0
  );
  const meterScale = origin.meterInMercatorCoordinateUnits();
  return new THREE.Vector2(
    (field.x - origin.x) / meterScale,
    (field.y - origin.y) / meterScale
  );
};

export const sampleGcg2016Field = (
  field: Gcg2016ShaderField,
  frame: ReferenceFrame,
  longitude: number,
  latitude: number
) => {
  const local = projectMercatorToScene(frame, longitude, latitude, 0);
  const fieldOffset = fieldCenterOffsetFromOrigin(
    frame.originLngLat,
    field.center
  );
  return sampleGcg2016FieldAtLocal(field, fieldOffset, local.x, local.z);
};

const sampleGcg2016FieldAtLocal = (
  field: Gcg2016ShaderField,
  fieldCenterOffset: THREE.Vector2,
  eastMeters: number,
  southMeters: number
) => {
  const u = THREE.MathUtils.clamp(
    (eastMeters - fieldCenterOffset.x) / (2 * field.halfExtentMeters) + 0.5,
    0,
    1
  );
  const v = THREE.MathUtils.clamp(
    (southMeters - fieldCenterOffset.y) / (2 * field.halfExtentMeters) + 0.5,
    0,
    1
  );
  const x = u * (field.size - 1);
  const y = v * (field.size - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.size - 1, x0 + 1);
  const y1 = Math.min(field.size - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (column: number, row: number) =>
    field.values[row * field.size + column] ?? 0;
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(at(x0, y0), at(x1, y0), tx),
    THREE.MathUtils.lerp(at(x0, y1), at(x1, y1), tx),
    ty
  );
};

export const createGcg2016ShaderField = async (
  center: readonly [number, number]
): Promise<Gcg2016ShaderField> => {
  const frame = createReferenceFrame(center, 6_371_000);
  const coordinates: LngLatArray.deg[] = [];
  for (let row = 0; row < GCG_TEXTURE_SIZE; row += 1) {
    const southMeters =
      ((row / (GCG_TEXTURE_SIZE - 1)) * 2 - 1) * GCG_HALF_EXTENT_METERS;
    for (let column = 0; column < GCG_TEXTURE_SIZE; column += 1) {
      const eastMeters =
        ((column / (GCG_TEXTURE_SIZE - 1)) * 2 - 1) * GCG_HALF_EXTENT_METERS;
      coordinates.push(localGroundLngLat(frame, eastMeters, southMeters));
    }
  }

  const undulations = await getGcg2016Undulations(coordinates);
  const values = Float32Array.from(undulations);
  const minimumMeters = Math.min(...undulations);
  const maximumMeters = Math.max(...undulations);
  const rangeMeters = Math.max(1e-6, maximumMeters - minimumMeters);
  const encoded = Uint16Array.from(undulations, (value) =>
    THREE.DataUtils.toHalfFloat((value - minimumMeters) / rangeMeters)
  );
  const texture = new THREE.DataTexture(
    encoded,
    GCG_TEXTURE_SIZE,
    GCG_TEXTURE_SIZE,
    THREE.RedFormat,
    THREE.HalfFloatType
  );
  texture.name = "GCG2016 bundled coefficient field";
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    center,
    halfExtentMeters: GCG_HALF_EXTENT_METERS,
    minimumMeters,
    maximumMeters,
    size: GCG_TEXTURE_SIZE,
    values,
    texture,
  };
};

const buildReferenceSurfaceGeometry = ({
  kind,
  frame,
  field,
  halfExtentMeters,
  verticalScale,
  verticalOffsetMeters,
}: {
  kind: Exclude<ReferenceSurface, "terrain">;
  frame: ReferenceFrame;
  field: Gcg2016ShaderField;
  halfExtentMeters: number;
  verticalScale: number;
  verticalOffsetMeters: number;
}) => {
  const geometry = new THREE.PlaneGeometry(
    halfExtentMeters * 2,
    halfExtentMeters * 2,
    SURFACE_SEGMENTS,
    SURFACE_SEGMENTS
  );
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const ground = new Float32Array(position.count * 2);
  const value = new Float32Array(position.count);
  const target = new THREE.Vector3();
  const fieldCenterOffset = fieldCenterOffsetFromOrigin(
    frame.originLngLat,
    field.center
  );
  for (let index = 0; index < position.count; index += 1) {
    const eastMeters = position.getX(index);
    const southMeters = position.getZ(index);
    const [longitude, latitude] = localGroundLngLat(
      frame,
      eastMeters,
      southMeters
    );
    const undulation = sampleGcg2016FieldAtLocal(
      field,
      fieldCenterOffset,
      eastMeters,
      southMeters
    );
    if (kind === REFERENCE_SURFACE.TANGENT) {
      target.set(eastMeters, 0, southMeters);
    } else {
      projectGeodeticToScene(
        frame,
        longitude,
        latitude,
        kind === REFERENCE_SURFACE.QUASIGEOID ? undulation : 0,
        kind === REFERENCE_SURFACE.SPHERE
          ? TERRAIN_GEOMETRY_MODE.LOCAL_SPHERE
          : TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
        target
      );
    }
    target.y = target.y * verticalScale + verticalOffsetMeters;
    position.setXYZ(index, target.x, target.y, target.z);
    ground[index * 2] = eastMeters;
    ground[index * 2 + 1] = southMeters;
    value[index] =
      kind === REFERENCE_SURFACE.QUASIGEOID ? undulation : target.y;
  }
  geometry.setAttribute(
    "aGroundPosition",
    new THREE.BufferAttribute(ground, 2)
  );
  geometry.setAttribute("aSurfaceValue", new THREE.BufferAttribute(value, 1));
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const createReferenceSurfaceMaterial = ({
  kind,
  opacity,
  field,
}: {
  kind: Exclude<ReferenceSurface, "terrain">;
  opacity: number;
  field: Gcg2016ShaderField;
}) => {
  const mode = {
    [REFERENCE_SURFACE.TANGENT]: 0,
    [REFERENCE_SURFACE.SPHERE]: 1,
    [REFERENCE_SURFACE.ELLIPSOID]: 2,
    [REFERENCE_SURFACE.QUASIGEOID]: 3,
  }[kind];
  return new THREE.ShaderMaterial({
    name: `${kind} reference shader`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uMode: { value: mode },
      uOpacity: { value: opacity },
      uMinimum: { value: field.minimumMeters },
      uMaximum: { value: field.maximumMeters },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aGroundPosition;
      attribute float aSurfaceValue;
      varying vec2 vGroundPosition;
      varying float vSurfaceValue;
      void main() {
        vGroundPosition = aGroundPosition;
        vSurfaceValue = aSurfaceValue;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uMode;
      uniform float uOpacity;
      uniform float uMinimum;
      uniform float uMaximum;
      varying vec2 vGroundPosition;
      varying float vSurfaceValue;
      ${VIRIDIS_GLSL}

      float gridLine(float spacingMeters) {
        vec2 grid = abs(fract(vGroundPosition / spacingMeters + 0.5) - 0.5);
        vec2 width = max(fwidth(vGroundPosition / spacingMeters), vec2(0.0001));
        vec2 line = 1.0 - smoothstep(vec2(0.0), width * 1.25, grid);
        return max(line.x, line.y);
      }

      void main() {
        vec3 color;
        float alpha = uOpacity;
        if (uMode < 0.5) {
          color = vec3(0.12, 0.82, 0.94);
          alpha *= 0.55;
        } else if (uMode < 1.5) {
          color = vec3(0.84, 0.24, 0.74);
          alpha *= 0.5;
        } else if (uMode < 2.5) {
          color = vec3(1.0, 0.52, 0.12);
          alpha *= 0.55;
        } else {
          float range = max(0.0001, uMaximum - uMinimum);
          color = carmaViridis((vSurfaceValue - uMinimum) / range);
        }
        color = mix(color, vec3(1.0), gridLine(1000.0) * 0.32);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
};

export const createReferenceSurfaceRuntime = ({
  id,
  originLngLat,
  field,
  halfExtentMeters,
  opacity,
  sphereRadiusMeters,
  verticalScale,
  verticalOffsetMeters,
  visibility,
}: {
  id: string;
  originLngLat: [number, number];
  field: Gcg2016ShaderField;
  halfExtentMeters: number;
  opacity: number;
  sphereRadiusMeters: number;
  verticalScale: number;
  verticalOffsetMeters: number;
  visibility: ReferenceSurfaceVisibility;
}): SharedThreeSceneRuntime => {
  const root = new THREE.Group();
  root.name = `${id}-root`;
  const frame = createReferenceFrame(originLngLat, sphereRadiusMeters);
  const surfaces = [
    [REFERENCE_SURFACE.TANGENT, visibility.localTangentPlane],
    [REFERENCE_SURFACE.SPHERE, visibility.localSphere],
    [REFERENCE_SURFACE.ELLIPSOID, visibility.ellipsoid],
    [REFERENCE_SURFACE.QUASIGEOID, visibility.quasigeoid],
  ] as const;
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.ShaderMaterial[] = [];
  surfaces.forEach(([kind, visible], index) => {
    const geometry = buildReferenceSurfaceGeometry({
      kind,
      frame,
      field,
      halfExtentMeters,
      verticalScale,
      verticalOffsetMeters,
    });
    const material = createReferenceSurfaceMaterial({ kind, opacity, field });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = kind;
    mesh.visible = visible;
    mesh.frustumCulled = true;
    mesh.renderOrder = index;
    root.add(mesh);
    geometries.push(geometry);
    materials.push(material);
  });

  return {
    id,
    originLngLat,
    root,
    update: () => undefined,
    hasRenderableContent: () => surfaces.some(([, visible]) => visible),
    isMainViewReady: () => true,
    getRequestDemand: () => 0,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      root.clear();
    },
  };
};

const terrainGeometryModeNumber = (mode: TerrainGeometryMode) =>
  mode === TERRAIN_GEOMETRY_MODE.MERCATOR
    ? 0
    : mode === TERRAIN_GEOMETRY_MODE.WGS84_ECEF
    ? 1
    : 2;

const terrainHeightDatumNumber = (datum: TerrainHeightDatum) =>
  datum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL ? 1 : 0;

export const referenceCurvatureRadii = (latitudeDegrees: number) => {
  const e2 = 1 - (WGS84_B / WGS84_A) ** 2;
  const factor =
    1 - e2 * Math.sin(THREE.MathUtils.degToRad(latitudeDegrees)) ** 2;
  return {
    east: WGS84_A / Math.sqrt(factor),
    north: (WGS84_A * (1 - e2)) / factor ** 1.5,
  };
};

/** Exact WGS84 reference prediction, not an observed mesh-height measurement. */
export const referenceMountDrop = (
  frame: ReferenceFrame,
  longitude: number,
  latitude: number,
  height = 0
) =>
  projectGeodeticToScene(
    frame,
    longitude,
    latitude,
    height,
    TERRAIN_GEOMETRY_MODE.WGS84_ECEF
  ).y - height;

const elevationReferenceUniforms = (
  frame: ReferenceFrame,
  field: Gcg2016ShaderField
) => {
  const radii = referenceCurvatureRadii(frame.originLngLat[1]);
  return {
    uCarmaAnchorNormalHeight: { value: frame.anchorNormalHeightMeters },
    uCarmaAnchorUndulation: {
      value: sampleGcg2016Field(field, frame, ...frame.originLngLat),
    },
    uCarmaGcgSize: { value: field.size },
    uCarmaPrimeVerticalRadius: { value: radii.east },
    uCarmaMeridionalRadius: { value: radii.north },
  };
};

const elevationReferenceGlsl = /* glsl */ `
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

const materialList = (material: THREE.Material | THREE.Material[]) =>
  Array.isArray(material) ? material : [material];

/**
 * Colour ECEF-derived MeshX geometry by WGS84 ellipsoidal height. The runtime
 * has already rigidly reoriented the tileset into the shared east/up/south
 * frame. Recovering height from that local frame avoids subtracting 6.4 Mm
 * ECEF coordinates in a float shader while retaining the ellipsoid curvature
 * term that a flat local-up colour would miss.
 */
export const patchEcefMeshElevationShader = ({
  root,
  runtimeRoot,
  frame,
  colorMinimumMeters,
  colorMaximumMeters,
  elevationIsolines = false,
  colorDatum = ELEVATION_COLOR_DATUM.ELLIPSOIDAL,
  encodedHeightDatum = TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL,
  field,
  atmosphere,
  bindings,
}: {
  root: THREE.Object3D;
  runtimeRoot: THREE.Object3D;
  frame: ReferenceFrame;
  colorMinimumMeters: number;
  colorMaximumMeters: number;
  elevationIsolines?: boolean;
  colorDatum?: ElevationColorDatum;
  encodedHeightDatum?: TerrainHeightDatum;
  field: Gcg2016ShaderField;
  atmosphere: ReferenceAtmosphereOptions;
  bindings?: Set<MeshElevationShaderBinding>;
}) => {
  const latitude = THREE.MathUtils.degToRad(frame.originLngLat[1]);
  const eccentricitySquared =
    (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
  const latitudeFactor =
    1 - eccentricitySquared * Math.sin(latitude) * Math.sin(latitude);
  const primeVerticalRadius = WGS84_A / Math.sqrt(latitudeFactor);
  const meridionalRadius =
    (WGS84_A * (1 - eccentricitySquared)) / Math.pow(latitudeFactor, 1.5);

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of materialList(object.material)) {
      if (material instanceof THREE.ShaderMaterial) continue;
      const existing = material.userData.carmaMeshElevationShader as
        | MeshElevationShaderBinding
        | undefined;
      if (existing) {
        existing.encodedHeightDatum.value =
          terrainHeightDatumNumber(encodedHeightDatum);
        existing.colorDatum.value = elevationColorDatumNumber(colorDatum);
        existing.elevationIsolines.value = elevationIsolines;
        existing.colorMinimum.value = colorMinimumMeters;
        existing.colorMaximum.value = colorMaximumMeters;
        updateAtmosphereShaderBindings(existing, atmosphere);
        bindings?.add(existing);
        continue;
      }
      const binding: MeshElevationShaderBinding = {
        encodedHeightDatum: {
          value: terrainHeightDatumNumber(encodedHeightDatum),
        },
        colorDatum: { value: elevationColorDatumNumber(colorDatum) },
        elevationIsolines: { value: elevationIsolines },
        colorMinimum: { value: colorMinimumMeters },
        colorMaximum: { value: colorMaximumMeters },
        ...createAtmosphereShaderBindings(atmosphere),
      };
      material.userData.carmaMeshElevationShader = binding;
      bindings?.add(binding);
      const releaseBinding = () => {
        bindings?.delete(binding);
        material.removeEventListener("dispose", releaseBinding);
      };
      material.addEventListener("dispose", releaseBinding);
      const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
      const previousProgramCacheKey =
        material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, renderer) => {
        previousOnBeforeCompile(shader, renderer);
        Object.assign(shader.uniforms, {
          ...elevationReferenceUniforms(frame, field),
          uCarmaColorDatum: binding.colorDatum,
          uCarmaEncodedHeightDatum: binding.encodedHeightDatum,
          uCarmaGcgTexture: { value: field.texture },
          uCarmaGcgMinimum: { value: field.minimumMeters },
          uCarmaGcgMaximum: { value: field.maximumMeters },
          uCarmaGcgHalfExtent: { value: field.halfExtentMeters },
          uCarmaFieldCenterOffset: {
            value: projectMercatorToScene(
              frame,
              field.center[0],
              field.center[1],
              0
            ),
          },
          uCarmaElevationIsolines: binding.elevationIsolines,
          uCarmaMeshColorMinimum: binding.colorMinimum,
          uCarmaMeshColorMaximum: binding.colorMaximum,
          uCarmaPrimeVerticalRadius: { value: primeVerticalRadius },
          uCarmaMeridionalRadius: { value: meridionalRadius },
          uCarmaMeshRuntimeWorldInverse: {
            // The runtime root owns the west/north→east/south half-turn.
            // Its inverse removes that too; restore it for geographic GCG UVs.
            // Squared curvature terms hid this sign error near the origin.
            value: new THREE.Matrix4()
              .makeRotationY(Math.PI)
              .multiply(runtimeRoot.matrixWorld.clone().invert()),
          },
          ...atmosphereShaderUniforms(binding),
        });
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
uniform float uCarmaPrimeVerticalRadius;
uniform float uCarmaMeridionalRadius;
uniform mat4 uCarmaMeshRuntimeWorldInverse;
uniform float uCarmaColorDatum;
uniform float uCarmaEncodedHeightDatum;
uniform sampler2D uCarmaGcgTexture;
uniform float uCarmaGcgMinimum;
uniform float uCarmaGcgMaximum;
uniform float uCarmaGcgHalfExtent;
uniform vec3 uCarmaFieldCenterOffset;
${elevationReferenceGlsl}
varying float vCarmaMeshElevation;
varying vec3 vCarmaReferencePosition;
${atmosphereVertexVarying}`
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
vec3 carmaMeshScenePosition = (uCarmaMeshRuntimeWorldInverse * modelMatrix * vec4(transformed, 1.0)).xyz;
vCarmaReferencePosition = carmaMeshScenePosition;
float carmaEllipsoidHeight = carmaMeshScenePosition.y
  + carmaMeshScenePosition.x * carmaMeshScenePosition.x / (2.0 * uCarmaPrimeVerticalRadius)
  + carmaMeshScenePosition.z * carmaMeshScenePosition.z / (2.0 * uCarmaMeridionalRadius);
vec2 carmaGcgUv = (carmaMeshScenePosition.xz - uCarmaFieldCenterOffset.xz) / (2.0 * uCarmaGcgHalfExtent) + 0.5;
vec2 carmaFieldUv = (clamp(carmaGcgUv, 0.0, 1.0) * (uCarmaGcgSize - 1.0) + 0.5) / uCarmaGcgSize;
float carmaUndulation = mix(uCarmaGcgMinimum, uCarmaGcgMaximum, texture2D(uCarmaGcgTexture, carmaFieldUv).r);
// Explicit source-height hypothesis, not an inferred dataset datum.
carmaEllipsoidHeight += (1.0 - step(0.5, uCarmaEncodedHeightDatum)) * carmaUndulation;
vCarmaMeshElevation = carmaReferenceElevation(carmaEllipsoidHeight - carmaUndulation,
  carmaEllipsoidHeight, carmaMeshScenePosition.y, carmaUndulation, carmaMountDrop(carmaMeshScenePosition.xz));`
          )
          .replace("#include <project_vertex>", atmosphereVertexDistance);
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform float uCarmaMeshColorMinimum;
uniform float uCarmaMeshColorMaximum;
varying float vCarmaMeshElevation;
${VIRIDIS_LINEAR_GLSL}
${atmosphereFragmentCommon}`
          )
          .replace(
            "#include <opaque_fragment>",
            atmosphereFragmentOutput(
              "vCarmaMeshElevation",
              `carmaElevationColor(vCarmaMeshElevation, uCarmaMeshColorMinimum, uCarmaMeshColorMaximum)`
            )
          );
      };
      material.customProgramCacheKey = () =>
        `${previousProgramCacheKey()}|carma-mesh-elevation-v9`;
      material.needsUpdate = true;
    }
  });
};

export const updateMeshElevationShader = (
  bindings: ReadonlySet<MeshElevationShaderBinding>,
  options: Readonly<{
    colorMinimumMeters: number;
    colorMaximumMeters: number;
    elevationIsolines?: boolean;
    colorDatum?: ElevationColorDatum;
    encodedHeightDatum?: TerrainHeightDatum;
    atmosphere: ReferenceAtmosphereOptions;
  }>
) => {
  for (const binding of bindings) {
    binding.encodedHeightDatum.value = terrainHeightDatumNumber(
      options.encodedHeightDatum ?? TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
    );
    binding.colorDatum.value = elevationColorDatumNumber(
      options.colorDatum ?? ELEVATION_COLOR_DATUM.ELLIPSOIDAL
    );
    binding.elevationIsolines.value = options.elevationIsolines ?? false;
    binding.colorMinimum.value = options.colorMinimumMeters;
    binding.colorMaximum.value = options.colorMaximumMeters;
    updateAtmosphereShaderBindings(binding, options.atmosphere);
  }
};

const TERRAIN_DEPTH_SHADER_STATE = "carmaReferenceTerrainDepthShader";

const createTerrainShaderBinding = ({
  frame,
  field,
  offset,
  geometryMode,
  heightDatum,
  colorMinimumMeters,
  colorMaximumMeters,
  elevationColorEnabled,
  atmosphere,
}: {
  frame: ReferenceFrame;
  field: Gcg2016ShaderField;
  offset: THREE.Vector2;
  geometryMode: TerrainGeometryMode;
  heightDatum: TerrainHeightDatum;
  colorMinimumMeters: number;
  colorMaximumMeters: number;
  elevationColorEnabled: boolean;
  atmosphere: ReferenceAtmosphereOptions;
}): TerrainShaderBinding => ({
  referenceUniforms: elevationReferenceUniforms(frame, field),
  colorDatum: {
    value: elevationColorDatumNumber(ELEVATION_COLOR_DATUM.ELLIPSOIDAL),
  },
  elevationIsolines: { value: false },
  texture: { value: field.texture },
  minimum: { value: field.minimumMeters },
  maximum: { value: field.maximumMeters },
  halfExtent: { value: field.halfExtentMeters },
  fieldCenterOffset: { value: offset.clone() },
  colorMinimum: { value: colorMinimumMeters },
  colorMaximum: { value: colorMaximumMeters },
  elevationColorEnabled: { value: elevationColorEnabled ? 1 : 0 },
  geometryMode: { value: terrainGeometryModeNumber(geometryMode) },
  heightDatum: { value: terrainHeightDatumNumber(heightDatum) },
  sphereRadius: { value: frame.sphereRadiusMeters },
  originSphereEcef: { value: frame.originSphereEcef.clone() },
  ...createAtmosphereShaderBindings(atmosphere),
});

const terrainVertexUniforms = (
  binding: TerrainShaderBinding,
  frame: ReferenceFrame
) => ({
  ...binding.referenceUniforms,
  uCarmaGcgTexture: binding.texture,
  uCarmaGcgMinimum: binding.minimum,
  uCarmaGcgMaximum: binding.maximum,
  uCarmaGcgHalfExtent: binding.halfExtent,
  uCarmaFieldCenterOffset: binding.fieldCenterOffset,
  uCarmaGeometryMode: binding.geometryMode,
  uCarmaHeightDatum: binding.heightDatum,
  uCarmaColorDatum: binding.colorDatum,
  uCarmaSphereRadius: binding.sphereRadius,
  uCarmaMercatorOrigin: {
    value: new THREE.Vector2(frame.originMercator.x, frame.originMercator.y),
  },
  uCarmaMercatorUnitsPerMeter: { value: frame.mercatorUnitsPerMeter },
  uCarmaOriginCosLatitude: {
    value: Math.cos(THREE.MathUtils.degToRad(frame.originLngLat[1])),
  },
  uCarmaOriginEcef: { value: frame.originEcef },
  uCarmaOriginSphereEcef: binding.originSphereEcef,
  uCarmaEcefToEnu: { value: frame.ecefToEnuRotation },
});

const terrainVertexCommon = (includeElevationVarying: boolean) => /* glsl */ `
#include <common>
uniform sampler2D uCarmaGcgTexture;
uniform float uCarmaGcgMinimum;
uniform float uCarmaGcgMaximum;
uniform float uCarmaGcgHalfExtent;
uniform vec2 uCarmaFieldCenterOffset;
uniform float uCarmaGeometryMode;
uniform float uCarmaHeightDatum;
uniform float uCarmaColorDatum;
uniform float uCarmaSphereRadius;
uniform vec2 uCarmaMercatorOrigin;
uniform float uCarmaMercatorUnitsPerMeter;
uniform float uCarmaOriginCosLatitude;
uniform vec3 uCarmaOriginEcef;
uniform vec3 uCarmaOriginSphereEcef;
uniform mat3 uCarmaEcefToEnu;
uniform float uCarmaPrimeVerticalRadius;
uniform float uCarmaMeridionalRadius;
${elevationReferenceGlsl}
${
  includeElevationVarying
    ? `varying float vCarmaTerrainElevation;
varying vec3 vCarmaReferencePosition;
${atmosphereVertexVarying}`
    : ""
}

const float CARMA_PI = 3.141592653589793;
const float CARMA_TWO_PI = 6.283185307179586;
const float CARMA_WGS84_A = ${WGS84_A.toFixed(1)};
const float CARMA_WGS84_E2 = ${(
  (WGS84_A * WGS84_A - WGS84_B * WGS84_B) /
  (WGS84_A * WGS84_A)
).toFixed(15)};

vec3 carmaGeodeticToEcef(float longitude, float latitude, float height) {
  float sinLatitude = sin(latitude);
  float cosLatitude = cos(latitude);
  float radius = CARMA_WGS84_A / sqrt(1.0 - CARMA_WGS84_E2 * sinLatitude * sinLatitude);
  return vec3(
    (radius + height) * cosLatitude * cos(longitude),
    (radius + height) * cosLatitude * sin(longitude),
    (radius * (1.0 - CARMA_WGS84_E2) + height) * sinLatitude
  );
}

vec3 carmaSphereToEcef(float longitude, float latitude, float radius) {
  float cosLatitude = cos(latitude);
  return vec3(
    radius * cosLatitude * cos(longitude),
    radius * cosLatitude * sin(longitude),
    radius * sin(latitude)
  );
}`;

const terrainVertexPosition = (includeElevationVarying: boolean) => /* glsl */ `
#include <begin_vertex>
vec2 carmaRelativeToField = position.xz - uCarmaFieldCenterOffset;
vec2 carmaGcgUv = carmaRelativeToField / (2.0 * uCarmaGcgHalfExtent) + 0.5;
vec2 carmaFieldUv = (clamp(carmaGcgUv, 0.0, 1.0) * (uCarmaGcgSize - 1.0) + 0.5) / uCarmaGcgSize;
float carmaGcgEncoded = texture2D(uCarmaGcgTexture, carmaFieldUv).r;
float carmaUndulation = mix(uCarmaGcgMinimum, uCarmaGcgMaximum, carmaGcgEncoded);
vec2 carmaMercator = uCarmaMercatorOrigin + position.xz * uCarmaMercatorUnitsPerMeter;
float carmaLongitude = carmaMercator.x * CARMA_TWO_PI - CARMA_PI;
float carmaMercatorLatitudeArgument = CARMA_PI * (1.0 - 2.0 * carmaMercator.y);
float carmaLatitude = atan(0.5 * (exp(carmaMercatorLatitudeArgument) - exp(-carmaMercatorLatitudeArgument)));
float carmaNormalHeight = position.y * cos(carmaLatitude) / uCarmaOriginCosLatitude;
float carmaHeight = carmaNormalHeight + step(0.5, uCarmaHeightDatum) * carmaUndulation;
if (uCarmaGeometryMode < 0.5) {
  transformed.y = carmaHeight * uCarmaOriginCosLatitude / cos(carmaLatitude);
} else {
  vec3 carmaEcef = uCarmaGeometryMode < 1.5
    ? carmaGeodeticToEcef(carmaLongitude, carmaLatitude, carmaHeight)
    : carmaSphereToEcef(carmaLongitude, carmaLatitude, uCarmaSphereRadius + carmaHeight);
  vec3 carmaOrigin = uCarmaGeometryMode < 1.5
    ? uCarmaOriginEcef
    : uCarmaOriginSphereEcef;
  vec3 carmaEnu = uCarmaEcefToEnu * (carmaEcef - carmaOrigin);
  transformed = vec3(carmaEnu.x, carmaEnu.z, -carmaEnu.y);
}
${
  includeElevationVarying
    ? `vCarmaReferencePosition = transformed;
float carmaSag = 0.0;
if (uCarmaColorDatum > 6.5) {
  // Use ellipsoidal EN distances, not Mercator-scaled X/Z. Sub-metre float
  // errors in horizontal distance contribute only millimetres to the sag.
  vec3 carmaDropEnu = uCarmaEcefToEnu * (carmaGeodeticToEcef(carmaLongitude, carmaLatitude, 0.0) - uCarmaOriginEcef);
  carmaSag = carmaMountDrop(vec2(carmaDropEnu.x, -carmaDropEnu.y));
}
vCarmaTerrainElevation = carmaReferenceElevation(carmaNormalHeight, carmaNormalHeight + carmaUndulation, transformed.y, carmaUndulation, carmaSag);`
    : ""
}`;

const createTerrainDepthMaterial = (
  binding: TerrainShaderBinding,
  frame: ReferenceFrame
) => {
  const material = new THREE.MeshDepthMaterial();
  material.name = "Reference terrain ECEF shadow depth";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, terrainVertexUniforms(binding, frame));
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", terrainVertexCommon(false))
      .replace("#include <begin_vertex>", terrainVertexPosition(false));
  };
  material.customProgramCacheKey = () => "carma-reference-terrain-depth-v2";
  return material;
};

export const disposeTerrainReferenceDepthMaterial = (root: THREE.Object3D) => {
  const state = root.userData[TERRAIN_DEPTH_SHADER_STATE] as
    | TerrainDepthShaderState
    | undefined;
  if (!state) return;
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      object.customDepthMaterial === state.material
    ) {
      object.customDepthMaterial = undefined;
    }
  });
  state.material.dispose();
  delete root.userData[TERRAIN_DEPTH_SHADER_STATE];
};

/**
 * Place the real streamed shadow terrain in flat Mercator, exact WGS84 ECEF
 * reoriented to local ENU, or a local sphere. The source remains DHHN2016;
 * selecting ellipsoidal height adds the bundled GCG2016 undulation in-shader.
 */
export const patchTerrainReferenceShader = ({
  root,
  frame,
  field,
  geometryMode,
  heightDatum,
  colorMinimumMeters,
  colorMaximumMeters,
  elevationColorEnabled,
  atmosphere,
  bindings,
}: {
  root: THREE.Object3D;
  frame: ReferenceFrame;
  field: Gcg2016ShaderField;
  geometryMode: TerrainGeometryMode;
  heightDatum: TerrainHeightDatum;
  colorMinimumMeters: number;
  colorMaximumMeters: number;
  elevationColorEnabled: boolean;
  atmosphere: ReferenceAtmosphereOptions;
  bindings: Set<TerrainShaderBinding>;
}) => {
  const offset = fieldCenterOffsetFromOrigin(frame.originLngLat, field.center);
  let depthState = root.userData[TERRAIN_DEPTH_SHADER_STATE] as
    | TerrainDepthShaderState
    | undefined;
  if (!depthState) {
    const binding = createTerrainShaderBinding({
      frame,
      field,
      offset,
      geometryMode,
      heightDatum,
      colorMinimumMeters,
      colorMaximumMeters,
      elevationColorEnabled,
      atmosphere,
    });
    depthState = {
      binding,
      material: createTerrainDepthMaterial(binding, frame),
    };
    root.userData[TERRAIN_DEPTH_SHADER_STATE] = depthState;
  }
  depthState.binding.geometryMode.value =
    terrainGeometryModeNumber(geometryMode);
  depthState.binding.heightDatum.value = terrainHeightDatumNumber(heightDatum);
  depthState.binding.sphereRadius.value = frame.sphereRadiusMeters;
  depthState.binding.originSphereEcef.value.copy(frame.originSphereEcef);
  updateAtmosphereShaderBindings(depthState.binding, atmosphere);
  bindings.add(depthState.binding);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.customDepthMaterial = depthState.material;
    // The vertex shader bends these flat source bounds by over 100 m on the
    // Nordhelle sightline. Three must not cull the already admitted geometry
    // with its undeformed sphere. Tile admission still belongs to the runtime.
    object.frustumCulled = false;
    for (const material of materialList(object.material)) {
      if (!(material instanceof THREE.MeshLambertMaterial)) continue;
      const existing = material.userData.carmaReferenceTerrainShader as
        | TerrainShaderBinding
        | undefined;
      if (existing) {
        existing.geometryMode.value = terrainGeometryModeNumber(geometryMode);
        existing.heightDatum.value = terrainHeightDatumNumber(heightDatum);
        existing.colorMinimum.value = colorMinimumMeters;
        existing.colorMaximum.value = colorMaximumMeters;
        existing.elevationColorEnabled.value = elevationColorEnabled ? 1 : 0;
        existing.sphereRadius.value = frame.sphereRadiusMeters;
        updateAtmosphereShaderBindings(existing, atmosphere);
        bindings.add(existing);
        continue;
      }

      const binding = createTerrainShaderBinding({
        frame,
        field,
        offset,
        geometryMode,
        heightDatum,
        colorMinimumMeters,
        colorMaximumMeters,
        elevationColorEnabled,
        atmosphere,
      });
      material.userData.carmaReferenceTerrainShader = binding;
      const releaseBinding = () => {
        bindings.delete(binding);
        material.removeEventListener("dispose", releaseBinding);
      };
      material.addEventListener("dispose", releaseBinding);
      const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
      const previousProgramCacheKey =
        material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, renderer) => {
        previousOnBeforeCompile(shader, renderer);
        Object.assign(shader.uniforms, {
          ...terrainVertexUniforms(binding, frame),
          uCarmaColorMinimum: binding.colorMinimum,
          uCarmaColorMaximum: binding.colorMaximum,
          uCarmaElevationColorEnabled: binding.elevationColorEnabled,
          uCarmaElevationIsolines: binding.elevationIsolines,
          ...atmosphereShaderUniforms(binding),
        });
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", terrainVertexCommon(true))
          .replace("#include <begin_vertex>", terrainVertexPosition(true))
          .replace("#include <project_vertex>", atmosphereVertexDistance);
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
uniform float uCarmaColorMinimum;
uniform float uCarmaColorMaximum;
uniform float uCarmaElevationColorEnabled;
varying float vCarmaTerrainElevation;
${VIRIDIS_LINEAR_GLSL}
${atmosphereFragmentCommon}`
          )
          .replace(
            "#include <opaque_fragment>",
            atmosphereFragmentOutput(
              "vCarmaTerrainElevation",
              `mix(
  gl_FragColor.rgb,
  carmaElevationColor(vCarmaTerrainElevation, uCarmaColorMinimum, uCarmaColorMaximum),
  step(0.5, uCarmaElevationColorEnabled)
)`
            )
          );
      };
      material.customProgramCacheKey = () =>
        `${previousProgramCacheKey()}|carma-reference-terrain-v9`;
      material.needsUpdate = true;
      bindings.add(binding);
    }
  });
};

export const updateTerrainReferenceShader = (
  bindings: ReadonlySet<TerrainShaderBinding>,
  options: Readonly<{
    geometryMode: TerrainGeometryMode;
    heightDatum: TerrainHeightDatum;
    frame: ReferenceFrame;
    colorMinimumMeters: number;
    colorMaximumMeters: number;
    elevationColorEnabled: boolean;
    atmosphere: ReferenceAtmosphereOptions;
  }>
) => {
  for (const binding of bindings) {
    binding.geometryMode.value = terrainGeometryModeNumber(
      options.geometryMode
    );
    binding.heightDatum.value = terrainHeightDatumNumber(options.heightDatum);
    binding.sphereRadius.value = options.frame.sphereRadiusMeters;
    binding.originSphereEcef.value.copy(options.frame.originSphereEcef);
    binding.colorMinimum.value = options.colorMinimumMeters;
    binding.colorMaximum.value = options.colorMaximumMeters;
    binding.elevationColorEnabled.value = options.elevationColorEnabled ? 1 : 0;
    updateAtmosphereShaderBindings(binding, options.atmosphere);
  }
};

export const summarizeSignedDistances = (
  values: readonly number[]
): DistanceSummary | null => {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return null;
  let sum = 0;
  let squared = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of finite) {
    sum += value;
    squared += value * value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return {
    count: finite.length,
    minimumMeters: minimum,
    maximumMeters: maximum,
    meanMeters: sum / finite.length,
    rmsMeters: Math.sqrt(squared / finite.length),
  };
};

export const signedCorrespondingDistance = (
  point: THREE.Vector3,
  surface: THREE.Vector3,
  localUp: THREE.Vector3
) => {
  const delta = point.clone().sub(surface);
  return delta.length() * Math.sign(delta.dot(localUp) || 1);
};

export const sceneSurfacePoint = ({
  surface,
  frame,
  field,
  longitude,
  latitude,
  undulationMeters,
  terrainNormalHeightMeters,
  terrainGeometryMode,
  terrainHeightDatum,
  verticalScale,
  verticalOffsetMeters,
}: {
  surface: ReferenceSurface;
  frame: ReferenceFrame;
  field: Gcg2016ShaderField;
  longitude: number;
  latitude: number;
  undulationMeters?: number;
  terrainNormalHeightMeters?: number;
  terrainGeometryMode: TerrainGeometryMode;
  terrainHeightDatum: TerrainHeightDatum;
  verticalScale: number;
  verticalOffsetMeters: number;
}) => {
  const undulation =
    undulationMeters ?? sampleGcg2016Field(field, frame, longitude, latitude);
  const target = new THREE.Vector3();
  if (surface === REFERENCE_SURFACE.TANGENT) {
    projectMercatorToScene(frame, longitude, latitude, 0, target);
  } else if (surface === REFERENCE_SURFACE.SPHERE) {
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      0,
      TERRAIN_GEOMETRY_MODE.LOCAL_SPHERE,
      target
    );
  } else if (surface === REFERENCE_SURFACE.ELLIPSOID) {
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      0,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
      target
    );
  } else if (surface === REFERENCE_SURFACE.QUASIGEOID) {
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      undulation,
      TERRAIN_GEOMETRY_MODE.WGS84_ECEF,
      target
    );
  } else if (terrainNormalHeightMeters !== undefined) {
    const height =
      terrainNormalHeightMeters +
      (terrainHeightDatum === TERRAIN_HEIGHT_DATUM.ELLIPSOIDAL
        ? undulation
        : 0);
    projectGeodeticToScene(
      frame,
      longitude,
      latitude,
      height,
      terrainGeometryMode,
      target
    );
    return target;
  } else {
    return null;
  }
  target.y = target.y * verticalScale + verticalOffsetMeters;
  return target;
};

export const localUpAt = (
  frame: ReferenceFrame,
  longitude: number,
  latitude: number
) => {
  const base = projectGeodeticToScene(
    frame,
    longitude,
    latitude,
    0,
    TERRAIN_GEOMETRY_MODE.WGS84_ECEF
  );
  return projectGeodeticToScene(
    frame,
    longitude,
    latitude,
    1,
    TERRAIN_GEOMETRY_MODE.WGS84_ECEF
  )
    .sub(base)
    .normalize();
};

export const WGS84_REFERENCE_AXES = {
  semiMajorMeters: WGS84_A,
  semiMinorMeters: WGS84_B,
  // Gaussian curvature radius sqrt(MN) at the Wuppertal story origin.
  defaultLocalSphereRadiusMeters: 6_382_757,
} as const;
