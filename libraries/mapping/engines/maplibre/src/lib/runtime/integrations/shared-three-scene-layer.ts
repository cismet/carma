import { synthesizeLodCamera } from "@carma-mapping/engines/threejs";
import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from "maplibre-gl";
import * as THREE from "three";
import { runMapLibreIdleRender } from "./maplibre-idle-render";

import { quantize } from "@carma-commons/math";
import { setSharedThreeShadedPresentation } from "./shared-three-scene-content-registry";
import { createMapStyleFramebufferCache } from "./map-style-framebuffer-cache";
import { MAP_LOADING_PHASE } from "../../core/map-loading-progress";
import { publishMapLoadingProgress } from "./map-loading-progress";
import {
  buildSharedSceneAccumulator,
  DEFAULT_SCENE_ACCUMULATION_OPTIONS,
  fitRenderTargetSizeToPixelBudget,
  type SceneAccumulationOptions,
  type SharedSceneAccumulator,
} from "@carma-mapping/engines/three/primitives/rendering";

export interface SharedThreeSceneFrame {
  map: MaplibreMap;
  renderCamera: THREE.Camera;
  lodCamera: THREE.PerspectiveCamera;
  lookTarget: THREE.Vector3;
  viewport: THREE.Vector2;
}

export type SharedThreeSceneShadowView = Readonly<{
  camera: THREE.Camera;
  shadowMapSize: Readonly<{
    width: number;
    height: number;
  }>;
}>;

export type SharedThreeSceneTileVolume = Readonly<{
  id: string;
  kind: string;
  loadReason?: "viewport" | "shadow";
  minimum: readonly [number, number, number];
  maximum: readonly [number, number, number];
}>;

export interface SharedThreeSceneRuntime {
  id: string;
  originLngLat: [number, number];
  root: THREE.Object3D;
  /** This runtime already supplies the visible ground surface. */
  providesTerrain?: boolean;
  /** Project preceding MapLibre ground styling onto selected runtime materials. */
  receivesMapStyleTexture?: boolean | ((material: THREE.Material) => boolean);
  /**
   * How the projected style meets the receiver's own color: `replace` paints
   * the captured pass as the surface color (bare terrain), `overlay`
   * composites it by alpha over the receiver's own texture (a textured mesh
   * that only takes draped labels).
   */
  mapStyleProjectionBlend?: MapStyleProjectionBlend;
  /** Changes whenever streamed content replaces or adds render materials. */
  mapStyleProjectionVersion?: () => number;
  /** Whether terrain-supplying content is ready to replace fallback terrain. */
  hasRenderableContent?: () => boolean;
  updatePriority?: number;
  onAdd?: (map: MaplibreMap) => void;
  update: (frame: SharedThreeSceneFrame) => void;
  setShadowSimulationStyle?: (
    style: SharedThreeSceneShadowStyle | null
  ) => void;
  setShadowView?: (view: SharedThreeSceneShadowView | null) => void;
  /** Requested screen-space error in pixels; lower loads finer tiles. */
  setErrorTarget?: (errorTarget: number) => void;
  setCacheBudget?: (bytes?: number) => void;
  /** World-space elevation span of loaded content intersecting this camera. */
  getViewElevationRange?: (
    camera: THREE.Camera
  ) => readonly [minimum: number, maximum: number] | null;
  /** World-space bounds of active tiles used for coverage and diagnostics. */
  getActiveTileVolumes?: () => readonly SharedThreeSceneTileVolume[];
  /** Show runtime-owned tile bounds and identifiers for diagnostics. */
  setTileBoundsVisible?: (visible: boolean) => void;
  /** Outstanding work required before a fixed-state render can converge. */
  getRequestDemand?: () => number;
  /** Visible content takes priority over optional sun-disc refinement. */
  isMainViewReady?: () => boolean;
  /** Whether this provider's selected target-LOD dependencies in a world region
   * are published. Unrelated downloads must not block corridor refinement. */
  isShadowRegionReady?: (bounds: THREE.Box3) => boolean;
  dispose: () => void;
}

export const getSharedThreeShadowViewSignature = (
  view: SharedThreeSceneShadowView | null
): string => {
  if (!view) return "";
  const { camera, shadowMapSize } = view;
  camera.updateMatrixWorld(true);
  return [
    quantize(camera.position.x, 0.25),
    quantize(camera.position.y, 0.25),
    quantize(camera.position.z, 0.25),
    quantize(camera.quaternion.x, 0.0001),
    quantize(camera.quaternion.y, 0.0001),
    quantize(camera.quaternion.z, 0.0001),
    quantize(camera.quaternion.w, 0.0001),
    ...camera.projectionMatrix.elements.map((value) => quantize(value, 0.0001)),
    `${shadowMapSize.width}x${shadowMapSize.height}`,
  ].join(",");
};

export type SharedThreeSceneShadowStyle = Readonly<{
  fullOpacity: boolean;
  uniformColor: string | null;
  /** 0 keeps the source texture, 1 shows only uniformColor. */
  uniformColorMix?: number;
  /** 0 removes all source-texture saturation, 1 preserves it. */
  textureSaturation?: number;
}>;

export type SharedSceneAccumulationController = {
  /** An independently converging scene strategy may own its accumulation.
   * The host still owns native pixel size, style registration and the shared
   * framebuffer depth range. A null result retains the mono implementation.
   * Do not include the global terrain epoch in viewKey: spatial strategies
   * invalidate affected receivers using their own caster dependencies.
   */
  renderProgressive?: (
    camera: THREE.Camera,
    frame: Readonly<{
      width: number;
      height: number;
      viewKey: string;
      styleEpoch: number;
      active: boolean;
    }>
  ) => Readonly<{
    progress: number;
    settled: boolean;
    needsRepaint: boolean;
  }> | null;
  /** Changes whenever the shadow/lighting state the rounds sample changed. */
  epoch: () => number;
  /** Changes only when an already displayed result is visually obsolete. */
  visualEpoch: () => number;
  /** Whether accumulating is worthwhile right now (soft sun, camera at rest). */
  active: () => boolean;
  /** Sampling is queued but waiting for terrain, motion or content settling. */
  pending?: () => boolean;
  /** Whether a settled result may cover a temporary content-loading gap. */
  retainSettledFrame: () => boolean;
  /** Re-aim the scene's lights for the given accumulation round. */
  prepareRound: (round: number) => void;
  /** Restore the non-jittered scene state before drawing the visible frame. */
  finishRound?: () => void;
  /** One transition after a complete current-camera result, for cancellable
   * background work. Must schedule work, never synchronously compute here. */
  onSettled?: () => void;
  /** Optional scene strategy, inside the existing drape/HDR/depth-range chain.
   * null selects the centre-sun preview used during motion or point lighting.
   * Return false to use the ordinary single-pass scene renderer.
   */
  renderScene?: (camera: THREE.Camera, round: number | null) => boolean;
  rounds: number;
  /** Effective buffer options may change without replacing the controller. */
  readonly options?: SceneAccumulationOptions;
  /** Maximum offscreen pixels used by each accumulation target. */
  maxRenderTargetPixels?: number;
};

export interface SharedThreeSceneLayer extends CustomLayerInterface {
  addRuntime: (runtime: SharedThreeSceneRuntime) => void;
  removeRuntime: (runtimeId: string) => void;
  hasRuntime: (runtimeId: string) => boolean;
  getScene: () => THREE.Scene;
  /** Runtimes currently attached to the shared scene, including local terrain. */
  getRuntimes: () => readonly SharedThreeSceneRuntime[];
  /** Renderer owned by the mounted MapLibre custom layer, if it is active. */
  getRenderer: () => THREE.WebGLRenderer | null;
  /** Optional synchronous GPU work outside a map frame; false means unsupported. */
  runIdleRender?: (render: () => void) => boolean;
  /**
   * Progressive refinement at rest: while the controller reports itself
   * active and its epoch and the camera hold still, the layer renders one
   * jittered round per frame into an accumulation buffer and composites the
   * running average; after the configured rounds, frames become a blit.
   * Pass null to return to direct rendering.
   */
  setAccumulationController: (
    controller: SharedSceneAccumulationController | null
  ) => void;
  /** Enable capture and projection of the preceding MapLibre style pass. */
  setMapStyleProjectionVisible?: (visible: boolean) => void;
  /** Diagnostics: what the map-style projection did in the last frame. */
  getMapStyleProjectionState?: () => MapStyleProjectionState;
  projectLngLatToScene: (
    lngLat: [number, number],
    altitudeMeters?: number,
    target?: THREE.Vector3
  ) => THREE.Vector3 | null;
  /** Inverse of projectLngLatToScene for a shared-scene world position. */
  projectSceneToLngLat: (
    position: THREE.Vector3 | readonly [number, number, number]
  ) => [longitude: number, latitude: number] | null;
  /** Detach the custom layer without destroying runtimes preserved across HMR. */
  detach: () => void;
  dispose: () => void;
}

export interface SharedThreeSceneLayerOptions {
  ambientLightIntensity?: number;
}

type DepthRange = readonly [near: number, far: number];

type RenderTargetDepthRangeBridge = {
  render: (depthRange: DepthRange, callback: () => void) => void;
  dispose: () => void;
};

type SharedCanvasViewportRenderer = Pick<THREE.WebGLRenderer, "setViewport">;

type MapStyleProjectionUniforms = Readonly<{
  texture: { value: THREE.Texture | null };
  sceneToClip: { value: THREE.Matrix4 };
  enabled: { value: number };
  /** MapLibre's packed terrain depth of the same frame, for overlay occlusion. */
  depthTexture: { value: THREE.Texture | null };
  depthEnabled: { value: number };
  /** Near and far plane of the MapLibre camera that wrote that depth. */
  depthNearFar: { value: THREE.Vector2 };
  texelSize: { value: THREE.Vector2 };
}>;

/**
 * The internal pieces of MapLibre's terrain that hold the DEM depth pass:
 * `Terrain.getFramebuffer("depth")` renders the DEM with `terrainDepth`, which
 * packs `gl_Position.z / gl_Position.w` into RGBA8 (see terrain_depth.fragment).
 */
type MapLibreTerrainDepthHost = {
  terrain?: {
    _fboDepthTexture?: { texture?: WebGLTexture | null } | null;
  } | null;
  transform?: { nearZ?: number; farZ?: number };
};

export type MapStyleProjectionBlend = "replace" | "overlay";

export type MapStyleProjectionState = Readonly<{
  visible: boolean;
  enabled: boolean;
  depthEnabled: boolean;
  depthNearFar: readonly [number, number];
  receivers: Readonly<Record<string, boolean>>;
  frames: number;
  captures: number;
  captureReuses: number;
}>;

type MapStyleProjectionMaterialState = {
  uniforms: MapStyleProjectionUniforms;
  blend: MapStyleProjectionBlend;
};

const MAP_STYLE_PROJECTION_STATE = "carmaMapStyleProjectionState";
const MAP_STYLE_PROJECTION_SHADER_KEY = "|carma-map-style-projection-v5";
const MAP_STYLE_PROJECTION_OVERLAY_DEFINE = "CARMA_MAP_STYLE_OVERLAY";

const MAP_STYLE_PROJECTION_VERTEX_HEADER = /* glsl */ `
uniform mat4 carmaMapStyleSceneToClip;
varying vec4 vCarmaMapStyleClip;
`;

const MAP_STYLE_PROJECTION_VERTEX_BODY = /* glsl */ `
#include <project_vertex>
vCarmaMapStyleClip = carmaMapStyleSceneToClip * modelMatrix * vec4( transformed, 1.0 );
`;

const MAP_STYLE_PROJECTION_FRAGMENT_HEADER = /* glsl */ `
uniform sampler2D carmaMapStyleTexture;
uniform float carmaMapStyleEnabled;
uniform sampler2D carmaMapStyleDepthTexture;
uniform float carmaMapStyleDepthEnabled;
uniform vec2 carmaMapStyleDepthNearFar;
uniform vec2 carmaMapStyleTexelSize;
varying vec4 vCarmaMapStyleClip;
#ifdef CARMA_MAP_STYLE_OVERLAY
// Draped label picked up in map_fragment, composited after lighting.
float carmaMapStyleLabelCoverage = 0.0;
vec3 carmaMapStyleLabelColor = vec3( 0.0 );
#endif

// MapLibre packs the DEM depth (clip z / w) into RGBA8, see terrain_depth.fragment.
float carmaMapStyleUnpackDepth( vec4 packed ) {
  return dot( packed, vec4( 1.0 / 16777216.0, 1.0 / 65536.0, 1.0 / 256.0, 1.0 ) );
}

float carmaMapStyleLinearDepth( float ndcZ ) {
  float near = carmaMapStyleDepthNearFar.x;
  float far = carmaMapStyleDepthNearFar.y;
  return 2.0 * near * far / ( far + near - ndcZ * ( far - near ) );
}

bool carmaMapStyleMatchesReceiver( vec2 uv ) {
  if ( carmaMapStyleDepthEnabled < 0.5 ) return true;
  float groundZ = carmaMapStyleUnpackDepth( texture2D( carmaMapStyleDepthTexture, uv ) );
  if ( groundZ <= 0.0 ) return false;
#ifndef CARMA_MAP_STYLE_OVERLAY
  // Terrain owns the visible surface; MapLibre only supplies its color.
  // Its independent DEM tessellation/depth must not mask that color where
  // Three uses another LOD or DSM. Keep depth-less capture gap repair below,
  // but reserve surface-depth matching for labels projected onto meshes.
  return true;
#else
  float fragmentZ = vCarmaMapStyleClip.z / vCarmaMapStyleClip.w;
  float groundDistance = carmaMapStyleLinearDepth( groundZ );
  float fragmentDistance = carmaMapStyleLinearDepth( fragmentZ );
  float tolerance = max( 2.0, 0.005 * groundDistance );
  return abs( fragmentDistance - groundDistance ) <= tolerance;
#endif
}

vec4 carmaMapStyleSampleGround( vec2 uv ) {
  vec4 sampleColor = texture2D( carmaMapStyleTexture, uv );
  if ( carmaMapStyleMatchesReceiver( uv ) ) return sampleColor;

  // MapLibre terrain without skirts can leave a one-to-few-pixel gap between
  // independently tessellated DEM tiles. Fill only those depth-less pixels
  // from the nearest ground sample so the captured style cannot paint the
  // framebuffer background as a dark seam onto the continuous Three terrain.
  vec2 texel = carmaMapStyleTexelSize;
  vec2 offsets[16];
  offsets[0] = vec2( 2.0, 0.0 );
  offsets[1] = vec2( -2.0, 0.0 );
  offsets[2] = vec2( 0.0, 2.0 );
  offsets[3] = vec2( 0.0, -2.0 );
  offsets[4] = vec2( 2.0, 2.0 );
  offsets[5] = vec2( -2.0, 2.0 );
  offsets[6] = vec2( 2.0, -2.0 );
  offsets[7] = vec2( -2.0, -2.0 );
  offsets[8] = vec2( 8.0, 0.0 );
  offsets[9] = vec2( -8.0, 0.0 );
  offsets[10] = vec2( 0.0, 8.0 );
  offsets[11] = vec2( 0.0, -8.0 );
  offsets[12] = vec2( 8.0, 8.0 );
  offsets[13] = vec2( -8.0, 8.0 );
  offsets[14] = vec2( 8.0, -8.0 );
  offsets[15] = vec2( -8.0, -8.0 );
  for ( int index = 0; index < 16; index++ ) {
    vec2 candidateUv = clamp( uv + offsets[index] * texel, vec2( 0.0 ), vec2( 1.0 ) );
    if ( carmaMapStyleMatchesReceiver( candidateUv ) ) {
      return texture2D( carmaMapStyleTexture, candidateUv );
    }
  }
  return vec4( 0.0 );
}

// The screen projection paints every surface along the view ray. A label
// drawn on the DEM ground belongs only to mesh surfaces at that ground: a
// roof or facade nearer to the camera than the DEM at the same pixel stays
// clean, so the label reads as baked on the street and occluded by buildings.
bool carmaMapStyleOccludedByMesh( vec2 uv ) {
  if ( carmaMapStyleDepthEnabled < 0.5 ) return false;
  float groundZ = carmaMapStyleUnpackDepth( texture2D( carmaMapStyleDepthTexture, uv ) );
  if ( groundZ <= 0.0 ) return false;
  float fragmentZ = vCarmaMapStyleClip.z / vCarmaMapStyleClip.w;
  float groundDistance = carmaMapStyleLinearDepth( groundZ );
  float fragmentDistance = carmaMapStyleLinearDepth( fragmentZ );
  float tolerance = max( 1.5, 0.02 * groundDistance );
  return fragmentDistance < groundDistance - tolerance;
}

vec3 carmaMapStyleSRGBToLinear( vec3 value ) {
  return mix(
    pow( value * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ),
    value * 0.0773993808,
    vec3( lessThanEqual( value, vec3( 0.04045 ) ) )
  );
}
`;

const MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT = /* glsl */ `
#ifdef CARMA_MAP_STYLE_OVERLAY
if ( carmaMapStyleLabelCoverage > 0.0 ) {
  // Keep the surface's own light and shadow ratio (how much brighter or
  // darker lighting made the albedo) and apply it to the label color, so
  // the text stays the sun color in the light and darkens in shadow
  // without blowing out.
  const vec3 carmaLuma = vec3( 0.2126, 0.7152, 0.0722 );
  float carmaAlbedo = max( dot( diffuseColor.rgb, carmaLuma ), 1e-3 );
  float carmaLit = dot( outgoingLight, carmaLuma );
  float carmaShade = clamp( carmaLit / carmaAlbedo, 0.35, 1.0 );
  outgoingLight = mix(
    outgoingLight,
    carmaMapStyleLabelColor * carmaShade,
    carmaMapStyleLabelCoverage
  );
}
#endif
#include <opaque_fragment>
`;

const MAP_STYLE_PROJECTION_FRAGMENT_BODY = /* glsl */ `
#include <map_fragment>
if ( carmaMapStyleEnabled > 0.5 && vCarmaMapStyleClip.w > 0.0 ) {
  vec2 carmaMapStyleUv = vCarmaMapStyleClip.xy / vCarmaMapStyleClip.w * 0.5 + 0.5;
  if (
    all( greaterThanEqual( carmaMapStyleUv, vec2( 0.0 ) ) ) &&
    all( lessThanEqual( carmaMapStyleUv, vec2( 1.0 ) ) )
  ) {
    vec4 carmaMapStyleSample = carmaMapStyleSampleGround( carmaMapStyleUv );
#ifdef CARMA_MAP_STYLE_OVERLAY
    // MapLibre leaves premultiplied color in the framebuffer. Straighten it,
    // linearize and composite it over the receiver's own texture so a
    // label-only capture keeps the mesh texture visible in between.
    if ( carmaMapStyleSample.a > 0.0 && !carmaMapStyleOccludedByMesh( carmaMapStyleUv ) ) {
      vec3 carmaMapStyleStraight = carmaMapStyleSRGBToLinear(
        clamp( carmaMapStyleSample.rgb / carmaMapStyleSample.a, 0.0, 1.0 )
      );
      // Glyph and halo bodies land at full coverage; only the antialiased
      // rim keeps a partial blend, so the draped text reads solid. The color
      // is applied after lighting (see the opaque stage below): fed in as
      // albedo it would clip to white under direct sun.
      carmaMapStyleLabelCoverage = smoothstep( 0.15, 0.55, carmaMapStyleSample.a );
      carmaMapStyleLabelColor = carmaMapStyleStraight;
    }
#else
    if ( carmaMapStyleSample.a > 0.0 ) {
      diffuseColor.rgb = carmaMapStyleSRGBToLinear(
        carmaMapStyleSample.rgb
      );
      diffuseColor.a = 1.0;
    }
#endif
  }
}
`;

/**
 * Add a stable screen projection of MapLibre's preceding ground pass to a
 * terrain material. The projected color enters before Lambert lighting, so
 * terrain and the style draped onto it receive the same Three.js shadows.
 */
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

type OverlayDepthContext = Pick<
  WebGLRenderingContext,
  "DEPTH_BUFFER_BIT" | "clear" | "clearDepth" | "depthMask" | "depthRange"
>;

type GroundClearContext = OverlayDepthContext &
  Pick<
    WebGLRenderingContext,
    "COLOR_BUFFER_BIT" | "COLOR_CLEAR_VALUE" | "clearColor" | "getParameter"
  >;

/** Clear the shared framebuffer depth without disturbing MapLibre's range. */
const clearSharedDepthBuffer = (
  gl: OverlayDepthContext,
  mapLibreDepthRange: DepthRange
): void => {
  gl.depthMask(true);
  gl.depthRange(0, 1);
  gl.clearDepth(1);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.depthRange(mapLibreDepthRange[0], mapLibreDepthRange[1]);
};

/**
 * Remove MapLibre's captured ground pass from the shared framebuffer before
 * Three draws the actual terrain. The color remains available through the
 * framebuffer texture, but MapLibre's flat fill, DEM surface and skirts must
 * not survive as a second visible ground surface.
 */
export const clearMapStyleGroundBeforeThreeTerrain = (
  gl: GroundClearContext,
  mapLibreDepthRange: DepthRange
): void => {
  const clearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;
  gl.depthMask(true);
  gl.depthRange(0, 1);
  gl.clearDepth(1);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
  gl.depthRange(mapLibreDepthRange[0], mapLibreDepthRange[1]);
};

/** Let the explicitly retained place-label layers render above Three. */
export const clearDepthForMapStyleOverlays = clearSharedDepthBuffer;

/**
 * Give the render camera the real local-scene pose while retaining MapLibre's
 * exact scene-to-clip transform.
 *
 * MapLibre supplies the complete scene-to-clip matrix, whereas Three expects
 * separate projection and view matrices. Compensating the projection by the
 * camera world matrix keeps `projection * view` unchanged and makes Three's
 * view-space shader inputs describe the synthesized map camera correctly.
 */
export const configureSharedRenderCamera = (
  renderCamera: THREE.PerspectiveCamera,
  lodCamera: THREE.PerspectiveCamera,
  sceneToClipMatrix: THREE.Matrix4
): void => {
  renderCamera.position.copy(lodCamera.position);
  renderCamera.quaternion.copy(lodCamera.quaternion);
  renderCamera.scale.copy(lodCamera.scale);
  renderCamera.up.copy(lodCamera.up);
  renderCamera.fov = lodCamera.fov;
  renderCamera.aspect = lodCamera.aspect;
  renderCamera.near = lodCamera.near;
  renderCamera.far = lodCamera.far;
  renderCamera.zoom = lodCamera.zoom;
  renderCamera.focus = lodCamera.focus;
  renderCamera.filmGauge = lodCamera.filmGauge;
  renderCamera.filmOffset = lodCamera.filmOffset;
  renderCamera.matrix.copy(lodCamera.matrix);
  renderCamera.matrixWorld.copy(lodCamera.matrixWorld);
  renderCamera.matrixWorldInverse.copy(lodCamera.matrixWorldInverse);
  renderCamera.projectionMatrix
    .copy(sceneToClipMatrix)
    .multiply(renderCamera.matrixWorld);
  renderCamera.projectionMatrixInverse
    .copy(renderCamera.projectionMatrix)
    .invert();
};

/**
 * Keep Three's main-framebuffer viewport in sync with the canvas MapLibre owns.
 *
 * WebGLRenderer snapshots the canvas dimensions when it is constructed. A
 * later MapLibre resize changes the shared canvas drawing buffer without
 * updating Three's private main viewport. After rendering a shadow map, Three
 * would therefore restore that stale viewport and stretch or clip the scene.
 * Updating only the viewport avoids calling `setSize`, which would write back
 * to a canvas whose size lifecycle belongs to MapLibre.
 */
export const syncSharedCanvasViewport = (
  renderer: SharedCanvasViewportRenderer,
  canvas: Pick<HTMLCanvasElement, "width" | "height">,
  viewport: THREE.Vector2
): void => {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  if (viewport.x === width && viewport.y === height) return;
  viewport.set(width, height);
  renderer.setViewport(0, 0, width, height);
};

/**
 * Three.js does not track `gl.depthRange`. MapLibre intentionally compresses
 * the main 3D depth range to leave room for later style layers, but that range
 * must not leak into Three's offscreen shadow maps: their lookup coordinates
 * are always normalized to [0, 1]. Route offscreen targets to the canonical
 * range while preserving MapLibre's range for the shared main framebuffer.
 */
export const installRenderTargetDepthRangeBridge = (
  renderer: Pick<THREE.WebGLRenderer, "setRenderTarget">,
  gl: Pick<
    WebGLRenderingContext,
    | "depthRange"
    | "getParameter"
    | "bindFramebuffer"
    | "FRAMEBUFFER"
    | "FRAMEBUFFER_BINDING"
  >
): RenderTargetDepthRangeBridge => {
  const originalSetRenderTarget = renderer.setRenderTarget;
  let activeDepthRange: DepthRange | null = null;

  renderer.setRenderTarget = function (...args) {
    originalSetRenderTarget.apply(renderer, args);
    if (!activeDepthRange) return;
    if (args[0] === null) {
      gl.depthRange(activeDepthRange[0], activeDepthRange[1]);
    } else {
      gl.depthRange(0, 1);
    }
  };

  return {
    render(depthRange, callback) {
      // MapLibre may render custom layers into an internal framebuffer. Three
      // does not know about it and setRenderTarget(null) binds the browser's
      // default framebuffer after an offscreen shadow/accumulation pass.
      const hostFramebuffer = gl.getParameter(
        gl.FRAMEBUFFER_BINDING
      ) as WebGLFramebuffer | null;
      activeDepthRange = depthRange;
      try {
        callback();
      } finally {
        activeDepthRange = null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, hostFramebuffer);
        gl.depthRange(depthRange[0], depthRange[1]);
      }
    },
    dispose() {
      activeDepthRange = null;
      renderer.setRenderTarget = originalSetRenderTarget;
    },
  };
};

const rotationX = new THREE.Matrix4().makeRotationAxis(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2
);

/**
 * One MapLibre custom layer and one Three.js scene for all streamed point and
 * mesh content. Opaque meshes and transparent splats therefore share Three's
 * render ordering and MapLibre's existing depth buffer in a single draw.
 */
export const buildSharedThreeSceneLayer = (
  layerId: string,
  options: SharedThreeSceneLayerOptions = {}
): SharedThreeSceneLayer => {
  const scene = new THREE.Scene();
  scene.add(
    new THREE.AmbientLight(0xffffff, options.ambientLightIntensity ?? 2.4)
  );
  const renderCamera = new THREE.PerspectiveCamera();
  const lodCamera = new THREE.PerspectiveCamera();
  let accumulationController: SharedSceneAccumulationController | null = null;
  let accumulator: SharedSceneAccumulator | null = null;
  let accumulatorConfigurationKey = "";
  let settledAccumulatorVisualKey = "";
  const viewport = new THREE.Vector2(1, 1);
  const lookTarget = new THREE.Vector3();
  const mapStyleProjectionUniforms: MapStyleProjectionUniforms = {
    texture: { value: null },
    sceneToClip: { value: new THREE.Matrix4() },
    enabled: { value: 0 },
    depthTexture: { value: null },
    depthEnabled: { value: 0 },
    depthNearFar: { value: new THREE.Vector2(1, 1000) },
    texelSize: { value: new THREE.Vector2(1, 1) },
  };
  let mapStyleFramebufferTexture: THREE.FramebufferTexture | null = null;
  const capturedMapStyleMatrix = new THREE.Matrix4();
  let mapStyleFramebufferCache: ReturnType<
    typeof createMapStyleFramebufferCache
  > | null = null;
  // A Three texture handle that borrows MapLibre's terrain depth WebGLTexture
  // for the frame instead of copying it.
  let mapStyleDepthTexture: THREE.Texture | null = null;
  let mapStyleDepthGlTexture: WebGLTexture | null = null;
  const mapStyleProjectionVersions = new Map<string, number>();
  const mapStyleProjectionReceivers = new Map<string, boolean>();
  const runtimes = new Map<string, SharedThreeSceneRuntime>();
  let runtimeUpdateOrder: SharedThreeSceneRuntime[] = [];
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let depthRangeBridge: RenderTargetDepthRangeBridge | null = null;
  let originMerc: MercatorCoordinate | null = null;
  let meterScale = 0;
  let mapStyleProjectionVisible = true;
  let mapStyleProjectionEpoch = 0;
  let capturedMapStyleRevision = -1;
  let renderedFrames = 0;
  let disposed = false;

  const placeRuntime = (runtime: SharedThreeSceneRuntime) => {
    if (!originMerc || meterScale <= 0) return;
    const runtimeOrigin = MercatorCoordinate.fromLngLat(
      runtime.originLngLat,
      0
    );
    const runtimeScale = runtimeOrigin.meterInMercatorCoordinateUnits();
    runtime.root.position.set(
      (runtimeOrigin.x - originMerc.x) / meterScale,
      (runtimeOrigin.z - originMerc.z) / meterScale,
      (runtimeOrigin.y - originMerc.y) / meterScale
    );
    runtime.root.scale.setScalar(runtimeScale / meterScale);
    runtime.root.updateMatrixWorld(true);
  };

  const configureMapStyleProjection = (): boolean => {
    for (const runtime of runtimes.values()) {
      const receiver = runtime.receivesMapStyleTexture;
      if (!receiver) continue;
      const version = runtime.mapStyleProjectionVersion?.() ?? 0;
      if (mapStyleProjectionVersions.get(runtime.id) === version) continue;
      let configured = false;
      runtime.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          if (typeof receiver === "function" && !receiver(material)) continue;
          configureMapStyleProjectedMaterial(
            material,
            mapStyleProjectionUniforms,
            runtime.mapStyleProjectionBlend ?? "replace"
          );
          configured = true;
        }
      });
      mapStyleProjectionVersions.set(runtime.id, version);
      mapStyleProjectionReceivers.set(runtime.id, configured);
    }
    return [...mapStyleProjectionReceivers.values()].some(Boolean);
  };

  const captureMapStyleFramebuffer = () => {
    if (!renderer || viewport.x < 1 || viewport.y < 1) return;
    const width = Math.floor(viewport.x);
    const height = Math.floor(viewport.y);
    const needsResize =
      !mapStyleFramebufferTexture ||
      mapStyleFramebufferTexture.image.width !== width ||
      mapStyleFramebufferTexture.image.height !== height;
    const texture = needsResize
      ? new THREE.FramebufferTexture(width, height)
      : mapStyleFramebufferTexture!;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    try {
      renderer.copyFramebufferToTexture(texture);
    } catch (error) {
      if (needsResize) texture.dispose();
      throw error;
    }
    // Publish a resized capture only after copying succeeds. A transient failure
    // must not dispose the last usable map and expose the plain terrain albedo.
    if (needsResize) mapStyleFramebufferTexture?.dispose();
    mapStyleFramebufferTexture = texture;
    mapStyleProjectionUniforms.texture.value = texture;
    mapStyleProjectionUniforms.texelSize.value.set(1 / width, 1 / height);
    capturedMapStyleMatrix.copy(mapStyleProjectionUniforms.sceneToClip.value);
    mapStyleProjectionUniforms.enabled.value = 1;
  };

  /**
   * Borrow MapLibre's terrain depth pass of this frame. It is re-rendered
   * whenever the camera moves or terrain tiles arrive, so it describes the
   * same DEM ground that the captured labels were drawn on.
   */
  const bindMapStyleDepth = () => {
    const host = map as unknown as MapLibreTerrainDepthHost | null;
    const glTexture = host?.terrain?._fboDepthTexture?.texture ?? null;
    const near = host?.transform?.nearZ;
    const far = host?.transform?.farZ;
    if (
      !renderer ||
      !glTexture ||
      typeof near !== "number" ||
      typeof far !== "number" ||
      !(far > near && near > 0)
    ) {
      mapStyleProjectionUniforms.depthEnabled.value = 0;
      return;
    }
    if (!mapStyleDepthTexture) {
      mapStyleDepthTexture = new THREE.Texture();
      mapStyleDepthTexture.minFilter = THREE.NearestFilter;
      mapStyleDepthTexture.magFilter = THREE.NearestFilter;
      mapStyleDepthTexture.generateMipmaps = false;
      mapStyleDepthTexture.flipY = false;
      mapStyleProjectionUniforms.depthTexture.value = mapStyleDepthTexture;
    }
    if (mapStyleDepthGlTexture !== glTexture) {
      mapStyleFramebufferCache?.invalidate();
      mapStyleDepthGlTexture = glTexture;
      const properties = renderer.properties.get(mapStyleDepthTexture) as {
        __webglTexture?: WebGLTexture;
        __webglInit?: boolean;
        __version?: number;
      };
      properties.__webglTexture = glTexture;
      properties.__webglInit = true;
      properties.__version = mapStyleDepthTexture.version;
    }
    mapStyleProjectionUniforms.depthNearFar.value.set(near, far);
    mapStyleProjectionUniforms.depthEnabled.value = 1;
  };

  const releaseMapStyleDepth = () => {
    if (mapStyleDepthTexture && renderer) {
      // The WebGLTexture belongs to MapLibre; drop the handle without
      // letting Three delete it.
      const properties = renderer.properties.get(mapStyleDepthTexture) as {
        __webglTexture?: WebGLTexture;
      };
      delete properties.__webglTexture;
      renderer.properties.remove(mapStyleDepthTexture);
    }
    mapStyleDepthTexture = null;
    mapStyleDepthGlTexture = null;
    mapStyleProjectionUniforms.depthTexture.value = null;
    mapStyleProjectionUniforms.depthEnabled.value = 0;
  };

  const layer: SharedThreeSceneLayer = {
    id: layerId,
    type: "custom",
    renderingMode: "3d",

    addRuntime(runtime) {
      if (disposed) return;
      const existing = runtimes.get(runtime.id);
      if (existing === runtime) return;
      if (existing) layer.removeRuntime(existing.id);
      runtimes.set(runtime.id, runtime);
      mapStyleProjectionVersions.delete(runtime.id);
      mapStyleProjectionReceivers.delete(runtime.id);
      runtimeUpdateOrder = [...runtimes.values()].sort(
        (a, b) => (b.updatePriority ?? 0) - (a.updatePriority ?? 0)
      );
      scene.add(runtime.root);
      placeRuntime(runtime);
      if (map) runtime.onAdd?.(map);
      map?.triggerRepaint();
    },

    removeRuntime(runtimeId) {
      const runtime = runtimes.get(runtimeId);
      if (!runtime) return;
      runtimes.delete(runtimeId);
      mapStyleProjectionVersions.delete(runtimeId);
      mapStyleProjectionReceivers.delete(runtimeId);
      runtimeUpdateOrder = runtimeUpdateOrder.filter(
        (candidate) => candidate !== runtime
      );
      scene.remove(runtime.root);
      runtime.dispose();
      map?.triggerRepaint();
    },

    hasRuntime(runtimeId) {
      return runtimes.has(runtimeId);
    },

    getScene() {
      return scene;
    },

    getRuntimes() {
      return [...runtimes.values()];
    },

    getRenderer() {
      return renderer;
    },
    runIdleRender(render) {
      return renderer !== null && runMapLibreIdleRender(map, render);
    },

    setAccumulationController(controller) {
      if (map)
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          controller ? 0 : 1
        );
      if (map && !controller) setSharedThreeShadedPresentation(map, false);
      accumulationController = controller;
      if (renderer) {
        renderer.toneMapping = controller
          ? THREE.AgXToneMapping
          : THREE.NoToneMapping;
      }
      if (!controller) {
        accumulator?.dispose();
        accumulator = null;
      }
    },

    getMapStyleProjectionState() {
      return {
        visible: mapStyleProjectionVisible,
        enabled: mapStyleProjectionUniforms.enabled.value === 1,
        depthEnabled: mapStyleProjectionUniforms.depthEnabled.value === 1,
        depthNearFar: [
          mapStyleProjectionUniforms.depthNearFar.value.x,
          mapStyleProjectionUniforms.depthNearFar.value.y,
        ],
        receivers: Object.fromEntries(mapStyleProjectionReceivers),
        frames: renderedFrames,
        captures: mapStyleFramebufferCache?.stats.captures ?? 0,
        captureReuses: mapStyleFramebufferCache?.stats.reuses ?? 0,
      };
    },

    setMapStyleProjectionVisible(visible) {
      if (mapStyleProjectionVisible === visible) return;
      mapStyleProjectionVisible = visible;
      mapStyleProjectionEpoch += 1;
      mapStyleFramebufferCache?.invalidate();
      if (!visible) mapStyleProjectionUniforms.enabled.value = 0;
      map?.triggerRepaint();
    },

    projectLngLatToScene(
      lngLat,
      altitudeMeters = 0,
      target = new THREE.Vector3()
    ) {
      if (!originMerc || meterScale <= 0) return null;
      const coordinate = MercatorCoordinate.fromLngLat(lngLat, altitudeMeters);
      return target.set(
        (coordinate.x - originMerc.x) / meterScale,
        (coordinate.z - originMerc.z) / meterScale,
        (coordinate.y - originMerc.y) / meterScale
      );
    },

    projectSceneToLngLat(position) {
      if (!originMerc || meterScale <= 0) return null;
      const [x, y, z] =
        position instanceof THREE.Vector3
          ? [position.x, position.y, position.z]
          : position;
      const coordinate = new MercatorCoordinate(
        originMerc.x + x * meterScale,
        originMerc.y + z * meterScale,
        originMerc.z + y * meterScale
      );
      const lngLat = coordinate.toLngLat();
      return [lngLat.lng, lngLat.lat];
    },

    detach() {
      if (map)
        publishMapLoadingProgress(map, MAP_LOADING_PHASE.SHADOW, layerId, 1);
      mapStyleFramebufferCache?.dispose();
      mapStyleFramebufferCache = null;
      for (const runtime of runtimes.values()) scene.remove(runtime.root);
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
      releaseMapStyleDepth();
      renderer?.dispose();
      renderer = null;
      mapStyleFramebufferTexture?.dispose();
      mapStyleFramebufferTexture = null;
      mapStyleProjectionUniforms.texture.value = null;
      mapStyleProjectionUniforms.enabled.value = 0;
      mapStyleProjectionVersions.clear();
      mapStyleProjectionReceivers.clear();
      map = null;
      originMerc = null;
      meterScale = 0;
    },

    onAdd(mapInstance, gl) {
      map = mapInstance;
      mapStyleFramebufferCache?.dispose();
      mapStyleFramebufferCache = createMapStyleFramebufferCache(
        mapInstance,
        layerId
      );
      capturedMapStyleRevision = -1;
      mapStyleProjectionEpoch += 1;
      const center = mapInstance.getCenter();
      originMerc = MercatorCoordinate.fromLngLat([center.lng, center.lat], 0);
      meterScale = originMerc.meterInMercatorCoordinateUnits();
      renderer = new THREE.WebGLRenderer({
        canvas: mapInstance.getCanvas(),
        context: gl,
      });
      depthRangeBridge = installRenderTargetDepthRangeBridge(renderer, gl);
      renderer.autoClear = false;
      // Direct/point-sun frames and the final HDR accumulation use the same
      // display transform. Ordinary unshaded tiles retain their original look.
      renderer.toneMapping = accumulationController
        ? THREE.AgXToneMapping
        : THREE.NoToneMapping;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      for (const runtime of runtimes.values()) {
        if (runtime.root.parent !== scene) scene.add(runtime.root);
        placeRuntime(runtime);
        runtime.onAdd?.(mapInstance);
      }
    },

    render(gl, options: CustomRenderMethodInput) {
      if (!map || !renderer || !originMerc || meterScale <= 0) return;
      renderedFrames += 1;

      const mainMatrix = new THREE.Matrix4().fromArray(
        options.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const localFromScene = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);
      const sceneToClipMatrix = mainMatrix.multiply(localFromScene);

      syncSharedCanvasViewport(renderer, map.getCanvas(), viewport);
      // Same pose the MapLibre 3D Tiles layer works out for itself, so it
      // lives in the engine rather than here, see synthesizeLodCamera.
      const centerLngLat = map.getCenter();
      const mapLibreTerrainElevation = map.getTerrain()
        ? map.queryTerrainElevation(centerLngLat) ??
          map.getCameraTargetElevation()
        : 0;
      if (
        !synthesizeLodCamera(
          lodCamera,
          map,
          {
            originMerc,
            meterScale,
            viewport,
            centerElevationMeters: mapLibreTerrainElevation,
          },
          lookTarget
        )
      ) {
        return;
      }
      configureSharedRenderCamera(renderCamera, lodCamera, sceneToClipMatrix);

      const frame: SharedThreeSceneFrame = {
        map,
        renderCamera,
        lodCamera,
        lookTarget,
        viewport,
      };
      scene.updateMatrixWorld(true);
      for (const runtime of runtimeUpdateOrder) {
        runtime.update(frame);
      }
      scene.updateMatrixWorld(true);

      const currentDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      const savedDepthRange: DepthRange = [
        currentDepthRange[0],
        currentDepthRange[1],
      ];
      renderer.resetState();
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
      mapStyleProjectionUniforms.sceneToClip.value.copy(sceneToClipMatrix);
      if (mapStyleProjectionVisible && configureMapStyleProjection()) {
        try {
          bindMapStyleDepth();
          const contentRevision = mapStyleFramebufferCache?.revision ?? 0;
          if (capturedMapStyleRevision !== contentRevision) {
            capturedMapStyleRevision = contentRevision;
            mapStyleProjectionEpoch += 1;
          }
          const captureSignature = [
            viewport.x,
            viewport.y,
            ...sceneToClipMatrix.elements,
            mapStyleProjectionUniforms.depthEnabled.value,
            ...mapStyleProjectionUniforms.depthNearFar.value.toArray(),
          ].join(",");
          const lightingReplay = accumulationController !== null;
          if (
            !mapStyleFramebufferTexture ||
            !mapStyleFramebufferCache?.canReuse(
              captureSignature,
              lightingReplay
            )
          ) {
            captureMapStyleFramebuffer();
            mapStyleFramebufferCache?.captured(captureSignature);
          }
          mapStyleProjectionUniforms.enabled.value = 1;
        } catch (error) {
          mapStyleFramebufferCache?.captureFailed();
          mapStyleProjectionUniforms.enabled.value = mapStyleFramebufferTexture
            ? 1
            : 0;
          mapStyleProjectionUniforms.sceneToClip.value.copy(
            capturedMapStyleMatrix
          );
          // The borrowed depth belongs to this frame, not the retained capture.
          mapStyleProjectionUniforms.depthEnabled.value = 0;
          console.warn("[shared-three-scene] map-style capture failed", error);
          if (!mapStyleFramebufferTexture) return;
        }
      } else {
        mapStyleProjectionUniforms.enabled.value = 0;
      }
      if (
        runtimeUpdateOrder.some(
          (runtime) =>
            runtime.providesTerrain === true ||
            Boolean(runtime.receivesMapStyleTexture)
        )
      ) {
        // The visible ground now belongs to Three. Keep MapLibre's color only
        // in the captured texture; discard its competing fill, DEM and skirts.
        clearMapStyleGroundBeforeThreeTerrain(gl, savedDepthRange);
      }

      const accumulation = accumulationController;
      const renderScene = (round: number | null) => {
        if (!accumulation?.renderScene?.(renderCamera, round)) {
          renderer?.render(scene, renderCamera);
        }
      };
      const poseKey = [
        // A DPR-only resize can keep both camera matrices unchanged. Its old
        // settled color frame must not be stretched to the new native viewport.
        viewport.x,
        viewport.y,
        ...renderCamera.matrixWorld.elements,
        ...renderCamera.projectionMatrix.elements,
      ]
        .map((value) => value.toPrecision(6))
        .join(",");
      const visualKey = accumulation
        ? `${accumulation.visualEpoch()}|${mapStyleProjectionEpoch}|${poseKey}`
        : "";
      const nextAccumulatorConfigurationKey = accumulation
        ? `${accumulation.rounds}|${
            accumulation.options?.format ??
            DEFAULT_SCENE_ACCUMULATION_OPTIONS.format
          }|${
            accumulation.options?.msaaSamples ??
            DEFAULT_SCENE_ACCUMULATION_OPTIONS.msaaSamples
          }`
        : "";
      const progressiveResult: {
        value: ReturnType<
          NonNullable<SharedSceneAccumulationController["renderProgressive"]>
        >;
      } = { value: null };
      if (accumulation?.renderProgressive && renderer) {
        depthRangeBridge?.render(savedDepthRange, () => {
          progressiveResult.value =
            accumulation.renderProgressive?.(renderCamera, {
              width: viewport.x,
              height: viewport.y,
              viewKey: poseKey,
              styleEpoch: mapStyleProjectionEpoch,
              active: accumulation.active(),
            }) ?? null;
        });
      }
      const progressive = progressiveResult.value;
      if (
        accumulator &&
        accumulatorConfigurationKey !== nextAccumulatorConfigurationKey
      ) {
        accumulator.dispose();
        accumulator = null;
        settledAccumulatorVisualKey = "";
      }
      if (progressive) {
        // A corridor-owned integration must never also be averaged by the
        // viewport accumulator. Release mono targets when changing strategy.
        accumulator?.dispose();
        accumulator = null;
        accumulatorConfigurationKey = "";
        settledAccumulatorVisualKey = "";
        if (progressive.needsRepaint) map.triggerRepaint();
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          progressive.progress
        );
        if (progressive.settled) accumulation?.onSettled?.();
      } else if (accumulation?.active() && renderer && !accumulator?.broken) {
        if (!accumulator) {
          accumulator = buildSharedSceneAccumulator(
            accumulation.rounds,
            accumulation.options
          );
          accumulatorConfigurationKey = nextAccumulatorConfigurationKey;
        }
        accumulator.ensureState(
          `${accumulation.epoch()}|${mapStyleProjectionEpoch}|${poseKey}`
        );
        const retainSettled =
          accumulator.hasSettledFrame &&
          settledAccumulatorVisualKey === visualKey;
        // MapLibre owns canvas resizes. Three's cached drawing-buffer size
        // stays at construction size because we intentionally never setSize.
        // Use the physical canvas viewport for draped text after resize/DPR moves.
        const accumulationSize = fitRenderTargetSizeToPixelBudget(
          viewport.x,
          viewport.y,
          accumulation.maxRenderTargetPixels ?? Number.POSITIVE_INFINITY
        );
        let becameSettled = false;
        if (!accumulator.converged) {
          const round = accumulator.nextRound;
          accumulation.prepareRound(round);
          // Only sample the light direction. MapLibre's captured color/depth
          // were rendered from this exact camera; keep that registration for
          // every round. The accumulation target supplies geometry MSAA.
          const activeRenderer = renderer;
          try {
            depthRangeBridge?.render(savedDepthRange, () => {
              accumulator?.renderRound(
                activeRenderer,
                accumulationSize.width,
                accumulationSize.height,
                () => renderScene(round)
              );
            });
          } finally {
            accumulation.finishRound?.();
          }
          if (accumulator.converged) {
            settledAccumulatorVisualKey = visualKey;
            becameSettled = true;
          }
        }
        let composited = false;
        depthRangeBridge?.render(savedDepthRange, () => {
          if (renderer) {
            composited =
              accumulator?.composite(renderer, retainSettled, undefined, {
                allowPartial: true,
              }) ?? false;
          }
        });
        if (!composited) {
          depthRangeBridge?.render(savedDepthRange, () => {
            renderScene(null);
          });
        }
        if (!accumulator.converged) map.triggerRepaint();
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          accumulator.converged
            ? 1
            : accumulator.nextRound / Math.max(1, accumulation.rounds)
        );
        if (becameSettled && composited) accumulation.onSettled?.();
      } else {
        const retainSettled =
          accumulation?.retainSettledFrame() === true &&
          accumulator?.hasSettledFrame === true &&
          settledAccumulatorVisualKey === visualKey;
        let composited = false;
        depthRangeBridge?.render(savedDepthRange, () => {
          if (retainSettled && renderer) {
            composited = accumulator?.composite(renderer, true) ?? false;
          }
        });
        if (!composited) {
          depthRangeBridge?.render(savedDepthRange, () => {
            renderScene(null);
          });
        }
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          !accumulator?.broken && accumulation?.pending?.() ? 0 : 1
        );
      }
      clearDepthForMapStyleOverlays(gl, savedDepthRange);
      if (accumulation) setSharedThreeShadedPresentation(map, true);
    },

    onRemove() {
      if (map)
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          1,
          false
        );
      mapStyleFramebufferCache?.dispose();
      mapStyleFramebufferCache = null;
      if (map) setSharedThreeShadedPresentation(map, false);
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
      releaseMapStyleDepth();
      renderer?.dispose();
      renderer = null;
      mapStyleFramebufferTexture?.dispose();
      mapStyleFramebufferTexture = null;
      mapStyleProjectionUniforms.texture.value = null;
      mapStyleProjectionUniforms.enabled.value = 0;
      mapStyleProjectionVersions.clear();
      mapStyleProjectionReceivers.clear();
      map = null;
    },

    dispose() {
      if (disposed) return;
      if (map)
        publishMapLoadingProgress(
          map,
          MAP_LOADING_PHASE.SHADOW,
          layerId,
          1,
          false
        );
      mapStyleFramebufferCache?.dispose();
      mapStyleFramebufferCache = null;
      if (map) setSharedThreeShadedPresentation(map, false);
      disposed = true;
      accumulator?.dispose();
      accumulator = null;
      mapStyleFramebufferTexture?.dispose();
      mapStyleFramebufferTexture = null;
      mapStyleProjectionUniforms.texture.value = null;
      mapStyleProjectionUniforms.enabled.value = 0;
      mapStyleProjectionVersions.clear();
      mapStyleProjectionReceivers.clear();
      for (const runtime of runtimes.values()) runtime.dispose();
      runtimes.clear();
      scene.clear();
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
      renderer?.dispose();
      renderer = null;
      map = null;
    },
  };

  return layer;
};
