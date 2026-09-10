import * as THREE from "three";

import { MESH_SURFACE_ALBEDO_GLSL } from "../../core/mesh-surface-shader";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";

/** projection responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesProjection(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "projectorUniforms"
    | "shadowAppearanceUniforms"
    | "activeProjector"
    | "placementMatrix"
    | "orientationGroup"
    | "identityRotation"
    | "inversePlacementMatrix"
    | "map"
  >
) {
  const patchMaterialForProjection: ThreeTilesRuntimeServices["patchMaterialForProjection"] =
    (material: THREE.Material) => {
      if ((material as { __projPatched?: boolean }).__projPatched) return;
      (material as { __projPatched?: boolean }).__projPatched = true;
      material.onBeforeCompile = (shader) => {
        Object.assign(
          shader.uniforms,
          runtimeState.projectorUniforms,
          runtimeState.shadowAppearanceUniforms
        );
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vProjWorld;"
          )
          .replace(
            "#include <worldpos_vertex>",
            "#include <worldpos_vertex>\nvProjWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
varying vec3 vProjWorld;
uniform float uProjKind;
uniform float uProjOpacity;
uniform vec3 uProjPos;
uniform float uProjHeading;
uniform mat4 uProjMatrix;
uniform sampler2D tProj;
uniform vec3 uShadowUniformColor;
uniform float uShadowUniformColorMix;
uniform float uShadowTextureSaturation;
uniform bool uShadowTextureColorCorrection;
uniform vec3 uShadowTextureGamma;
uniform vec3 uShadowTextureBlackPoint;
uniform vec3 uShadowTextureWhitePoint;`
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>\n${MESH_SURFACE_ALBEDO_GLSL}`
          )
          .replace(
            "#include <dithering_fragment>",
            `#include <dithering_fragment>
if (uProjKind > 0.5 && uProjOpacity > 0.001) {
  vec3 projColor = vec3(0.0);
  float mask = 0.0;
  if (uProjKind < 1.5) {
    vec3 dir = normalize(vProjWorld - uProjPos);
    float theta = atan(dir.x, -dir.z) - uProjHeading;
    float u = fract(theta / 6.28318530718 + 0.5);
    float v = 0.5 - asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265359;
    projColor = texture2D(tProj, vec2(u, v)).rgb;
    mask = 1.0;
  } else {
    vec4 clipPos = uProjMatrix * vec4(vProjWorld, 1.0);
    if (clipPos.w > 0.0) {
      vec2 uv = clipPos.xy / clipPos.w * 0.5 + 0.5;
      if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
        projColor = texture2D(tProj, uv).rgb;
        mask = 1.0;
      }
    }
  }
  gl_FragColor.rgb = mix(gl_FragColor.rgb, projColor, uProjOpacity * mask);
}`
          );
      };
      material.needsUpdate = true;
    };

  const syncProjector: ThreeTilesRuntimeServices["syncProjector"] = () => {
    const projector = runtimeState.activeProjector;
    if (!projector) {
      runtimeState.projectorUniforms.uProjKind.value = 0;
      runtimeState.projectorUniforms.uProjOpacity.value = 0;
      runtimeState.projectorUniforms.tProj.value = null;
      return;
    }
    runtimeState.placementMatrix.compose(
      runtimeState.orientationGroup.position,
      runtimeState.identityRotation,
      runtimeState.orientationGroup.scale
    );
    runtimeState.inversePlacementMatrix
      .copy(runtimeState.placementMatrix)
      .invert();
    runtimeState.projectorUniforms.uProjKind.value =
      projector.kind === "pano" ? 1 : 2;
    runtimeState.projectorUniforms.uProjOpacity.value = projector.opacity;
    runtimeState.projectorUniforms.tProj.value = projector.texture;
    if (projector.kind === "pano") {
      runtimeState.projectorUniforms.uProjPos.value
        .copy(projector.position)
        .applyMatrix4(runtimeState.placementMatrix);
      runtimeState.projectorUniforms.uProjHeading.value = projector.headingRad;
    } else {
      runtimeState.projectorUniforms.uProjMatrix.value
        .copy(projector.viewProj)
        .multiply(runtimeState.inversePlacementMatrix);
    }
  };

  const setProjector: ThreeTilesRuntimeServices["setProjector"] = (
    projector
  ) => {
    runtimeState.activeProjector = projector;
    syncProjector();
    runtimeState.map?.triggerRepaint();
  };
  return { patchMaterialForProjection, syncProjector, setProjector };
}
