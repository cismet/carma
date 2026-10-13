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

import type { AxisBoundaryDisplayUniforms } from "./shared-three-axis-boundary-display";

const AXIS_BOUNDARY_FRAGMENT_HEADER = /* glsl */ `
uniform sampler2D carmaAxisBoundaryDisplayTexture;
uniform mat4 carmaAxisBoundaryDisplaySceneToClip;
uniform float carmaAxisBoundaryDisplayEnabled;
`;
const AXIS_BOUNDARY_FRAGMENT_FUNCTION = /* glsl */ `
vec4 carmaAxisBoundaryContour(vec3 scenePosition) {
  if (carmaAxisBoundaryDisplayEnabled < 0.5) return vec4(0.0);
  vec4 clip = carmaAxisBoundaryDisplaySceneToClip * vec4(scenePosition, 1.0);
  if (clip.w <= 0.0) return vec4(0.0);
  vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))))
    return vec4(0.0);
  return texture2D(carmaAxisBoundaryDisplayTexture, uv);
}
`;
const AXIS_BOUNDARY_UNIFORMS = "carmaMapStyleAxisBoundaryUniforms";
const EMPTY_AXIS_BOUNDARY_UNIFORMS: AxisBoundaryDisplayUniforms = {
  carmaAxisBoundaryDisplayTexture: { value: null },
  carmaAxisBoundaryDisplaySceneToClip: { value: new THREE.Matrix4() },
  carmaAxisBoundaryDisplayEnabled: { value: 0 },
};
type ShaderUniforms = Parameters<
  THREE.Material["onBeforeCompile"]
>[0]["uniforms"];
const axisBoundaryShaders = new WeakMap<THREE.Material, Set<ShaderUniforms>>();

/** The projection display owns the shared bundle and its render target. Rebinding a
 * receiver updates compiled uniforms without recompiling the invariant shader. */
export const setMapStyleAxisBoundaryUniforms = (
  material: THREE.Material,
  bundle: AxisBoundaryDisplayUniforms | null
): void => {
  if (bundle) material.userData[AXIS_BOUNDARY_UNIFORMS] = bundle;
  else delete material.userData[AXIS_BOUNDARY_UNIFORMS];
  axisBoundaryShaders.get(material)?.forEach((uniforms) => {
    Object.assign(uniforms, bundle ?? EMPTY_AXIS_BOUNDARY_UNIFORMS);
  });
};

const bindAxisBoundaryUniforms = (
  material: THREE.Material,
  uniforms: ShaderUniforms
): void => {
  Object.assign(
    uniforms,
    material.userData[AXIS_BOUNDARY_UNIFORMS] ?? EMPTY_AXIS_BOUNDARY_UNIFORMS
  );
  let shaders = axisBoundaryShaders.get(material);
  if (!shaders) {
    shaders = new Set();
    axisBoundaryShaders.set(material, shaders);
    const retained = shaders;
    material.addEventListener("dispose", () => {
      retained.clear();
      axisBoundaryShaders.delete(material);
      delete material.userData[AXIS_BOUNDARY_UNIFORMS];
    });
  }
  shaders.add(uniforms);
};

type MapStyleProjectionMaterialState = {
  uniforms: MapStyleProjectionUniforms;
  blend: MapStyleProjectionBlend;
  localFrame: boolean;
};

const MAP_STYLE_PROJECTION_STATE = "carmaMapStyleProjectionState";
const MAP_STYLE_PROJECTION_SHADER_KEY =
  "|carma-map-style-projection-v38|axis-tiled-display-v1|footprint-color-v1";
const MAP_STYLE_PROJECTION_OVERLAY_DEFINE = "CARMA_MAP_STYLE_OVERLAY";
const MAP_STYLE_PROJECTION_MARKINGS_DEFINE = "CARMA_MAP_STYLE_MARKINGS_ONLY";

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
  if (blend === "markings-only") {
    defines[MAP_STYLE_PROJECTION_MARKINGS_DEFINE] = "";
  } else {
    delete defines[MAP_STYLE_PROJECTION_MARKINGS_DEFINE];
  }
  if (blend === "photo-only") {
    defines.CARMA_MAP_STYLE_PHOTO_ONLY = "";
  } else {
    delete defines.CARMA_MAP_STYLE_PHOTO_ONLY;
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
    bindAxisBoundaryUniforms(material, shader.uniforms);
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
    shader.uniforms["carmaPhotoGapTexture"] = state.uniforms.photoGapRepair
      ?.texture ?? { value: null };
    shader.uniforms["carmaPhotoGapEnabled"] = state.uniforms.photoGapRepair
      ?.enabled ?? { value: 0 };
    shader.uniforms["carmaPhotoGapGeometry"] = state.uniforms.photoGapRepair
      ?.geometry ?? { value: null };
    shader.uniforms["carmaPhotoGapSceneToMetric"] = state.uniforms
      .photoGapRepair?.sceneToMetric ?? { value: new THREE.Matrix4() };
    shader.uniforms["carmaPhotoGapFieldSize"] = state.uniforms.photoGapRepair
      ?.fieldSize ?? { value: new THREE.Vector2(1, 1) };
    shader.uniforms["carmaPhotoGapPages"] = state.uniforms.photoGapRepair
      ?.pages ?? { value: 0 };
    for (const index of [0, 1, 2])
      shader.uniforms[`carmaPhotoGapMetricToClip${index}`] = state.uniforms
        .photoGapRepair?.metricToClip[index] ?? { value: new THREE.Matrix4() };
    shader.uniforms["carmaPhotoGapFootprints"] = state.uniforms.photoGapRepair
      ?.footprints ?? { value: 0 };
    for (const index of [0, 1, 2, 3])
      shader.uniforms[`carmaPhotoGapMetricToFootprint${index}`] = state.uniforms
        .photoGapRepair?.metricToFootprint[index] ?? {
        value: new THREE.Matrix4(),
      };
    shader.uniforms["carmaPhotoMosaicTexture"] = state.uniforms.photoMosaic
      ?.texture ?? { value: null };
    shader.uniforms["carmaPhotoMosaicOpacity"] = state.uniforms.photoMosaic
      ?.opacity ?? { value: 0 };
    shader.uniforms["carmaPhotoMosaicNavigationGroup"] = state.uniforms
      .photoMosaic?.navigationGroup ?? { value: 0 };
    shader.uniforms["carmaScreenBasemapLabels"] = state.uniforms
      .screenBasemapLabels ?? { value: 1 };
    shader.uniforms["carmaScreenBackdropOverride"] = state.uniforms
      .screenBackdropOverride ?? { value: new THREE.Vector4(0, 0, 0, 0) };
    shader.uniforms["carmaScreenBackdropLook"] = state.uniforms.screenBackdrop
      ?.look ?? { value: new THREE.Vector3(1, 1, 1) };
    shader.uniforms["carmaScreenBackdropTint"] = state.uniforms.screenBackdrop
      ?.tint ?? { value: new THREE.Vector4() };
    shader.uniforms["carmaScreenBackdropOpacity"] = state.uniforms
      .screenBackdrop?.opacity ?? { value: 0 };
    shader.uniforms["carmaScreenToBorderImage"] = state.uniforms.screenBorder
      ?.viewportToImage ?? { value: new THREE.Matrix3() };
    shader.uniforms["carmaScreenBorderImageSize"] = state.uniforms.screenBorder
      ?.imageSize ?? { value: new THREE.Vector2(1, 1) };
    shader.uniforms["carmaScreenFootprintColor"] = state.uniforms
      .screenFootprintColor ?? { value: new THREE.Color(1, 1, 1) };
    shader.uniforms["carmaScreenBorderStyle"] = state.uniforms.screenBorder
      ?.style ?? { value: new THREE.Vector4() };
    shader.uniforms["carmaScreenFramePixelRatio"] = projective.pixelRatio;
    const surface = state.uniforms.surfaceOverlay ?? emptySurface;
    for (let index = 0; index < 2; index++) {
      const screen = state.uniforms.screenOverlays?.[index];
      shader.uniforms[`carmaScreenFrameProjection${index}`] =
        screen?.frameProjection ?? { value: new THREE.Matrix4() };
      shader.uniforms[`carmaScreenFrameStyle${index}`] = screen?.frameStyle ?? {
        value: new THREE.Vector4(0, 0, 0, 0),
      };
      shader.uniforms[`carmaScreenFrameEnabled${index}`] =
        screen?.frameEnabled ?? { value: 0 };
      shader.uniforms[`carmaScreenFrameCoverage${index}`] =
        screen?.frameCoverage ?? { value: 1 };
      shader.uniforms[`carmaScreenTexture${index}`] = screen?.texture ?? {
        value: null,
      };
      shader.uniforms[`carmaScreenToTexture${index}`] =
        screen?.viewportToTexture ?? { value: new THREE.Matrix3() };
      shader.uniforms[`carmaScreenSceneToTexture${index}`] =
        screen?.sceneToTexture ?? { value: new THREE.Matrix4() };
      shader.uniforms[`carmaScreenSourceDepthTexture${index}`] =
        screen?.sourceDepthTexture ?? { value: null };
      shader.uniforms[`carmaScreenSourceDepthSceneToClip${index}`] =
        screen?.sourceDepthSceneToClip ?? { value: new THREE.Matrix4() };
      shader.uniforms[`carmaScreenSourceDepthNearFar${index}`] =
        screen?.sourceDepthNearFar ?? { value: new THREE.Vector2(1, 20000) };
      shader.uniforms[`carmaScreenSourceDepthEnabled${index}`] =
        screen?.sourceDepthEnabled ?? { value: 0 };
      shader.uniforms[`carmaScreenSourceDepthBias${index}`] =
        screen?.sourceDepthBias ?? { value: 0 };
      shader.uniforms[`carmaScreenProjective${index}`] = screen?.projective ?? {
        value: 0,
      };
      shader.uniforms[`carmaScreenUnderlay${index}`] = screen?.underlay ?? {
        value: 0,
      };
      shader.uniforms[`carmaScreenFillGaps${index}`] = screen?.fillGaps ?? {
        value: 0,
      };
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
        `#include <common>${MAP_STYLE_PROJECTION_FRAGMENT_HEADER}${AXIS_BOUNDARY_FRAGMENT_HEADER}${AXIS_BOUNDARY_FRAGMENT_FUNCTION}`
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
