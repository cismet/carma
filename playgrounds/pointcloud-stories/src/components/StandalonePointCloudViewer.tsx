import { useEffect, useRef, useState } from "react";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
} from "3d-tiles-renderer/plugins";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import {
  dhhn2016ToEllipsoidalHeight,
  getFromWGS84ToUTM32,
} from "@carma-geo/proj";

import { getRampTexture } from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";
import type { RampName } from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";
import {
  streamCopcPoints,
  type CopcPointChunk,
  type CopcRegionOfInterest,
  type CopcRigidRegistration,
  type CopcRoiOutsideMode,
  type CopcSceneMetadata,
} from "../../../ng-topicmap-playground/src/app/pointcloud/copcLoader";
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
import { formatPointCloudAcquisitionDate } from "../../../ng-topicmap-playground/src/app/pointcloud/point-cloud-assets";
import type { PointCloudAcquisitionDate } from "../../../ng-topicmap-playground/src/app/pointcloud/point-cloud-assets";
import {
  DEFAULT_GEORADAR_ROAD,
  GEORADAR_ROADS,
  getRoadLocalSegments,
  getRoadSourceSegments,
} from "../data/georadarRoads";

export type StandalonePointCloudColor = "white" | "rgb" | "classification";
export type StandaloneMetricBlendMode = "normal" | "multiply";
export type StandalonePointSizeMode = "pixels" | "meters";
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
  roadRoiEnabled?: boolean;
  roadName?: string;
  roadWidthMeters?: number;
  roadBudgetPercent?: number;
  roadOutsideMode?: CopcRoiOutsideMode;
  roadOutsideDepth?: number;
  showRoadRoiControls?: boolean;
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
  errorTarget: number
) => {
  const [centerEast, centerNorth] = getFromWGS84ToUTM32(
    metadata.centerLngLat as Parameters<typeof getFromWGS84ToUTM32>[0]
  ) as [number, number];
  const tiles = new TilesRenderer(WUPP_MESH_2024.url);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
  );

  tiles.registerPlugin(new ImplicitTilingPlugin());
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
              centerEast,
              centerNorth,
              metadata.zBase
            )
          : metadata.zBase,
    })
  );
  tiles.errorTarget = errorTarget;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);
  // ReorientationPlugin produces X west / Z north. Point chunks use X east /
  // Z south, so keep the plugin-owned transform untouched and correct axes in
  // a persistent outer anchor frame (the plugin updates tiles.group later).
  const anchorGroup = new THREE.Group();
  anchorGroup.rotation.y = Math.PI;
  anchorGroup.add(tiles.group);
  scene.add(anchorGroup);

  return {
    tiles,
    dispose: () => {
      scene.remove(anchorGroup);
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
  ranges: Map<string, CachedRange>;
  uploadedMetric: string | null;
  metadata?: CopcSceneMetadata;
  mesh?: Awaited<ReturnType<typeof addMesh2024>>;
  meshLoad?: Promise<void>;
  meshDesiredVisible: boolean;
  meshDesiredErrorTarget: number;
  disposed: boolean;
  reportError: (message: string) => void;
  roiGuide?: THREE.LineSegments;
}

const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, value));

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

const baseColorSlot = (color: StandalonePointCloudColor): LayerColorSlot => ({
  mode: color === "white" ? 0 : color === "classification" ? 2 : 1,
});

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

const applyColorSettings = (
  runtime: ViewerRuntime,
  settings: ViewerSettings
) => {
  uploadMetric(runtime, settings.metric);
  const blendMode: LayerBlendMode =
    settings.metricBlendMode === "multiply" ? 1 : 0;
  runtime.visualizer.setColorization(
    baseColorSlot(settings.color),
    metricColorSlot(runtime, settings),
    { mode: 0 },
    { mode: blendMode, opacity: 1 },
    { mode: 0, opacity: 0 }
  );
};

const syncMesh = (runtime: ViewerRuntime, settings: ViewerSettings) => {
  runtime.meshDesiredVisible = settings.showMesh2024;
  runtime.meshDesiredErrorTarget = settings.meshErrorTarget;
  if (
    settings.showMesh2024 &&
    runtime.metadata &&
    !runtime.mesh &&
    !runtime.meshLoad
  ) {
    const pending = addMesh2024(
      runtime.scene,
      runtime.renderer,
      runtime.camera,
      runtime.metadata,
      settings.sourceHeightDatum,
      settings.meshErrorTarget
    )
      .then((mesh) => {
        if (runtime.disposed || !runtime.meshDesiredVisible) {
          mesh.dispose();
          return;
        }
        mesh.tiles.errorTarget = runtime.meshDesiredErrorTarget;
        runtime.mesh = mesh;
      })
      .catch((cause: unknown) => {
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
  }
  if (runtime.mesh) runtime.mesh.tiles.errorTarget = settings.meshErrorTarget;

  // Point clouds always depth-test against the scene, including mesh
  // comparisons. Composite mode controls whether splats also write depth.
  runtime.visualizer.setDepthTest(true);
  runtime.visualizer.group.renderOrder = 0;
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
  sizeMode = POINT_SIZE_MODES.PIXELS,
  pointSize = 2,
  radiusMeters = 0.05,
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
  roadRoiEnabled = false,
  roadName = DEFAULT_GEORADAR_ROAD,
  roadWidthMeters = 24,
  roadBudgetPercent = 85,
  roadOutsideMode = "uniform",
  roadOutsideDepth = 2,
  showRoadRoiControls = false,
}: StandalonePointCloudViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewerRuntime | null>(null);
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
  const settingsRef = useRef<ViewerSettings>({
    sizeMode,
    pointSize,
    radiusMeters,
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
  });
  settingsRef.current = {
    sizeMode,
    pointSize,
    radiusMeters,
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
  };

  const [status, setStatus] = useState("Loading point cloud…");
  const [error, setError] = useState<string | null>(null);

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
    metric,
    metricBlendMode,
    pointSize,
    pointCompositeMode,
    radiusMeters,
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
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x33404d, 2.2));
    const sunlight = new THREE.DirectionalLight(0xffffff, 2.5);
    sunlight.position.set(300, 500, 200);
    scene.add(sunlight);

    const visualizer = createCopcPointCloudVisualizer();
    scene.add(visualizer.group);
    const runtime: ViewerRuntime = {
      scene,
      renderer,
      camera,
      visualizer,
      chunks: [],
      ranges: new Map(),
      uploadedMetric: null,
      meshDesiredVisible: settingsRef.current.showMesh2024,
      meshDesiredErrorTarget: settingsRef.current.meshErrorTarget,
      disposed: false,
      reportError: setError,
    };
    runtimeRef.current = runtime;
    applyViewerSettings(runtime, settingsRef.current, roiAppliedRef.current);

    let animationFrame = 0;
    let framed = false;
    let disposed = false;
    const cancelToken = { cancelled: false };

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const drawingBuffer = renderer.getDrawingBufferSize(new THREE.Vector2());
      visualizer.setViewport(drawingBuffer.x, drawingBuffer.y);
      runtime.mesh?.tiles.setResolutionFromRenderer(camera, renderer);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      controls.update();
      runtime.mesh?.tiles.update();
      renderer.render(scene, camera);
    };
    animate();

    void streamCopcPoints({
      url: datasetUrl,
      registration,
      fieldDimensions,
      includeRgb: hasRgb,
      pointBudgetPercent,
      roi: roiApplied.enabled ? toLoaderRoi(roiApplied) : undefined,
      cancelToken,
      onMetadata: (metadata) => {
        if (disposed) return;
        runtime.metadata = metadata;
        applyViewerSettings(
          runtime,
          settingsRef.current,
          roiAppliedRef.current
        );
      },
      onChunk: (chunk) => {
        if (disposed) return;
        runtime.chunks.push(chunk);
        visualizer.addChunk(chunk);
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
      },
      onProgress: (loaded, selected) => {
        if (!disposed) {
          setStatus(
            `${loaded.toLocaleString()} / ${selected.toLocaleString()} points (${pointBudgetPercent}%)${formatRoiAllocation(
              runtime,
              roiApplied
            )}`
          );
        }
      },
    })
      .then(() => {
        if (disposed) return;
        frameObject(
          roiApplied.enabled &&
            roiApplied.outsideMode === "hide" &&
            runtime.roiGuide
            ? runtime.roiGuide
            : visualizer.group,
          camera,
          controls
        );
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
      cancelToken.cancelled = true;
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
      controls.dispose();
      runtime.mesh?.dispose();
      removeRoiGuide(runtime);
      scene.remove(visualizer.group);
      visualizer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (runtimeRef.current === runtime) runtimeRef.current = null;
    };
  }, [
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
      </div>
      {showRoadRoiControls && (
        <RoiControls
          value={roiDraft}
          onChange={setRoiDraft}
          onApply={() => setRoiApplied({ ...roiDraft })}
        />
      )}
    </div>
  );
}
