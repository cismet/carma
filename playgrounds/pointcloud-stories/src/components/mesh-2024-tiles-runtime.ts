import { TilesRenderer } from "3d-tiles-renderer";
import {
  DebugTilesPlugin,
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
  UnloadTilesPlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import {
  abs,
  color,
  dot,
  float,
  fract,
  fwidth,
  materialColor,
  max,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { degToRadNumeric } from "@carma-units";

import {
  getRampTexture,
  type RampName,
} from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";
import { createTilesCameraSet } from "../../../../libraries/mapping/engines/maplibre/src/lib/runtime/integrations/tiles-camera-set";
import {
  createImageDisplayFilter,
  IMAGE_DISPLAY_DEFAULT_EDGE_ENHANCEMENT,
} from "./image-display-filter";

export type Mesh2024Camera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type SceneCamera = Mesh2024Camera;
export type Mesh2024Renderer = {
  readonly domElement: HTMLCanvasElement;
};
export const MESH_APPEARANCE_MODES = ["textured", "clay", "elevation"] as const;
export type Mesh2024AppearanceMode = (typeof MESH_APPEARANCE_MODES)[number];
export const MESH_ELEVATION_COLOR_RAMPS = [
  "viridis",
  "inferno",
  "turbo",
  "spectral",
  "elevation",
  "grayscale",
] as const satisfies readonly RampName[];
export type Mesh2024ElevationColorRamp =
  (typeof MESH_ELEVATION_COLOR_RAMPS)[number];
export type Mesh2024TilesRuntimeOptions = {
  scene: THREE.Scene;
  renderer: Mesh2024Renderer;
  camera: Mesh2024Camera;
  originLngLat: [number, number];
  anchorHeightEllipsoidal: number;
  opacity: number;
  appearance?: Mesh2024AppearanceMode;
  saturation?: number;
  contrast?: number;
  edgeEnhancement?: number;
  elevationMinimum?: number;
  elevationMaximum?: number;
  elevationColorRamp?: Mesh2024ElevationColorRamp;
  errorTarget: number;
  centerQualityBoost: boolean;
  debug: boolean;
  wireframe: boolean;
  tileBounds: boolean;
  requestRender: () => void;
  onModel?: (anchor: THREE.Group, materials: THREE.Material[]) => void;
};

export const MESH_MINIMUM_ERROR_TARGET_PIXELS = 0.05;
export const MESH_MAXIMUM_ERROR_TARGET_PIXELS = 16;
export const MESH_DEFAULT_ERROR_TARGET_PIXELS = 0.5;
export const MESH_DEFAULT_APPEARANCE: Mesh2024AppearanceMode = "textured";
export const MESH_DEFAULT_SATURATION = 1;
export const MESH_DEFAULT_CONTRAST = 1;
export const MESH_ELEVATION_RANGE_MINIMUM_METERS = 50;
export const MESH_ELEVATION_RANGE_MAXIMUM_METERS = 500;
export const MESH_DEFAULT_ELEVATION_MINIMUM_METERS = 150;
export const MESH_DEFAULT_ELEVATION_MAXIMUM_METERS = 220;
export const MESH_DEFAULT_ELEVATION_COLOR_RAMP: Mesh2024ElevationColorRamp =
  "viridis";
const MESH_CLAY_COLOR = 0xb9b2a7;
const MESH_COVERAGE_ERROR_TARGET_PIXELS = 64;
const MESH_REFINEMENT_FACTOR = 2;
/** Delay between refinement steps; short enough to feel responsive. */
const MESH_REFINEMENT_STEP_MILLISECONDS = 70;
/** Periodic recovery so a stalled or budget-capped refinement resumes. */
const MESH_REFINEMENT_WATCHDOG_MILLISECONDS = 1_500;
const MESH_MINIMUM_CACHE_BYTES = 192 * 1024 ** 2;
const MESH_INITIAL_MAXIMUM_CACHE_BYTES = 768 * 1024 ** 2;
const MESH_MAXIMUM_CACHE_BYTES = 1_536 * 1024 ** 2;
// A low retention floor is what lets the LRU actually reclaim tiles that
// left the frustum; a high floor keeps stale out-of-view tiles resident and
// starves the visible view of budget. Visible tiles are marked used every
// traversal, so they are never the ones evicted.
const MESH_MINIMUM_CACHE_ENTRIES = 192;
const MESH_MAXIMUM_CACHE_ENTRIES = 4_096;
const MESH_RETRY_DELAYS_MILLISECONDS = [
  1_000, 3_000, 8_000, 20_000, 60_000,
] as const;
const MESH_REQUEST_TIMEOUT_MILLISECONDS = 30_000;

const detectMeshCacheLimits = () => {
  const deviceMemoryBytes =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory &&
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory! *
      1024 ** 3;
  const heapLimitBytes = (
    performance as Performance & {
      memory?: { jsHeapSizeLimit?: number };
    }
  ).memory?.jsHeapSizeLimit;
  const detectedBytes = [deviceMemoryBytes, heapLimitBytes]
    .filter((value): value is number => Number.isFinite(value) && value > 0)
    .reduce(
      (minimum, value) => Math.min(minimum, value),
      Number.POSITIVE_INFINITY
    );
  const effectiveDetectedBytes = Number.isFinite(detectedBytes)
    ? detectedBytes
    : 1024 ** 3;
  const initialBytes = Math.min(
    MESH_INITIAL_MAXIMUM_CACHE_BYTES,
    Math.max(MESH_MINIMUM_CACHE_BYTES, Math.floor(effectiveDetectedBytes * 0.2))
  );
  return {
    initialBytes,
    maximumBytes: Math.min(
      MESH_MAXIMUM_CACHE_BYTES,
      Math.max(initialBytes, Math.floor(effectiveDetectedBytes * 0.35))
    ),
  };
};

type MeshLoadIssue = {
  category: "CORS/Netzwerk" | "HTTP" | "Decode" | "Ladefehler";
  message: string;
  url: string;
};

const describeMeshLoadIssue = (
  error: unknown,
  sourceUrl: string | URL
): MeshLoadIssue => {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  const normalized = message.toLowerCase();
  const category = /failed to fetch|networkerror|load failed|err_failed/.test(
    normalized
  )
    ? "CORS/Netzwerk"
    : /\b(?:4|5)\d{2}\b|http/.test(normalized)
    ? "HTTP"
    : /draco|gltf|decode|decoder|parse|invalid|unexpected/.test(normalized)
    ? "Decode"
    : "Ladefehler";
  let url = String(sourceUrl);
  try {
    const parsed = new URL(url);
    url = `${parsed.host}${parsed.pathname}`;
  } catch {
    // Keep the source string when a loader reports a relative URL.
  }
  return {
    category,
    message: message || "Unbekannter Fehler",
    url: url.slice(0, 110),
  };
};

export const createMesh2024TilesRuntime = ({
  scene,
  renderer,
  camera,
  originLngLat,
  anchorHeightEllipsoidal,
  opacity: initialOpacity,
  appearance: initialAppearance = MESH_DEFAULT_APPEARANCE,
  saturation: initialSaturation = MESH_DEFAULT_SATURATION,
  contrast: initialContrast = MESH_DEFAULT_CONTRAST,
  edgeEnhancement:
    initialEdgeEnhancement = IMAGE_DISPLAY_DEFAULT_EDGE_ENHANCEMENT,
  elevationMinimum:
    initialElevationMinimum = MESH_DEFAULT_ELEVATION_MINIMUM_METERS,
  elevationMaximum:
    initialElevationMaximum = MESH_DEFAULT_ELEVATION_MAXIMUM_METERS,
  elevationColorRamp:
    initialElevationColorRamp = MESH_DEFAULT_ELEVATION_COLOR_RAMP,
  errorTarget: initialErrorTarget,
  centerQualityBoost: initialCenterQualityBoost,
  debug: initialDebug,
  wireframe: initialWireframe,
  tileBounds: initialTileBounds,
  requestRender,
  onModel = () => undefined,
}: Mesh2024TilesRuntimeOptions) => {
  const texturedDisplayFilter = createImageDisplayFilter(
    initialSaturation,
    initialContrast,
    initialEdgeEnhancement
  );
  const clayMixUniform = uniform(initialAppearance === "clay" ? 1 : 0);
  const elevationMixUniform = uniform(
    initialAppearance === "elevation" ? 1 : 0
  );
  const initialElevationRange = [
    initialElevationMinimum,
    initialElevationMaximum,
  ].sort((left, right) => left - right);
  const elevationMinimumUniform = uniform(initialElevationRange[0]);
  const elevationMaximumUniform = uniform(initialElevationRange[1]);
  const texturedColor = texturedDisplayFilter.apply(vec3(materialColor));
  // The photogrammetry tiles can use unlit source materials because their
  // illumination is baked into the texture. Clay therefore supplies its own
  // stable key/fill term so geometry stays legible regardless of material type.
  const clayKeyLight = max(dot(normalWorld, vec3(-0.36, 0.82, 0.44)), 0);
  const clayColor = color(MESH_CLAY_COLOR).mul(
    clayKeyLight.mul(0.48).add(0.52)
  );
  // ReorientationPlugin places the tiles in an ENU frame whose Y origin is
  // anchorHeightEllipsoidal, so adding the anchor recovers absolute ETRS89
  // ellipsoidal height for every fragment.
  const elevationMeters = positionWorld.y.add(anchorHeightEllipsoidal);
  const elevationRange = max(
    elevationMaximumUniform.sub(elevationMinimumUniform),
    0.001
  );
  const elevationUnit = elevationMeters
    .sub(elevationMinimumUniform)
    .div(elevationRange)
    .clamp(0, 1);
  const elevationRampNode = texture(
    getRampTexture(initialElevationColorRamp),
    vec2(elevationUnit, 0.5)
  );
  const elevationHillshade = clayKeyLight.mul(0.18).add(0.82);
  const elevationBaseColor = elevationRampNode.rgb.mul(elevationHillshade);
  const elevationPixelSpan = max(fwidth(elevationMeters), 0.0005);
  const contourLine = (
    intervalMeters: number,
    halfWidthPixels: number,
    fadeStart: number,
    fadeEnd: number
  ) => {
    const interval = float(intervalMeters);
    const distanceToLine = abs(
      fract(elevationMeters.div(interval).add(0.5)).sub(0.5)
    ).mul(interval);
    const halfWidth = elevationPixelSpan.mul(halfWidthPixels);
    const antialiasWidth = elevationPixelSpan.mul(0.75);
    const line = smoothstep(
      halfWidth,
      halfWidth.add(antialiasWidth),
      distanceToLine
    ).oneMinus();
    const resolutionVisibility = smoothstep(
      fadeStart,
      fadeEnd,
      elevationPixelSpan.div(interval)
    ).oneMinus();
    return line.mul(resolutionVisibility);
  };
  const decimeterContours = contourLine(0.1, 0.12, 0.45, 1.1);
  const meterContours = contourLine(1, 0.42, 0.55, 1.35);
  const fiveMeterContours = contourLine(5, 1.05, 0.7, 1.6);
  const contourColor = color(0x101820);
  const elevationContourColor = mix(
    mix(
      mix(elevationBaseColor, contourColor, decimeterContours.mul(0.24)),
      contourColor,
      meterContours.mul(0.62)
    ),
    contourColor,
    fiveMeterContours.mul(0.92)
  );
  const baseAppearanceColor = mix(texturedColor, clayColor, clayMixUniform);
  const appearanceColorNode = vec4(
    mix(baseAppearanceColor, elevationContourColor, elevationMixUniform),
    1
  );
  type MaterialWithColorNode = THREE.Material & {
    colorNode?: typeof appearanceColorNode;
  };
  const applyMaterialAppearance = (material: THREE.Material) => {
    const nodeMaterial = material as MaterialWithColorNode;
    if (nodeMaterial.colorNode === appearanceColorNode) return;
    nodeMaterial.colorNode = appearanceColorNode;
    material.needsUpdate = true;
  };
  const tiles = new TilesRenderer(WUPP_MESH_2024.url);
  const debugTilesPlugin = new DebugTilesPlugin({
    displayBoxBounds: initialTileBounds,
  });
  const requestTimeoutPlugin = {
    name: "REQUEST_TIMEOUT_PLUGIN",
    fetchData: (url: string | URL, options: RequestInit = {}) => {
      const controller = new AbortController();
      const sourceSignal = options.signal;
      const abortFromSource = () => controller.abort(sourceSignal?.reason);
      if (sourceSignal?.aborted) abortFromSource();
      else
        sourceSignal?.addEventListener("abort", abortFromSource, {
          once: true,
        });
      const timeout = window.setTimeout(
        () =>
          controller.abort(
            new DOMException(
              `3D-Tile-Request nach ${
                MESH_REQUEST_TIMEOUT_MILLISECONDS / 1_000
              } s abgebrochen`,
              "TimeoutError"
            )
          ),
        MESH_REQUEST_TIMEOUT_MILLISECONDS
      );
      return fetch(url, { ...options, signal: controller.signal }).finally(
        () => {
          window.clearTimeout(timeout);
          sourceSignal?.removeEventListener("abort", abortFromSource);
        }
      );
    },
  };
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
  );
  tiles.registerPlugin(requestTimeoutPlugin);
  tiles.registerPlugin(new ImplicitTilingPlugin());
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }));
  tiles.registerPlugin(debugTilesPlugin);
  tiles.registerPlugin(new UpdateOnChangePlugin());
  // Frees geometry and textures of tiles that leave the view almost
  // immediately, so the budget goes to what is actually on screen. The
  // small delay avoids thrashing while the camera is still moving.
  tiles.registerPlugin(new UnloadTilesPlugin({ delay: 200 }));
  tiles.registerPlugin(
    new ReorientationPlugin({
      lat: degToRadNumeric(originLngLat[1]),
      lon: degToRadNumeric(originLngLat[0]),
      // ReorientationPlugin explicitly expects height above the ellipsoid.
      // Mesh 2024 was transformed with GCG2016 from
      // EPSG:25832+EPSG:7837 into EPSG:4978, so the local tangent frame must
      // use the matching ellipsoidal anchor rather than the source NHN value.
      height: anchorHeightEllipsoidal,
    })
  );
  // Loading ancestors in this deeply nested REPLACE hierarchy can fill the LRU
  // with entries that are all marked as used and therefore cannot be evicted.
  // Load only the current view and build coverage progressively: coarse tiles
  // first, followed by increasingly fine screen-space-error targets.
  tiles.loadSiblings = false;
  tiles.loadAncestors = false;
  // The public Wuppertal host aborts bursts at the renderer's generic default
  // of 25 concurrent downloads with ERR_HTTP2_PROTOCOL_ERROR. Keep the built-in
  // request priority, but use a conservative transport limit for this source.
  tiles.downloadQueue.maxJobsPerOrigin = 8;
  tiles.parseQueue.maxJobs = 8;
  tiles.processNodeQueue.maxJobs = 48;
  tiles.maxTilesProcessed = 1_000;
  let centerQualityBoost = initialCenterQualityBoost;
  const cameraSet = createTilesCameraSet(tiles, camera, centerQualityBoost);
  cameraSet.update(
    camera,
    Math.max(1, renderer.domElement.clientWidth),
    Math.max(1, renderer.domElement.clientHeight)
  );

  const anchor = new THREE.Group();
  anchor.rotation.y = Math.PI;
  anchor.add(tiles.group);
  scene.add(anchor);
  const loadedTiles = new Set<unknown>();
  let requestedErrorTarget = MESH_DEFAULT_ERROR_TARGET_PIXELS;
  let activeErrorTarget = MESH_COVERAGE_ERROR_TARGET_PIXELS;
  let completedErrorTarget = MESH_COVERAGE_ERROR_TARGET_PIXELS;
  let refinementFallbackTarget = MESH_COVERAGE_ERROR_TARGET_PIXELS;
  let refinementBudgetLimited = false;
  let scheduleProgressiveRefinement = () => undefined;
  let debug = initialDebug;
  let wireframe = initialWireframe;
  let opacity = initialOpacity;
  const cacheLimits = detectMeshCacheLimits();
  let budgetBytes = cacheLimits.initialBytes;
  const maximumBudgetBytes = cacheLimits.maximumBytes;
  const cache = tiles.lruCache as typeof tiles.lruCache & {
    cachedBytes: number;
    itemSet: Map<unknown, number>;
  };
  cache.minSize = MESH_MINIMUM_CACHE_ENTRIES;
  cache.maxSize = MESH_MAXIMUM_CACHE_ENTRIES;
  const restartProgressiveLod = () => {
    activeErrorTarget = Math.max(
      requestedErrorTarget,
      MESH_COVERAGE_ERROR_TARGET_PIXELS
    );
    completedErrorTarget = activeErrorTarget;
    refinementFallbackTarget = activeErrorTarget;
    refinementBudgetLimited = false;
    tiles.errorTarget = activeErrorTarget;
  };
  const applyErrorTarget = (nextErrorTarget: number) => {
    requestedErrorTarget = THREE.MathUtils.clamp(
      nextErrorTarget,
      MESH_MINIMUM_ERROR_TARGET_PIXELS,
      MESH_MAXIMUM_ERROR_TARGET_PIXELS
    );
    restartProgressiveLod();
    cache.minBytesSize = budgetBytes * 0.45;
    cache.maxBytesSize = budgetBytes;
    cache.unloadPercent = 0.5;
    tiles.dispatchEvent({ type: "needs-update" });
    scheduleProgressiveRefinement();
  };
  applyErrorTarget(initialErrorTarget);
  const materials: THREE.Material[] = [];
  const trackedMaterials = new WeakSet<THREE.Material>();
  const trackMaterial = (material: THREE.Material) => {
    if (trackedMaterials.has(material)) return;
    trackedMaterials.add(material);
    materials.push(material);
  };
  const applyMaterialWireframe = (material: THREE.Material) => {
    if (!("wireframe" in material)) return;
    const wireframeMaterial = material as THREE.Material & {
      wireframe: boolean;
    };
    if (wireframeMaterial.wireframe === wireframe) return;
    wireframeMaterial.wireframe = wireframe;
    material.needsUpdate = true;
  };
  const applyMaterialStyles = (material: THREE.Material) => {
    applyMaterialAppearance(material);
    applyMaterialWireframe(material);
    const transparent = opacity < 0.999;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true;
    }
    material.opacity = opacity;
    // A faded mesh is visual context, not an opaque depth mask. Keeping depth
    // writes enabled here would still hide Georadar behind nearly invisible
    // tiles because the depth buffer has no concept of partial opacity.
    material.depthWrite = !transparent;
    trackMaterial(material);
  };
  const applyModelStyles = (modelScene: THREE.Object3D) => {
    modelScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const childMaterials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of childMaterials) applyMaterialStyles(material);
    });
  };
  const applyLoadedModelStyles = () => {
    tiles.forEachLoadedModel((modelScene) => applyModelStyles(modelScene));
  };
  let rootTilesetLoaded = false;
  let loadErrorCount = 0;
  let lastLoadIssue: MeshLoadIssue | undefined;
  let retryAttempt = 0;
  let retryTimer: number | undefined;
  let disposed = false;
  let evictedCacheEntries = 0;
  let cacheRecoveryPasses = 0;
  let tileRequestCount = 0;
  let lastTileRequestAt = Number.NEGATIVE_INFINITY;
  let refinementTimer: number | undefined;
  let budgetPressureTimer: number | undefined;
  let recentFrameMilliseconds = 0;
  scheduleProgressiveRefinement = () => {
    if (
      disposed ||
      refinementBudgetLimited ||
      activeErrorTarget <= requestedErrorTarget
    )
      return;
    if (refinementTimer !== undefined) window.clearTimeout(refinementTimer);
    refinementTimer = window.setTimeout(() => {
      refinementTimer = undefined;
      if (disposed || activeErrorTarget <= requestedErrorTarget) return;
      const { queued, downloading, parsing } = (
        tiles as unknown as {
          stats: { queued: number; downloading: number; parsing: number };
        }
      ).stats;
      if (queued + downloading + parsing > 0) {
        scheduleProgressiveRefinement();
        return;
      }
      refinementFallbackTarget = completedErrorTarget;
      activeErrorTarget = Math.max(
        requestedErrorTarget,
        activeErrorTarget / MESH_REFINEMENT_FACTOR
      );
      tiles.errorTarget = activeErrorTarget;
      tiles.dispatchEvent({ type: "needs-update" });
    }, MESH_REFINEMENT_STEP_MILLISECONDS);
  };
  const onNeedsUpdate = () => requestRender();
  tiles.addEventListener("needs-update", onNeedsUpdate);
  // Recovery watchdog. Two things otherwise leave the mesh pinned at a coarse
  // level: refinementBudgetLimited latches on the first cache-full event and is
  // only cleared when the view changes or the quality slider moves, and a
  // traversal can settle while UpdateOnChangePlugin sees no change to react to.
  // Once the queues are idle below the requested target, clear the latch and
  // take another refinement step.
  const refinementWatchdog = window.setInterval(() => {
    if (disposed) return;
    tiles.dispatchEvent({ type: "needs-update" });
    if (activeErrorTarget <= requestedErrorTarget) return;
    const { queued, downloading, parsing } = (
      tiles as unknown as {
        stats: { queued: number; downloading: number; parsing: number };
      }
    ).stats;
    if (queued + downloading + parsing > 0) return;
    if (refinementBudgetLimited) {
      // The budget cap was measured under the previous view; out-of-view tiles
      // have since been unloaded, so let refinement try again.
      refinementBudgetLimited = false;
    }
    scheduleProgressiveRefinement();
  }, MESH_REFINEMENT_WATCHDOG_MILLISECONDS);
  const onUpdateAfter = () => {
    // Plugins and renderer updates can replace or restore tile materials after
    // load-model. Reassert the complete style contract after every traversal;
    // unchanged material properties remain an inexpensive no-op.
    applyLoadedModelStyles();
    const entriesBeforeUnload = cache.itemSet.size;
    // TilesRenderer schedules its LRU pass as a microtask immediately before
    // update-after. Check in the following microtask so a cache-full traversal
    // gets another chance to queue the newly visible tiles after space exists.
    queueMicrotask(() => {
      if (disposed) return;
      const evictedEntries = entriesBeforeUnload - cache.itemSet.size;
      if (evictedEntries > 0) {
        evictedCacheEntries += evictedEntries;
        cacheRecoveryPasses += 1;
      }
      if (cache.isFull() && activeErrorTarget < refinementFallbackTarget) {
        if (budgetPressureTimer === undefined) {
          budgetPressureTimer = window.setTimeout(() => {
            budgetPressureTimer = undefined;
            if (
              disposed ||
              !cache.isFull() ||
              activeErrorTarget >= refinementFallbackTarget
            )
              return;
            const heapUsage = (
              performance as Performance & {
                memory?: {
                  usedJSHeapSize?: number;
                  jsHeapSizeLimit?: number;
                };
              }
            ).memory;
            const heapHasHeadroom =
              !heapUsage?.usedJSHeapSize ||
              !heapUsage.jsHeapSizeLimit ||
              heapUsage.usedJSHeapSize / heapUsage.jsHeapSizeLimit < 0.78;
            const rendererIsResponsive =
              recentFrameMilliseconds === 0 || recentFrameMilliseconds < 24;
            if (
              budgetBytes < maximumBudgetBytes &&
              heapHasHeadroom &&
              rendererIsResponsive
            ) {
              budgetBytes = Math.min(
                maximumBudgetBytes,
                Math.max(budgetBytes + 256 * 1024 ** 2, budgetBytes * 1.25)
              );
              cache.minBytesSize = budgetBytes * 0.45;
              cache.maxBytesSize = budgetBytes;
              tiles.dispatchEvent({ type: "needs-update" });
              scheduleProgressiveRefinement();
              return;
            }
            activeErrorTarget = refinementFallbackTarget;
            completedErrorTarget = refinementFallbackTarget;
            refinementBudgetLimited = true;
            tiles.errorTarget = activeErrorTarget;
            tiles.dispatchEvent({ type: "needs-update" });
          }, 600);
        }
        return;
      }
      if (budgetPressureTimer !== undefined) {
        window.clearTimeout(budgetPressureTimer);
        budgetPressureTimer = undefined;
      }
      if (evictedEntries > 0) {
        tiles.dispatchEvent({ type: "needs-update" });
      }
    });
    scheduleProgressiveRefinement();
  };
  const onTileDownloadStart = () => {
    tileRequestCount += 1;
    lastTileRequestAt = performance.now();
  };
  tiles.addEventListener("update-after", onUpdateAfter);
  tiles.addEventListener("tile-download-start", onTileDownloadStart);
  const clearLoadFailures = () => {
    loadErrorCount = 0;
    lastLoadIssue = undefined;
    retryAttempt = 0;
    if (retryTimer !== undefined) {
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    }
  };
  const retryFailedTiles = () => {
    try {
      tiles.resetFailedTiles();
    } catch (error) {
      loadErrorCount += 1;
      lastLoadIssue = describeMeshLoadIssue(error, WUPP_MESH_2024.url);
    }
    tiles.dispatchEvent({ type: "needs-update" });
  };
  const scheduleFailedTileRetry = () => {
    if (disposed || retryTimer !== undefined) {
      return;
    }
    const delay =
      MESH_RETRY_DELAYS_MILLISECONDS[
        Math.min(retryAttempt, MESH_RETRY_DELAYS_MILLISECONDS.length - 1)
      ];
    retryAttempt += 1;
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      if (disposed) return;
      retryFailedTiles();
    }, delay);
  };
  tiles.addEventListener("load-root-tileset", () => {
    rootTilesetLoaded = true;
  });
  tiles.addEventListener("load-model", ({ scene: modelScene, tile }) => {
    loadedTiles.add(tile);
    applyModelStyles(modelScene);
    onModel(anchor, materials);
  });
  tiles.addEventListener("dispose-model", ({ tile }) => {
    loadedTiles.delete(tile);
  });
  tiles.addEventListener("load-error", ({ error, url }) => {
    loadErrorCount += 1;
    lastLoadIssue = describeMeshLoadIssue(error, url);
    scheduleFailedTileRetry();
  });
  tiles.addEventListener("tiles-load-end", () => {
    const failedTileCount = (
      tiles as typeof tiles & { stats: { failed: number } }
    ).stats.failed;
    if (loadErrorCount > 0 && failedTileCount === 0) {
      clearLoadFailures();
    }
    if (!cache.isFull()) {
      completedErrorTarget = activeErrorTarget;
      refinementFallbackTarget = activeErrorTarget;
    }
    scheduleProgressiveRefinement();
  });

  return {
    anchor,
    tiles,
    materials,
    resize: (activeCamera: SceneCamera, width: number, height: number) => {
      cameraSet.update(activeCamera, width, height);
    },
    setActiveCamera: (nextCamera: SceneCamera) => {
      if (!cameraSet.setActiveCamera(nextCamera)) return;
      restartProgressiveLod();
      cameraSet.update(
        nextCamera,
        Math.max(1, renderer.domElement.clientWidth),
        Math.max(1, renderer.domElement.clientHeight)
      );
      tiles.dispatchEvent({ type: "needs-update" });
    },
    updateCoverageCamera: cameraSet.update,
    /**
     * True while the mesh is actually moving data: tiles queued, downloading
     * or parsing. Deliberately ignores the refinement ladder — a tileset that
     * yielded until the mesh reached its final target could be starved for as
     * long as the mesh keeps refining, so other tilesets only step aside for
     * real network and parse work and fill every gap in between.
     */
    isFetching: () => {
      if (disposed) return false;
      const { queued, downloading, parsing } = (
        tiles as unknown as {
          stats: { queued: number; downloading: number; parsing: number };
        }
      ).stats;
      return queued + downloading + parsing > 0;
    },
    notifyViewChanged: () => {
      restartProgressiveLod();
      tiles.dispatchEvent({ type: "needs-update" });
      scheduleProgressiveRefinement();
    },
    reportFrameTime: (milliseconds: number) => {
      recentFrameMilliseconds =
        recentFrameMilliseconds === 0
          ? milliseconds
          : THREE.MathUtils.lerp(recentFrameMilliseconds, milliseconds, 0.15);
    },
    applyAppearance: (
      appearance: Mesh2024AppearanceMode,
      nextSaturation: number,
      nextContrast: number,
      nextEdgeEnhancement: number,
      nextElevationMinimum: number,
      nextElevationMaximum: number,
      nextElevationColorRamp: Mesh2024ElevationColorRamp
    ) => {
      clayMixUniform.value = appearance === "clay" ? 1 : 0;
      elevationMixUniform.value = appearance === "elevation" ? 1 : 0;
      texturedDisplayFilter.setValues(
        nextSaturation,
        nextContrast,
        nextEdgeEnhancement
      );
      const [minimum, maximum] = [
        nextElevationMinimum,
        nextElevationMaximum,
      ].sort((left, right) => left - right);
      elevationMinimumUniform.value = minimum;
      elevationMaximumUniform.value = Math.max(minimum + 0.001, maximum);
      elevationRampNode.value = getRampTexture(nextElevationColorRamp);
      applyLoadedModelStyles();
      requestRender();
    },
    applyOpacity: (nextOpacity: number) => {
      opacity = THREE.MathUtils.clamp(nextOpacity, 0, 1);
      applyLoadedModelStyles();
      requestRender();
    },
    applyErrorTarget,
    applyCenterQualityBoost: (enabled: boolean) => {
      if (centerQualityBoost === enabled) return;
      centerQualityBoost = enabled;
      cameraSet.setCenterQualityBoost(enabled);
      restartProgressiveLod();
      tiles.dispatchEvent({ type: "needs-update" });
      scheduleProgressiveRefinement();
    },
    applyDebug: (nextDebug: boolean) => {
      debug = nextDebug;
    },
    applyWireframe: (enabled: boolean) => {
      if (wireframe === enabled) return;
      wireframe = enabled;
      applyLoadedModelStyles();
      requestRender();
    },
    applyTileBounds: (enabled: boolean) => {
      debugTilesPlugin.displayBoxBounds = enabled;
      debugTilesPlugin.update();
      tiles.dispatchEvent({ type: "needs-update" });
      requestRender();
    },
    resetFailures: clearLoadFailures,
    retryFailedTiles,
    getLoadingStatus: () => {
      const runtimeTiles = tiles as typeof tiles & {
        stats: {
          inCache: number;
          queued: number;
          downloading: number;
          parsing: number;
          active: number;
          visible: number;
          failed: number;
        };
      };
      const cachedMegabytes = cache.cachedBytes / (1024 * 1024);
      const cacheIsFull = cache.isFull();
      const pending =
        runtimeTiles.stats.queued +
        runtimeTiles.stats.downloading +
        runtimeTiles.stats.parsing;
      const errorTarget = tiles.errorTarget;
      const meshUrl = new URL(WUPP_MESH_2024.url, window.location.href);
      const crossOrigin = meshUrl.origin !== window.location.origin;
      const loadState =
        !rootTilesetLoaded && lastLoadIssue
          ? `Mesh-Fehler · ${lastLoadIssue.category} · ${lastLoadIssue.url} · ${lastLoadIssue.message}`
          : loadedTiles.size > 0
          ? `Mesh geladen · ${loadedTiles.size} Tiles · ${runtimeTiles.stats.visible} sichtbar · ${runtimeTiles.stats.active} aktiv`
          : rootTilesetLoaded
          ? "Mesh-Index geladen · sichtbare Tiles werden geladen"
          : "Mesh-Index wird geladen";
      const issueStatus =
        rootTilesetLoaded && lastLoadIssue
          ? ` · ⚠ ${loadErrorCount} Tile-Fehler · ${lastLoadIssue.category} · ${lastLoadIssue.url} · ${lastLoadIssue.message}`
          : "";
      const retryStatus = lastLoadIssue
        ? retryTimer !== undefined
          ? ` · Wiederholung ${retryAttempt} geplant`
          : retryAttempt > 0
          ? ` · Wiederholung ${retryAttempt} läuft`
          : ""
        : "";
      const corsStatus = crossOrigin
        ? loadedTiles.size > 0
          ? `3D-Tiles cross-origin ok · ${window.location.host} → ${meshUrl.host}`
          : `3D-Tiles cross-origin wird geprüft · ${window.location.host} → ${meshUrl.host}`
        : `3D-Tiles same-origin · ${window.location.host}`;
      const lodLimitStatus = refinementBudgetLimited
        ? ` · LOD budgetbegrenzt bei ${completedErrorTarget.toFixed(2)} px`
        : "";
      const debugStatus = debug
        ? ` · Loader: Standard-SSE-/Fehlerpriorität · Ziel ${requestedErrorTarget.toFixed(
            2
          )} px · Cache ${(budgetBytes / (1024 * 1024)).toFixed(
            0
          )} MB · Kameras ${tiles.cameras.length} · Zentrum-Boost ${
            centerQualityBoost ? "2× / 38 % FOV" : "aus"
          } · progressive LOD ${activeErrorTarget.toFixed(
            2
          )}→${requestedErrorTarget.toFixed(2)} px · nur Sichtfeld · Timeout ${
            MESH_REQUEST_TIMEOUT_MILLISECONDS / 1_000
          } s · Download ${tiles.downloadQueue.maxJobsPerOrigin} · Parse ${
            tiles.parseQueue.maxJobs
          } · Traversal ${
            tiles.maxTilesProcessed
          } · Requests ${tileRequestCount} · LRU-Räumungen ${evictedCacheEntries} in ${cacheRecoveryPasses} Läufen${
            Number.isFinite(lastTileRequestAt)
              ? ` · letzter Request vor ${Math.max(
                  0,
                  (performance.now() - lastTileRequestAt) / 1_000
                ).toFixed(1)} s`
              : ""
          }`
        : "";
      return `${loadState}${issueStatus}${retryStatus} · Screenfehler ${errorTarget.toFixed(
        2
      )}→${requestedErrorTarget.toFixed(2)} px · Cache ${
        runtimeTiles.stats.inCache
      }/${cache.maxSize} Einträge${
        cacheIsFull ? " (voll)" : ""
      }, ${cachedMegabytes.toFixed(0)}/${(budgetBytes / (1024 * 1024)).toFixed(
        0
      )} MB (automatisch, max. ${Math.round(
        maximumBudgetBytes / (1024 * 1024)
      )} MB) · ${pending} ausstehend${lodLimitStatus} · ${corsStatus}${debugStatus}`;
    },
    dispose: () => {
      disposed = true;
      window.clearInterval(refinementWatchdog);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (refinementTimer !== undefined) window.clearTimeout(refinementTimer);
      if (budgetPressureTimer !== undefined)
        window.clearTimeout(budgetPressureTimer);
      tiles.removeEventListener("needs-update", onNeedsUpdate);
      tiles.removeEventListener("update-after", onUpdateAfter);
      tiles.removeEventListener("tile-download-start", onTileDownloadStart);
      scene.remove(anchor);
      cameraSet.dispose();
      tiles.dispose();
      dracoLoader.dispose();
    },
  };
};
