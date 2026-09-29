import * as THREE from "three";

import { getWgs84PrincipalCurvatureRadii } from "@carma-geo/proj";
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
  type ElevationColorDatum,
} from "./reference-elevation-shader";
import type { Gcg2016ShaderField } from "./reference-gcg2016-field";
import {
  projectMercatorToScene,
  type ReferenceFrame,
} from "./reference-surface-frame";
import {
  TERRAIN_HEIGHT_DATUM,
  terrainHeightDatumNumber,
  type TerrainHeightDatum,
} from "./reference-surface-types";

type NumberUniform = { value: number };

export type MeshElevationShaderBinding = AtmosphereShaderBinding &
  Readonly<{
    colorDatum: NumberUniform;
    encodedHeightDatum: NumberUniform;
    elevationIsolines: { value: boolean };
    colorMinimum: NumberUniform;
    colorMaximum: NumberUniform;
  }>;

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
  const {
    primeVerticalMeters: primeVerticalRadius,
    meridionalMeters: meridionalRadius,
  } = getWgs84PrincipalCurvatureRadii(degToRadNumeric(frame.originLngLat[1]));

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
        `${previousProgramCacheKey()}|carma-mesh-elevation`;
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
