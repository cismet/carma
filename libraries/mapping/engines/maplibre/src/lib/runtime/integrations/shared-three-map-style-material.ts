import * as THREE from "three";
import type {
  MapStyleProjectionUniforms,
  MapStyleProjectionBlend,
} from "../../core/shared-three-scene-types";
import {
  MAP_STYLE_PROJECTION_VERTEX_HEADER,
  MAP_STYLE_PROJECTION_VERTEX_BODY,
  MAP_STYLE_PROJECTION_FRAGMENT_HEADER,
  MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT,
  MAP_STYLE_PROJECTION_FRAGMENT_BODY,
} from "../../core/shared-three-map-style-shaders";

type MapStyleProjectionMaterialState = {
  uniforms: MapStyleProjectionUniforms;
  blend: MapStyleProjectionBlend;
  localFrame: boolean;
};

const MAP_STYLE_PROJECTION_STATE = "carmaMapStyleProjectionState";
const MAP_STYLE_PROJECTION_SHADER_KEY = "|carma-map-style-projection-v13";
const MAP_STYLE_PROJECTION_OVERLAY_DEFINE = "CARMA_MAP_STYLE_OVERLAY";

const applyMapStyleProjectionBlend = (
  material: THREE.Material,
  blend: MapStyleProjectionBlend
): void => {
  const defines = (material.defines ??= {});
  if (blend === "overlay") {
    defines[MAP_STYLE_PROJECTION_OVERLAY_DEFINE] = "";
  } else {
    delete defines[MAP_STYLE_PROJECTION_OVERLAY_DEFINE];
  }
};

export const configureMapStyleProjectedMaterial = (
  material: THREE.Material,
  uniforms: MapStyleProjectionUniforms,
  blend: MapStyleProjectionBlend = "replace",
  localFrame = false
): void => {
  const userData = material.userData as Record<string, unknown>;
  const existing = userData[MAP_STYLE_PROJECTION_STATE] as
    | MapStyleProjectionMaterialState
    | undefined;
  if (existing) {
    if (existing.uniforms !== uniforms) {
      existing.uniforms = uniforms;
      material.needsUpdate = true;
    }
    if (existing.blend !== blend) {
      existing.blend = blend;
      applyMapStyleProjectionBlend(material, blend);
      material.needsUpdate = true;
    }
    if (existing.localFrame !== localFrame) {
      existing.localFrame = localFrame;
      if (localFrame) material.defines!.CARMA_PROJECTIVE_LOCAL_FRAME = "";
      else delete material.defines!.CARMA_PROJECTIVE_LOCAL_FRAME;
      material.needsUpdate = true;
    }
    return;
  }

  const state: MapStyleProjectionMaterialState = {
    uniforms,
    blend,
    localFrame,
  };
  const emptySurface = {
    texture: { value: null },
    sceneToTexture: { value: new THREE.Matrix4() },
    opacity: { value: 0 },
    previousTexture: { value: null },
    previousSceneToTexture: { value: new THREE.Matrix4() },
    previousEnabled: { value: 0 },
    previousOpacity: { value: -1 },
    transition: { value: 1 },
  };
  const emptyProjective = {
    data: { value: null },
    labelAtlas: { value: null },
    count: { value: 0 },
    time: { value: 0 },
    trailColor: { value: new THREE.Color() },
    trailDuration: { value: 8 },
    opacity: { value: 0 },
    pixelRatio: { value: 1 },
  };
  userData[MAP_STYLE_PROJECTION_STATE] = state;
  applyMapStyleProjectionBlend(material, blend);
  if (localFrame) material.defines!.CARMA_PROJECTIVE_LOCAL_FRAME = "";
  else delete material.defines!.CARMA_PROJECTIVE_LOCAL_FRAME;
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms["carmaMapStyleTexture"] = state.uniforms.texture;
    shader.uniforms["carmaMapStyleSceneToClip"] = state.uniforms.sceneToClip;
    shader.uniforms["carmaMapStyleEnabled"] = state.uniforms.enabled;
    shader.uniforms["carmaMapStyleDepthTexture"] = state.uniforms.depthTexture;
    shader.uniforms["carmaMapStyleDepthEnabled"] = state.uniforms.depthEnabled;
    shader.uniforms["carmaMapStyleDepthNearFar"] = state.uniforms.depthNearFar;
    shader.uniforms["carmaMapStyleTexelSize"] = state.uniforms.texelSize;
    const projective = state.uniforms.projectiveOverlay ?? emptyProjective;
    shader.uniforms["carmaProjectiveData"] = projective.data;
    shader.uniforms["carmaProjectiveLabelAtlas"] = projective.labelAtlas;
    shader.uniforms["carmaProjectiveCount"] = projective.count;
    shader.uniforms["carmaProjectiveTime"] = projective.time;
    shader.uniforms["carmaProjectiveTrailColor"] = projective.trailColor;
    shader.uniforms["carmaProjectiveTrailDuration"] = projective.trailDuration;
    shader.uniforms["carmaProjectiveOpacity"] = projective.opacity;
    shader.uniforms["carmaProjectivePixelRatio"] = projective.pixelRatio;
    shader.uniforms["carmaScreenBackdropLook"] = state.uniforms.screenBackdrop
      ?.look ?? { value: new THREE.Vector3(1, 1, 1) };
    shader.uniforms["carmaScreenBackdropTint"] = state.uniforms.screenBackdrop
      ?.tint ?? { value: new THREE.Vector4() };
    shader.uniforms["carmaScreenBackdropOpacity"] = state.uniforms
      .screenBackdrop?.opacity ?? { value: 0 };
    const surface = state.uniforms.surfaceOverlay ?? emptySurface;
    for (let index = 0; index < 2; index++) {
      const screen = state.uniforms.screenOverlays?.[index];
      shader.uniforms[`carmaScreenTexture${index}`] = screen?.texture ?? {
        value: null,
      };
      shader.uniforms[`carmaScreenToTexture${index}`] =
        screen?.viewportToTexture ?? { value: new THREE.Matrix3() };
      shader.uniforms[`carmaScreenOpacity${index}`] = screen?.opacity ?? {
        value: 0,
      };
    }
    shader.uniforms["carmaSurfacePreviousTexture"] = surface.previousTexture;
    shader.uniforms["carmaSurfacePreviousSceneToTexture"] =
      surface.previousSceneToTexture;
    shader.uniforms["carmaSurfacePreviousEnabled"] = surface.previousEnabled;
    shader.uniforms["carmaSurfacePreviousOpacity"] = surface.previousOpacity;
    shader.uniforms["carmaSurfaceTransition"] = surface.transition;
    shader.uniforms["carmaSurfaceTexture"] = surface.texture;
    shader.uniforms["carmaSurfaceSceneToTexture"] = surface.sceneToTexture;
    shader.uniforms["carmaSurfaceOpacity"] = surface.opacity;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>${MAP_STYLE_PROJECTION_VERTEX_HEADER}`
      )
      .replace("#include <project_vertex>", MAP_STYLE_PROJECTION_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>${MAP_STYLE_PROJECTION_FRAGMENT_HEADER}`
      )
      .replace("#include <map_fragment>", MAP_STYLE_PROJECTION_FRAGMENT_BODY)
      .replace(
        "#include <opaque_fragment>",
        MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT
      );
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey()}${MAP_STYLE_PROJECTION_SHADER_KEY}|${
      state.blend
    }|${state.localFrame ? "local" : "mercator"}`;
  material.needsUpdate = true;
};
