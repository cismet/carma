import { useEffect, useRef, useState } from "react";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  LoadRegionPlugin,
  RayRegion,
  ReorientationPlugin,
  SphereRegion,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import type { Altitude, Coordinates } from "@carma-geo/data-structures";
import {
  dhhn2016ToEllipsoidalHeight,
  getFromWGS84ToUTM32,
} from "@carma-geo/proj";

import { getRampTexture } from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";
import { FloatingPanel } from "../../../ng-topicmap-playground/src/app/pointcloud/PointColorizer";
import type { RampName } from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";
import {
  DEFAULT_COLORIZATION,
  PointColorizer,
} from "../../../ng-topicmap-playground/src/app/pointcloud/PointColorizer";
import type {
  ColorizationConfig,
  ColorizerFieldInfo,
} from "../../../ng-topicmap-playground/src/app/pointcloud/PointColorizer";
import { Gltf1UpgradePlugin } from "../../../ng-topicmap-playground/src/app/pointcloud/gltf1UpgradePlugin";
import {
  openCopcPointSource,
  streamCopcPoints,
  type CopcPointChunk,
  type CopcRegionOfInterest,
  type CopcRigidRegistration,
  type CopcRoiOutsideMode,
  type CopcSceneMetadata,
} from "../../../ng-topicmap-playground/src/app/pointcloud/copcLoader";
import {
  createCopcStreamWorkerClient,
  type CopcWorkerSource,
} from "../../../ng-topicmap-playground/src/app/pointcloud/copc-stream-worker-client";
import {
  createCopcPointCloudVisualizer,
  POINT_SHAPES,
  POINT_SIZE_MODES,
} from "../../../ng-topicmap-playground/src/app/pointcloud/copcPointsLayer";
import type {
  CopcPointCloudVisualizer,
  LayerBlendMode,
  LayerColorSlot,
  PointCompositeMode,
  PointShape,
} from "../../../ng-topicmap-playground/src/app/pointcloud/copcPointsLayer";

export { POINT_SHAPES } from "../../../ng-topicmap-playground/src/app/pointcloud/copcPointsLayer";
export type {
  PointCompositeMode,
  PointShape,
} from "../../../ng-topicmap-playground/src/app/pointcloud/copcPointsLayer";
import { formatPointCloudAcquisitionDate } from "../../../ng-topicmap-playground/src/app/pointcloud/point-cloud-assets";
import type { PointCloudAcquisitionDate } from "../../../ng-topicmap-playground/src/app/pointcloud/point-cloud-assets";
import {
  DEFAULT_GEORADAR_ROAD,
  GEORADAR_ROADS,
  getRoadLocalSegments,
  getRoadSourceSegments,
} from "../data/georadarRoads";

export type StandalonePointCloudColor = "white" | "rgb" | "classification" | "intensity";
export type StandaloneMetricBlendMode = "normal" | "multiply";
export type StandalonePointSizeMode = "auto" | "pixels" | "meters";
export type StandaloneBackground = "white" | "black";
export type StandaloneClampMode = "auto" | "manual";
export const POINT_CLOUD_HEIGHT_DATUMS = {
  DHHN2016: "dhhn2016",
  ELLIPSOIDAL: "ellipsoidal",
} as const;
export type PointCloudHeightDatum =
  (typeof POINT_CLOUD_HEIGHT_DATUMS)[keyof typeof POINT_CLOUD_HEIGHT_DATUMS];

export const POINT_METRICS = [
  "none",
  "rgb",
  "classification",
  "z",
  "intensity",
  "returnnumber",
  "numberofreturns",
  "synthetic",
  "keypoint",
  "withheld",
  "overlap",
  "scannerchannel",
  "scandirectionflag",
  "edgeofflightline",
  "userdata",
  "scanangle",
  "pointsourceid",
  "gpstime",
  "traceid",
  "tracestation",
  "sliceindex",
  "sliceid",
  "depthlayer",
  "depthmm",
  "surfacepointindex",
  "pointindex",
] as const;

export type PointMetric = (typeof POINT_METRICS)[number];

export interface StandalonePointCloudViewerProps {
  datasetUrl: string;
  datasetName?: string;
  sourceTag?: string;
  acquiredOn?: PointCloudAcquisitionDate | null;
  registration?: CopcRigidRegistration;
  /** Canonical lowercase scalar fields decoded from each COPC node. */
  fieldDimensions?: readonly string[];
  /** Whether the asset-wide audit found usable varying RGB channels. */
  hasRgb?: boolean;
  pointBudgetPercent?: number;
  sizeMode?: StandalonePointSizeMode;
  pointSize?: number;
  radiusMeters?: number;
  radiusScale?: number;
  shape?: PointShape;
  color?: StandalonePointCloudColor;
  metric?: PointMetric;
  metricBlendMode?: StandaloneMetricBlendMode;
  colorRamp?: RampName;
  clampMode?: StandaloneClampMode;
  clampMin?: number;
  clampMax?: number;
  pointCompositeMode?: PointCompositeMode;
  background?: StandaloneBackground;
  sourceHeightDatum?: PointCloudHeightDatum;
  heightOffset?: number;
  showMesh2024?: boolean;
  meshErrorTarget?: number;
  meshOpacity?: number;
  meshWhite?: boolean;
  roadRoiEnabled?: boolean;
  roadName?: string;
  roadWidthMeters?: number;
  roadBudgetPercent?: number;
  roadOutsideMode?: CopcRoiOutsideMode;
  roadOutsideDepth?: number;
  showRoadRoiControls?: boolean;
  showFieldColorizer?: boolean;
  /** Hides the floating reopen button when an external UI hosts the trigger. */
  showFieldColorizerButton?: boolean;
  pickingEnabled?: boolean;
  pickKind?: "pointcloud" | "mesh";
  registrationMatrix?: THREE.Matrix4;
  /** localStorage key that keeps camera position and target across reloads. */
  cameraStorageKey?: string;
  /** Re-runs the maximize-current-view refinement after every camera move. */
  autoMaximizeOnCameraEnd?: boolean;
  onPick?: (kind: "pointcloud" | "mesh", point: THREE.Vector3) => void;
  /** Fires when a pair's scene marker (point, axes, or line) is clicked. */
  onPairPicked?: (pairIndex: number) => void;
  onColorizerOptionsChange?: (options: {
    color: StandalonePointCloudColor;
    metric: PointMetric;
    colorRamp: RampName;
    clampMode: StandaloneClampMode;
    clampMin: number;
    clampMax: number;
  }) => void;
  onMeshLoadStateChange?: (state: "loading" | "loaded" | "error") => void;
  onViewerReady?: (actions: {
    framePointCloud: () => void;
    frameMesh: () => void;
    frameRegistrationPairs: (points: readonly THREE.Vector3[]) => void;
    maximizeCurrentView: () => void;
    setRegistrationPairLines: (
      pairs: readonly { pointcloud: THREE.Vector3; mesh: THREE.Vector3 }[],
      selectedPairIndex?: number | null
    ) => void;
    highlightPoint: (kind: "pointcloud" | "mesh", point: THREE.Vector3) => void;
    setMeshInspectionPreview: (preview: { enabled: boolean; opacity: number; wireframe: boolean }) => void;
    openFieldColorizer: () => void;
  }) => void;
}

interface RoiState {
  enabled: boolean;
  roadName: string;
  widthMeters: number;
  budgetPercent: number;
  outsideMode: CopcRoiOutsideMode;
  outsideDepth: number;
}

interface ViewerSettings {
  sizeMode: StandalonePointSizeMode;
  pointSize: number;
  radiusMeters: number;
  radiusScale: number;
  shape: PointShape;
  color: StandalonePointCloudColor;
  metric: PointMetric;
  metricBlendMode: StandaloneMetricBlendMode;
  colorRamp: RampName;
  clampMode: StandaloneClampMode;
  clampMin: number;
  clampMax: number;
  pointCompositeMode: PointCompositeMode;
  background: StandaloneBackground;
  sourceHeightDatum: PointCloudHeightDatum;
  heightOffset: number;
  showMesh2024: boolean;
  meshErrorTarget: number;
  meshOpacity: number;
  meshWhite: boolean;
}

interface CachedRange {
  min: number;
  max: number;
  chunkCount: number;
}

const frameObject = (
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls
) => {
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return;

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 10) * 0.5;
  const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const direction = new THREE.Vector3(1, 0.72, 1).normalize();

  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance * 1.25);
  camera.near = Math.max(0.05, radius / 10_000);
  camera.far = Math.max(2_000, radius * 100);
  camera.updateProjectionMatrix();
  controls.update();
};

const addMesh2024 = async (
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  metadata: CopcSceneMetadata,
  sourceHeightDatum: PointCloudHeightDatum,
  errorTarget: number,
  opacity: number,
  white: boolean,
  onMeshTileContentLoaded?: (scene: THREE.Object3D) => void,
  onMeshStatus?: (status: string | null) => void
) => {
  const [centerEast, centerNorth] = getFromWGS84ToUTM32(
    metadata.centerLngLat as Parameters<typeof getFromWGS84ToUTM32>[0]
  ) as [number, number];
  const tiles = new TilesRenderer(WUPP_MESH_2024.url);
  // Debug handle for interactive inspection in the browser console.
  (window as unknown as { __meshTiles?: unknown }).__meshTiles = tiles;
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
  );

  tiles.registerPlugin(new ImplicitTilingPlugin());
  tiles.registerPlugin(new UpdateOnChangePlugin());
  tiles.registerPlugin(new Gltf1UpgradePlugin());
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }));
  tiles.registerPlugin(
    new ReorientationPlugin({
      lat: THREE.MathUtils.degToRad(metadata.centerLngLat[1]),
      lon: THREE.MathUtils.degToRad(metadata.centerLngLat[0]),
      // Mesh 2024 is EPSG:4978. The local origin must therefore always use
      // the cloud's zBase expressed as an ellipsoidal height.
      height:
        sourceHeightDatum === POINT_CLOUD_HEIGHT_DATUMS.DHHN2016
          ? await dhhn2016ToEllipsoidalHeight(
              {
                east: centerEast as Coordinates.ETRS89UTMEastingMeters,
                north: centerNorth as Coordinates.ETRS89UTMNorthingMeters,
                zone: 32,
              },
              metadata.zBase as Altitude.DHHN2016Meters
            )
          : metadata.zBase,
    })
  );
  // Progressive LOD like the production Mesh 2024 runtime: establish full
  // coverage at a coarse error target first, then halve toward the requested
  // target whenever the tile queues drain. Jumping straight to a sub-pixel
  // target would leave the surface in scattered patches for minutes.
  const coverageErrorTarget = 64;
  let requestedErrorTarget = errorTarget;
  let activeErrorTarget = Math.max(requestedErrorTarget, coverageErrorTarget);
  tiles.errorTarget = activeErrorTarget;
  const readQueueStats = () =>
    (
      tiles as unknown as {
        stats: { queued: number; downloading: number; parsing: number };
      }
    ).stats;
  const refineTimer = window.setInterval(() => {
    if (activeErrorTarget <= requestedErrorTarget) return;
    const { queued, downloading, parsing } = readQueueStats();
    if (queued + downloading + parsing > 0) return;
    activeErrorTarget = Math.max(requestedErrorTarget, activeErrorTarget / 2);
    tiles.errorTarget = activeErrorTarget;
    tiles.dispatchEvent({ type: "needs-update" });
  }, 600);
  const applyErrorTarget = (next: number) => {
    requestedErrorTarget = next;
    if (next > activeErrorTarget) {
      activeErrorTarget = next;
      tiles.errorTarget = next;
      tiles.dispatchEvent({ type: "needs-update" });
    }
  };
  tiles.loadSiblings = false;
  tiles.loadAncestors = false;
  // The public Wuppertal host aborts request bursts near the renderer's
  // generic default of 25 concurrent downloads with ERR_HTTP2_PROTOCOL_ERROR
  // (same limit as the production Mesh 2024 runtime uses).
  tiles.downloadQueue.maxJobs = 8;
  tiles.parseQueue.maxJobs = 8;
  tiles.processNodeQueue.maxJobs = 64;
  // Best-quality targets refine deep, but memory belongs to the CURRENT view:
  // a low retention floor trashes out-of-view tiles early instead of keeping
  // a city-wide working set resident. Visible tiles are marked used every
  // traversal, so the surface in view never loses tiles to this.
  tiles.maxTilesProcessed = 1_000;
  tiles.lruCache.minSize = 128;
  tiles.lruCache.maxSize = 4_096;
  tiles.lruCache.unloadPercent = 0.35;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  // ReorientationPlugin produces X west / Z north. Point chunks use X east /
  // Z south, so keep the plugin-owned transform untouched and correct axes in
  // a persistent outer anchor frame (the plugin updates tiles.group later).
  const anchorGroup = new THREE.Group();
  anchorGroup.rotation.y = Math.PI;
  anchorGroup.add(tiles.group);
  scene.add(anchorGroup);
  anchorGroup.updateWorldMatrix(true, true);

  // The Mesh 2024 tileset covers a much larger area than an individual COPC.
  // Keep only tiles whose loaded scene bounds intersect the COPC's local
  // octree extent. This also prevents ray picking from hitting unrelated mesh
  // geometry outside the point-cloud registration area.
  const pointCloudBoundsLocal = new THREE.Box3(
    new THREE.Vector3(
      metadata.boundsLocal[0][0],
      metadata.zMin - metadata.zBase,
      metadata.boundsLocal[0][1]
    ),
    new THREE.Vector3(
      metadata.boundsLocal[1][0],
      metadata.zMax - metadata.zBase,
      metadata.boundsLocal[1][1]
    )
  );
  // Limit tile LOADING (not just visibility) to the point-cloud
  // neighbourhood: without a mask region the renderer downloads and parses
  // city-wide tiles that the visibility filter below hides again anyway.
  // errorTarget Infinity keeps the region a pure mask — refinement depth
  // stays camera-driven. The sphere lives in the tileset frame, so it is
  // refreshed before every traversal (the reorientation transform only
  // settles after the root tileset has loaded).
  const loadRegionPlugin = new LoadRegionPlugin();
  const loadRegionSphere = new SphereRegion({
    mask: true,
    errorTarget: Number.POSITIVE_INFINITY,
  });
  loadRegionPlugin.addRegion(loadRegionSphere);
  // Screen-center detail ray: tiles pierced by the view-center ray always
  // carry enough region error to refine to leaf tiles, independent of the
  // camera-driven screen-space error. This is what makes the screen center
  // reach the lowest error first while the periphery follows.
  const centerDetailRay = new RayRegion({ mask: false, errorTarget: 0 });
  loadRegionPlugin.addRegion(centerDetailRay);
  tiles.registerPlugin(loadRegionPlugin);
  const loadRegionMargin = 30;
  const tilesFrameFromScene = new THREE.Matrix4();
  const updateLoadRegion = () => {
    tiles.group.updateWorldMatrix(true, false);
    pointCloudBoundsLocal.getBoundingSphere(loadRegionSphere.sphere);
    loadRegionSphere.sphere.radius += loadRegionMargin;
    tilesFrameFromScene.copy(tiles.group.matrixWorld).invert();
    loadRegionSphere.sphere.applyMatrix4(tilesFrameFromScene);
    camera.updateMatrixWorld();
    centerDetailRay.ray.origin.copy(camera.position);
    camera.getWorldDirection(centerDetailRay.ray.direction);
    centerDetailRay.ray.applyMatrix4(tilesFrameFromScene);
  };
  updateLoadRegion();
  tiles.addEventListener("update-before", updateLoadRegion);

  // Tile and root failures must neither stay silent nor permanent: retry
  // with backoff like the production Mesh 2024 runtime and surface the state
  // in the viewer status line. Without this, one failed tileset request
  // means "mesh never shows up" with no visible reason.
  const retryDelaysMilliseconds = [1_000, 3_000, 8_000, 20_000, 60_000];
  let retryAttempt = 0;
  let retryTimer = 0;
  let tileErrorCount = 0;
  let lastTileError = "";
  let rootLoaded = false;
  let contentSeen = false;
  const readTileStats = () =>
    (tiles as unknown as { stats: { failed: number } }).stats;
  const publishStatus = () => {
    if (!onMeshStatus) return;
    if (tileErrorCount > 0) {
      onMeshStatus(
        `Mesh 2024: ${tileErrorCount} tile error(s) · ${lastTileError}${
          retryTimer ? ` · retry ${retryAttempt} scheduled` : ""
        }`
      );
    } else if (!contentSeen) {
      onMeshStatus(
        rootLoaded
          ? "Mesh 2024: loading visible tiles…"
          : "Mesh 2024: loading tileset index…"
      );
    } else {
      onMeshStatus(null);
    }
  };
  publishStatus();
  const scheduleFailedTileRetry = () => {
    if (retryTimer) return;
    const delay =
      retryDelaysMilliseconds[
        Math.min(retryAttempt, retryDelaysMilliseconds.length - 1)
      ];
    retryAttempt += 1;
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      try {
        tiles.resetFailedTiles();
      } catch (cause) {
        lastTileError = cause instanceof Error ? cause.message : String(cause);
      }
      tiles.dispatchEvent({ type: "needs-update" });
      publishStatus();
    }, delay);
  };
  const onLoadRootTileset = () => {
    rootLoaded = true;
    publishStatus();
    // The reorientation transform only settles with the root tileset. Any
    // traversal that ran before it saw the load-region mask in the wrong
    // frame and selected nothing — force a fresh traversal now that the
    // frame is correct, otherwise a slow tileset.json response leaves the
    // renderer idle forever (UpdateOnChangePlugin only re-runs on changes).
    tiles.dispatchEvent({ type: "needs-update" });
  };
  const onLoadError = (event: { error?: unknown; url?: string | URL }) => {
    tileErrorCount += 1;
    lastTileError = (
      event.error instanceof Error ? event.error.message : String(event.error)
    )
      .replace(/\s+/g, " ")
      .slice(0, 140);
    scheduleFailedTileRetry();
    publishStatus();
  };
  const onTilesLoadEnd = () => {
    if (readTileStats().failed === 0) {
      tileErrorCount = 0;
      lastTileError = "";
      retryAttempt = 0;
    }
    publishStatus();
  };
  tiles.addEventListener("load-root-tileset", onLoadRootTileset);
  tiles.addEventListener("load-error", onLoadError);
  tiles.addEventListener("tiles-load-end", onTilesLoadEnd);
  // Anti-stall watchdog: unconditionally force a re-traversal every two
  // seconds. UpdateOnChangePlugin only re-runs on detected changes, and any
  // missed event or transform race (settling reorientation frame, stale
  // load-region mask) otherwise leaves the renderer idle with missing tiles
  // for the current frustum. A redundant traversal is cheap; a stale mesh
  // never self-heals.
  const watchdogTimer = window.setInterval(() => {
    tiles.dispatchEvent({ type: "needs-update" });
  }, 2_000);

  // No renderer-level clipping and no per-tile visibility filtering: the
  // load-region mask above already bounds what gets downloaded, and loaded
  // tiles render in full at the best available quality. The event name is
  // "load-model" in 3d-tiles-renderer 0.4.x — it carries the tile scene.
  const onTileContentLoaded = (event: { scene?: THREE.Object3D }) => {
    if (!event.scene) return;
    contentSeen = true;
    publishStatus();
    onMeshTileContentLoaded?.(event.scene);
  };
  tiles.addEventListener("load-model", onTileContentLoaded);

  return {
    tiles,
    applyErrorTarget,
    /** Forces a fresh traversal for the current frustum on the next frame. */
    kick: () => tiles.dispatchEvent({ type: "needs-update" }),
    /**
     * Restarts the progressive LOD ladder from the coarse coverage target.
     * After a significant camera move this fills the new view with coverage
     * tiles within a couple of queue drains instead of grinding leaf tiles
     * into a sub-pixel target while the area looks stale.
     */
    resetProgressiveLoad: () => {
      activeErrorTarget = Math.max(requestedErrorTarget, coverageErrorTarget);
      tiles.errorTarget = activeErrorTarget;
      tiles.dispatchEvent({ type: "needs-update" });
    },
    /**
     * True when the mesh has nothing left to fetch for the current view:
     * root arrived, download/parse queues are empty, and the progressive
     * LOD ladder has reached the requested error target.
     */
    isIdle: () => {
      const { queued, downloading, parsing } = readQueueStats();
      return (
        rootLoaded &&
        queued + downloading + parsing === 0 &&
        activeErrorTarget <= requestedErrorTarget
      );
    },
    dispose: () => {
      window.clearInterval(refineTimer);
      window.clearInterval(watchdogTimer);
      window.clearTimeout(retryTimer);
      scene.remove(anchorGroup);
      tiles.removeEventListener("update-before", updateLoadRegion);
      tiles.removeEventListener("load-root-tileset", onLoadRootTileset);
      tiles.removeEventListener("load-error", onLoadError);
      tiles.removeEventListener("tiles-load-end", onTilesLoadEnd);
      tiles.removeEventListener("load-model", onTileContentLoaded);
      onMeshStatus?.(null);
      tiles.dispose();
      dracoLoader.dispose();
    },
  };
};

interface ViewerRuntime {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  visualizer: CopcPointCloudVisualizer;
  chunks: CopcPointChunk[];
  chunksByNodeKey: Map<string, CopcPointChunk>;
  ranges: Map<string, CachedRange>;
  uploadedMetric: string | null;
  uploadedBaseField: string | null;
  metadata?: CopcSceneMetadata;
  mesh?: Awaited<ReturnType<typeof addMesh2024>>;
  meshLoad?: Promise<void>;
  /** Lazily opened random-access COPC source for view refinement. */
  copcSource?: Promise<CopcWorkerSource>;
  /** Cancellation token of the currently running maximize-view refinement. */
  refineToken?: { cancelled: boolean };
  meshDesiredVisible: boolean;
  meshDesiredErrorTarget: number;
  meshOpacity: number;
  meshInspectionPreview: boolean;
  meshPreviewOpacity: number;
  meshPreviewWireframe: boolean;
  meshWhite: boolean;
  disposed: boolean;
  reportError: (message: string) => void;
  meshLoadStateChange: (state: "loading" | "loaded" | "error") => void;
  meshStatusChange: (status: string | null) => void;
  roiGuide?: THREE.LineSegments;
}

const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, value));

/**
 * Upper bound for points ADDED by one "maximize current view" refinement
 * (chunks outside the view are released first). Each point carries position,
 * color, and several scalar fields, so this keeps a refinement pass at a few
 * hundred megabytes instead of tab-killing.
 */
const MAXIMIZE_VIEW_POINT_LIMIT = 6_000_000;

const sameRoi = (a: RoiState, b: RoiState): boolean =>
  a.enabled === b.enabled &&
  a.roadName === b.roadName &&
  a.widthMeters === b.widthMeters &&
  a.budgetPercent === b.budgetPercent &&
  a.outsideMode === b.outsideMode &&
  a.outsideDepth === b.outsideDepth;

const toLoaderRoi = (roi: RoiState): CopcRegionOfInterest => ({
  segments: getRoadSourceSegments(roi.roadName),
  widthMeters: Math.max(1, roi.widthMeters),
  insideBudgetShare: clampPercent(roi.budgetPercent) / 100,
  outsideMode: roi.outsideMode,
  outsideDepth: Math.max(0, Math.round(roi.outsideDepth)),
});

function RoiControls({
  value,
  onChange,
  onApply,
}: {
  value: RoiState;
  onChange: (next: RoiState) => void;
  onApply: () => void;
}) {
  const update = <Key extends keyof RoiState>(key: Key, next: RoiState[Key]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="pointcloud-roi-panel">
      <label className="pointcloud-roi-heading">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => update("enabled", event.target.checked)}
        />
        Named-road ROI
      </label>

      <label>
        Road / path
        <select
          value={value.roadName}
          onChange={(event) => update("roadName", event.target.value)}
        >
          {GEORADAR_ROADS.map((road) => (
            <option key={road.properties.name} value={road.properties.name}>
              {road.properties.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        Corridor width {value.widthMeters.toFixed(0)} m
        <input
          type="range"
          min={2}
          max={80}
          step={2}
          value={value.widthMeters}
          onChange={(event) =>
            update("widthMeters", Number(event.target.value))
          }
        />
      </label>

      <label>
        ROI budget {value.budgetPercent.toFixed(0)}%
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={value.budgetPercent}
          onChange={(event) =>
            update("budgetPercent", Number(event.target.value))
          }
        />
      </label>

      <label>
        Outside
        <select
          value={value.outsideMode}
          onChange={(event) =>
            update("outsideMode", event.target.value as CopcRoiOutsideMode)
          }
        >
          <option value="hide">Hide</option>
          <option value="uniform">Uniform tree level</option>
        </select>
      </label>

      {value.outsideMode === "uniform" && (
        <label>
          Outside tree level {value.outsideDepth}
          <input
            type="range"
            min={0}
            max={8}
            value={value.outsideDepth}
            onChange={(event) =>
              update("outsideDepth", Number(event.target.value))
            }
          />
        </label>
      )}

      <button type="button" onClick={onApply}>
        Apply named road
      </button>
    </div>
  );
}

const metricFieldName = (metric: PointMetric): string | null =>
  metric === "none" || metric === "rgb" || metric === "classification"
    ? null
    : metric;

const getMetricRange = (
  runtime: ViewerRuntime,
  fieldName: string
): [number, number] => {
  const cached = runtime.ranges.get(fieldName) ?? {
    min: Infinity,
    max: -Infinity,
    chunkCount: 0,
  };

  for (let index = cached.chunkCount; index < runtime.chunks.length; index++) {
    const values = runtime.chunks[index].fieldValues[fieldName];
    if (!values) continue;
    for (let valueIndex = 0; valueIndex < values.length; valueIndex++) {
      const value = values[valueIndex];
      if (!Number.isFinite(value)) continue;
      if (value < cached.min) cached.min = value;
      if (value > cached.max) cached.max = value;
    }
  }
  cached.chunkCount = runtime.chunks.length;
  runtime.ranges.set(fieldName, cached);

  return Number.isFinite(cached.min) && Number.isFinite(cached.max)
    ? [cached.min, cached.max]
    : [0, 1];
};

const baseColorSlot = (
  runtime: ViewerRuntime,
  settings: ViewerSettings
): LayerColorSlot =>
  settings.color === "intensity"
    ? {
        mode: 3,
        rampTexture: getRampTexture(settings.colorRamp),
        range:
          settings.clampMode === "manual"
            ? ([settings.clampMin, settings.clampMax] as [number, number])
            : getMetricRange(runtime, "intensity"),
        gamma: 1,
      }
    : { mode: settings.color === "white" ? 0 : settings.color === "rgb" ? 1 : 2 };

const metricColorSlot = (
  runtime: ViewerRuntime,
  settings: ViewerSettings
): LayerColorSlot => {
  if (settings.metric === "none") return { mode: 0 };
  if (settings.metric === "rgb") return { mode: 1 };
  if (settings.metric === "classification") return { mode: 2 };

  const range =
    settings.clampMode === "manual"
      ? ([settings.clampMin, settings.clampMax] as [number, number])
      : getMetricRange(runtime, settings.metric);
  return {
    mode: 3,
    rampTexture: getRampTexture(settings.colorRamp),
    range,
    gamma: 1,
  };
};

const uploadMetric = (runtime: ViewerRuntime, metric: PointMetric) => {
  const fieldName = metricFieldName(metric);
  if (fieldName === runtime.uploadedMetric) return;

  runtime.chunks.forEach((chunk, index) => {
    runtime.visualizer.setChunkField(
      "b",
      index,
      fieldName ? chunk.fieldValues[fieldName] ?? null : null
    );
  });
  runtime.uploadedMetric = fieldName;
};

const uploadBaseField = (runtime: ViewerRuntime, color: StandalonePointCloudColor) => {
  const fieldName = color === "intensity" ? "intensity" : null;
  if (fieldName === runtime.uploadedBaseField) return;
  runtime.chunks.forEach((chunk, index) => {
    runtime.visualizer.setChunkField(
      "a",
      index,
      fieldName ? chunk.fieldValues[fieldName] ?? null : null
    );
  });
  runtime.uploadedBaseField = fieldName;
};

const applyColorSettings = (
  runtime: ViewerRuntime,
  settings: ViewerSettings
) => {
  uploadBaseField(runtime, settings.color);
  uploadMetric(runtime, settings.metric);
  const blendMode: LayerBlendMode =
    settings.metricBlendMode === "multiply" ? 1 : 0;
  runtime.visualizer.setColorization(
    baseColorSlot(runtime, settings),
    metricColorSlot(runtime, settings),
    { mode: 0 },
    { mode: blendMode, opacity: 1 },
    { mode: 0, opacity: 0 }
  );
};

const syncMesh = (runtime: ViewerRuntime, settings: ViewerSettings) => {
  runtime.meshDesiredVisible = settings.showMesh2024;
  // Re-apply the quality slider only when it actually changed, so unrelated
  // settings churn cannot silently undo a maximize-view refinement.
  const meshErrorTargetChanged =
    runtime.meshDesiredErrorTarget !== settings.meshErrorTarget;
  runtime.meshDesiredErrorTarget = settings.meshErrorTarget;
  runtime.meshOpacity = settings.meshOpacity;
  runtime.meshWhite = settings.meshWhite;
  if (
    settings.showMesh2024 &&
    runtime.metadata &&
    !runtime.mesh &&
    !runtime.meshLoad
  ) {
    runtime.meshLoadStateChange("loading");
    let meshContentNotified = false;
    const pending = addMesh2024(
      runtime.scene,
      runtime.renderer,
      runtime.camera,
      runtime.metadata,
      settings.sourceHeightDatum,
        settings.meshErrorTarget,
        settings.meshOpacity,
        settings.meshWhite,
        (tileScene) => {
          // "loaded" means actual tile content arrived — not merely that the
          // renderer was constructed.
          if (!meshContentNotified) {
            meshContentNotified = true;
            runtime.meshLoadStateChange("loaded");
          }
          // Tiles fetched later (camera moves, refinement) must match the
          // current appearance settings, not the defaults they shipped with.
          tileScene.traverse((object) => {
            if (object.userData.isRegistrationWireframeOverlay) return;
            const objectMaterial = (object as THREE.Mesh).material;
            const materials = Array.isArray(objectMaterial)
              ? objectMaterial
              : [objectMaterial];
            materials.forEach((material) => {
              if (!material) return;
              material.transparent = runtime.meshOpacity < 1;
              material.opacity = runtime.meshOpacity;
              if (runtime.meshWhite && "color" in material) {
                (material as THREE.MeshBasicMaterial).color.set(0xffffff);
              }
              material.needsUpdate = true;
            });
          });
          if (runtime.meshInspectionPreview) {
            applyMeshInspectionPreview(tileScene, {
              enabled: true,
              opacity: runtime.meshPreviewOpacity,
              wireframe: runtime.meshPreviewWireframe,
            });
          }
        },
        (status) => runtime.meshStatusChange(status)
    )
      .then((mesh) => {
        if (runtime.disposed || !runtime.meshDesiredVisible) {
          mesh.dispose();
          return;
        }
        mesh.applyErrorTarget(runtime.meshDesiredErrorTarget);
        mesh.tiles.group.traverse((object) => {
          // The wireframe inspection overlay keeps its own material — the
          // mesh opacity slider and white shading never touch it.
          if (object.userData.isRegistrationWireframeOverlay) return;
          const objectMaterial = (object as THREE.Mesh).material;
          const materials = Array.isArray(objectMaterial)
            ? objectMaterial
            : [objectMaterial];
          materials.forEach((material) => {
            if (!material) return;
            material.transparent = runtime.meshOpacity < 1;
            material.opacity = runtime.meshOpacity;
            if (runtime.meshWhite && "color" in material) {
              (material as THREE.MeshBasicMaterial).color.set(0xffffff);
            }
            material.needsUpdate = true;
          });
        });
        runtime.mesh = mesh;
        if (runtime.meshInspectionPreview) {
          applyMeshInspectionPreview(runtime.mesh.tiles.group, {
            enabled: true,
            opacity: runtime.meshPreviewOpacity,
            wireframe: runtime.meshPreviewWireframe,
          });
        }
      })
      .catch((cause: unknown) => {
        runtime.meshLoadStateChange("error");
        if (!runtime.disposed) {
          runtime.reportError(
            `Mesh 2024: ${
              cause instanceof Error ? cause.message : String(cause)
            }`
          );
        }
      })
      .finally(() => {
        if (runtime.meshLoad === pending) runtime.meshLoad = undefined;
      });
    runtime.meshLoad = pending;
  } else if (!settings.showMesh2024 && runtime.mesh) {
    runtime.mesh.dispose();
    runtime.mesh = undefined;
    runtime.meshStatusChange(null);
  }
  if (runtime.mesh) {
    if (meshErrorTargetChanged) {
      runtime.mesh.applyErrorTarget(settings.meshErrorTarget);
    }
    runtime.mesh.tiles.group.traverse((object) => {
      // The wireframe inspection overlay stays at full strength regardless
      // of the mesh opacity slider.
      if (object.userData.isRegistrationWireframeOverlay) return;
      const material = (object as THREE.Mesh).material;
      if (!material || Array.isArray(material)) return;
      material.transparent = settings.meshOpacity < 1;
      material.opacity = settings.meshOpacity;
      material.needsUpdate = true;
    });
    if (runtime.meshInspectionPreview) {
      applyMeshInspectionPreview(runtime.mesh.tiles.group, {
        enabled: true,
        opacity: runtime.meshPreviewOpacity,
        wireframe: runtime.meshPreviewWireframe,
      });
    }
  }

  // Point clouds always depth-test against the scene, including mesh
  // comparisons. Composite mode controls whether splats also write depth.
  runtime.visualizer.setDepthTest(true);
  runtime.visualizer.group.renderOrder = 0;
};

type MeshInspectionPreview = {
  enabled: boolean;
  opacity: number;
  wireframe: boolean;
};

const applyMeshInspectionPreview = (object: THREE.Object3D, preview: MeshInspectionPreview) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.material) return;
    if (mesh.userData.isRegistrationWireframeOverlay) return;
    const wireframeOverlay = mesh.userData.registrationWireframeOverlay as THREE.LineSegments | undefined;
    if (preview.enabled && preview.wireframe && !wireframeOverlay) {
      const overlay = new THREE.LineSegments(
        new THREE.WireframeGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({
          color: 0x000000,
          transparent: false,
          opacity: 1,
          depthTest: true,
          depthWrite: false,
        })
      );
      overlay.renderOrder = 1001;
      overlay.userData.isRegistrationWireframeOverlay = true;
      mesh.add(overlay);
      mesh.userData.registrationWireframeOverlay = overlay;
    } else if ((!preview.enabled || !preview.wireframe) && wireframeOverlay) {
      mesh.remove(wireframeOverlay);
      wireframeOverlay.geometry.dispose();
      (wireframeOverlay.material as THREE.Material).dispose();
      delete mesh.userData.registrationWireframeOverlay;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const previewMaterial = material as THREE.Material & {
        wireframe?: boolean;
        userData: Record<string, unknown>;
      };
      if (!previewMaterial.userData.registrationPreview) {
        previewMaterial.userData.registrationPreview = {
          transparent: material.transparent,
          opacity: material.opacity,
          wireframe: previewMaterial.wireframe,
          color: "color" in material ? (material as THREE.MeshBasicMaterial).color.getHex() : undefined,
          polygonOffset: material.polygonOffset,
          polygonOffsetFactor: material.polygonOffsetFactor,
          polygonOffsetUnits: material.polygonOffsetUnits,
        };
      }
      const original = previewMaterial.userData.registrationPreview as {
        transparent: boolean;
        opacity: number;
        wireframe?: boolean;
        color?: number;
        polygonOffset: boolean;
        polygonOffsetFactor: number;
        polygonOffsetUnits: number;
      };
      material.transparent = preview.enabled || original.transparent;
      material.opacity = preview.enabled ? preview.opacity : original.opacity;
      previewMaterial.wireframe = original.wireframe;
      // While the wireframe overlay is shown, push the solid surface slightly
      // back in depth so the overlay lines pass the depth test everywhere on
      // the surface instead of z-fighting with it.
      const wireframeActive = preview.enabled && preview.wireframe;
      material.polygonOffset = wireframeActive || original.polygonOffset;
      material.polygonOffsetFactor = wireframeActive ? 1 : original.polygonOffsetFactor;
      material.polygonOffsetUnits = wireframeActive ? 1 : original.polygonOffsetUnits;
      if ("color" in material) {
        (material as THREE.MeshBasicMaterial).color.setHex(original.color ?? 0xffffff);
      }
      material.needsUpdate = true;
    });
  });
};

const setMeshInspectionPreview = (runtime: ViewerRuntime, preview: MeshInspectionPreview) => {
  runtime.meshInspectionPreview = preview.enabled;
  runtime.meshPreviewOpacity = preview.opacity;
  runtime.meshPreviewWireframe = preview.wireframe;
  if (runtime.mesh) applyMeshInspectionPreview(runtime.mesh.tiles.group, preview);
};

const removeRoiGuide = (runtime: ViewerRuntime) => {
  const guide = runtime.roiGuide;
  if (!guide) return;
  runtime.scene.remove(guide);
  guide.geometry.dispose();
  const materials = Array.isArray(guide.material)
    ? guide.material
    : [guide.material];
  materials.forEach((material) => material.dispose());
  runtime.roiGuide = undefined;
};

const syncRoi = (
  runtime: ViewerRuntime,
  settings: ViewerSettings,
  roi: RoiState
) => {
  removeRoiGuide(runtime);
  if (!roi.enabled || !runtime.metadata) {
    runtime.visualizer.setClipCorridor(null);
    return;
  }

  const segments = getRoadLocalSegments(roi.roadName, runtime.metadata);
  runtime.visualizer.setClipCorridor(
    roi.outsideMode === "hide"
      ? { segments, halfWidth: Math.max(1, roi.widthMeters) / 2 }
      : null
  );

  const guideY =
    settings.heightOffset + runtime.metadata.zMax - runtime.metadata.zBase;
  const positions = new Float32Array(
    segments.flatMap((segment) => [
      segment.startX,
      guideY,
      segment.startZ,
      segment.endX,
      guideY,
      segment.endZ,
    ])
  );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0x00a8c8,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  const guide = new THREE.LineSegments(geometry, material);
  guide.renderOrder = 10;
  runtime.scene.add(guide);
  runtime.roiGuide = guide;
};

const applyViewerSettings = (
  runtime: ViewerRuntime,
  settings: ViewerSettings,
  roi: RoiState
) => {
  runtime.visualizer.setSizeMode(settings.sizeMode);
  runtime.visualizer.setPointSize(settings.pointSize);
  runtime.visualizer.setRadiusMeters(settings.radiusMeters);
  runtime.visualizer.setRadiusScale(settings.radiusScale);
  runtime.visualizer.setShape(settings.shape);
  runtime.visualizer.setHeightOffset(settings.heightOffset);
  applyColorSettings(runtime, settings);
  syncMesh(runtime, settings);
  runtime.visualizer.setCompositeMode(settings.pointCompositeMode);
  runtime.scene.background = new THREE.Color(
    settings.background === "white" ? 0xffffff : 0x000000
  );
  syncRoi(runtime, settings, roi);
};

const formatRoiAllocation = (runtime: ViewerRuntime, roi: RoiState): string =>
  roi.enabled && runtime.metadata
    ? ` · ${
        roi.roadName
      } ${runtime.metadata.selectedInsidePoints.toLocaleString()} / outside ${runtime.metadata.selectedOutsidePoints.toLocaleString()}`
    : "";

export function StandalonePointCloudViewer({
  datasetUrl,
  datasetName,
  sourceTag,
  acquiredOn = null,
  registration,
  fieldDimensions,
  hasRgb = true,
  pointBudgetPercent = 100,
  sizeMode = POINT_SIZE_MODES.METERS,
  pointSize = 2,
  radiusMeters = 0.3,
  radiusScale = 1,
  shape = POINT_SHAPES.CIRCLE,
  color = "rgb",
  metric = "z",
  metricBlendMode = "multiply",
  colorRamp = "elevation",
  clampMode = "auto",
  clampMin = 0,
  clampMax = 1,
  pointCompositeMode = "normal",
  background = "white",
  sourceHeightDatum = POINT_CLOUD_HEIGHT_DATUMS.DHHN2016,
  heightOffset = 0,
  showMesh2024 = false,
  meshErrorTarget = 12,
  meshOpacity = 1,
  meshWhite = false,
  roadRoiEnabled = false,
  roadName = DEFAULT_GEORADAR_ROAD,
  roadWidthMeters = 24,
  roadBudgetPercent = 85,
  roadOutsideMode = "uniform",
  roadOutsideDepth = 2,
  showRoadRoiControls = false,
  showFieldColorizer = false,
  showFieldColorizerButton = true,
  pickingEnabled = false,
  pickKind,
  registrationMatrix,
  cameraStorageKey,
  autoMaximizeOnCameraEnd = false,
  onPick,
  onPairPicked,
  onColorizerOptionsChange,
  onMeshLoadStateChange,
  onViewerReady,
}: StandalonePointCloudViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
  const autoMaximizeRef = useRef(autoMaximizeOnCameraEnd);
  autoMaximizeRef.current = autoMaximizeOnCameraEnd;
  const [roiApplied, setRoiApplied] = useState<RoiState>({
    enabled: roadRoiEnabled,
    roadName,
    widthMeters: roadWidthMeters,
    budgetPercent: roadBudgetPercent,
    outsideMode: roadOutsideMode,
    outsideDepth: roadOutsideDepth,
  });
  const [roiDraft, setRoiDraft] = useState<RoiState>(roiApplied);
  const roiAppliedRef = useRef(roiApplied);
  roiAppliedRef.current = roiApplied;
  const colorizerOverrideRef = useRef<Partial<ViewerSettings>>({});
  const lastColorizerOptionsRef = useRef<Partial<ViewerSettings> | null>(null);
  const settingsRef = useRef<ViewerSettings>({
    sizeMode,
    pointSize,
    radiusMeters,
    radiusScale,
    shape,
    color,
    metric,
    metricBlendMode,
    colorRamp,
    clampMode,
    clampMin,
    clampMax,
    pointCompositeMode,
    background,
    sourceHeightDatum,
    heightOffset,
    showMesh2024,
    meshErrorTarget,
    meshOpacity,
    meshWhite,
  });
  settingsRef.current = {
    sizeMode,
    pointSize,
    radiusMeters,
    radiusScale,
    shape,
    color,
    metric,
    metricBlendMode,
    colorRamp,
    clampMode,
    clampMin,
    clampMax,
    pointCompositeMode,
    background,
    sourceHeightDatum,
    heightOffset,
    showMesh2024,
    meshErrorTarget,
    meshOpacity,
    meshWhite,
    ...colorizerOverrideRef.current,
  };

  const [status, setStatus] = useState("Loading point cloud…");
  const [meshStatus, setMeshStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pickingEnabledRef = useRef(pickingEnabled);
  pickingEnabledRef.current = pickingEnabled;
  const pickKindRef = useRef(pickKind);
  pickKindRef.current = pickKind;
  // While the mesh half of a pair is being picked, fade the cloud to half
  // opacity so the mesh surface underneath is visible and unambiguous to
  // click. Picking already targets only the mesh in this phase; the fade is
  // reverted as soon as the mesh point is registered or picking is disarmed.
  useEffect(() => {
    runtimeRef.current?.visualizer.setGlobalOpacity(
      pickingEnabled && pickKind === "mesh" ? 0.5 : 1
    );
  }, [pickingEnabled, pickKind]);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onPairPickedRef = useRef(onPairPicked);
  onPairPickedRef.current = onPairPicked;
  const registrationMatrixRef = useRef(registrationMatrix ?? new THREE.Matrix4());
  registrationMatrixRef.current = registrationMatrix ?? new THREE.Matrix4();
  const [colorizerOpen, setColorizerOpen] = useState(false);
  const [colorization, setColorization] = useState<ColorizationConfig>(() =>
    structuredClone(DEFAULT_COLORIZATION)
  );
  const [colorizerFields, setColorizerFields] = useState<ColorizerFieldInfo[]>([]);

  useEffect(() => {
    const last = lastColorizerOptionsRef.current;
    const cameFromColorizer = last &&
      last.color === color &&
      last.metric === metric &&
      last.colorRamp === colorRamp &&
      last.clampMode === clampMode &&
      last.clampMin === clampMin &&
      last.clampMax === clampMax;
    if (!cameFromColorizer) colorizerOverrideRef.current = {};
    const source = color === "intensity" && metric === "intensity"
      ? null
      : metric === "rgb"
      ? { kind: "rgb" as const }
      : metric === "classification"
      ? { kind: "classification" as const }
      : metric === "none"
      ? null
      : { kind: "field" as const, field: metric };
    setColorization((current) => ({
      ...current,
      layers: [
        {
          ...current.layers[0],
          source: color === "rgb" ? { kind: "rgb" as const } : color === "classification" ? { kind: "classification" as const } : color === "intensity" ? { kind: "field" as const, field: "intensity" } : { kind: "solid" as const, color: "#ffffff" },
          ramp: colorRamp,
          clampMin,
          clampMax,
        },
        { ...current.layers[1], source, ramp: colorRamp, clampMin, clampMax },
        current.layers[2],
      ],
    }));
  }, [clampMax, clampMin, color, colorRamp, metric]);

  useEffect(() => {
    const next: RoiState = {
      enabled: roadRoiEnabled,
      roadName,
      widthMeters: roadWidthMeters,
      budgetPercent: roadBudgetPercent,
      outsideMode: roadOutsideMode,
      outsideDepth: roadOutsideDepth,
    };
    setRoiApplied((current) => (sameRoi(current, next) ? current : next));
    setRoiDraft((current) => (sameRoi(current, next) ? current : next));
  }, [
    roadBudgetPercent,
    roadName,
    roadOutsideDepth,
    roadOutsideMode,
    roadRoiEnabled,
    roadWidthMeters,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime)
      applyViewerSettings(runtime, settingsRef.current, roiAppliedRef.current);
  }, [
    background,
    clampMax,
    clampMin,
    clampMode,
    color,
    colorRamp,
    heightOffset,
    meshErrorTarget,
    meshOpacity,
    meshWhite,
    metric,
    metricBlendMode,
    pointSize,
    pointCompositeMode,
    radiusMeters,
    radiusScale,
    shape,
    showMesh2024,
    sizeMode,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime?.metadata) return;
    runtime.mesh?.dispose();
    runtime.mesh = undefined;
    applyViewerSettings(runtime, settingsRef.current, roiAppliedRef.current);
  }, [sourceHeightDatum]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setStatus("Loading point cloud…");
    setError(null);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    container.append(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(
      settingsRef.current.background === "white" ? 0xffffff : 0x000000
    );
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100_000);
    camera.position.set(100, 80, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    // MapLibre-style mouse paradigm: left drag grabs and pans the ground,
    // right (or middle) drag rotates and pitches around the surface point
    // under the cursor, and the wheel dollies toward the cursor. The pivot is
    // re-anchored on the mesh intersection at every drag start (see
    // retargetPivotFromSurface below).
    controls.enableRotate = true;
    controls.enableZoom = false;
    controls.screenSpacePanning = false;
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    let animationFrame = 0;
    let framed = false;
    let cameraRestored = false;
    let disposed = false;
    const cancelToken = { cancelled: false };

    // Keep the last camera pose per storage key so a reload continues from
    // the same view instead of re-framing the whole cloud.
    let cameraSaveTimer = 0;
    const saveCamera = () => {
      if (!cameraStorageKey) return;
      try {
        // Only pose is persisted; near/far are derived from the viewing
        // distance every frame, so stale clip planes can never be restored.
        localStorage.setItem(
          cameraStorageKey,
          JSON.stringify({
            position: camera.position.toArray(),
            target: controls.target.toArray(),
          })
        );
      } catch {
        // Storage failures (quota, privacy mode) never break the viewer.
      }
    };
    const scheduleCameraSave = () => {
      if (!cameraStorageKey) return;
      window.clearTimeout(cameraSaveTimer);
      cameraSaveTimer = window.setTimeout(saveCamera, 300);
    };
    if (cameraStorageKey) {
      try {
        const saved = localStorage.getItem(cameraStorageKey);
        if (saved) {
          const view = JSON.parse(saved) as {
            position: [number, number, number];
            target: [number, number, number];
          };
          if (
            Array.isArray(view.position) &&
            Array.isArray(view.target) &&
            [...view.position, ...view.target].every(Number.isFinite)
          ) {
            camera.position.fromArray(view.position);
            controls.target.fromArray(view.target);
            controls.update();
            framed = true;
            cameraRestored = true;
          }
        }
      } catch {
        // A malformed stored view falls back to automatic framing.
      }
      controls.addEventListener("end", scheduleCameraSave);
    }

    const navigationRaycaster = new THREE.Raycaster();
    const navigationDirection = new THREE.Vector3();
    const navigationPointer = new THREE.Vector2();
    const navigationClearance = 1.5;
    const handleTravelZoom = (event: WheelEvent) => {
      event.preventDefault();
      // MapLibre-style zoom: dolly toward the point under the cursor.
      // Camera and target translate together, so the heading never changes.
      const domBounds = renderer.domElement.getBoundingClientRect();
      navigationPointer.set(
        ((event.clientX - domBounds.left) / domBounds.width) * 2 - 1,
        -((event.clientY - domBounds.top) / domBounds.height) * 2 + 1
      );
      navigationRaycaster.setFromCamera(navigationPointer, camera);
      navigationDirection.copy(navigationRaycaster.ray.direction);
      const distance = Math.max(camera.position.distanceTo(controls.target), 10);
      const requestedMove = THREE.MathUtils.clamp(
        -event.deltaY * 0.00035 * distance,
        -distance * 0.2,
        distance * 0.2
      );
      let move = requestedMove;

      // Use the loaded mesh as a soft travel boundary. The step shrinks with
      // the remaining surface distance, then stops at a small clearance.
      if (requestedMove > 0) {
        const mesh = runtimeRef.current?.mesh?.tiles.group;
        if (mesh) {
          const hit = navigationRaycaster.intersectObject(mesh, true)[0];
          if (hit) {
            const available = hit.distance - navigationClearance;
            move = Math.min(requestedMove, Math.max(0, available * 0.45));
          }
        }
      }
      camera.position.addScaledVector(navigationDirection, move);
      controls.target.addScaledVector(navigationDirection, move);
      controls.update();
      scheduleCameraSave();
      // The custom wheel travel bypasses OrbitControls' start/end events, so
      // invalidate stale refinement and re-fetch for the new view explicitly.
      handleInteractionStart();
      handleInteractionEnd();
    };
    renderer.domElement.addEventListener("wheel", handleTravelZoom, { passive: false });
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    renderer.domElement.addEventListener("contextmenu", preventContextMenu);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x33404d, 2.2));
    const sunlight = new THREE.DirectionalLight(0xffffff, 2.5);
    sunlight.position.set(300, 500, 200);
    scene.add(sunlight);

    const visualizer = createCopcPointCloudVisualizer();
    scene.add(visualizer.group);
    const registrationOverlay = new THREE.Group();
    scene.add(registrationOverlay);
    const registrationMarkers = new Map<"pointcloud" | "mesh", THREE.Mesh>();
    const registrationInverse = new THREE.Matrix4();
    // Mesh 2024 has absolute priority over the COPC loader for network and
    // parse capacity: point work only proceeds while the mesh has nothing
    // queued, downloading, or parsing. Resolves once the mesh reports idle
    // for a few consecutive polls (queue handoffs leave sub-frame gaps), on
    // cancellation, or after the valve — a dead tile host must never block
    // points forever.
    const waitForMeshIdle = (
      valveMilliseconds: number,
      token?: { cancelled: boolean }
    ) =>
      new Promise<void>((resolve) => {
        let stablePolls = 0;
        const finish = () => {
          window.clearInterval(pollTimer);
          window.clearTimeout(valveTimer);
          resolve();
        };
        const pollTimer = window.setInterval(() => {
          if (disposed || token?.cancelled) {
            finish();
            return;
          }
          stablePolls = runtime.mesh?.isIdle() ? stablePolls + 1 : 0;
          if (stablePolls >= 3) finish();
        }, 250);
        const valveTimer = window.setTimeout(finish, valveMilliseconds);
      });
    const applyRegistrationTransform = () => {
      visualizer.group.matrixAutoUpdate = false;
      visualizer.group.matrix.copy(registrationMatrixRef.current);
      visualizer.group.matrixWorldNeedsUpdate = true;
      registrationInverse.copy(registrationMatrixRef.current).invert();
    };
    applyRegistrationTransform();
    const runtime: ViewerRuntime = {
      scene,
      renderer,
      camera,
      visualizer,
      chunks: [],
      chunksByNodeKey: new Map(),
      ranges: new Map(),
      uploadedMetric: null,
      uploadedBaseField: null,
      meshDesiredVisible: settingsRef.current.showMesh2024,
      meshDesiredErrorTarget: settingsRef.current.meshErrorTarget,
      meshOpacity: settingsRef.current.meshOpacity,
      meshWhite: settingsRef.current.meshWhite,
      meshInspectionPreview: false,
      meshPreviewOpacity: 0.5,
      meshPreviewWireframe: true,
      disposed: false,
      reportError: setError,
      meshLoadStateChange: (state) => {
        onMeshLoadStateChange?.(state);
      },
      meshStatusChange: setMeshStatus,
    };
    runtimeRef.current = runtime;

    // Decode off-thread whenever module workers are available: laz-perf and
    // the per-point projection are the main-thread blockers during loading.
    const workerClient = createCopcStreamWorkerClient();
    const streamOptions = {
      url: datasetUrl,
      registration,
      fieldDimensions,
      includeRgb: hasRgb,
      pointBudgetPercent,
      roi: roiApplied.enabled ? toLoaderRoi(roiApplied) : undefined,
    };

    const fieldStats = new Map<string, {
      name: string;
      min: number;
      max: number;
      empty: boolean;
      histogram: number[];
    }>();
    let chunksSinceFieldPublish = 0;
    const publishColorizerFields = () => {
      setColorizerFields([...fieldStats.values()].map((field) => {
        const peak = Math.max(...field.histogram, 1);
        return {
          ...field,
          histogram: field.histogram.map((value) => value / peak),
        } satisfies ColorizerFieldInfo;
      }));
    };
    // Single ingestion path for both the initial stream and later on-demand
    // refinement loads, keeping runtime.chunks parallel to the visualizer's
    // internal chunk list (setChunkField addresses chunks by index).
    const ingestChunk = (chunk: CopcPointChunk) => {
      if (disposed) return;
      if (chunk.nodeKey && runtime.chunksByNodeKey.has(chunk.nodeKey)) return;
      runtime.chunks.push(chunk);
      if (chunk.nodeKey) runtime.chunksByNodeKey.set(chunk.nodeKey, chunk);
      Object.entries(chunk.fieldValues).forEach(([name, values]) => {
        const field = fieldStats.get(name) ?? {
          name,
          min: Infinity,
          max: -Infinity,
          empty: true,
          histogram: Array.from({ length: 32 }, () => 0),
        };
        values.forEach((value) => {
          if (!Number.isFinite(value)) return;
          field.min = Math.min(field.min, value);
          field.max = Math.max(field.max, value);
          field.empty = false;
        });
        const span = field.max - field.min || 1;
        values.forEach((value) => {
          if (!Number.isFinite(value)) return;
          const index = THREE.MathUtils.clamp(
            Math.floor(((value - field.min) / span) * field.histogram.length),
            0,
            field.histogram.length - 1
          );
          field.histogram[index] += 1;
        });
        fieldStats.set(name, field);
      });
      chunksSinceFieldPublish += 1;
      if (chunksSinceFieldPublish >= 8) {
        chunksSinceFieldPublish = 0;
        publishColorizerFields();
      }
      visualizer.addChunk(chunk);
      const baseFieldName = settingsRef.current.color === "intensity" ? "intensity" : null;
      if (baseFieldName && baseFieldName === runtime.uploadedBaseField) {
        visualizer.setChunkField(
          "a",
          runtime.chunks.length - 1,
          chunk.fieldValues[baseFieldName] ?? null
        );
      } else {
        uploadBaseField(runtime, settingsRef.current.color);
      }
      const fieldName = metricFieldName(settingsRef.current.metric);
      if (fieldName && fieldName === runtime.uploadedMetric) {
        visualizer.setChunkField(
          "b",
          runtime.chunks.length - 1,
          chunk.fieldValues[fieldName] ?? null
        );
      } else {
        uploadMetric(runtime, settingsRef.current.metric);
      }
      applyColorSettings(runtime, settingsRef.current);
      if (!framed) {
        framed = true;
        frameObject(visualizer.group, camera, controls);
      }
    };

    // Dedicates all memory and request capacity to the current view: releases
    // point chunks outside the frustum (out-of-view mesh tiles fall out of
    // the shrunken LRU on their own), pushes the mesh to its best obtainable
    // quality, and only then refines points — ordered from the screen center
    // outwards so the middle of the view reaches leaf detail first.
    const maximizeCurrentView = () => {
      if (runtime.refineToken) runtime.refineToken.cancelled = true;
      const refineToken = { cancelled: false };
      runtime.refineToken = refineToken;
      camera.updateMatrixWorld();
      runtime.visualizer.group.updateWorldMatrix(true, true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      );
      const groupMatrixWorld = runtime.visualizer.group.matrixWorld.clone();
      const boundsInView = (
        bounds: NonNullable<CopcPointChunk["boundsLocal"]>
      ) =>
        frustum.intersectsBox(
          new THREE.Box3(
            new THREE.Vector3(bounds[0], bounds[1], bounds[2]),
            new THREE.Vector3(bounds[3], bounds[4], bounds[5])
          ).applyMatrix4(groupMatrixWorld)
        );
      // Release chunks outside the current view so the visible region can
      // take the whole memory budget, then refine what remains visible
      // from the COPC octree, coarse to fine.
      runtime.chunks
        .filter(
          (chunk) =>
            chunk.nodeKey && chunk.boundsLocal && !boundsInView(chunk.boundsLocal)
        )
        .forEach((chunk) => {
          runtime.visualizer.removeChunk(chunk.nodeKey as string);
          runtime.chunksByNodeKey.delete(chunk.nodeKey as string);
        });
      runtime.chunks = runtime.chunks.filter(
        (chunk) => !chunk.nodeKey || runtime.chunksByNodeKey.has(chunk.nodeKey)
      );
      runtime.visualizer.setPointBudget(Number.POSITIVE_INFINITY);
      const meshRuntime = runtime.mesh;
      // Push the mesh past the everyday target to the absolute minimum the
      // production Mesh 2024 runtime allows (0.05 px), regardless of the
      // quality slider — maximize means best obtainable detail.
      const maximizeErrorTarget = Math.min(0.05, runtime.meshDesiredErrorTarget);
      if (meshRuntime) {
        meshRuntime.applyErrorTarget(maximizeErrorTarget);
        // Invalidate the previous traversal immediately: stale queued tiles
        // are dropped (in-flight requests for unused tiles abort) and tiles
        // for the current frustum start fetching right away.
        meshRuntime.kick();
      }
      // Screen-center-out ordering: nodes are ranked by how far their center
      // projects from the middle of the screen, so the center receives every
      // octree depth (leaf detail) before the periphery gets anything.
      const nodeCenter = new THREE.Vector3();
      const screenCenterDistance = (
        bounds: NonNullable<CopcPointChunk["boundsLocal"]>
      ) => {
        nodeCenter
          .set(
            (bounds[0] + bounds[3]) / 2,
            (bounds[1] + bounds[4]) / 2,
            (bounds[2] + bounds[5]) / 2
          )
          .applyMatrix4(groupMatrixWorld)
          .project(camera);
        return Math.hypot(nodeCenter.x, nodeCenter.y);
      };
      runtime.copcSource ??= workerClient
        ? workerClient.openSource(streamOptions)
        : openCopcPointSource({ ...streamOptions, cancelToken });
      // Mesh quality has absolute priority: point refinement starts only
      // after the mesh is idle at the maximize target (the valve inside
      // waitForMeshIdle keeps a stalled tile host from blocking points).
      void Promise.all([runtime.copcSource, waitForMeshIdle(90_000, refineToken)])
        .then(async ([source]) => {
          let addedPoints = 0;
          const candidates = source.nodes
            .filter((node) => !runtime.chunksByNodeKey.has(node.key))
            .filter((node) => boundsInView(node.boundsLocal))
            .map((node) => ({
              node,
              screenDistance: screenCenterDistance(node.boundsLocal),
            }))
            .sort(
              (a, b) =>
                a.screenDistance - b.screenDistance ||
                a.node.depth - b.node.depth
            );
          for (const { node } of candidates) {
            if (refineToken.cancelled || disposed) return;
            if (addedPoints + node.pointCount > MAXIMIZE_VIEW_POINT_LIMIT) break;
            // The mesh keeps absolute request priority during refinement:
            // whenever it starts fetching again, points wait.
            if (runtime.mesh && !runtime.mesh.isIdle()) {
              await waitForMeshIdle(30_000, refineToken);
              if (refineToken.cancelled || disposed) return;
            }
            const chunk = await source.loadNode(node.key);
            if (refineToken.cancelled || disposed) return;
            ingestChunk(chunk);
            addedPoints += node.pointCount;
            setStatus(
              `${visualizer.pointCount.toLocaleString()} points (maximized view)`
            );
            // Yield between nodes so rendering and input stay responsive.
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        })
        .catch((cause: unknown) => {
          if (disposed || refineToken.cancelled) return;
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    };

    // Every camera interaction invalidates stale refinement work, and the
    // move end re-fetches for the new frustum: the mesh re-traverses
    // immediately, and (when enabled) the full maximize pass re-runs after a
    // short settle delay.
    let maximizeDebounceTimer = 0;
    const lastRefreshedCameraPosition = camera.position.clone();
    const lastRefreshedCameraQuaternion = camera.quaternion.clone();
    const handleInteractionStart = () => {
      window.clearTimeout(maximizeDebounceTimer);
      if (runtime.refineToken) runtime.refineToken.cancelled = true;
    };
    const handleInteractionEnd = () => {
      const meshRuntime = runtime.mesh;
      if (meshRuntime) {
        // A significant view change restarts the coarse-to-fine ladder so
        // the new area reaches full coverage quickly; small nudges keep the
        // current refinement level and only force a fresh traversal.
        const viewDistance = Math.max(
          camera.position.distanceTo(controls.target),
          10
        );
        const movedFar =
          camera.position.distanceTo(lastRefreshedCameraPosition) >
            viewDistance * 0.2 ||
          camera.quaternion.angleTo(lastRefreshedCameraQuaternion) >
            THREE.MathUtils.degToRad(10);
        if (movedFar) {
          meshRuntime.resetProgressiveLoad();
          lastRefreshedCameraPosition.copy(camera.position);
          lastRefreshedCameraQuaternion.copy(camera.quaternion);
        } else {
          meshRuntime.kick();
        }
      }
      if (!autoMaximizeRef.current) return;
      window.clearTimeout(maximizeDebounceTimer);
      maximizeDebounceTimer = window.setTimeout(maximizeCurrentView, 400);
    };
    controls.addEventListener("start", handleInteractionStart);
    controls.addEventListener("end", handleInteractionEnd);

    onViewerReady?.({
      framePointCloud: () => frameObject(runtime.visualizer.group, camera, controls),
      frameMesh: () => {
        if (runtime.mesh) frameObject(runtime.mesh.tiles.group, camera, controls);
      },
      frameRegistrationPairs: (points) => {
        if (points.length === 0) return;
        const bounds = new THREE.Box3().setFromPoints([...points]);
        if (bounds.isEmpty()) return;
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const radius = Math.max(size.length() * 0.5, 2);
        const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const direction = new THREE.Vector3(1, 0.72, 1).normalize();
        controls.target.copy(center);
        camera.position.copy(center).addScaledVector(direction, distance * 1.65);
        camera.near = Math.max(0.05, radius / 10_000);
        camera.far = Math.max(2_000, radius * 100);
        camera.updateProjectionMatrix();
        controls.update();
      },
      maximizeCurrentView,
      setRegistrationPairLines: (pairs, selectedPairIndex = null) => {
        registrationOverlay.children.slice().forEach((child) => {
          registrationOverlay.remove(child);
          if ("geometry" in child && child.geometry instanceof THREE.BufferGeometry) {
            child.geometry.dispose();
          }
          if ("material" in child) {
            const material = child.material;
            (Array.isArray(material) ? material : [material]).forEach((entry) => entry.dispose());
          }
        });
        if (pairs.length === 0) return;
        const resolution = new THREE.Vector2(renderer.domElement.width, renderer.domElement.height);
        const underlayMaterial = new LineMaterial({
            color: 0x101820,
            transparent: true,
            opacity: 0.95,
            linewidth: 7,
            resolution,
          });
        const lineMaterial = new LineMaterial({
            color: 0xfff200,
            transparent: true,
            opacity: 1,
            linewidth: 3,
            resolution,
          });
        // The selected pair's connecting line renders cyan instead of yellow.
        const selectedLineMaterial = new LineMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 1,
            linewidth: 4,
            resolution,
          });
        underlayMaterial.depthTest = false;
        underlayMaterial.depthWrite = false;
        lineMaterial.depthTest = false;
        lineMaterial.depthWrite = false;
        selectedLineMaterial.depthTest = false;
        selectedLineMaterial.depthWrite = false;
        pairs.forEach(({ pointcloud, mesh }, index) => {
          // Each LineGeometry contains exactly one pair: point-cloud → Mesh.
          // Keeping one segment per geometry prevents unrelated pairs from
          // ever being joined into a continuous path.
          const geometry = new LineGeometry();
          geometry.setPositions([
            pointcloud.x, pointcloud.y, pointcloud.z,
            mesh.x, mesh.y, mesh.z,
          ]);
          const underlay = new LineSegments2(geometry, underlayMaterial);
          const line = new LineSegments2(
            geometry,
            index === selectedPairIndex ? selectedLineMaterial : lineMaterial
          );
          underlay.renderOrder = 900;
          line.renderOrder = 901;
          underlay.userData.pairIndex = index;
          line.userData.pairIndex = index;
          registrationOverlay.add(underlay, line);
        });
        // Clone the picked cloud vertices as actual THREE.Points in the
        // scene: a pair's reference point stays visible as a real point even
        // after its source chunk was evicted by a maximize pass. Clicking an
        // anchor selects its pair (the raycast index IS the pair index). The
        // selected pair renders cyan, unselected pairs yellow.
        const cloudPositions = new Float32Array(pairs.length * 3);
        const cloudColors = new Float32Array(pairs.length * 3);
        pairs.forEach(({ pointcloud }, index) => {
          cloudPositions.set([pointcloud.x, pointcloud.y, pointcloud.z], index * 3);
          cloudColors.set(
            index === selectedPairIndex ? [0, 0.9, 1] : [1, 0.83, 0],
            index * 3
          );
        });
        const cloudGeometry = new THREE.BufferGeometry();
        cloudGeometry.setAttribute(
          "position",
          new THREE.BufferAttribute(cloudPositions, 3)
        );
        cloudGeometry.setAttribute("color", new THREE.BufferAttribute(cloudColors, 3));
        const cloudAnchors = new THREE.Points(
          cloudGeometry,
          new THREE.PointsMaterial({
            vertexColors: true,
            size: 8,
            sizeAttenuation: false,
            depthTest: false,
            depthWrite: false,
            transparent: true,
          })
        );
        cloudAnchors.renderOrder = 902;
        cloudAnchors.userData.pairAnchorKind = "pointcloud";
        // Mesh endpoints render as debug axes: ±1 m along each axis in the
        // classic X-red / Y-green / Z-blue coloring, drawn as 3 px fat lines
        // (LineBasicMaterial widths are ignored by WebGL). Three segments per
        // pair, so a raycast faceIndex maps back to its pair as
        // floor(faceIndex / 3). The selected pair's axes stay at full
        // brightness while unselected ones are dimmed.
        const axesPositions: number[] = [];
        const axesColors: number[] = [];
        const axisDirections: Array<[THREE.Vector3, number, number, number]> = [
          [new THREE.Vector3(1, 0, 0), 1, 0.15, 0.15],
          [new THREE.Vector3(0, 1, 0), 0.2, 1, 0.2],
          [new THREE.Vector3(0, 0, 1), 0.2, 0.4, 1],
        ];
        pairs.forEach(({ mesh }, index) => {
          const brightness = index === selectedPairIndex ? 1 : 0.45;
          axisDirections.forEach(([direction, red, green, blue]) => {
            axesPositions.push(
              mesh.x - direction.x, mesh.y - direction.y, mesh.z - direction.z,
              mesh.x + direction.x, mesh.y + direction.y, mesh.z + direction.z
            );
            axesColors.push(
              red * brightness, green * brightness, blue * brightness,
              red * brightness, green * brightness, blue * brightness
            );
          });
        });
        const axesGeometry = new LineSegmentsGeometry();
        axesGeometry.setPositions(axesPositions);
        axesGeometry.setColors(axesColors);
        const meshAxes = new LineSegments2(
          axesGeometry,
          new LineMaterial({
            vertexColors: true,
            linewidth: 3,
            resolution,
            depthTest: false,
            depthWrite: false,
            transparent: true,
          })
        );
        meshAxes.renderOrder = 902;
        meshAxes.userData.pairAxes = true;
        registrationOverlay.add(cloudAnchors, meshAxes);
        registrationOverlay.renderOrder = 900;
      },
      highlightPoint: (kind, point) => {
        let marker = registrationMarkers.get(kind);
        if (!marker) {
          const markerMaterial = new THREE.MeshBasicMaterial({
            color: kind === "pointcloud" ? 0xffd400 : 0xff3b30,
          });
          markerMaterial.depthTest = false;
          markerMaterial.depthWrite = false;
          marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.45, 12, 8),
            markerMaterial
          );
          marker.userData.registrationMarker = kind;
          marker.renderOrder = 1000;
          registrationMarkers.set(kind, marker);
          scene.add(marker);
        }
        marker.position.copy(point);
        if (kind === "pointcloud") marker.position.applyMatrix4(registrationMatrixRef.current);
        marker.updateMatrix();
      },
      setMeshInspectionPreview: (preview) => setMeshInspectionPreview(runtime, preview),
      openFieldColorizer: () => setColorizerOpen(true),
    });
    applyViewerSettings(runtime, settingsRef.current, roiAppliedRef.current);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDragged = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    // Raycasting THREE.Points has no acceleration structure; above this point
    // count the pivot falls back to the mesh (or the previous target depth).
    const pivotPointRaycastLimit = 3_000_000;
    const retargetPivotFromSurface = (event: PointerEvent) => {
      const domBounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - domBounds.left) / domBounds.width) * 2 - 1,
        -((event.clientY - domBounds.top) / domBounds.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      raycaster.params.Points.threshold = THREE.MathUtils.clamp(
        camera.position.distanceTo(controls.target) * 0.01,
        0.25,
        3
      );
      const meshHit = runtime.mesh
        ? raycaster.intersectObject(runtime.mesh.tiles.group, true)[0]
        : undefined;
      const hit =
        meshHit ??
        (visualizer.pointCount <= pivotPointRaycastLimit
          ? raycaster.intersectObject(visualizer.group, true)[0]
          : undefined);
      if (!hit) return;
      // Project the hit onto the view axis: the pivot takes the surface
      // depth under the cursor while the camera orientation stays untouched,
      // so re-anchoring never causes a visible jump.
      const viewDirection = camera.getWorldDirection(navigationDirection);
      const pivotDepth = hit.point.clone().sub(camera.position).dot(viewDirection);
      if (pivotDepth <= camera.near * 2) return;
      controls.target
        .copy(camera.position)
        .addScaledVector(viewDirection, pivotDepth);
      controls.update();
    };
    const handlePointerDown = (event: PointerEvent) => {
      pointerDragged = false;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      // Anchor rotation and pan on the mesh intersection under the cursor.
      if (event.button === 0 || event.button === 2) {
        retargetPivotFromSurface(event);
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY) > 5) {
        pointerDragged = true;
      }
    };
    const handlePick = (event: MouseEvent) => {
      if (pointerDragged || event.button !== 0) {
        pointerDragged = false;
        return;
      }
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      raycaster.params.Points.threshold = THREE.MathUtils.clamp(
        camera.position.distanceTo(controls.target) * 0.01,
        0.25,
        3
      );
      const pickHandler = onPickRef.current;
      if (!pickingEnabledRef.current || !pickHandler) {
        // Outside armed pair picking, clicking a pair's cloned cloud point,
        // its mesh axes marker, or its connecting line selects that pair.
        const selectHandler = onPairPickedRef.current;
        if (!selectHandler) return;
        (raycaster.params as { Line2?: { threshold: number } }).Line2 = {
          threshold: 0,
        };
        const overlayHit = raycaster.intersectObject(registrationOverlay, true)[0];
        if (!overlayHit) return;
        const data = overlayHit.object.userData;
        const pairIndex =
          typeof data.pairIndex === "number"
            ? (data.pairIndex as number)
            : data.pairAnchorKind === "pointcloud" && overlayHit.index !== undefined
            ? overlayHit.index
            : data.pairAxes && overlayHit.faceIndex !== undefined &&
              overlayHit.faceIndex !== null
            ? Math.floor(overlayHit.faceIndex / 3)
            : undefined;
        if (pairIndex !== undefined) selectHandler(pairIndex);
        return;
      }
      const pointHit = raycaster.intersectObject(visualizer.group, true)[0];
      const meshHit = runtime.mesh
        ? raycaster.intersectObject(runtime.mesh.tiles.group, true)[0]
        : undefined;
      // Points raycasts report the closest position ON THE RAY, not the
      // vertex itself. Registration pairs must reference the actual measured
      // point, so resolve the hit back to the exact vertex via its index.
      const exactPointPosition = (hit: THREE.Intersection): THREE.Vector3 => {
        if (!(hit.object instanceof THREE.Points) || hit.index === undefined) {
          return hit.point.clone();
        }
        const position = hit.object.geometry.getAttribute("position");
        return hit.object.localToWorld(
          new THREE.Vector3().fromBufferAttribute(position, hit.index)
        );
      };
      if (pickKindRef.current === "pointcloud" && pointHit) {
        pickHandler(
          "pointcloud",
          exactPointPosition(pointHit).applyMatrix4(registrationInverse)
        );
      } else if (pickKindRef.current === "mesh" && meshHit) {
        pickHandler("mesh", meshHit.point.clone());
      } else if (!pickKindRef.current && pointHit) {
        pickHandler("pointcloud", exactPointPosition(pointHit));
      }
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("click", handlePick);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
      visualizer.setViewport(drawingBuffer.x, drawingBuffer.y);
      runtime.mesh?.tiles.setResolutionFromRenderer(camera, renderer);
      registrationOverlay.traverse((child) => {
        const material = "material" in child ? child.material : undefined;
        if (material instanceof LineMaterial) material.resolution.set(renderer.domElement.width, renderer.domElement.height);
      });
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    // Chunk-level frustum culling with hoisted temporaries. Folding the
    // group's world matrix into the projection matrix keeps the per-chunk
    // test in local coordinates — no per-chunk Box3 transforms or garbage.
    const cullFrustum = new THREE.Frustum();
    const cullMatrix = new THREE.Matrix4();
    const lastCullMatrix = new THREE.Matrix4();
    const cullBounds = new THREE.Box3();
    let lastCullChunkCount = -1;
    let cullCountdown = 0;
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      applyRegistrationTransform();
      controls.update();
      runtime.mesh?.tiles.update();
      if (cullCountdown-- <= 0) {
        cullCountdown = 6;
        // Adapt the clip planes to the viewing distance. Framing helpers set
        // tight near/far for close-ups (e.g. fly-to-pair); without this,
        // zooming back out would leave mesh and cloud beyond the far plane —
        // invisible and never loaded.
        const viewDistance = Math.max(
          camera.position.distanceTo(controls.target),
          1
        );
        const adaptedNear = Math.max(0.05, viewDistance / 5_000);
        const adaptedFar = Math.max(5_000, viewDistance * 200);
        if (
          Math.abs(camera.near - adaptedNear) / adaptedNear > 0.25 ||
          Math.abs(camera.far - adaptedFar) / adaptedFar > 0.25
        ) {
          camera.near = adaptedNear;
          camera.far = adaptedFar;
          camera.updateProjectionMatrix();
        }
        camera.updateMatrixWorld();
        runtime.visualizer.group.updateWorldMatrix(true, false);
        cullMatrix
          .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
          .multiply(runtime.visualizer.group.matrixWorld);
        const chunkCount = runtime.visualizer.group.children.length;
        if (!cullMatrix.equals(lastCullMatrix) || chunkCount !== lastCullChunkCount) {
          lastCullMatrix.copy(cullMatrix);
          lastCullChunkCount = chunkCount;
          cullFrustum.setFromProjectionMatrix(cullMatrix);
          for (const child of runtime.visualizer.group.children) {
            if (!(child instanceof THREE.Points)) continue;
            const chunk = runtime.chunksByNodeKey.get(child.userData.nodeKey as string);
            if (!chunk?.boundsLocal) continue;
            cullBounds.min.set(chunk.boundsLocal[0], chunk.boundsLocal[1], chunk.boundsLocal[2]);
            cullBounds.max.set(chunk.boundsLocal[3], chunk.boundsLocal[4], chunk.boundsLocal[5]);
            child.visible = cullFrustum.intersectsBox(cullBounds);
          }
        }
      }
      renderer.render(scene, camera);
    };
    animate();

    const streamCallbacks = {
      onMetadata: async (metadata: CopcSceneMetadata) => {
        if (disposed) return;
        runtime.metadata = metadata;
        applyViewerSettings(
          runtime,
          settingsRef.current,
          roiAppliedRef.current
        );
        if (settingsRef.current.showMesh2024) {
          // Mesh 2024 owns all initial network/parse capacity: the point
          // stream starts only after the mesh finished refining the current
          // view (or the valve fires on a dead tileset host).
          await waitForMeshIdle(45_000);
        }
      },
      onChunk: ingestChunk,
      onProgress: (loaded: number, selected: number) => {
        if (!disposed) {
          setStatus(
            `${loaded.toLocaleString()} / ${selected.toLocaleString()} points (${pointBudgetPercent}%)${formatRoiAllocation(
              runtime,
              roiApplied
            )}`
          );
        }
      },
    };
    const runPointStream = workerClient
      ? workerClient
          .stream(streamOptions, streamCallbacks)
          .catch((cause: unknown) => {
            // A worker bundle can fail in environments where a dependency is
            // not worker-safe. Fall back to main-thread streaming as long as
            // nothing has been delivered yet.
            if (disposed || runtime.metadata) throw cause;
            runtime.copcSource = undefined;
            return streamCopcPoints({
              ...streamOptions,
              cancelToken,
              ...streamCallbacks,
            });
          })
      : streamCopcPoints({ ...streamOptions, cancelToken, ...streamCallbacks });
    void runPointStream
      .then(() => {
        if (disposed) return;
        publishColorizerFields();
        if (!cameraRestored) {
          frameObject(
            roiApplied.enabled &&
              roiApplied.outsideMode === "hide" &&
              runtime.roiGuide
              ? runtime.roiGuide
              : visualizer.group,
            camera,
            controls
          );
        }
        setStatus(
          `${visualizer.pointCount.toLocaleString()} points (${pointBudgetPercent}%)${formatRoiAllocation(
            runtime,
            roiApplied
          )}`
        );
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      disposed = true;
      runtime.disposed = true;
      if (runtime.refineToken) runtime.refineToken.cancelled = true;
      cancelToken.cancelled = true;
      workerClient?.cancelStream();
      workerClient?.dispose();
      window.clearTimeout(cameraSaveTimer);
      window.clearTimeout(maximizeDebounceTimer);
      saveCamera();
      controls.removeEventListener("end", scheduleCameraSave);
      controls.removeEventListener("start", handleInteractionStart);
      controls.removeEventListener("end", handleInteractionEnd);
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
      controls.dispose();
      runtime.mesh?.dispose();
      removeRoiGuide(runtime);
      scene.remove(visualizer.group);
      scene.remove(registrationOverlay);
      registrationOverlay.traverse((child) => {
        if ("geometry" in child && child.geometry instanceof THREE.BufferGeometry) child.geometry.dispose();
        if ("material" in child) {
          const material = child.material;
          (Array.isArray(material) ? material : [material]).forEach((entry) => entry.dispose());
        }
      });
      registrationMarkers.forEach((marker) => {
        marker.geometry.dispose();
        (marker.material as THREE.Material).dispose();
        scene.remove(marker);
      });
      visualizer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      renderer.domElement.removeEventListener("click", handlePick);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("wheel", handleTravelZoom);
      renderer.domElement.removeEventListener("contextmenu", preventContextMenu);
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [
    cameraStorageKey,
    datasetUrl,
    registration,
    fieldDimensions,
    hasRgb,
    pointBudgetPercent,
    roiApplied,
  ]);

  return (
    <div
      ref={containerRef}
      className="pointcloud-viewer"
      style={{ background: background === "white" ? "#fff" : "#000" }}
    >
      <div className={`pointcloud-status${error ? " is-error" : ""}`}>
        {datasetName && (
          <div className="pointcloud-status-metadata">
            <strong>{datasetName}</strong>
            {sourceTag && <span>{sourceTag}</span>}
            <span>{formatPointCloudAcquisitionDate(acquiredOn)}</span>
          </div>
        )}
        <div>{error ?? status}</div>
        {meshStatus && <div className="pointcloud-mesh-status">{meshStatus}</div>}
      </div>
      {showRoadRoiControls && (
        <RoiControls
          value={roiDraft}
          onChange={setRoiDraft}
          onApply={() => setRoiApplied({ ...roiDraft })}
        />
      )}
      {showFieldColorizer && (
        colorizerOpen ? (
          <FloatingPanel
            title="Point cloud field colorizer"
            onClose={() => setColorizerOpen(false)}
            showClose={false}
            className="point-colorizer-modal"
            initial={{ x: 24, y: 72 }}
            zIndex={40}
          >
            <PointColorizer
              fields={colorizerFields}
              hasRgb={hasRgb}
              value={colorization}
              onChange={(next) => {
            setColorization(next);
            const base = next.layers[0];
            const blend = next.layers[1];
            const source = blend.source ?? null;
            const baseSource = base.source;
            const nextMetric: PointMetric =
              source?.kind === "field" ? (source.field as PointMetric) :
              source?.kind === "rgb" ? "rgb" :
              source?.kind === "classification" ? "classification" : "none";
            const nextColor: StandalonePointCloudColor =
              baseSource?.kind === "field" && baseSource.field === "intensity"
                ? "intensity"
                : baseSource?.kind === "rgb"
                ? "rgb"
                : baseSource?.kind === "classification"
                ? "classification"
                : "white";
            const slot = baseSource?.kind === "field" ? base : blend;
            settingsRef.current = {
              ...settingsRef.current,
              color: nextColor,
              metric: nextMetric,
              colorRamp: slot.ramp,
              clampMode: slot.source?.kind === "field" ? "manual" : "auto",
              clampMin: slot.clampMin,
              clampMax: slot.clampMax,
            };
            colorizerOverrideRef.current = {
              color: nextColor,
              metric: nextMetric,
              colorRamp: slot.ramp,
              clampMode: slot.source?.kind === "field" ? "manual" : "auto",
              clampMin: slot.clampMin,
              clampMax: slot.clampMax,
            };
            lastColorizerOptionsRef.current = colorizerOverrideRef.current;
            onColorizerOptionsChange?.({
              color: nextColor,
              metric: nextMetric,
              colorRamp: slot.ramp,
              clampMode: slot.source?.kind === "field" ? "manual" : "auto",
              clampMin: slot.clampMin,
              clampMax: slot.clampMax,
            });
            const runtime = runtimeRef.current;
            if (runtime) applyViewerSettings(runtime, settingsRef.current, roiAppliedRef.current);
              }}
              storageKey="carma-mesh-registration-colorizer"
            />
          </FloatingPanel>
        ) : showFieldColorizerButton ? (
          <button
            type="button"
            className="pointcloud-colorizer-reopen"
            onClick={() => setColorizerOpen(true)}
          >
            Open field colorizer
          </button>
        ) : null
      )}
    </div>
  );
}
