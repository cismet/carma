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
};

const MAP_STYLE_PROJECTION_STATE = "carmaMapStyleProjectionState";
const MAP_STYLE_PROJECTION_SHADER_KEY = "|carma-map-style-projection-v5";
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
  blend: MapStyleProjectionBlend = "replace"
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
    return;
  }

  const state: MapStyleProjectionMaterialState = { uniforms, blend };
  userData[MAP_STYLE_PROJECTION_STATE] = state;
  applyMapStyleProjectionBlend(material, blend);
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
    }`;
  material.needsUpdate = true;
};
