import * as THREE from "three";

import { WGS84_A, WGS84_E2 } from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";

import {
  atmosphereFragmentCommon,
  atmosphereFragmentOutput,
  atmosphereShaderUniforms,
  atmosphereVertexDistance,
  atmosphereVertexVarying,
  createAtmosphereShaderBindings,
  updateAtmosphereShaderBindings,
  type AtmosphereShaderBinding,
  type ReferenceAtmosphereOptions,
} from "./reference-atmosphere-shader";
import {
  ELEVATION_COLOR_DATUM,
  VIRIDIS_LINEAR_GLSL,
  elevationColorDatumNumber,
  elevationReferenceGlsl,
  elevationReferenceUniforms,
} from "./reference-elevation-shader";
import {
  fieldCenterOffsetFromOrigin,
  type Gcg2016ShaderField,
} from "./reference-gcg2016-field";
import type { ReferenceFrame } from "./reference-surface-frame";
import {
  TERRAIN_GEOMETRY_MODE,
  TERRAIN_HEIGHT_DATUM,
  terrainGeometryModeNumber,
  terrainHeightDatumNumber,
  type TerrainGeometryMode,
  type TerrainHeightDatum,
} from "./reference-surface-types";

type NumberUniform = { value: number };

export type TerrainShaderBinding = AtmosphereShaderBinding &
  Readonly<{
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
  }>;

type TerrainDepthShaderState = Readonly<{
  binding: TerrainShaderBinding;
  material: THREE.MeshDepthMaterial;
}>;

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
    value: Math.cos(degToRadNumeric(frame.originLngLat[1])),
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
const float CARMA_WGS84_E2 = ${WGS84_E2.toFixed(15)};

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
  material.customProgramCacheKey = () => "carma-reference-terrain-depth";
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
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
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
        `${previousProgramCacheKey()}|carma-reference-terrain`;
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
