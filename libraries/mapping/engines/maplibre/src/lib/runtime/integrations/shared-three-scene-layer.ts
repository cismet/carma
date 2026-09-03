import { synthesizeLodCamera } from "@carma-mapping/engines/threejs";
import { MercatorCoordinate } from "maplibre-gl";
import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  Map as MaplibreMap,
} from "maplibre-gl";
import * as THREE from "three";

import { quantize } from "@carma-commons/math";
import {
  buildSharedSceneAccumulator,
  fitRenderTargetSizeToPixelBudget,
  type SharedSceneAccumulator,
} from "./shared-scene-accumulator";

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
  receivesMapStyleTexture?:
    | boolean
    | ((material: THREE.Material) => boolean);
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
  /** Changes whenever the shadow/lighting state the rounds sample changed. */
  epoch: () => number;
  /** Changes only when an already displayed result is visually obsolete. */
  visualEpoch: () => number;
  /** Whether accumulating is worthwhile right now (soft sun, camera at rest). */
  active: () => boolean;
  /** Whether a settled result may cover a temporary content-loading gap. */
  retainSettledFrame: () => boolean;
  /** Re-aim the scene's lights for the given accumulation round. */
  prepareRound: (round: number) => void;
  /** Restore the non-jittered scene state before drawing the visible frame. */
  finishRound?: () => void;
  rounds: number;
  /** Maximum offscreen pixels used by each accumulation target. */
  maxRenderTargetPixels?: number;
};

export interface SharedThreeSceneLayer extends CustomLayerInterface {
  addRuntime: (runtime: SharedThreeSceneRuntime) => void;
  removeRuntime: (runtimeId: string) => void;
  hasRuntime: (runtimeId: string) => boolean;
  getScene: () => THREE.Scene;
  /** Renderer owned by the mounted MapLibre custom layer, if it is active. */
  getRenderer: () => THREE.WebGLRenderer | null;
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
  projectLngLatToScene: (
    lngLat: [number, number],
    altitudeMeters?: number,
    target?: THREE.Vector3
  ) => THREE.Vector3 | null;
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
}>;

type MapStyleProjectionMaterialState = {
  uniforms: MapStyleProjectionUniforms;
};

const MAP_STYLE_PROJECTION_STATE = "carmaMapStyleProjectionState";
const MAP_STYLE_PROJECTION_SHADER_KEY = "|carma-map-style-projection-v1";

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
varying vec4 vCarmaMapStyleClip;

vec3 carmaMapStyleSRGBToLinear( vec3 value ) {
  return mix(
    pow( value * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ),
    value * 0.0773993808,
    vec3( lessThanEqual( value, vec3( 0.04045 ) ) )
  );
}
`;

const MAP_STYLE_PROJECTION_FRAGMENT_BODY = /* glsl */ `
#include <map_fragment>
if ( carmaMapStyleEnabled > 0.5 && vCarmaMapStyleClip.w > 0.0 ) {
  vec2 carmaMapStyleUv = vCarmaMapStyleClip.xy / vCarmaMapStyleClip.w * 0.5 + 0.5;
  if (
    all( greaterThanEqual( carmaMapStyleUv, vec2( 0.0 ) ) ) &&
    all( lessThanEqual( carmaMapStyleUv, vec2( 1.0 ) ) )
  ) {
    vec4 carmaMapStyleSample = texture2D(
      carmaMapStyleTexture,
      carmaMapStyleUv
    );
    diffuseColor.rgb = carmaMapStyleSRGBToLinear(
      carmaMapStyleSample.rgb
    );
    diffuseColor.a = 1.0;
  }
}
`;

/**
 * Add a stable screen projection of MapLibre's preceding ground pass to a
 * terrain material. The projected color enters before Lambert lighting, so
 * terrain and the style draped onto it receive the same Three.js shadows.
 */
export const configureMapStyleProjectedMaterial = (
  material: THREE.Material,
  uniforms: MapStyleProjectionUniforms
): void => {
  const userData = material.userData as Record<string, unknown>;
  const existing = userData[
    MAP_STYLE_PROJECTION_STATE
  ] as MapStyleProjectionMaterialState | undefined;
  if (existing) {
    if (existing.uniforms !== uniforms) {
      existing.uniforms = uniforms;
      material.needsUpdate = true;
    }
    return;
  }

  const state: MapStyleProjectionMaterialState = { uniforms };
  userData[MAP_STYLE_PROJECTION_STATE] = state;
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  const previousProgramCacheKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms["carmaMapStyleTexture"] = state.uniforms.texture;
    shader.uniforms["carmaMapStyleSceneToClip"] = state.uniforms.sceneToClip;
    shader.uniforms["carmaMapStyleEnabled"] = state.uniforms.enabled;
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
      .replace("#include <map_fragment>", MAP_STYLE_PROJECTION_FRAGMENT_BODY);
  };
  material.customProgramCacheKey = () =>
    `${previousProgramCacheKey()}${MAP_STYLE_PROJECTION_SHADER_KEY}`;
  material.needsUpdate = true;
};

type OverlayDepthContext = Pick<
  WebGLRenderingContext,
  "DEPTH_BUFFER_BIT" | "clear" | "clearDepth" | "depthMask" | "depthRange"
>;

type GroundClearContext = OverlayDepthContext &
  Pick<
    WebGLRenderingContext,
    | "COLOR_BUFFER_BIT"
    | "COLOR_CLEAR_VALUE"
    | "clearColor"
    | "getParameter"
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
  let accumulatorRounds = 0;
  let settledAccumulatorVisualKey = "";
  const jitterMatrix = new THREE.Matrix4();
  const unjitteredProjectionMatrix = new THREE.Matrix4();
  const viewport = new THREE.Vector2(1, 1);
  const lookTarget = new THREE.Vector3();
  const mapStyleProjectionUniforms: MapStyleProjectionUniforms = {
    texture: { value: null },
    sceneToClip: { value: new THREE.Matrix4() },
    enabled: { value: 0 },
  };
  let mapStyleFramebufferTexture: THREE.FramebufferTexture | null = null;
  const mapStyleProjectionVersions = new Map<string, number>();
  const mapStyleProjectionReceivers = new Map<string, boolean>();
  const runtimes = new Map<string, SharedThreeSceneRuntime>();
  let runtimeUpdateOrder: SharedThreeSceneRuntime[] = [];
  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let depthRangeBridge: RenderTargetDepthRangeBridge | null = null;
  let originMerc: MercatorCoordinate | null = null;
  let meterScale = 0;
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
            mapStyleProjectionUniforms
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
    if (
      !mapStyleFramebufferTexture ||
      mapStyleFramebufferTexture.image.width !== width ||
      mapStyleFramebufferTexture.image.height !== height
    ) {
      mapStyleFramebufferTexture?.dispose();
      mapStyleFramebufferTexture = new THREE.FramebufferTexture(width, height);
      mapStyleFramebufferTexture.minFilter = THREE.LinearFilter;
      mapStyleFramebufferTexture.magFilter = THREE.LinearFilter;
      mapStyleProjectionUniforms.texture.value = mapStyleFramebufferTexture;
    }
    renderer.copyFramebufferToTexture(mapStyleFramebufferTexture);
    mapStyleProjectionUniforms.enabled.value = 1;
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

    getRenderer() {
      return renderer;
    },

    setAccumulationController(controller) {
      accumulationController = controller;
      if (!controller) {
        accumulator?.dispose();
        accumulator = null;
      }
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

    detach() {
      for (const runtime of runtimes.values()) scene.remove(runtime.root);
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
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
      const center = mapInstance.getCenter();
      originMerc = MercatorCoordinate.fromLngLat([center.lng, center.lat], 0);
      meterScale = originMerc.meterInMercatorCoordinateUnits();
      renderer = new THREE.WebGLRenderer({
        canvas: mapInstance.getCanvas(),
        context: gl,
      });
      depthRangeBridge = installRenderTargetDepthRangeBridge(renderer, gl);
      renderer.autoClear = false;
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
      if (configureMapStyleProjection()) {
        try {
          captureMapStyleFramebuffer();
        } catch (error) {
          mapStyleProjectionUniforms.enabled.value = 0;
          console.warn("[shared-three-scene] map-style capture failed", error);
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
      const poseKey = [
        ...renderCamera.matrixWorld.elements,
        ...renderCamera.projectionMatrix.elements,
      ]
        .map((value) => value.toPrecision(6))
        .join(",");
      const visualKey = accumulation
        ? `${accumulation.visualEpoch()}|${poseKey}`
        : "";
      if (accumulation?.active() && renderer && !accumulator?.broken) {
        if (accumulator && accumulatorRounds !== accumulation.rounds) {
          accumulator.dispose();
          accumulator = null;
          settledAccumulatorVisualKey = "";
        }
        if (!accumulator) {
          accumulator = buildSharedSceneAccumulator(accumulation.rounds);
          accumulatorRounds = accumulation.rounds;
        }
        accumulator.ensureState(`${accumulation.epoch()}|${poseKey}`);
        const retainSettled =
          accumulator.hasSettledFrame &&
          settledAccumulatorVisualKey === visualKey;
        const drawingBuffer = renderer.getDrawingBufferSize(
          new THREE.Vector2()
        );
        const accumulationSize = fitRenderTargetSizeToPixelBudget(
          drawingBuffer.x,
          drawingBuffer.y,
          accumulation.maxRenderTargetPixels ?? Number.POSITIVE_INFINITY
        );
        if (!accumulator.converged) {
          const round = accumulator.nextRound;
          accumulation.prepareRound(round);
          // Sub-pixel camera jitter per round: with the geometry at rest the
          // average is straight supersampling, which also wins back the
          // antialiasing the offscreen target lacks.
          const jitter = accumulator.jitterFor(round);
          jitterMatrix.makeTranslation(
            (jitter.x * 2) / accumulationSize.width,
            (jitter.y * 2) / accumulationSize.height,
            0
          );
          const activeRenderer = renderer;
          unjitteredProjectionMatrix.copy(renderCamera.projectionMatrix);
          renderCamera.projectionMatrix.premultiply(jitterMatrix);
          renderCamera.projectionMatrixInverse
            .copy(renderCamera.projectionMatrix)
            .invert();
          try {
            depthRangeBridge?.render(savedDepthRange, () => {
              accumulator?.renderRound(
                activeRenderer,
                accumulationSize.width,
                accumulationSize.height,
                () => activeRenderer.render(scene, renderCamera)
              );
            });
          } finally {
            renderCamera.projectionMatrix.copy(unjitteredProjectionMatrix);
            renderCamera.projectionMatrixInverse
              .copy(unjitteredProjectionMatrix)
              .invert();
            accumulation.finishRound?.();
          }
          if (accumulator.converged) {
            settledAccumulatorVisualKey = visualKey;
          }
        }
        let composited = false;
        depthRangeBridge?.render(savedDepthRange, () => {
          if (renderer) {
            composited =
              accumulator?.composite(renderer, retainSettled) ?? false;
          }
        });
        if (!composited) {
          depthRangeBridge?.render(savedDepthRange, () => {
            renderer?.render(scene, renderCamera);
          });
        }
        if (!accumulator.converged) map.triggerRepaint();
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
            renderer?.render(scene, renderCamera);
          });
        }
      }
      clearDepthForMapStyleOverlays(gl, savedDepthRange);
    },

    onRemove() {
      depthRangeBridge?.dispose();
      depthRangeBridge = null;
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
