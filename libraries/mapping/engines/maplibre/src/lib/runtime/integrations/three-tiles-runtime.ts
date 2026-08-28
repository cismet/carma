import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";
import {
  DebugTilesPlugin,
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { clamp } from "@carma-commons/math";
import { GLTFPrimitiveOutlineExtension } from "@carma-mapping/engines/threejs";
import { degToRadNumeric } from "@carma-units";
import { Gltf1UpgradePlugin } from "./gltf1-upgrade-plugin";
import {
  createTilesCameraSet,
  resolveTilesViewCamera,
} from "./tiles-camera-set";
import type { TilesCameraSet } from "./tiles-camera-set";
import {
  createThreeTilesRetryController,
  type RetryableTilesRenderer,
} from "./three-tiles-retry-controller";
import {
  isSharedThreeTerrainLoading,
  subscribeSharedThreeTerrainLoading,
} from "./shared-three-terrain-registry";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
  SharedThreeSceneShadowStyle,
  SharedThreeSceneShadowView,
} from "./shared-three-scene-layer";
import { getSharedThreeShadowViewSignature } from "./shared-three-scene-layer";

// Match the direct screen-space-error control used by the official
// 3DTilesRendererJS kitchen-sink demo. Lower values request more detail.
export const TILES_ERROR_TARGET_MIN_PIXELS = 0;
export const TILES_ERROR_TARGET_MAX_PIXELS = 50;
export const TILES_ERROR_TARGET_DEFAULT_PIXELS = 6;

const MINIMUM_PROGRESSIVE_ERROR_TARGET_PIXELS = 0.05;
const COVERAGE_ERROR_TARGET_PIXELS = 64;
const REFINEMENT_FACTOR = 2;
const DEFAULT_CACHE_BYTES = 256 * 1024 ** 2;
const MINIMUM_CACHE_BYTES = 16 * 1024 ** 2;
export const THREE_TILES_DEFAULT_REQUEST_CONCURRENCY = 12;
const MAX_SHADOW_REQUEST_CONCURRENCY = 12;
const CLAY_COLOR = 0xd6d2ca;
const TILE_OUTLINE_FLAG = "isTileOutline";

const buildPrimitiveOutlinePlugin = (
  parser: unknown,
  options: {
    color: THREE.ColorRepresentation;
    opacity: number;
  }
) => ({
  name: "CARMA_lazy_primitive_outline",
  async afterRoot(result: { scene: THREE.Object3D }) {
    await new GLTFPrimitiveOutlineExtension(
      parser as ConstructorParameters<typeof GLTFPrimitiveOutlineExtension>[0],
      options
    ).afterRoot(result);
  },
});

/** Cesium 3D Tiles runtime for the shared local MapLibre Three.js scene. */

export type ImageProjector =
  | {
      kind: "pano";
      position: THREE.Vector3;
      headingRad: number;
      texture: THREE.Texture;
      opacity: number;
    }
  | {
      kind: "frustum";
      viewProj: THREE.Matrix4;
      texture: THREE.Texture;
      opacity: number;
    };

export interface ThreeTilesRuntime extends SharedThreeSceneRuntime {
  setVisible: (visible: boolean) => void;
  setHeightOffset: (offsetMeters: number) => void;
  setErrorTarget: (errorTarget: number) => void;
  /** Override textures with physically lit clay shading (reversible). */
  setWhiteShading: (white: boolean) => void;
  setClayMaterial: (options: ClayMaterialOptions) => void;
  setClayColor: (color: string) => void;
  setOpacity: (opacity: number) => void;
  setWireframe: (enabled: boolean) => void;
  setOutlineVisible: (visible: boolean) => void;
  setTileBoundsVisible: (enabled: boolean) => void;
  setCacheBudget: (bytes: number) => void;
  setRequestConcurrency: (jobs: number) => void;
  getRequestDemand: () => number;
  getViewElevationRange: (
    camera: THREE.Camera
  ) => readonly [minimum: number, maximum: number] | null;
  setProjector: (projector: ImageProjector | null) => void;
  setShadowView: (view: SharedThreeSceneShadowView | null) => void;
  originMerc: MercatorCoordinate;
  mScale: number;
}

export interface ClayMaterialOptions {
  color?: string;
  roughness?: number;
  metalness?: number;
}

export interface ThreeTilesRuntimeOptions {
  cacheBudgetBytes?: number;
  requestConcurrency?: number;
  onRequestStateChange?: () => void;
  onContentChanged?: () => void;
  outline?: boolean;
  outlineColor?: THREE.ColorRepresentation;
  outlineOpacity?: number;
  /** Restyle this tileset like a building layer while shadow mode is active. */
  shadowBuildingStyle?: boolean;
}

export function buildThreeTilesRuntime(
  layerId: string,
  tilesetUrl: string,
  originLngLat: [number, number],
  options: ThreeTilesRuntimeOptions = {}
): ThreeTilesRuntime {
  const originMerc = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const mScale = originMerc.meterInMercatorCoordinateUnits();

  let map: MaplibreMap | null = null;
  let tiles: TilesRenderer | null = null;
  let debugTilesPlugin: DebugTilesPlugin | null = null;
  let cameraSet: TilesCameraSet | null = null;
  let kickstartTimer = 0;
  let refinementTimer = 0;
  let unsubscribeTerrainLoading: (() => void) | null = null;
  let requestedErrorTarget = TILES_ERROR_TARGET_DEFAULT_PIXELS;
  let activeErrorTarget = COVERAGE_ERROR_TARGET_PIXELS;
  let cacheBudgetBytes = Math.max(
    MINIMUM_CACHE_BYTES,
    Math.floor(options.cacheBudgetBytes ?? DEFAULT_CACHE_BYTES)
  );
  let requestConcurrency = Math.max(
    0,
    Math.floor(
      options.requestConcurrency ?? THREE_TILES_DEFAULT_REQUEST_CONCURRENCY
    )
  );
  // ReorientationPlugin produces X west / Z north. The MapLibre custom-layer
  // matrix below and the other pointcloud layers use X east / Z south, so keep
  // the plugin-owned group untouched and correct the horizontal axes in a
  // persistent parent (the plugin updates tiles.group asynchronously).
  const orientationGroup = new THREE.Group();
  orientationGroup.rotation.y = Math.PI;
  const offsetGroup = new THREE.Group();
  orientationGroup.add(offsetGroup);
  let whiteShading = false;
  let clayColor = new THREE.Color(CLAY_COLOR);
  let clayRoughness = 0.92;
  let clayMetalness = 0;
  let opacity = 1;
  let wireframe = false;
  let outlineVisible = options.outline ?? true;
  let shadowSimulationStyle: SharedThreeSceneShadowStyle | null = null;
  let shadowView: SharedThreeSceneShadowView | null = null;
  let shadowViewSignature = "";
  let shadowSelectionEnabled = false;
  let shadowSelectionNeedsTraversal = false;
  const shadowClayColor = new THREE.Color(CLAY_COLOR);
  let tileBoundsVisible = false;
  let runtimeVisible = true;
  let activeProjector: ImageProjector | null = null;
  const placementMatrix = new THREE.Matrix4();
  const inversePlacementMatrix = new THREE.Matrix4();
  const tileViewProjection = new THREE.Matrix4();
  const tileViewFrustum = new THREE.Frustum();
  const tileBoundingSphere = new THREE.Sphere();
  const tileBoundingBox = new THREE.Box3();
  const tileViewElevationFrustum = new THREE.Frustum();
  const tileViewElevationProjection = new THREE.Matrix4();
  const tileProjectedCenter = new THREE.Vector3();
  const identityRotation = new THREE.Quaternion();
  const projectorUniforms = {
    uProjKind: { value: 0 },
    uProjOpacity: { value: 0 },
    uProjPos: { value: new THREE.Vector3() },
    uProjHeading: { value: 0 },
    uProjMatrix: { value: new THREE.Matrix4() },
    tProj: { value: null as THREE.Texture | null },
  };

  const patchMaterialForProjection = (material: THREE.Material) => {
    if ((material as { __projPatched?: boolean }).__projPatched) return;
    (material as { __projPatched?: boolean }).__projPatched = true;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, projectorUniforms);
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
uniform sampler2D tProj;`
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

  type ClayMaterialState = {
    original: THREE.Material | THREE.Material[];
    clay: THREE.Material | THREE.Material[];
  };

  const clayMaterialStates = new Map<THREE.Mesh, ClayMaterialState>();
  const originalShadowSides = new Map<THREE.Material, THREE.Side | null>();
  const asMaterialArray = (
    material: THREE.Material | THREE.Material[]
  ): THREE.Material[] => (Array.isArray(material) ? material : [material]);

  const buildClayMaterial = (source: THREE.Material) => {
    const material = new THREE.MeshStandardMaterial({
      color: shadowSimulationStyle?.uniformColor ? shadowClayColor : clayColor,
      roughness: clayRoughness,
      metalness: clayMetalness,
      // LoD2 building tiles are closed solids. Some source glTF materials are
      // marked double-sided, which makes the visible roof faces write the
      // shadow map and self-occlude. Render the clay shell from the outside and
      // cast from the opposite, interior-facing side, matching the stable ALKIS
      // extrusion path.
      side: THREE.FrontSide,
      opacity: source.opacity,
      transparent: source.transparent,
      depthTest: true,
      depthWrite: source.depthWrite,
      alphaTest: source.alphaTest,
    });
    material.shadowSide = THREE.BackSide;
    material.name = source.name ? `${source.name} · clay` : "tileset-clay";
    return material;
  };

  const disposeClayState = (mesh: THREE.Mesh, state: ClayMaterialState) => {
    mesh.material = state.original;
    for (const material of asMaterialArray(state.clay)) material.dispose();
    clayMaterialStates.delete(mesh);
  };

  const restoreClayMaterials = (root: THREE.Object3D) => {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const state = mesh.isMesh ? clayMaterialStates.get(mesh) : undefined;
      if (state) disposeClayState(mesh, state);
    });
  };

  const applyClosedSolidShadowSide = (material: THREE.Material) => {
    if (shadowSimulationStyle) {
      if (!originalShadowSides.has(material)) {
        originalShadowSides.set(material, material.shadowSide);
      }
      material.shadowSide = THREE.BackSide;
      return;
    }

    if (originalShadowSides.has(material)) {
      material.shadowSide = originalShadowSides.get(material) ?? null;
      originalShadowSides.delete(material);
    }
  };

  const restoreShadowSides = () => {
    for (const [material, shadowSide] of originalShadowSides) {
      material.shadowSide = shadowSide;
      material.needsUpdate = true;
    }
    originalShadowSides.clear();
  };

  const applyMaterialFlags = (root: THREE.Object3D) => {
    const useClayShading =
      whiteShading || !!shadowSimulationStyle?.uniformColor;
    const effectiveClayColor = shadowSimulationStyle?.uniformColor
      ? shadowClayColor
      : clayColor;
    const forceOpaque = shadowSimulationStyle?.fullOpacity === true;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      let clayState = clayMaterialStates.get(mesh);
      if (useClayShading && !clayState) {
        const original = mesh.material;
        const clay = Array.isArray(original)
          ? original.map(buildClayMaterial)
          : buildClayMaterial(original);
        clayState = { original, clay };
        clayMaterialStates.set(mesh, clayState);
        mesh.material = clay;
      } else if (!useClayShading && clayState) {
        disposeClayState(mesh, clayState);
        clayState = undefined;
      }

      const materials = asMaterialArray(mesh.material);
      for (const material of materials) {
        // Clay materials already enforce the closed-solid shadow convention.
        // Preserve the same convention for original textured materials when
        // uniform color is disabled, and restore their source setting when
        // shadow simulation ends.
        if (!clayState) applyClosedSolidShadowSide(material);
        // The reorientation parent keeps tile coordinates in the same local
        // meter frame and projection as the point layers. Write that shared
        // depth so later point-cloud layers are hidden by nearer mesh faces.
        material.depthTest = true;
        if (material.userData.__baseOpacity === undefined) {
          material.userData.__baseOpacity = material.opacity;
          material.userData.__baseTransparent = material.transparent;
          material.userData.__baseDepthWrite = material.depthWrite;
        }
        const translucent = opacity < 0.999;
        material.opacity = forceOpaque
          ? 1
          : (material.userData.__baseOpacity as number) * opacity;
        material.transparent = forceOpaque
          ? false
          : (material.userData.__baseTransparent as boolean) || translucent;
        material.depthWrite = forceOpaque
          ? true
          : (material.userData.__baseDepthWrite as boolean) && !translucent;
        if ("wireframe" in material) {
          (material as THREE.Material & { wireframe: boolean }).wireframe =
            wireframe;
        }
        if (useClayShading && "color" in material) {
          (material as THREE.Material & { color: THREE.Color }).color.copy(
            effectiveClayColor
          );
        }
        patchMaterialForProjection(material);
        material.needsUpdate = true;
      }
    });
  };

  const applyOutlineVisibility = (root: THREE.Object3D) => {
    root.traverse((object) => {
      if (object.userData[TILE_OUTLINE_FLAG]) {
        object.visible = shadowSimulationStyle ? false : outlineVisible;
      }
    });
  };

  const requestRender = () => map?.triggerRepaint();
  const tileRetries = createThreeTilesRetryController(
    () => tiles as (TilesRenderer & RetryableTilesRenderer) | null,
    requestRender
  );
  const getRequestDemand = () => {
    if (!runtimeVisible) return 0;
    if (!tiles) return 1;
    const queue = tiles.downloadQueue as typeof tiles.downloadQueue & {
      items: unknown[];
      currJobs: number;
    };
    const stats = (
      tiles as TilesRenderer & {
        stats?: { queued?: number; downloading?: number; parsing?: number };
      }
    ).stats;
    return (
      queue.items.length +
      queue.currJobs +
      (stats?.queued ?? 0) +
      (stats?.downloading ?? 0) +
      (stats?.parsing ?? 0) +
      (activeErrorTarget > requestedErrorTarget || refinementTimer ? 1 : 0) +
      (shadowView && !shadowSelectionEnabled ? 1 : 0) +
      (shadowSelectionNeedsTraversal ? 1 : 0) +
      (tileRetries.hasPendingRetries() ? 1 : 0) +
      (tiles.group.children.length === 0 ? 1 : 0)
    );
  };
  const getViewElevationRange = (
    camera: THREE.Camera
  ): readonly [number, number] | null => {
    if (!tiles || !runtimeVisible) return null;
    const currentTiles = tiles;
    camera.updateMatrixWorld(true);
    currentTiles.group.updateWorldMatrix(true, false);
    tileViewElevationProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    tileViewElevationFrustum.setFromProjectionMatrix(
      tileViewElevationProjection,
      camera.coordinateSystem,
      camera.reversedDepth
    );
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    currentTiles.forEachLoadedModel((_scene, tile) => {
      const bounds = (
        tile as Tile & {
          engineData?: {
            boundingVolume?: {
              getAABB: (target: THREE.Box3) => void;
            };
          };
        }
      ).engineData?.boundingVolume;
      if (!bounds) return;
      bounds.getAABB(tileBoundingBox);
      tileBoundingBox.applyMatrix4(currentTiles.group.matrixWorld);
      if (!tileViewElevationFrustum.intersectsBox(tileBoundingBox)) return;
      minimum = Math.min(minimum, tileBoundingBox.min.y);
      maximum = Math.max(maximum, tileBoundingBox.max.y);
    });
    return Number.isFinite(minimum) && Number.isFinite(maximum)
      ? [minimum, maximum]
      : null;
  };
  const notifyRequestStateChange = () => options.onRequestStateChange?.();
  const setShadowSelectionEnabled = (enabled: boolean) => {
    const nextEnabled = enabled && shadowView !== null;
    if (shadowSelectionEnabled === nextEnabled) return;
    shadowSelectionEnabled = nextEnabled;
    shadowSelectionNeedsTraversal = nextEnabled;
    cameraSet?.setShadowView(nextEnabled ? shadowView : null);
  };
  const maybeEnableShadowSelection = () => {
    if (
      shadowSelectionEnabled ||
      !shadowView ||
      !tiles ||
      !cameraSet ||
      (map && isSharedThreeTerrainLoading(map)) ||
      tileRetries.hasPendingRetries()
    ) {
      return;
    }
    const stats = tiles as TilesRenderer & {
      stats: { queued: number; downloading: number; parsing: number };
    };
    if (
      stats.stats.queued + stats.stats.downloading + stats.stats.parsing >
      0
    ) {
      return;
    }
    setShadowSelectionEnabled(true);
    tiles.dispatchEvent({ type: "needs-update" });
    requestRender();
  };
  const handleModelLoad = (event: { scene?: THREE.Object3D; tile?: Tile }) => {
    if (event.tile) tileRetries.handleSuccess(event.tile);
    if (event.scene) {
      event.scene.traverse((object) => {
        object.frustumCulled = false;
      });
      applyMaterialFlags(event.scene);
      applyOutlineVisibility(event.scene);
    }
    options.onContentChanged?.();
    notifyRequestStateChange();
    requestRender();
  };
  const handleModelDispose = (event: { scene?: THREE.Object3D }) => {
    if (event.scene) restoreClayMaterials(event.scene);
    options.onContentChanged?.();
  };
  const handleLoadError = (event: { tile?: Tile | null }) => {
    tileRetries.handleFailure(event.tile ?? null);
    notifyRequestStateChange();
  };
  const handleTilesLoadEnd = () => {
    notifyRequestStateChange();
    maybeEnableShadowSelection();
  };
  const syncProjector = () => {
    const projector = activeProjector;
    if (!projector) {
      projectorUniforms.uProjKind.value = 0;
      projectorUniforms.uProjOpacity.value = 0;
      projectorUniforms.tProj.value = null;
      return;
    }
    placementMatrix.compose(
      orientationGroup.position,
      identityRotation,
      orientationGroup.scale
    );
    inversePlacementMatrix.copy(placementMatrix).invert();
    projectorUniforms.uProjKind.value = projector.kind === "pano" ? 1 : 2;
    projectorUniforms.uProjOpacity.value = projector.opacity;
    projectorUniforms.tProj.value = projector.texture;
    if (projector.kind === "pano") {
      projectorUniforms.uProjPos.value
        .copy(projector.position)
        .applyMatrix4(placementMatrix);
      projectorUniforms.uProjHeading.value = projector.headingRad;
    } else {
      projectorUniforms.uProjMatrix.value
        .copy(projector.viewProj)
        .multiply(inversePlacementMatrix);
    }
  };
  const applyCacheBudget = () => {
    if (!tiles) return;
    tiles.lruCache.minBytesSize = cacheBudgetBytes * 0.45;
    tiles.lruCache.maxBytesSize = cacheBudgetBytes;
    tiles.lruCache.unloadPercent = 0.5;
    tiles.lruCache.scheduleUnload();
  };
  const applyRequestConcurrency = () => {
    if (!tiles) return;
    tiles.downloadQueue.maxJobs =
      map && isSharedThreeTerrainLoading(map)
        ? 0
        : shadowView
        ? Math.min(requestConcurrency, MAX_SHADOW_REQUEST_CONCURRENCY)
        : requestConcurrency;
  };
  const restartProgressiveLod = () => {
    activeErrorTarget = Math.max(
      requestedErrorTarget,
      COVERAGE_ERROR_TARGET_PIXELS
    );
    if (tiles) tiles.errorTarget = activeErrorTarget;
  };
  const scheduleProgressiveRefinement = () => {
    if (
      !tiles ||
      activeErrorTarget <= requestedErrorTarget ||
      refinementTimer
    ) {
      return;
    }
    refinementTimer = window.setTimeout(() => {
      refinementTimer = 0;
      if (!tiles || activeErrorTarget <= requestedErrorTarget) return;
      const stats = (
        tiles as unknown as {
          stats: {
            queued?: number;
            downloading?: number;
            parsing?: number;
          };
        }
      ).stats;
      if (
        (stats.queued ?? 0) + (stats.downloading ?? 0) + (stats.parsing ?? 0) >
        0
      ) {
        scheduleProgressiveRefinement();
        return;
      }
      const nextErrorTarget = activeErrorTarget / REFINEMENT_FACTOR;
      activeErrorTarget =
        nextErrorTarget <=
        Math.max(requestedErrorTarget, MINIMUM_PROGRESSIVE_ERROR_TARGET_PIXELS)
          ? requestedErrorTarget
          : nextErrorTarget;
      tiles.errorTarget = activeErrorTarget;
      tiles.dispatchEvent({ type: "needs-update" });
      scheduleProgressiveRefinement();
    }, 180);
  };
  const handleViewStart = () => {
    if (refinementTimer) {
      window.clearTimeout(refinementTimer);
      refinementTimer = 0;
    }
    setShadowSelectionEnabled(false);
    tiles?.dispatchEvent({ type: "needs-update" });
  };
  const handleViewEnd = () => {
    tiles?.dispatchEvent({ type: "needs-update" });
    scheduleProgressiveRefinement();
  };
  const pruneStaleQueuedRequests = () => {
    if (!tiles) return;
    const queue = tiles.downloadQueue as typeof tiles.downloadQueue & {
      items: Array<{
        traversal?: { inFrustum?: boolean; used?: boolean };
      }>;
      remove: (item: unknown) => void;
    };
    for (const tile of [...queue.items]) {
      if (
        tile.traversal?.inFrustum === false &&
        tile.traversal.used === false
      ) {
        queue.remove(tile);
      }
    }
  };
  const prioritizeQueuedTiles = (viewCamera: THREE.Camera) => {
    if (!tiles) return;
    tileViewProjection
      .multiplyMatrices(
        viewCamera.projectionMatrix,
        viewCamera.matrixWorldInverse
      )
      .multiply(tiles.group.matrixWorld);
    tileViewFrustum.setFromProjectionMatrix(
      tileViewProjection,
      viewCamera.coordinateSystem,
      viewCamera.reversedDepth
    );
    const queue = tiles.downloadQueue as typeof tiles.downloadQueue & {
      items: Array<
        Tile & {
          priority?: number;
          engineData?: {
            boundingVolume?: {
              getAABB: (target: THREE.Box3) => void;
              getSphere: (target: THREE.Sphere) => void;
            };
          };
        }
      >;
    };
    for (const tile of queue.items) {
      const bounds = tile.engineData?.boundingVolume;
      if (!bounds) continue;
      bounds.getAABB(tileBoundingBox);
      const inViewport = tileViewFrustum.intersectsBox(tileBoundingBox);
      bounds.getSphere(tileBoundingSphere);
      tileProjectedCenter
        .copy(tileBoundingSphere.center)
        .applyMatrix4(tiles.group.matrixWorld)
        .project(viewCamera);
      const distanceSquared =
        tileProjectedCenter.x ** 2 + tileProjectedCenter.y ** 2;
      tile.priority = (inViewport ? 2 : 0) + 1 / (1 + distanceSquared);
    }
    queue.sort();
  };
  const handleUpdateAfter = () => {
    scheduleProgressiveRefinement();
    const currentTiles = tiles;
    if (!currentTiles) return;
    const cache = currentTiles.lruCache as typeof currentTiles.lruCache & {
      itemSet: Map<unknown, number>;
    };
    const entriesBeforeUnload = cache.itemSet.size;
    queueMicrotask(() => {
      if (tiles !== currentTiles) return;
      if (cache.itemSet.size < entriesBeforeUnload) {
        currentTiles.dispatchEvent({ type: "needs-update" });
      }
    });
  };

  const layer: ThreeTilesRuntime = {
    id: layerId,
    originLngLat,
    root: orientationGroup,
    originMerc,
    mScale,

    onAdd(mapInstance: MaplibreMap) {
      map = mapInstance;
      if (tiles) return;

      tiles = new TilesRenderer(tilesetUrl);
      // 3D Tiles 1.1 implicit tiling (template URIs) is plugin-based
      tiles.registerPlugin(new ImplicitTilingPlugin());
      tiles.registerPlugin(new UpdateOnChangePlugin());
      // Mesh 2020 ships glTF 1.0 b3dm — upgrade payloads on the fly
      tiles.registerPlugin(new Gltf1UpgradePlugin());
      // Draco-compressed glTF payloads need an explicit decoder
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(
        "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
      );
      tiles.registerPlugin(
        new GLTFExtensionsPlugin({
          dracoLoader,
          plugins: [
            (parser: unknown) =>
              buildPrimitiveOutlinePlugin(parser, {
                color: options.outlineColor ?? 0x000000,
                opacity: options.outlineOpacity ?? 1,
              }),
          ],
        })
      );
      debugTilesPlugin = new DebugTilesPlugin({
        displayBoxBounds: tileBoundsVisible,
      });
      tiles.registerPlugin(debugTilesPlugin);
      // Reorient the ECEF tileset into the local scene frame at the
      // layer origin: ENU with +Y up, north toward -Z — matching the
      // point cloud layers (x east, y up, z south).
      tiles.registerPlugin(
        new ReorientationPlugin({
          lat: degToRadNumeric(originLngLat[1]),
          lon: degToRadNumeric(originLngLat[0]),
          height: 0,
        })
      );

      tiles.loadSiblings = false;
      tiles.loadAncestors = true;
      applyRequestConcurrency();
      tiles.parseQueue.maxJobs = 4;
      tiles.processNodeQueue.maxJobs = 48;
      tiles.maxTilesProcessed = 1_000;
      tiles.lruCache.minSize = 2_048;
      tiles.lruCache.maxSize = 4_096;
      applyCacheBudget();
      restartProgressiveLod();
      offsetGroup.add(tiles.group);

      // Request frames until the first tile work starts.
      kickstartTimer = window.setInterval(() => {
        const stats = (
          tiles as unknown as {
            stats?: { downloading?: number; parsing?: number };
          }
        )?.stats;
        if (
          !tiles ||
          (stats?.downloading ?? 0) > 0 ||
          (stats?.parsing ?? 0) > 0 ||
          tiles.group.children.length > 0
        ) {
          window.clearInterval(kickstartTimer);
          kickstartTimer = 0;
          return;
        }
        requestRender();
      }, 400);
      tiles.addEventListener("needs-update", requestRender);
      tiles.addEventListener("load-tileset", requestRender);
      tiles.addEventListener("update-after", handleUpdateAfter);
      tiles.addEventListener("load-model", handleModelLoad);
      tiles.addEventListener("dispose-model", handleModelDispose);
      tiles.addEventListener("load-error", handleLoadError);
      tiles.addEventListener("tiles-load-end", handleTilesLoadEnd);
      unsubscribeTerrainLoading = subscribeSharedThreeTerrainLoading(
        map,
        () => {
          applyRequestConcurrency();
          if (tiles && tiles.downloadQueue.maxJobs > 0) {
            tiles.downloadQueue.tryRunJobs();
          }
          tiles?.dispatchEvent({ type: "needs-update" });
          requestRender();
        }
      );
      map.on("movestart", handleViewStart);
      map.on("moveend", handleViewEnd);
      map.on("resize", handleViewEnd);
    },

    update(frame: SharedThreeSceneFrame) {
      if (!runtimeVisible || !tiles || !map) return;
      syncProjector();
      try {
        const viewCamera = resolveTilesViewCamera(
          frame.renderCamera,
          frame.lodCamera
        );
        if (!cameraSet) {
          cameraSet = createTilesCameraSet(tiles, viewCamera);
          cameraSet.setShadowView(shadowSelectionEnabled ? shadowView : null);
        }
        cameraSet.update(viewCamera, frame.viewport.x, frame.viewport.y);
        const completingShadowTraversal = shadowSelectionNeedsTraversal;
        tiles.update();
        if (completingShadowTraversal) shadowSelectionNeedsTraversal = false;
        prioritizeQueuedTiles(viewCamera);
        pruneStaleQueuedRequests();
        maybeEnableShadowSelection();
      } catch (error) {
        console.error("[tiles3d] update failed:", error);
      }

      // Keep rendering while the tile pipeline has work.
      const stats = (
        tiles as unknown as {
          stats?: {
            queued?: number;
            downloading?: number;
            parsing?: number;
          };
        }
      ).stats;
      if (
        (stats?.queued ?? 0) > 0 ||
        (stats?.downloading ?? 0) > 0 ||
        (stats?.parsing ?? 0) > 0
      ) {
        map.triggerRepaint();
      }
    },

    setVisible(visible: boolean) {
      if (runtimeVisible === visible) return;
      runtimeVisible = visible;
      orientationGroup.visible = visible;
      notifyRequestStateChange();
      if (!visible) {
        if (refinementTimer) {
          window.clearTimeout(refinementTimer);
          refinementTimer = 0;
        }
        map?.triggerRepaint();
        return;
      }
      restartProgressiveLod();
      tiles?.dispatchEvent({ type: "needs-update" });
      scheduleProgressiveRefinement();
      map?.triggerRepaint();
    },

    setHeightOffset(offsetMeters: number) {
      offsetGroup.position.y = offsetMeters;
      map?.triggerRepaint();
    },

    setErrorTarget(errorTarget: number) {
      requestedErrorTarget = clamp(
        errorTarget,
        TILES_ERROR_TARGET_MIN_PIXELS,
        TILES_ERROR_TARGET_MAX_PIXELS
      );
      restartProgressiveLod();
      tiles?.dispatchEvent({ type: "needs-update" });
      scheduleProgressiveRefinement();
    },

    setShadowSimulationStyle(style) {
      if (!options.shadowBuildingStyle) return;
      shadowSimulationStyle = style;
      if (style?.uniformColor) shadowClayColor.set(style.uniformColor);
      applyMaterialFlags(orientationGroup);
      applyOutlineVisibility(orientationGroup);
      map?.triggerRepaint();
    },

    setProjector(projector) {
      activeProjector = projector;
      syncProjector();
      map?.triggerRepaint();
    },

    setShadowView(view) {
      const nextSignature = getSharedThreeShadowViewSignature(view);
      if (nextSignature === shadowViewSignature) return;
      shadowViewSignature = nextSignature;
      shadowView = view;
      setShadowSelectionEnabled(false);
      applyRequestConcurrency();
      tiles?.dispatchEvent({ type: "needs-update" });
      notifyRequestStateChange();
    },

    setWhiteShading(white: boolean) {
      whiteShading = white;
      applyMaterialFlags(orientationGroup);
      map?.triggerRepaint();
    },

    setClayMaterial(options: ClayMaterialOptions) {
      if (options.color !== undefined) clayColor.set(options.color);
      if (options.roughness !== undefined) {
        clayRoughness = clamp(options.roughness, 0, 1);
      }
      if (options.metalness !== undefined) {
        clayMetalness = clamp(options.metalness, 0, 1);
      }
      for (const state of clayMaterialStates.values()) {
        for (const material of asMaterialArray(state.clay)) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.color.copy(clayColor);
          material.roughness = clayRoughness;
          material.metalness = clayMetalness;
          material.needsUpdate = true;
        }
      }
      applyMaterialFlags(orientationGroup);
      map?.triggerRepaint();
    },

    setClayColor(color: string) {
      layer.setClayMaterial({ color });
    },

    setOpacity(nextOpacity: number) {
      opacity = clamp(nextOpacity, 0, 1);
      applyMaterialFlags(orientationGroup);
      map?.triggerRepaint();
    },

    setWireframe(enabled: boolean) {
      wireframe = enabled;
      applyMaterialFlags(orientationGroup);
      map?.triggerRepaint();
    },

    setOutlineVisible(visible: boolean) {
      outlineVisible = visible;
      applyOutlineVisibility(orientationGroup);
      map?.triggerRepaint();
    },

    setTileBoundsVisible(enabled: boolean) {
      tileBoundsVisible = enabled;
      if (debugTilesPlugin) {
        debugTilesPlugin.displayBoxBounds = enabled;
        debugTilesPlugin.update();
      }
      tiles?.dispatchEvent({ type: "needs-update" });
      map?.triggerRepaint();
    },

    setCacheBudget(bytes: number) {
      cacheBudgetBytes = Math.max(MINIMUM_CACHE_BYTES, Math.floor(bytes));
      applyCacheBudget();
      tiles?.dispatchEvent({ type: "needs-update" });
    },

    setRequestConcurrency(jobs: number) {
      const nextConcurrency = Math.max(0, Math.floor(jobs));
      const changed = nextConcurrency !== requestConcurrency;
      requestConcurrency = nextConcurrency;
      if (!tiles) return;
      applyRequestConcurrency();
      if (tiles.downloadQueue.maxJobs > 0) {
        tiles.downloadQueue.tryRunJobs();
      }
      if (changed) tiles.dispatchEvent({ type: "needs-update" });
    },

    getRequestDemand,
    getViewElevationRange,

    dispose() {
      if (kickstartTimer) {
        window.clearInterval(kickstartTimer);
        kickstartTimer = 0;
      }
      if (refinementTimer) {
        window.clearTimeout(refinementTimer);
        refinementTimer = 0;
      }
      map?.off("movestart", handleViewStart);
      map?.off("moveend", handleViewEnd);
      map?.off("resize", handleViewEnd);
      unsubscribeTerrainLoading?.();
      unsubscribeTerrainLoading = null;
      tiles?.removeEventListener("needs-update", requestRender);
      tiles?.removeEventListener("load-tileset", requestRender);
      tiles?.removeEventListener("update-after", handleUpdateAfter);
      tiles?.removeEventListener("load-model", handleModelLoad);
      tiles?.removeEventListener("dispose-model", handleModelDispose);
      tiles?.removeEventListener("load-error", handleLoadError);
      tiles?.removeEventListener("tiles-load-end", handleTilesLoadEnd);
      cameraSet?.dispose();
      cameraSet = null;
      tileRetries.dispose();
      restoreClayMaterials(orientationGroup);
      restoreShadowSides();
      tiles?.dispose();
      tiles = null;
      debugTilesPlugin = null;
      orientationGroup.clear();
      map = null;
    },
  };

  return layer;
}
