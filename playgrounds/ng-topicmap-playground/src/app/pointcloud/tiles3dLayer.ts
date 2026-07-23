import { TilesRenderer } from "3d-tiles-renderer";
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

import { Gltf1UpgradePlugin } from "./gltf1UpgradePlugin";
import { createTilesCameraSet } from "./tiles-camera-set";
import type { TilesCameraSet } from "./tiles-camera-set";
import type {
  PointcloudSceneFrame,
  PointcloudSceneRuntime,
} from "./pointcloudSceneLayer";

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
const CLAY_COLOR = 0xd6d2ca;

// ─────────────────────────────────────────────────────────────
//  Cesium 3D Tiles (b3dm meshes) inside the shared MapLibre
//  pointcloudSceneLayer, using NASA-AMMOS 3d-tiles-renderer (Apache-2.0).
//
//  The tilesets are georeferenced in ECEF; the ReorientationPlugin
//  maps them into the same local scene frame the point cloud
//  layers use (x east, y up, z south, meters at the layer origin).
//
//  The shared synthesized PerspectiveCamera drives tile LOD and culling;
//  the shared matrix camera draws meshes and points in one depth pass.
// ─────────────────────────────────────────────────────────────

/** Projective image overlay: equirect panorama around a point, or a
 *  perspective frustum (oblique photo) via its view-projection matrix.
 *  Coordinates are scene-frame meters (x east, y up, z south). */
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

export interface Tiles3dLayer extends PointcloudSceneRuntime {
  /** Pause/resume traversal and drawing without destroying the tileset cache. */
  setVisible: (visible: boolean) => void;
  /** Vertical offset in meters (datum corrections included by caller) */
  setHeightOffset: (offsetMeters: number) => void;
  setErrorTarget: (errorTarget: number) => void;
  /** Override textures with flat white shading (reversible) */
  setWhiteShading: (white: boolean) => void;
  setClayColor: (color: string) => void;
  setOpacity: (opacity: number) => void;
  setWireframe: (enabled: boolean) => void;
  setTileBoundsVisible: (enabled: boolean) => void;
  setCacheBudget: (bytes: number) => void;
  setRequestConcurrency: (jobs: number) => void;
  getRequestDemand: () => number;
  /** Project an oriented image onto the mesh (null clears) */
  setProjector: (projector: ImageProjector | null) => void;
  originMerc: MercatorCoordinate;
  mScale: number;
}

export interface Tiles3dLayerOptions {
  cacheBudgetBytes?: number;
  requestConcurrency?: number;
  onRequestStateChange?: () => void;
}

export function buildTiles3dLayer(
  layerId: string,
  tilesetUrl: string,
  originLngLat: [number, number],
  options: Tiles3dLayerOptions = {}
): Tiles3dLayer {
  const originMerc = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const mScale = originMerc.meterInMercatorCoordinateUnits();

  let map: MaplibreMap | null = null;
  let tiles: TilesRenderer | null = null;
  let debugTilesPlugin: DebugTilesPlugin | null = null;
  let cameraSet: TilesCameraSet | null = null;
  let kickstartTimer = 0;
  let refinementTimer = 0;
  let requestedErrorTarget = TILES_ERROR_TARGET_DEFAULT_PIXELS;
  let activeErrorTarget = COVERAGE_ERROR_TARGET_PIXELS;
  let cacheBudgetBytes = Math.max(
    MINIMUM_CACHE_BYTES,
    Math.floor(options.cacheBudgetBytes ?? DEFAULT_CACHE_BYTES)
  );
  let requestConcurrency = Math.max(
    0,
    Math.floor(options.requestConcurrency ?? 4)
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
  let opacity = 1;
  let wireframe = false;
  let tileBoundsVisible = false;
  let runtimeVisible = true;
  let activeProjector: ImageProjector | null = null;
  const placementMatrix = new THREE.Matrix4();
  const inversePlacementMatrix = new THREE.Matrix4();
  const identityRotation = new THREE.Quaternion();

  // Shared projector uniforms — mutated in place, referenced by all
  // patched tile materials (onBeforeCompile below).
  const projUniforms = {
    uProjKind: { value: 0 }, // 0 off, 1 pano, 2 frustum
    uProjOpacity: { value: 0 },
    uProjPos: { value: new THREE.Vector3() },
    uProjHeading: { value: 0 },
    uProjMatrix: { value: new THREE.Matrix4() },
    tProj: { value: null as THREE.Texture | null },
    uClayEnabled: { value: 0 },
    uClayColor: { value: clayColor.clone() },
  };

  const patchMaterialForProjection = (material: THREE.Material) => {
    if ((material as { __projPatched?: boolean }).__projPatched) return;
    (material as { __projPatched?: boolean }).__projPatched = true;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, projUniforms);
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
uniform float uClayEnabled;
uniform vec3 uClayColor;`
        )
        .replace(
          "#include <opaque_fragment>",
          `if (uClayEnabled > 0.5) {
  // The source tiles are intentionally unlit because illumination is baked
  // into their photographs. For the textureless clay view, reconstruct a
  // stable face normal from world-position derivatives so the same relief
  // lighting also works for those MeshBasicMaterial payloads.
  vec3 clayGradient = cross(dFdx(vProjWorld), dFdy(vProjWorld));
  float clayGradientLength = max(length(clayGradient), 1e-5);
  vec3 clayNormal = clayGradient / clayGradientLength;
  if (!gl_FrontFacing) clayNormal = -clayNormal;

  float claySky = clamp(clayNormal.y * 0.5 + 0.5, 0.0, 1.0);
  float clayHemisphere = mix(0.38, 0.72, claySky);
  float clayKey = max(
    dot(clayNormal, normalize(vec3(-0.45, 0.82, -0.35))),
    0.0
  ) * 0.36;
  float clayFill = max(
    dot(clayNormal, normalize(vec3(0.55, 0.35, 0.75))),
    0.0
  ) * 0.16;
  // Replace either unlit or PBR output with the same predictable clay
  // response. This keeps glTF 1 and glTF 2 tiles visually consistent.
  outgoingLight = uClayColor *
    clamp(clayHemisphere + clayKey + clayFill, 0.3, 1.08);
}
#include <opaque_fragment>`
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

  const applyMaterialFlags = (root: THREE.Object3D) => {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
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
        material.opacity =
          (material.userData.__baseOpacity as number) * opacity;
        material.transparent =
          (material.userData.__baseTransparent as boolean) || translucent;
        material.depthWrite =
          (material.userData.__baseDepthWrite as boolean) && !translucent;
        if ("wireframe" in material) {
          (material as THREE.Material & { wireframe: boolean }).wireframe =
            wireframe;
        }
        const textured = material as THREE.MeshStandardMaterial;
        if (whiteShading) {
          if (textured.map) {
            textured.userData.__originalMap = textured.map;
            textured.map = null;
          }
          if (textured.color && !textured.userData.__originalColor) {
            textured.userData.__originalColor = textured.color.clone();
          }
          textured.color?.set(CLAY_COLOR);
        } else {
          if (textured.userData.__originalMap) {
            textured.map = textured.userData.__originalMap as THREE.Texture;
            delete textured.userData.__originalMap;
          }
          if (textured.color && textured.userData.__originalColor) {
            textured.color.copy(
              textured.userData.__originalColor as THREE.Color
            );
            delete textured.userData.__originalColor;
          }
        }
        material.needsUpdate = true;
        patchMaterialForProjection(material);
      }
    });
  };

  const requestRender = () => map?.triggerRepaint();
  const getRequestDemand = () => {
    if (!runtimeVisible) return 0;
    if (!tiles) return 1;
    const queue = tiles.downloadQueue as typeof tiles.downloadQueue & {
      items: unknown[];
      currJobs: number;
    };
    return (
      queue.items.length +
      queue.currJobs +
      (tiles.group.children.length === 0 ? 1 : 0)
    );
  };
  const notifyRequestStateChange = () => options.onRequestStateChange?.();
  const syncProjector = () => {
    const projector = activeProjector;
    if (!projector) {
      projUniforms.uProjKind.value = 0;
      projUniforms.uProjOpacity.value = 0;
      projUniforms.tProj.value = null;
      return;
    }
    // Projectors are authored in the mesh's former standalone scene frame.
    // Apply only the shared-scene placement; the root's Y-180 correction is
    // already represented in those coordinates.
    placementMatrix.compose(
      orientationGroup.position,
      identityRotation,
      orientationGroup.scale
    );
    inversePlacementMatrix.copy(placementMatrix).invert();
    projUniforms.uProjKind.value = projector.kind === "pano" ? 1 : 2;
    projUniforms.uProjOpacity.value = projector.opacity;
    projUniforms.tProj.value = projector.texture;
    if (projector.kind === "pano") {
      projUniforms.uProjPos.value
        .copy(projector.position)
        .applyMatrix4(placementMatrix);
      projUniforms.uProjHeading.value = projector.headingRad;
    } else {
      projUniforms.uProjMatrix.value
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
    restartProgressiveLod();
    tiles?.dispatchEvent({ type: "needs-update" });
  };
  const handleViewEnd = () => {
    tiles?.dispatchEvent({ type: "needs-update" });
    scheduleProgressiveRefinement();
  };
  const handleUpdateAfter = () => {
    scheduleProgressiveRefinement();
    notifyRequestStateChange();
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

  const layer: Tiles3dLayer = {
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
      tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }));
      debugTilesPlugin = new DebugTilesPlugin({
        displayBoxBounds: tileBoundsVisible,
      });
      tiles.registerPlugin(debugTilesPlugin);

      // Reorient the ECEF tileset into the local scene frame at the
      // layer origin: ENU with +Y up, north toward -Z — matching the
      // point cloud layers (x east, y up, z south).
      tiles.registerPlugin(
        new ReorientationPlugin({
          lat: THREE.MathUtils.degToRad(originLngLat[1]),
          lon: THREE.MathUtils.degToRad(originLngLat[0]),
          height: 0,
        })
      );

      tiles.loadSiblings = false;
      tiles.loadAncestors = false;
      tiles.downloadQueue.maxJobs = requestConcurrency;
      tiles.parseQueue.maxJobs = 4;
      tiles.processNodeQueue.maxJobs = 48;
      tiles.maxTilesProcessed = 1_000;
      tiles.lruCache.minSize = 2_048;
      tiles.lruCache.maxSize = 4_096;
      applyCacheBudget();
      restartProgressiveLod();
      offsetGroup.add(tiles.group);

      // Kickstart: tiles.update() only runs inside render(), so nudge
      // the map a few times until the pipeline has work — WITHOUT a
      // permanent per-frame repaint (that keeps the map from ever
      // reaching "idle" and stalls every whenStyleReady() wait).
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
      tiles.addEventListener("load-tile-set", requestRender);
      tiles.addEventListener("update-after", handleUpdateAfter);
      tiles.addEventListener("load-model", (event) => {
        const modelScene = (event as { scene?: THREE.Object3D }).scene;
        if (modelScene) applyMaterialFlags(modelScene);
        notifyRequestStateChange();
        requestRender();
      });
      tiles.addEventListener("load-error", notifyRequestStateChange);
      tiles.addEventListener("tiles-load-end", notifyRequestStateChange);
      map.on("movestart", handleViewStart);
      map.on("moveend", handleViewEnd);
      map.on("resize", handleViewEnd);
    },

    update(frame: PointcloudSceneFrame) {
      if (!runtimeVisible || !tiles || !map) return;
      syncProjector();
      try {
        if (!cameraSet) {
          cameraSet = createTilesCameraSet(tiles, frame.lodCamera);
        }
        cameraSet.update(frame.lodCamera, frame.viewport.x, frame.viewport.y);
        tiles.update();
      } catch (error) {
        console.error("[tiles3d] update failed:", error);
      }

      // Keep repainting while the pipeline has actual work queued —
      // but never unconditionally (a permanent repaint loop prevents
      // the map from reaching "idle", stalling whenStyleReady waits).
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

      // TilesRenderer performs the shared-camera culling. Three's second
      // sphere cull is incompatible with MapLibre's matrix-only draw camera.
      orientationGroup.traverse((object) => {
        object.frustumCulled = false;
      });
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
      requestedErrorTarget = THREE.MathUtils.clamp(
        errorTarget,
        TILES_ERROR_TARGET_MIN_PIXELS,
        TILES_ERROR_TARGET_MAX_PIXELS
      );
      restartProgressiveLod();
      tiles?.dispatchEvent({ type: "needs-update" });
      scheduleProgressiveRefinement();
    },

    setProjector(projector) {
      activeProjector = projector;
      syncProjector();
      map?.triggerRepaint();
    },

    setWhiteShading(white: boolean) {
      whiteShading = white;
      projUniforms.uClayEnabled.value = white ? 1 : 0;
      applyMaterialFlags(orientationGroup);
      map?.triggerRepaint();
    },

    setClayColor(color: string) {
      clayColor.set(color);
      projUniforms.uClayColor.value.copy(clayColor);
      applyMaterialFlags(orientationGroup);
      map?.triggerRepaint();
    },

    setOpacity(nextOpacity: number) {
      opacity = THREE.MathUtils.clamp(nextOpacity, 0, 1);
      applyMaterialFlags(orientationGroup);
      map?.triggerRepaint();
    },

    setWireframe(enabled: boolean) {
      wireframe = enabled;
      applyMaterialFlags(orientationGroup);
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
      tiles.downloadQueue.maxJobs = requestConcurrency;
      if (requestConcurrency > 0) tiles.downloadQueue.tryRunJobs();
      if (changed) tiles.dispatchEvent({ type: "needs-update" });
    },

    getRequestDemand,

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
      tiles?.removeEventListener("needs-update", requestRender);
      tiles?.removeEventListener("load-tile-set", requestRender);
      tiles?.removeEventListener("update-after", handleUpdateAfter);
      cameraSet?.dispose();
      cameraSet = null;
      tiles?.dispose();
      tiles = null;
      debugTilesPlugin = null;
      offsetGroup.clear();
      map = null;
    },
  };

  return layer;
}
