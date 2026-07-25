import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button, InputNumber, Select, Slider, Switch, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleInfo,
  faCube,
  faEye,
  faEyeSlash,
  faMap,
  faSliders,
} from "@fortawesome/free-solid-svg-icons";
import * as THREE from "three/webgpu";
import type { WebGLRenderer as ThreeWebGLRenderer } from "three";
import {
  attribute,
  Discard,
  float,
  Fn,
  If,
  instanceIndex,
  texture,
  texture3D,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

import {
  WUPP_MESH_2024,
  WUPP_TERRAIN_PROVIDER,
  WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M,
} from "@carma-commons/resources";
import type { Altitude, Coordinates } from "@carma-geo/data-structures";
import {
  Cartographic,
  CesiumTerrainProvider,
  sampleTerrainMostDetailed,
} from "@carma-cesium";
import {
  dhhn2016ToEllipsoidalHeight,
  GRS80_ELLIPSOID,
  getFromUTM32ToWGS84,
  getGcg2016UndulationFromUtm,
  utmToEllipsoidSurface,
} from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
import { CompassNeedleSVG } from "@carma-mapping/components";
import { ControlButtonStyler } from "@carma-mapping/map-controls-layout";
import { createUtmGridSurface } from "@carma-mapping/engines/three/primitives";

import {
  RAMP_NAMES,
  rampCssGradient,
  type RampName,
} from "../../../ng-topicmap-playground/src/app/pointcloud/colorRamps";

import {
  loadPanoPoses,
  PANORAMA_REFERENCE_URL,
  PANORAMA_RESOURCE_ORIENTATION_CORRECTION,
  type ImagePose,
} from "./oriented-imagery";
import { georadarStationAtClipUnit } from "./georadar-clip-coordinate";
import {
  buildCutawayTransferData,
  buildTransferData,
  DEFAULT_GEORADAR_ALPHA_RAMP,
  DEFAULT_GEORADAR_CLAMP_RANGE,
  DEFAULT_GEORADAR_COLOR_RAMP,
  DEFAULT_GEORADAR_COLOR_RAMP_INVERTED,
  DEFAULT_GEORADAR_TONE_CURVE,
  GEORADAR_ALPHA_RAMP_PRESETS,
  GEORADAR_TONE_CURVE_PRESETS,
  TransferCurveEditor,
  type ClipRange,
  type CurvePoint,
  type VolumeMetadata,
  type VolumeVariant,
} from "./GeoradarVolumeExplorer";
import {
  disposeJpegTexture,
  loadJpegTexture,
  type LoadedJpegTexture,
} from "./jpeg-texture";
import { createModelNavigationControls } from "./model-navigation-controls";
import {
  applyImageDisplayFilterToMaterial,
  createImageDisplayFilter,
  IMAGE_DISPLAY_DEFAULT_CONTRAST,
  IMAGE_DISPLAY_DEFAULT_EDGE_ENHANCEMENT,
  IMAGE_DISPLAY_DEFAULT_SATURATION,
  IMAGE_DISPLAY_MAXIMUM_EDGE_ENHANCEMENT,
  type ImageDisplayFilter,
} from "./image-display-filter";
import {
  createPointTilesetRuntime,
} from "./point-tileset-runtime";
import { POINT_CLOUD_PRESET_FEATURE_COLLECTION } from "../../../ng-topicmap-playground/src/app/pointcloud/pointcloud-preset-features";
import { investigationDataUrl } from "./investigation-data";
import {
  createMesh2024TilesRuntime,
  MESH_APPEARANCE_MODES,
  MESH_DEFAULT_APPEARANCE,
  MESH_DEFAULT_CONTRAST,
  MESH_DEFAULT_ELEVATION_COLOR_RAMP,
  MESH_DEFAULT_ELEVATION_MAXIMUM_METERS,
  MESH_DEFAULT_ELEVATION_MINIMUM_METERS,
  MESH_DEFAULT_ERROR_TARGET_PIXELS,
  MESH_DEFAULT_SATURATION,
  MESH_ELEVATION_COLOR_RAMPS,
  MESH_ELEVATION_RANGE_MAXIMUM_METERS,
  MESH_ELEVATION_RANGE_MINIMUM_METERS,
  MESH_MAXIMUM_ERROR_TARGET_PIXELS,
  MESH_MINIMUM_ERROR_TARGET_PIXELS,
  type Mesh2024AppearanceMode,
  type Mesh2024ElevationColorRamp,
} from "./mesh-2024-tiles-runtime";
import {
  calculateTrajectoryCurveOffsets,
  calculateTrajectorySliceFrames,
  sampleTrajectoryFrameAtStation,
  smoothTrajectoryCenterline,
  TRAJECTORY_ALIGNMENT_MODES,
  type TrajectoryAlignmentMode,
} from "./georadar-trajectory-alignment";
import {
  buildGeoradarLodSliceIndices,
  buildGeoradarLodSampleWindows,
  buildGeoradarRenderSegments,
  GEORADAR_LOD_STEPS,
  selectGeoradarLodStep,
  type GeoradarLodStep,
} from "./georadar-segment-lod";
import {
  createGeoradarMdioSource,
  type GeoradarMdioSource,
} from "./georadar-mdio-source";
import {
  createGeoradarFaceEditor,
  type GeoradarFaceEditorEdit,
  type GeoradarFaceFrame,
  type GeoradarSplineClipFrame,
} from "./georadar-face-editor";
import {
  buildGeoradarNavigationGraph,
  buildPanoramaNavigationGraph,
  getPanoramaNavigationTargets,
  getPanoramaTraceId,
  getSurveyStreetName,
  selectPanoramaNavigationTargetForBearing,
  type GeoradarSurveyManifest,
  type PanoramaNavigationTarget,
  type SurveyNavigationGraph,
  type SurveyNavigationNode,
} from "./survey-navigation";
import {
  deletePanoramaCorrectionControlPoint,
  readPanoramaCorrectionDatabase,
  resolvePanoramaCorrections,
  setPanoramaCorrectionControlPoint,
  writePanoramaCorrectionDatabase,
  type PanoramaCorrection,
  type PanoramaCorrectionDatabase,
  type ResolvedPanoramaCorrection,
  ZERO_PANORAMA_CORRECTION,
} from "./panorama-corrections";
import {
  filterNivControlPointsNearTrack,
  loadNivControlPoints,
  NIV_POINT_TRACK_CORRIDOR_METERS,
  type NivControlPoint,
} from "./niv-control-points";
import {
  createEcefToSceneMatrix,
  ecefToScenePosition,
} from "./ecef-scene-frame";

export {
  MESH_APPEARANCE_MODES,
  MESH_DEFAULT_ELEVATION_COLOR_RAMP,
  MESH_DEFAULT_ELEVATION_MAXIMUM_METERS,
  MESH_DEFAULT_ELEVATION_MINIMUM_METERS,
  MESH_ELEVATION_COLOR_RAMPS,
  MESH_ELEVATION_RANGE_MAXIMUM_METERS,
  MESH_ELEVATION_RANGE_MINIMUM_METERS,
  IMAGE_DISPLAY_DEFAULT_CONTRAST,
  IMAGE_DISPLAY_DEFAULT_EDGE_ENHANCEMENT,
  IMAGE_DISPLAY_DEFAULT_SATURATION,
  IMAGE_DISPLAY_MAXIMUM_EDGE_ENHANCEMENT,
  TRAJECTORY_ALIGNMENT_MODES,
};

export const CAPTURE_026_RADAR_SEGMENT_COUNTS = [5, 11, 21, 27] as const;
export type Capture026RadarSegmentCount =
  (typeof CAPTURE_026_RADAR_SEGMENT_COUNTS)[number];

export const GEORADAR_MINIMUM_RENDER_DISTANCE_METERS = 10;
export const GEORADAR_MAXIMUM_RENDER_DISTANCE_METERS = 2_000;
export const GEORADAR_DEFAULT_RENDER_DISTANCE_METERS = 250;

/** Oelberg MLS 3D Tiles delivery, resolved from the shared preset collection. */
const OELBERG_POINT_TILESET_URL =
  (
    POINT_CLOUD_PRESET_FEATURE_COLLECTION.features.find(
      (feature) => feature.id === "mls3dtiles"
    )?.properties as
      | { carmaConf3D?: { pointcloud?: { url?: string } } }
      | undefined
  )?.carmaConf3D?.pointcloud?.url ?? "";

const CAPTURE_026_MANIFEST_BY_SEGMENT_COUNT: Record<
  Capture026RadarSegmentCount,
  string
> = {
  5: investigationDataUrl("/capture-026-scene/capture-026-scene.json"),
  11: investigationDataUrl("/capture-026-scene/capture-026-scene-11x10m.json"),
  21: investigationDataUrl("/capture-026-scene/capture-026-scene-21x10m.json"),
  27: investigationDataUrl("/capture-026-scene/capture-026-scene-27x10m.json"),
};

export const CAPTURE_026_DEPTH_CLIP_MODES = [
  "relative",
  "surface",
  "absolute",
] as const;
export type Capture026DepthClipMode =
  (typeof CAPTURE_026_DEPTH_CLIP_MODES)[number];

export const CAPTURE_026_GEORADAR_RENDER_MODES = ["volume", "cutaway"] as const;
export type Capture026GeoradarRenderMode =
  (typeof CAPTURE_026_GEORADAR_RENDER_MODES)[number];

export const CAPTURE_026_PLANAR3_MODES = [
  "mesh-projection",
  "camera-plane",
  "both",
  "hidden",
] as const;
export type Capture026Planar3Mode = (typeof CAPTURE_026_PLANAR3_MODES)[number];
type VisibleCapture026Planar3Mode = Exclude<Capture026Planar3Mode, "hidden">;

export const CAPTURE_026_SURFACE_ELEVATION_SOURCES = [
  "dsm-2024",
  "dgm-2020",
] as const;
export type Capture026SurfaceElevationSource =
  (typeof CAPTURE_026_SURFACE_ELEVATION_SOURCES)[number];

export const CAPTURE_026_CAMERA_PROJECTIONS = [
  "perspective",
  "orthographic",
] as const;
export type Capture026CameraProjection =
  (typeof CAPTURE_026_CAMERA_PROJECTIONS)[number];

export const CAPTURE_026_PANORAMA_BLEND_MODES = [
  "panorama-only",
  "alpha",
  "multiply",
  "screen",
  "difference",
  "additive",
  "subtractive",
] as const;
export type Capture026PanoramaBlendMode =
  (typeof CAPTURE_026_PANORAMA_BLEND_MODES)[number];

const SURFACE_ELEVATION_SOURCES: Record<
  Capture026SurfaceElevationSource,
  { label: string; statusLabel: string; url: string }
> = {
  "dsm-2024": {
    label: "DSM 2024 · 1 m (Oberfläche)",
    statusLabel: "DSM 2024 · 1 m",
    url: WUPP_TERRAIN_PROVIDER_DSM_MESH_2024_1M.url,
  },
  "dgm-2020": {
    label: "DGM 2020 (Gelände)",
    statusLabel: "DGM 2020",
    url: WUPP_TERRAIN_PROVIDER.url,
  },
};

type SceneCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type CameraFlight = {
  startedAt: number;
  durationMs: number;
  fromPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  fromFov: number;
  fromUp: THREE.Vector3;
  toPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
  toFov: number;
  toUp: THREE.Vector3;
  onComplete?: () => void;
};

type Capture026Clipping = {
  x: ClipRange;
  y: ClipRange;
  z: ClipRange;
  depthMode: Capture026DepthClipMode;
};

export interface Capture026CollocatedSceneProps {
  manifestUrl?: string;
  radarOnly?: boolean;
  radarSegmentCount?: Capture026RadarSegmentCount;
  showGeoradar?: boolean;
  georadarRenderDistance?: number;
  georadarRenderMode?: Capture026GeoradarRenderMode;
  georadarDepthInverted?: boolean;
  showMesh2024?: boolean;
  /** Adds the Oelberg MLS cloud from its 3D Tiles delivery. */
  showOelbergPointTileset?: boolean;
  oelbergPointTilesetPointSize?: number;
  showNivPoints?: boolean;
  meshOpacity?: number;
  meshAppearance?: Mesh2024AppearanceMode;
  meshSaturation?: number;
  meshContrast?: number;
  meshElevationMinimum?: number;
  meshElevationMaximum?: number;
  meshElevationColorRamp?: Mesh2024ElevationColorRamp;
  meshErrorTarget?: number;
  meshCenterQualityBoost?: boolean;
  meshDebug?: boolean;
  meshWireframe?: boolean;
  meshTileBounds?: boolean;
  surfaceElevationSource?: Capture026SurfaceElevationSource;
  cameraProjection?: Capture026CameraProjection;
  showPanoramas?: boolean;
  panoramaOpacity?: number;
  panoramaSaturation?: number;
  panoramaContrast?: number;
  panoramaBlendMode?: Capture026PanoramaBlendMode;
  imageEdgeEnhancement?: number;
  panoramaOffsetForward?: number;
  panoramaOffsetDown?: number;
  panoramaOffsetRight?: number;
  panoramaBearingOffset?: number;
  panoramaPitchOffset?: number;
  panoramaRollOffset?: number;
  planar3Mode?: Capture026Planar3Mode;
  planar3OffsetForward?: number;
  planar3OffsetUp?: number;
  planar3OffsetRight?: number;
  showPlanar2?: boolean;
  alignmentMode?: TrajectoryAlignmentMode;
  trajectoryOffsetForward?: number;
  trajectoryOffsetDown?: number;
  trajectoryOffsetRight?: number;
}

const readInitialRadarCaptureId = () => {
  const candidates: Window[] = [window];
  try {
    if (
      window.parent !== window &&
      window.parent.location.origin === window.location.origin
    ) {
      candidates.push(window.parent);
    }
  } catch {
    // The embedded Storybook URL is still sufficient across origins.
  }
  for (const candidate of candidates) {
    const value = Number(
      new URL(candidate.location.href).searchParams.get("radar")
    );
    if (Number.isInteger(value) && value >= 1 && value <= 27) return value;
  }
  return 26;
};

type PlanarPose = {
  id: string;
  utm: [number, number, number];
  rollDegrees: number;
  pitchDegrees: number;
  headingDegrees: number;
  distanceToVolumeMeters: number;
  imageUrl: string;
};

type PlanarProjection = {
  cameraPosition: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  distance: number;
  width: number;
  height: number;
};

type PlanarNavigation = {
  kind: "planar";
  cameraPosition: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  worldSpace: false;
};

type PlanarPoseRuntime = {
  baseCameraPosition: THREE.Vector3;
  basePlaneCenter: THREE.Vector3;
  projection: PlanarProjection;
  navigation: PlanarNavigation;
  frustum: THREE.LineSegments;
};

type PanoramaPoseMeshes = {
  outside: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  inside: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  imageLodKey: string;
  basePosition: THREE.Vector3;
  basePanoramaQuaternion: THREE.Quaternion;
  forwardAxis: THREE.Vector3;
  downAxis: THREE.Vector3;
  rightAxis: THREE.Vector3;
};

type ImageTexturePreview = {
  url: string;
  width: number;
  height: number;
  bytes: number;
};

type ImageTextureDisplay = ImageTexturePreview;

type ImageTextureEntry = {
  key: string;
  kind: "planar-2" | "planar-3" | "panorama";
  id: string;
  source: string;
  display: ImageTextureDisplay;
  preview: ImageTexturePreview;
};

type ImageTextureManifest = {
  format: "carma-capture-026-image-textures-v1";
  previewMaximumDimension: number;
  images: ImageTextureEntry[];
};

type Capture026Manifest = {
  captureId: number;
  volume: {
    metadataUrl: string;
    variantId: string;
    depthExaggeration: number;
    clipUnit: { x: [number, number]; y: [number, number]; z: [number, number] };
  };
  georeference: {
    originUtm: [number, number];
    anchorHeightDhhN: number;
    alongEastNorth: [number, number];
    acrossEastNorth: [number, number];
    centerlineUtm: [number, number][];
    segmentWindow?: {
      focusStartMeter: number;
      segmentLengthMeter: number;
      adjacentSegments: number;
    };
    surfaceHeight: { initialOffsetFromCameraMeters: number };
    rigidFit: { rmsResidualMeters: number; maximumResidualMeters: number };
  };
  imageSelection: {
    imageTextureManifestUrl?: string;
    planarIntrinsics: string;
  };
  imagery: { id: "planar-2" | "planar-3"; selected: PlanarPose[] }[];
};

type RuntimeSettings = Required<
  Pick<
    Capture026CollocatedSceneProps,
    | "radarOnly"
    | "showGeoradar"
    | "georadarRenderDistance"
    | "showMesh2024"
    | "showOelbergPointTileset"
    | "oelbergPointTilesetPointSize"
    | "showNivPoints"
    | "showPlanar2"
    | "planar3Mode"
    | "planar3OffsetForward"
    | "planar3OffsetUp"
    | "planar3OffsetRight"
    | "showPanoramas"
    | "panoramaOpacity"
    | "panoramaSaturation"
    | "panoramaContrast"
    | "panoramaBlendMode"
    | "imageEdgeEnhancement"
    | "panoramaOffsetForward"
    | "panoramaOffsetDown"
    | "panoramaOffsetRight"
    | "panoramaBearingOffset"
    | "panoramaPitchOffset"
    | "panoramaRollOffset"
    | "meshOpacity"
    | "meshAppearance"
    | "meshSaturation"
    | "meshContrast"
    | "meshElevationMinimum"
    | "meshElevationMaximum"
    | "meshElevationColorRamp"
    | "meshErrorTarget"
    | "meshCenterQualityBoost"
    | "meshDebug"
    | "meshWireframe"
    | "meshTileBounds"
    | "surfaceElevationSource"
    | "cameraProjection"
    | "alignmentMode"
    | "trajectoryOffsetForward"
    | "trajectoryOffsetDown"
    | "trajectoryOffsetRight"
  >
> & {
  panoramaCalibrationVisible: boolean;
};

type SceneClippingMetrics = {
  lengthMeters: number;
  sliceMeters: number[];
  segmentCount: number;
  segmentLengthMeters: number;
  widthMeters: number;
  sourceDepthMeters: number;
  relativeTopMeters: number;
  relativeBottomMeters: number;
  referenceSurfaceDhhN: number;
};

type PanoramaCalibrationStatus = {
  panoramaId: string;
  traceId: string;
  traceIndex: number;
  sourcePositionUtm: [number, number, number];
  sourcePositionDhhN: [number, number, number];
  sourceOrientationDegrees: {
    heading: number;
    pitch: number;
    roll: number;
  };
  resourceOrientationCorrection: typeof PANORAMA_RESOURCE_ORIENTATION_CORRECTION;
  appliedPositionUtm: [number, number, number];
  appliedQuaternion: [number, number, number, number];
  baseCorrection: PanoramaCorrection;
  resolved: ResolvedPanoramaCorrection;
  storedCorrection?: PanoramaCorrection;
  controlPointCount: number;
};

type SceneStatusGroup = {
  id: "surface" | "georadar" | "mesh" | "imagery" | "display";
  label: string;
  entries: string[];
};

type SceneStatus = {
  summary: string;
  groups: SceneStatusGroup[];
};

type TemporalStatusGroupId = "georadar" | "mesh" | "imagery";
type StatusHistory = Record<TemporalStatusGroupId, number[]>;

type OptionsSection = "georadar" | "mesh" | "planar3" | "panorama";

const splitStatusEntries = (...values: string[]) =>
  values.flatMap((value) =>
    value
      .split(" · ")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

const getStatusGroupPreview = (group: SceneStatusGroup) => {
  const preferredPatterns: Partial<Record<SceneStatusGroup["id"], RegExp[]>> = {
    georadar: [
      /Georadar vollständig/,
      /Z-Zellvolumen|Schnittflächen/,
      /^Z nach /,
      /Radar-LOD/,
      /MB GPU/,
    ],
    mesh: [
      /Mesh (geladen|wird geladen|aus)/,
      /Screenfehler/,
      /Cache/,
      /ausstehend/,
    ],
    imagery: [
      /Panoramen/,
      /JPEG-Quellen/,
      /Kugelbilder/,
      /Kugel-Working-Set/,
      /aktiv /,
    ],
  };
  const preferredEntries = (preferredPatterns[group.id] ?? [])
    .map((pattern) => group.entries.find((entry) => pattern.test(entry)))
    .filter((entry): entry is string => Boolean(entry));
  return (
    preferredEntries.length > 0 ? preferredEntries : group.entries.slice(0, 3)
  ).join(" · ");
};

const getStatusGroupMetric = (group: SceneStatusGroup): number | undefined => {
  const pattern =
    group.id === "georadar"
      ? /Radar-LOD (\d+)\//
      : group.id === "mesh"
      ? /Mesh geladen · (\d+) Tiles/
      : group.id === "imagery"
      ? /Bildtexturen ([\d.]+) MB/
      : undefined;
  if (!pattern) return undefined;
  const match = group.entries.join(" · ").match(pattern);
  const metric = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(metric) ? metric : undefined;
};

const appendHistoryValue = (values: number[], value: number) =>
  [...values, value].slice(-36);

const createSparklinePoints = (
  values: number[],
  width: number,
  height: number,
  padding = 2
) => {
  const series =
    values.length === 0
      ? [0, 0]
      : values.length === 1
      ? [values[0], values[0]]
      : values;
  const minimum = Math.min(...series);
  const maximum = Math.max(...series);
  const range = Math.max(1e-6, maximum - minimum);
  return series
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(1, series.length - 1)) * (width - padding * 2);
      const y =
        height - padding - ((value - minimum) / range) * (height - padding * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    })
    .join(" ");
};

const isTemporalStatusGroup = (
  id: SceneStatusGroup["id"]
): id is TemporalStatusGroupId =>
  id === "georadar" || id === "mesh" || id === "imagery";

type GeoradarTransferSettings = {
  toneCurve: CurvePoint[];
  opacityRamp: CurvePoint[];
  clampRange: ClipRange;
  colorRamp: RampName;
  invertColorRamp: boolean;
};

type GeoradarDisplaySettings = {
  renderMode: Capture026GeoradarRenderMode;
  depthInverted: boolean;
};

const copyCurve = (points: readonly CurvePoint[]) =>
  points.map((point) => ({ ...point }));

const createDefaultGeoradarTransferSettings = (): GeoradarTransferSettings => ({
  toneCurve: copyCurve(DEFAULT_GEORADAR_TONE_CURVE),
  opacityRamp: copyCurve(DEFAULT_GEORADAR_ALPHA_RAMP),
  clampRange: { ...DEFAULT_GEORADAR_CLAMP_RANGE },
  colorRamp: DEFAULT_GEORADAR_COLOR_RAMP,
  invertColorRamp: DEFAULT_GEORADAR_COLOR_RAMP_INVERTED,
});

type SceneRuntime = {
  renderer: THREE.WebGPURenderer;
  volume: GeoradarSliceSweep;
  source: GeoradarMdioSource;
  metadata: VolumeMetadata;
  variant: VolumeVariant;
  groups: {
    mesh: THREE.Group;
    nivPoints: THREE.Group;
    planar2: THREE.Group;
    planar3: THREE.Group;
    planar3Projection: THREE.Group;
    panoramas: THREE.Group;
    survey: THREE.Group;
  };
  clippingMetrics: SceneClippingMetrics;
  signalHistogram256: number[];
  applyVisualization: (settings: RuntimeSettings) => void;
  applyGeoradarTransfer: (settings: GeoradarTransferSettings) => void;
  applyGeoradarDisplay: (settings: GeoradarDisplaySettings) => void;
  applyElevationSource: (
    source: Capture026SurfaceElevationSource
  ) => Promise<SceneClippingMetrics>;
  applyClipping: (clipping: Capture026Clipping) => void;
  applyTrajectoryOffset: (forward: number, down: number, right: number) => void;
  applySettings: (settings: RuntimeSettings) => void;
  setActivePanoramaCorrection: (correction: PanoramaCorrection) => void;
  deleteActivePanoramaCorrection: () => void;
  exportPanoramaCorrections: () => void;
  setTopDownView: () => void;
  dispose: () => void;
};

const PANORAMA_OUTSIDE_RADIUS_METERS = 0.68;
const PANORAMA_INSIDE_RADIUS_METERS = 0.675;
const PANORAMA_GRATICULE_RADIUS_METERS = 0.67;
const PANORAMA_DEFAULT_FOV_DEGREES = 44;
const PANORAMA_MIN_FOV_DEGREES = 24;
const PANORAMA_EXIT_WHEEL_DISTANCE = 42;
const PANORAMA_EXIT_TOUCH_DISTANCE = 28;
const PANORAMA_EXIT_BACKWARD_METERS = 10;
const PANORAMA_EXIT_UPWARD_METERS = 6;
const PANORAMA_SWITCH_FADE_OUT_MILLISECONDS = 120;
const PANORAMA_SWITCH_FADE_IN_MILLISECONDS = 160;
const PANORAMA_SWITCH_ARRIVAL_FADE_KEY = "capture026-panorama-arrival-fade";
const PANORAMA_THUMBNAIL_MAXIMUM_DIMENSION = 256;
const PANORAMA_THUMBNAIL_VISIBLE_LIMIT = 32;
const PANORAMA_THUMBNAIL_CONCURRENT_LOADS = 4;
const PANORAMA_THUMBNAIL_MAXIMUM_DISTANCE_METERS = 120;

const createPanoramaGraticule = () => {
  const group = new THREE.Group();
  group.name = "Panorama calibration graticule";
  const gridPoints: THREE.Vector3[] = [];
  const horizonPoints: THREE.Vector3[] = [];
  const addArc = (
    target: THREE.Vector3[],
    pointAt: (step: number) => THREE.Vector3,
    steps: number
  ) => {
    for (let step = 0; step < steps; step += 1) {
      target.push(pointAt(step), pointAt(step + 1));
    }
  };
  const pointAt = (latitude: number, longitude: number) => {
    const cosLatitude = Math.cos(latitude);
    return new THREE.Vector3(
      Math.sin(longitude) * cosLatitude,
      Math.sin(latitude),
      -Math.cos(longitude) * cosLatitude
    ).multiplyScalar(PANORAMA_GRATICULE_RADIUS_METERS);
  };
  addArc(horizonPoints, (step) => pointAt(0, (step * Math.PI) / 90), 180);
  for (const latitudeDegrees of [-20, -10, 10, 20]) {
    const latitude = THREE.MathUtils.degToRad(latitudeDegrees);
    addArc(gridPoints, (step) => pointAt(latitude, (step * Math.PI) / 90), 180);
  }
  for (
    let longitudeDegrees = 0;
    longitudeDegrees < 360;
    longitudeDegrees += 30
  ) {
    const longitude = THREE.MathUtils.degToRad(longitudeDegrees);
    addArc(
      gridPoints,
      (step) => pointAt(THREE.MathUtils.degToRad(-30 + step), longitude),
      60
    );
  }
  const createLines = (
    points: THREE.Vector3[],
    color: number,
    opacity: number,
    renderOrder: number
  ) => {
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      })
    );
    lines.renderOrder = renderOrder;
    return lines;
  };
  group.add(
    createLines(gridPoints, 0xffffff, 0.48, 12),
    createLines(horizonPoints, 0x00d4e8, 0.95, 13)
  );
  group.visible = false;
  return group;
};

const createSurveyLabelSprite = (
  streetName: string,
  captureId: number,
  active: boolean
) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D für Radarlabel nicht verfügbar");
  context.font = "600 34px system-ui, sans-serif";
  const streetLines: string[] = [];
  let currentLine = "";
  for (const word of streetName.trim().split(/\s+/)) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (context.measureText(candidate).width <= 470) {
      currentLine = candidate;
      continue;
    }
    if (currentLine) streetLines.push(currentLine);
    currentLine = "";
    let wordPart = "";
    for (const character of Array.from(word)) {
      if (
        wordPart &&
        context.measureText(`${wordPart}${character}`).width > 470
      ) {
        streetLines.push(wordPart);
        wordPart = character;
      } else {
        wordPart += character;
      }
    }
    currentLine = wordPart;
  }
  if (currentLine) streetLines.push(currentLine);
  if (streetLines.length === 0) streetLines.push(streetName);
  const streetLineHeight = 36;
  const radarLineHeight = 26;
  const labelGap = 6;
  const contentHeight =
    streetLines.length * streetLineHeight + labelGap + radarLineHeight;
  canvas.height = Math.max(112, contentHeight + 24);
  const contentTop = (canvas.height - contentHeight) / 2;
  context.fillStyle = active
    ? "rgba(8, 145, 178, 0.92)"
    : "rgba(91, 33, 182, 0.82)";
  context.beginPath();
  context.roundRect(4, 4, 504, canvas.height - 8, 28);
  context.fill();
  context.fillStyle = "white";
  context.font = "600 34px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  streetLines.forEach((line, index) => {
    context.fillText(line, 256, contentTop + (index + 0.5) * streetLineHeight);
  });
  context.font = "500 22px system-ui, sans-serif";
  context.fillText(
    `Radar ${String(captureId).padStart(3, "0")}`,
    256,
    contentTop + streetLines.length * streetLineHeight + labelGap + 13
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(18, (18 * canvas.height) / canvas.width, 1);
  sprite.renderOrder = 15;
  return sprite;
};

const addGeoradarSurveyOverlay = (
  group: THREE.Group,
  survey: GeoradarSurveyManifest,
  graph: SurveyNavigationGraph,
  origin: [number, number],
  activeCaptureId: number
) => {
  for (const trace of survey.traces) {
    const active = trace.captureId === activeCaptureId;
    const geometry = new THREE.BufferGeometry().setFromPoints(
      trace.centerlineUtm.map(
        ([east, north]) =>
          new THREE.Vector3(east - origin[0], 0.12, -(north - origin[1]))
      )
    );
    const material = new THREE.LineBasicMaterial({
      color: active ? 0x00b8cf : 0x6d28d9,
      opacity: active ? 1 : 0.62,
      transparent: !active,
      depthTest: false,
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = active ? 10 : 8;
    const middle =
      trace.centerlineUtm[Math.floor(trace.centerlineUtm.length / 2)];
    const streetName = getSurveyStreetName(middle);
    line.userData.navigation = {
      kind: "georadar-trace",
      captureId: trace.captureId,
    };
    line.userData.streetName = streetName;
    group.add(line);

    const label = createSurveyLabelSprite(streetName, trace.captureId, active);
    label.position.set(
      middle[0] - origin[0],
      active ? 2.6 : 1.8,
      -(middle[1] - origin[1])
    );
    label.userData.navigation = {
      kind: "georadar-trace",
      captureId: trace.captureId,
    };
    label.userData.streetName = streetName;
    group.add(label);
  }

  const connectionPoints: THREE.Vector3[] = [];
  const seen = new Set<string>();
  for (const edge of graph.crossTraceEdges) {
    const key = [edge.from, edge.to].sort().join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    const from = graph.nodes.get(edge.from);
    const to = graph.nodes.get(edge.to);
    if (!from || !to) continue;
    connectionPoints.push(
      new THREE.Vector3(
        from.position[0] - origin[0],
        0.2,
        -(from.position[1] - origin[1])
      ),
      new THREE.Vector3(
        to.position[0] - origin[0],
        0.2,
        -(to.position[1] - origin[1])
      )
    );
  }
  if (connectionPoints.length > 0) {
    const geometry = new THREE.BufferGeometry().setFromPoints(connectionPoints);
    const material = new THREE.LineDashedMaterial({
      color: 0xf59e0b,
      dashSize: 2,
      gapSize: 1,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const connections = new THREE.LineSegments(geometry, material);
    connections.computeLineDistances();
    connections.renderOrder = 9;
    group.add(connections);
  }
};

const terrainUrlForRuntime = (source: Capture026SurfaceElevationSource) => {
  const url = SURFACE_ELEVATION_SOURCES[source].url;
  if (!import.meta.env.DEV) return url;
  const parsed = new URL(url);
  return `/__wupp_terrain__${parsed.pathname}`;
};

const smoothProfile = (values: number[]) =>
  values.map((_, index) => {
    const previous = values[Math.max(0, index - 1)];
    const current = values[index];
    const next = values[Math.min(values.length - 1, index + 1)];
    return previous * 0.25 + current * 0.5 + next * 0.25;
  });

const sampleSurfaceProfile = async (
  centerline: [number, number][],
  source: Capture026SurfaceElevationSource
) => {
  const provider = await CesiumTerrainProvider.fromUrl(
    terrainUrlForRuntime(source)
  );
  const positions = centerline.map(([east, north]) => {
    const [longitude, latitude] = getFromUTM32ToWGS84([east, north]) as [
      number,
      number
    ];
    return Cartographic.fromDegrees(longitude, latitude);
  });
  const samples = await sampleTerrainMostDetailed(provider, positions, true);
  // Wuppertal's quantized terrain sources carry DHHN2016 numeric heights.
  // Convert every sample before differencing so the profile follows the
  // ellipsoid rather than silently flattening the quasigeoid variation.
  const heights = smoothProfile(
    await Promise.all(
      samples.map(async ({ height }, index) => {
        const [east, north] = centerline[index];
        return dhhn2016ToEllipsoidalHeight(
          {
            east: east as Coordinates.ETRS89UTMEastingMeters,
            north: north as Coordinates.ETRS89UTMNorthingMeters,
            zone: 32,
          },
          height as Altitude.DHHN2016Meters
        );
      })
    )
  );
  const reference = heights[Math.floor(heights.length / 2)] ?? 0;
  return heights.map((height) => height - reference);
};

const fetchJson = async <Result,>(url: string): Promise<Result> => {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<Result>;
};

/**
 * Scene manifests and the survey graph reference their sibling files with
 * root-relative paths. Those paths mean "relative to the investigation data
 * folder" — resolved against the page origin they only work on the dev
 * server, so anything read from data goes through this resolver.
 */
const resolveInvestigationDataReference = (reference: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(reference)
    ? reference
    : investigationDataUrl(reference);

const resolveGeoradarMdioStoreUrl = (metadataUrl: string) => {
  const metadataFileName = new URL(metadataUrl, window.location.href).pathname
    .split("/")
    .at(-1);
  if (!metadataFileName?.endsWith(".json")) {
    throw new Error(`Ungültige Georadar-Metadaten-URL: ${metadataUrl}`);
  }
  const storeName = `${metadataFileName.slice(0, -".json".length)}.mdio`;
  const configuredBase =
    import.meta.env.VITE_GEORADAR_MDIO_BASE_URL ??
    `${investigationDataUrl("/georadar-mdio")}/`;
  const base = configuredBase.endsWith("/")
    ? configuredBase
    : `${configuredBase}/`;
  return new URL(`${base}${storeName}`, window.location.href).href;
};

const createAssetAvailabilityProbe = () => {
  const results = new Map<string, Promise<boolean>>();
  const probe = async (url: string) => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      try {
        const head = await fetch(url, {
          method: "HEAD",
          cache: "force-cache",
          signal: controller.signal,
        });
        if (head.ok) return true;
        if (head.status === 404 || head.status === 410) return false;
      } catch {
        if (controller.signal.aborted) return false;
      }
      try {
        const partial = await fetch(url, {
          headers: { Range: "bytes=0-0" },
          cache: "force-cache",
          signal: controller.signal,
        });
        await partial.body?.cancel();
        return partial.ok;
      } catch {
        return false;
      }
    } finally {
      window.clearTimeout(timeout);
    }
  };
  const isLoadable = (url: string) => {
    const absoluteUrl = new URL(url, window.location.href).href;
    let result = results.get(absoluteUrl);
    if (!result) {
      result = probe(absoluteUrl);
      results.set(absoluteUrl, result);
    }
    return result;
  };
  return {
    isLoadable,
    markUnavailable: (url: string) => {
      results.set(
        new URL(url, window.location.href).href,
        Promise.resolve(false)
      );
    },
    clear: () => results.clear(),
  };
};

const toScenePosition = (
  utm: [number, number, number],
  origin: [number, number],
  anchorHeight: number
) =>
  new THREE.Vector3(
    utm[0] - origin[0],
    utm[2] - anchorHeight,
    -(utm[1] - origin[1])
  );

const createNivPointLabel = (point: NivControlPoint) => {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "rgba(14, 23, 31, 0.84)";
  context.beginPath();
  context.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 28);
  context.fill();
  context.strokeStyle = "rgba(34, 211, 238, 0.95)";
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = "#ecfeff";
  context.font = "600 34px system-ui, sans-serif";
  context.textBaseline = "middle";
  const identifier = point.punktnummer_nrw ?? point.laufende_nummer;
  context.fillText(
    `NIV ${identifier} · ${point.hoehe_ueber_nhn2016.toFixed(3)} m DHHN2016`,
    30,
    canvas.height / 2
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(8, 1.4, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 12;
  return sprite;
};

const addNivControlPointLayer = (
  group: THREE.Group,
  entries: ReturnType<typeof filterNivControlPointsNearTrack>,
  ecefToScene: THREE.Matrix4
) => {
  if (entries.length === 0) return;
  const geometry = new THREE.SphereGeometry(0.2, 12, 8);
  const material = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    depthTest: false,
    depthWrite: false,
  });
  const points = new THREE.InstancedMesh(geometry, material, entries.length);
  points.renderOrder = 11;
  const matrix = new THREE.Matrix4();
  entries.forEach(({ point }, index) => {
    const position = ecefToScenePosition(point.ecef, ecefToScene);
    matrix.makeTranslation(position.x, position.y, position.z);
    points.setMatrixAt(index, matrix);
    const label = createNivPointLabel(point);
    if (label) {
      label.position.copy(position).add(new THREE.Vector3(0, 0.35, 0));
      label.userData.nivPoint = point;
      group.add(label);
    }
  });
  points.instanceMatrix.needsUpdate = true;
  group.add(points);
};

const planarAxes = (pose: PlanarPose) => {
  const heading = degToRadNumeric(pose.headingDegrees);
  const pitch = degToRadNumeric(pose.pitchDegrees);
  const roll = degToRadNumeric(pose.rollDegrees);
  const forward = new THREE.Vector3(
    Math.sin(heading) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(heading) * Math.cos(pitch)
  ).normalize();
  const right = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading))
    .normalize()
    .applyAxisAngle(forward, roll);
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { forward, right, up };
};

const createImageTextureRuntime = (
  manifest: ImageTextureManifest,
  manifestUrl: string,
  availability: ReturnType<typeof createAssetAvailabilityProbe>
) => {
  if (manifest.format !== "carma-capture-026-image-textures-v1") {
    throw new Error(`Unbekanntes Bildtextur-Format: ${manifest.format}`);
  }
  const entries = new Map(manifest.images.map((entry) => [entry.key, entry]));
  const manifestBaseUrl = new URL(manifestUrl, window.location.href);
  const assetUrl = (url: string) => new URL(url, manifestBaseUrl).href;
  const previewLoads = new Map<string, Promise<LoadedJpegTexture>>();
  const previewResults = new Map<string, LoadedJpegTexture>();
  const externalThumbnailRecords = new Map<
    string,
    {
      cancelled: boolean;
      loading: Promise<LoadedJpegTexture>;
      result?: LoadedJpegTexture;
    }
  >();
  let activationGeneration = 0;
  let active:
    | {
        key: string;
        loaded?: LoadedJpegTexture;
        previewTexture?: THREE.Texture;
        material: THREE.MeshBasicMaterial;
      }
    | undefined;
  const externalEntries = new Map<string, string>();

  const requireEntry = (key: string) => {
    const entry = entries.get(key);
    if (!entry) throw new Error(`Bildtextur fehlt: ${key}`);
    return entry;
  };
  const loadPreview = (key: string) => {
    let loading = previewLoads.get(key);
    if (!loading) {
      const preview = requireEntry(key).preview;
      loading = loadJpegTexture(
        assetUrl(preview.url),
        preview.width,
        preview.height
      ).then((result) => {
        previewResults.set(key, result);
        return result;
      });
      previewLoads.set(key, loading);
    }
    return loading;
  };
  const bindPreview = async (
    key: string,
    material: THREE.MeshBasicMaterial | THREE.MeshPhysicalMaterial
  ) => {
    const { texture } = await loadPreview(key);
    material.map = texture;
    material.userData.disposeMap = false;
    material.needsUpdate = true;
    return texture;
  };
  const loadThumbnail = async (key: string) => {
    if (entries.has(key)) return (await loadPreview(key)).texture;
    const externalUrl = externalEntries.get(key);
    if (!externalUrl) throw new Error(`Bildtextur fehlt: ${key}`);
    let record = externalThumbnailRecords.get(key);
    if (!record) {
      const nextRecord = {
        cancelled: false,
        loading: Promise.resolve(undefined as never),
      } as {
        cancelled: boolean;
        loading: Promise<LoadedJpegTexture>;
        result?: LoadedJpegTexture;
      };
      nextRecord.loading = loadJpegTexture(
        externalUrl,
        8192,
        4096,
        PANORAMA_THUMBNAIL_MAXIMUM_DIMENSION
      ).then((result) => {
        if (nextRecord.cancelled) {
          disposeJpegTexture(result);
          throw new DOMException("Panorama-Vorschau verworfen", "AbortError");
        }
        nextRecord.result = result;
        return result;
      });
      record = nextRecord;
      externalThumbnailRecords.set(key, record);
    }
    return (await record.loading).texture;
  };
  const releaseThumbnail = (key: string) => {
    if (entries.has(key)) return;
    const record = externalThumbnailRecords.get(key);
    if (!record) return;
    record.cancelled = true;
    if (record.result) disposeJpegTexture(record.result);
    externalThumbnailRecords.delete(key);
  };
  const deactivate = () => {
    activationGeneration += 1;
    if (!active) return;
    active.material.map = active.previewTexture ?? null;
    active.material.needsUpdate = true;
    if (active.loaded) disposeJpegTexture(active.loaded);
    active = undefined;
  };
  const activate = async (
    key: string,
    material: THREE.MeshBasicMaterial,
    onApplied?: () => void
  ) => {
    if (active?.key === key && active.material === material) return;
    const generation = ++activationGeneration;
    const entry = entries.get(key);
    if (!entry) {
      const externalUrl = externalEntries.get(key);
      if (!externalUrl) throw new Error(`Bildtextur fehlt: ${key}`);
      const loaded = await loadJpegTexture(externalUrl, 8192, 4096, 4096);
      if (generation !== activationGeneration) {
        disposeJpegTexture(loaded);
        return;
      }
      if (active) {
        active.material.map = active.previewTexture ?? null;
        active.material.needsUpdate = true;
        if (active.loaded) disposeJpegTexture(active.loaded);
        active = undefined;
      }
      material.map = loaded.texture;
      material.userData.disposeMap = false;
      material.needsUpdate = true;
      active = { key, loaded, material };
      onApplied?.();
      return;
    }
    const preview = await loadPreview(key);
    if (generation !== activationGeneration) {
      return;
    }
    if (active) {
      active.material.map = active.previewTexture;
      active.material.needsUpdate = true;
      if (active.loaded) disposeJpegTexture(active.loaded);
    }
    material.map = preview.texture;
    material.userData.disposeMap = false;
    material.needsUpdate = true;
    active = {
      key,
      previewTexture: preview.texture,
      material,
    };
    onApplied?.();
    const display = entry.display;
    const loaded = await loadJpegTexture(
      assetUrl(display.url),
      display.width,
      display.height
    );
    if (generation !== activationGeneration || active?.material !== material) {
      disposeJpegTexture(loaded);
      return;
    }
    material.map = loaded.texture;
    material.needsUpdate = true;
    active.loaded = loaded;
    onApplied?.();
  };

  return {
    hasEntry: (key: string) => entries.has(key),
    registerExternal: (key: string, url: string) => {
      if (!entries.has(key)) externalEntries.set(key, url);
    },
    isLoadable: (key: string) => {
      const entry = entries.get(key);
      const url = entry
        ? assetUrl(entry.preview.url)
        : externalEntries.get(key);
      return url ? availability.isLoadable(url) : Promise.resolve(false);
    },
    markUnavailable: (key: string) => {
      const entry = entries.get(key);
      const url = entry
        ? assetUrl(entry.preview.url)
        : externalEntries.get(key);
      if (url) availability.markUnavailable(url);
    },
    bindPreview,
    loadThumbnail,
    releaseThumbnail,
    activate,
    deactivate,
    getStatus: () => {
      const previewBytes = [...previewResults.values()].reduce(
        (sum, result) => sum + result.gpuBytes,
        0
      );
      const thumbnailResults = [...externalThumbnailRecords.values()].flatMap(
        ({ result }) => (result ? [result] : [])
      );
      const thumbnailBytes = thumbnailResults.reduce(
        (sum, result) => sum + result.gpuBytes,
        0
      );
      const activeDimensions = active?.loaded
        ? `${active.loaded.width}×${active.loaded.height}`
        : active
        ? "Preview"
        : "–";
      const gpuBytes =
        previewBytes + thumbnailBytes + (active?.loaded?.gpuBytes ?? 0);
      return `${entries.size + externalEntries.size} JPEG-Quellen · Preview ≤${
        manifest.previewMaximumDimension
      } px · Kugelbilder ${
        previewResults.size + thumbnailResults.length
      }× · aktiv ${activeDimensions} · Bildtexturen ${(
        gpuBytes /
        (1024 * 1024)
      ).toFixed(1)} MB`;
    },
    dispose: () => {
      deactivate();
      for (const loading of previewLoads.values()) {
        void loading.then(disposeJpegTexture);
      }
      previewLoads.clear();
      previewResults.clear();
      for (const record of externalThumbnailRecords.values()) {
        record.cancelled = true;
        if (record.result) disposeJpegTexture(record.result);
      }
      externalThumbnailRecords.clear();
      externalEntries.clear();
    },
  };
};

type ImageTextureRuntime = ReturnType<typeof createImageTextureRuntime>;

const addPlanarPose = async (
  group: THREE.Group,
  pose: PlanarPose,
  origin: [number, number],
  anchorHeight: number,
  accent: number,
  imageTextures: ImageTextureRuntime,
  imageKind: "planar-2" | "planar-3",
  displayFilter: ImageDisplayFilter
) => {
  const imageLodKey = `${imageKind}/${pose.id}`;
  const cameraPosition = toScenePosition(pose.utm, origin, anchorHeight);
  const { forward, right, up } = planarAxes(pose);
  const distance = 2.35;
  const height = 1.35;
  const width = height * (2464 / 2056);
  const planeCenter = cameraPosition.clone().addScaledVector(forward, distance);
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
  });
  applyImageDisplayFilterToMaterial(material, displayFilter);
  await imageTextures.bindPreview(imageLodKey, material);
  const plane = new THREE.Mesh(geometry, material);
  plane.position.copy(planeCenter);
  // Three cameras look down local -Z. right × up therefore defines the
  // backward (+Z) axis, not the optical forward axis.
  plane.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, forward.clone().negate())
  );
  plane.renderOrder = 4;
  plane.userData.pose = pose;
  plane.userData.imageLodKey = imageLodKey;
  const navigation: PlanarNavigation = {
    kind: "planar",
    cameraPosition: cameraPosition.clone(),
    target: planeCenter.clone(),
    up: up.clone(),
    worldSpace: false,
  };
  const projection: PlanarProjection = {
    cameraPosition: cameraPosition.clone(),
    forward: forward.clone(),
    right: right.clone(),
    up: up.clone(),
    distance,
    width,
    height,
  };
  plane.userData.navigation = navigation;
  plane.userData.projection = projection;
  group.add(plane);

  const halfRight = right.clone().multiplyScalar(width / 2);
  const halfUp = up.clone().multiplyScalar(height / 2);
  const corners = [
    planeCenter.clone().sub(halfRight).sub(halfUp),
    planeCenter.clone().add(halfRight).sub(halfUp),
    planeCenter.clone().add(halfRight).add(halfUp),
    planeCenter.clone().sub(halfRight).add(halfUp),
  ];
  const points: THREE.Vector3[] = [];
  for (let index = 0; index < corners.length; index += 1) {
    points.push(cameraPosition, corners[index]);
    points.push(corners[index], corners[(index + 1) % corners.length]);
  }
  const frustumGeometry = new THREE.BufferGeometry().setFromPoints(points);
  const frustumMaterial = new THREE.LineBasicMaterial({
    color: accent,
    transparent: true,
    opacity: 0.82,
    depthTest: false,
  });
  const frustum = new THREE.LineSegments(frustumGeometry, frustumMaterial);
  frustum.renderOrder = 5;
  group.add(frustum);
  plane.userData.planarPoseRuntime = {
    baseCameraPosition: cameraPosition.clone(),
    basePlaneCenter: planeCenter.clone(),
    projection,
    navigation,
    frustum,
  } satisfies PlanarPoseRuntime;
  return plane;
};

const applyPlanarPoseOffset = (
  group: THREE.Group,
  forwardMeters: number,
  upMeters: number,
  rightMeters: number
) => {
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const runtime = child.userData.planarPoseRuntime as
      | PlanarPoseRuntime
      | undefined;
    if (!runtime) continue;
    const offset = runtime.projection.forward
      .clone()
      .multiplyScalar(forwardMeters)
      .addScaledVector(runtime.projection.up, upMeters)
      .addScaledVector(runtime.projection.right, rightMeters);
    const cameraPosition = runtime.baseCameraPosition.clone().add(offset);
    const planeCenter = runtime.basePlaneCenter.clone().add(offset);
    child.position.copy(planeCenter);
    runtime.frustum.position.copy(offset);
    runtime.projection.cameraPosition.copy(cameraPosition);
    runtime.navigation.cameraPosition.copy(cameraPosition);
    runtime.navigation.target.copy(planeCenter);
  }
};

const addPanoramaPose = async (
  group: THREE.Group,
  pose: ImagePose,
  origin: [number, number],
  anchorHeight: number,
  outsideGeometry: THREE.SphereGeometry,
  insideGeometry: THREE.SphereGeometry,
  displayFilter: ImageDisplayFilter
) => {
  const imageLodKey = `panorama/${pose.id}`;
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xc3cdd3,
    emissive: 0x25343b,
    emissiveIntensity: 0.22,
    metalness: 0.48,
    roughness: 0.24,
    clearcoat: 0.92,
    clearcoatRoughness: 0.18,
    side: THREE.FrontSide,
    transparent: true,
    opacity: 0.88,
    depthTest: true,
    depthWrite: true,
  });
  applyImageDisplayFilterToMaterial(material, displayFilter);
  material.userData.disposeMap = false;
  const sphere = new THREE.Mesh(outsideGeometry, material);
  sphere.position.copy(toScenePosition(pose.utm, origin, anchorHeight));
  sphere.rotation.y = -(pose.headingRad ?? 0);
  const offsetFrameQuaternion = sphere.quaternion.clone();
  sphere.userData.pose = pose;
  sphere.userData.navigation = {
    kind: "panorama",
    headingRad: pose.headingRad ?? 0,
  };
  group.add(sphere);

  const insideMaterial = new THREE.MeshBasicMaterial({
    depthTest: false,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  });
  applyImageDisplayFilterToMaterial(insideMaterial, displayFilter);
  const insideSphere = new THREE.Mesh(insideGeometry, insideMaterial);
  insideSphere.position.copy(sphere.position);
  insideSphere.rotation.copy(sphere.rotation);
  // reference.csv supplies full exterior orientation. Previously only heading
  // was retained, which left the recorded vehicle pitch and roll baked into
  // every panorama instead of placing its horizon in the world frame.
  insideSphere.rotateX(pose.pitchRad ?? 0);
  insideSphere.rotateZ(-(pose.rollRad ?? 0));
  // Texture longitude calibration belongs inside the physical camera pose;
  // applying it first would rotate the pitch and roll correction axes.
  insideSphere.rotateY(Math.PI / 2);
  const basePanoramaQuaternion = insideSphere.quaternion.clone();
  // The small exterior sphere is the same captured light field viewed from
  // outside. Keep its source pose and later micro-corrections identical to the
  // correctly calibrated inner panorama; only its material/view side differs.
  sphere.quaternion.copy(basePanoramaQuaternion);
  sphere.updateMatrixWorld();
  insideSphere.renderOrder = 9;
  insideSphere.visible = false;
  sphere.userData.panoramaInside = insideSphere;
  group.add(insideSphere);
  const basePosition = sphere.position.clone();
  const forwardAxis = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(offsetFrameQuaternion)
    .normalize();
  const downAxis = new THREE.Vector3(0, -1, 0)
    .applyQuaternion(offsetFrameQuaternion)
    .normalize();
  const rightAxis = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(offsetFrameQuaternion)
    .normalize();
  return {
    outside: sphere,
    inside: insideSphere,
    imageLodKey,
    basePosition,
    basePanoramaQuaternion,
    forwardAxis,
    downAxis,
    rightAxis,
  };
};

const applyPanoramaOrientation = (
  panorama: PanoramaPoseMeshes,
  bearingDegrees: number,
  pitchDegrees: number,
  rollDegrees: number
) => {
  panorama.inside.quaternion.copy(panorama.basePanoramaQuaternion);
  panorama.inside.rotateY(THREE.MathUtils.degToRad(bearingDegrees));
  panorama.inside.rotateX(THREE.MathUtils.degToRad(pitchDegrees));
  panorama.inside.rotateZ(THREE.MathUtils.degToRad(rollDegrees));
  panorama.outside.quaternion.copy(panorama.inside.quaternion);
};

const applyPanoramaPosition = (
  panorama: PanoramaPoseMeshes,
  forward: number,
  down: number,
  right: number
) => {
  const offset = panorama.forwardAxis
    .clone()
    .multiplyScalar(forward)
    .addScaledVector(panorama.downAxis, down)
    .addScaledVector(panorama.rightAxis, right);
  panorama.outside.position.copy(panorama.basePosition).add(offset);
  panorama.inside.position.copy(panorama.outside.position);
};

const applyPanoramaAppearance = (
  panorama: PanoramaPoseMeshes,
  opacity: number,
  blendMode: Capture026PanoramaBlendMode
) => {
  const clampedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  panorama.outside.renderOrder = 0;
  panorama.outside.material.opacity = clampedOpacity;
  panorama.outside.material.transparent = clampedOpacity < 0.999;
  panorama.outside.material.depthTest = true;
  panorama.outside.material.depthWrite = true;
  panorama.outside.material.needsUpdate = true;

  const material = panorama.inside.material;
  material.opacity = clampedOpacity;
  material.transparent =
    clampedOpacity < 0.999 || blendMode !== "panorama-only";
  material.premultipliedAlpha = blendMode === "multiply";
  const difference = blendMode === "difference";
  material.blending =
    blendMode === "multiply"
      ? THREE.MultiplyBlending
      : blendMode === "screen" || difference
      ? THREE.CustomBlending
      : blendMode === "additive"
      ? THREE.AdditiveBlending
      : blendMode === "subtractive"
      ? THREE.SubtractiveBlending
      : THREE.NormalBlending;
  material.blendEquation = difference
    ? THREE.ReverseSubtractEquation
    : THREE.AddEquation;
  material.blendSrc =
    blendMode === "screen" ? THREE.OneFactor : THREE.SrcAlphaFactor;
  material.blendDst =
    blendMode === "screen"
      ? THREE.OneMinusSrcColorFactor
      : difference
      ? THREE.OneFactor
      : THREE.OneMinusSrcAlphaFactor;
  material.depthTest = false;
  material.depthWrite = false;
  material.needsUpdate = true;
};

const animatePanoramaOpacity = (
  panorama: PanoramaPoseMeshes,
  from: number,
  to: number,
  durationMilliseconds: number,
  requestFrame: () => void,
  shouldContinue: () => boolean
) =>
  new Promise<boolean>((resolve) => {
    const material = panorama.inside.material;
    const startedAt = performance.now();
    material.transparent = true;
    material.needsUpdate = true;
    const update = (time: number) => {
      if (!shouldContinue()) {
        resolve(false);
        return;
      }
      const unit = THREE.MathUtils.clamp(
        (time - startedAt) / durationMilliseconds,
        0,
        1
      );
      const eased = unit * unit * (3 - 2 * unit);
      material.opacity = THREE.MathUtils.lerp(from, to, eased);
      requestFrame();
      if (unit < 1) window.requestAnimationFrame(update);
      else resolve(true);
    };
    window.requestAnimationFrame(update);
  });

const replaceGroupContents = (target: THREE.Group, source: THREE.Group) => {
  for (const child of [...target.children]) {
    target.remove(child);
    disposeObject(child);
  }
  for (const child of [...source.children]) target.add(child);
};

const projectPlanar3OntoMesh = (
  target: THREE.Group,
  planarGroup: THREE.Group,
  meshAnchor: THREE.Group
) => {
  const next = new THREE.Group();
  const raycaster = new THREE.Raycaster();
  let triangleCount = 0;
  planarGroup.updateWorldMatrix(true, true);
  for (const child of planarGroup.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const projection = child.userData.projection as
      | PlanarProjection
      | undefined;
    const sourceMaterial = child.material as THREE.MeshBasicMaterial;
    if (!projection || !sourceMaterial.map) continue;

    const columns = 18;
    const rows = 14;
    const hits: Array<THREE.Vector3 | null> = [];
    for (let row = 0; row <= rows; row += 1) {
      const v = row / rows;
      for (let column = 0; column <= columns; column += 1) {
        const u = column / columns;
        const direction = projection.forward
          .clone()
          .transformDirection(planarGroup.matrixWorld)
          .multiplyScalar(projection.distance)
          .addScaledVector(
            projection.right
              .clone()
              .transformDirection(planarGroup.matrixWorld),
            (u - 0.5) * projection.width
          )
          .addScaledVector(
            projection.up.clone().transformDirection(planarGroup.matrixWorld),
            (v - 0.5) * projection.height
          )
          .normalize();
        raycaster.set(
          projection.cameraPosition
            .clone()
            .applyMatrix4(planarGroup.matrixWorld),
          direction
        );
        raycaster.near = 0.15;
        raycaster.far = 12;
        const hit = raycaster.intersectObject(meshAnchor, true)[0];
        hits.push(
          hit ? hit.point.clone().add(new THREE.Vector3(0, 0.018, 0)) : null
        );
      }
    }

    const positions: number[] = [];
    const uvs: number[] = [];
    const append = (point: THREE.Vector3, u: number, v: number) => {
      positions.push(point.x, point.y, point.z);
      uvs.push(u, v);
    };
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const stride = columns + 1;
        const p00 = hits[row * stride + column];
        const p10 = hits[row * stride + column + 1];
        const p01 = hits[(row + 1) * stride + column];
        const p11 = hits[(row + 1) * stride + column + 1];
        if (!p00 || !p10 || !p01 || !p11) continue;
        const u0 = column / columns;
        const u1 = (column + 1) / columns;
        const v0 = row / rows;
        const v1 = (row + 1) / rows;
        append(p00, u0, v0);
        append(p10, u1, v0);
        append(p11, u1, v1);
        append(p00, u0, v0);
        append(p11, u1, v1);
        append(p01, u0, v1);
        triangleCount += 2;
      }
    }
    if (positions.length === 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      map: sourceMaterial.map,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      toneMapped: false,
    });
    material.userData.disposeMap = false;
    const projectionMesh = new THREE.Mesh(geometry, material);
    projectionMesh.renderOrder = 2;
    next.add(projectionMesh);
  }
  replaceGroupContents(target, next);
  return triangleCount;
};

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      if (child.material.map) child.material.map.dispose();
      child.material.dispose();
      return;
    }
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) {
      return;
    }
    child.geometry.dispose();
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (
        "map" in material &&
        material.map instanceof THREE.Texture &&
        material.userData.disposeMap !== false
      ) {
        material.map.dispose();
      }
      material.dispose();
    }
  });
};

type GeoradarSliceSweep = {
  group: THREE.Group;
  width: number;
  depthDisplay: number;
  clipMin: ReturnType<typeof uniform>;
  clipMax: ReturnType<typeof uniform>;
  opacityScale: ReturnType<typeof uniform>;
  setTransferData: (data: Uint8Array) => void;
  setAlignment: (
    mode: TrajectoryAlignmentMode,
    surfaceOffsetsMeters: number[]
  ) => void;
  setLocalOffset: (
    forward: number,
    down: number,
    right: number,
    updateBounds?: boolean
  ) => void;
  setBaseHeight: (height: number) => void;
  setDepthInverted: (inverted: boolean) => void;
  setRenderMode: (mode: Capture026GeoradarRenderMode) => void;
  setRenderDistance: (distanceMeters: number) => void;
  setXrayMode: (enabled: boolean) => void;
  updateView: (
    camera: SceneCamera,
    viewportWidth: number,
    viewportHeight: number,
    time: number
  ) => void;
  getUserFacingCrossSection: (camera: SceneCamera) => GeoradarFaceFrame | null;
  getSplineClipFrames: (camera: SceneCamera) => GeoradarSplineClipFrame[];
  getLodStatus: () => string;
  dispose: () => void;
};

const GEORADAR_LOD_TARGET_INTERVAL_PIXELS = 0.75;
const GEORADAR_LOD_EVALUATION_INTERVAL_MILLISECONDS = 80;
const GEORADAR_RESOURCE_RETENTION_MILLISECONDS = 5_000;
const GEORADAR_MINIMUM_PROJECTED_SIZE_PIXELS = 0.35;
const GEORADAR_FRAME_TEXTURE_MAXIMUM_SAMPLES = 8_192;

const createGeoradarSliceSweep = ({
  metadata,
  variant,
  sampleSource,
  transferData,
  depthExaggeration,
  origin,
  centerline,
  alongEastNorth,
  acrossEastNorth,
  onResourceChange,
  onResourceError,
}: {
  metadata: VolumeMetadata;
  variant: VolumeVariant;
  sampleSource: GeoradarMdioSource;
  transferData: Uint8Array;
  depthExaggeration: number;
  origin: [number, number];
  centerline: [number, number][];
  alongEastNorth: [number, number];
  acrossEastNorth: [number, number];
  onResourceChange: () => void;
  onResourceError: (reason: unknown) => void;
}): GeoradarSliceSweep => {
  const group = new THREE.Group();
  group.visible = true;
  const shape = variant.shape;
  const sliceCount = shape.slice;
  const width =
    metadata.axes.traceMeters.at(-1)! - metadata.axes.traceMeters.at(0)!;
  const depthMeters = metadata.axes.depthMillimeters.at(-1)! / 1000;
  const depthDisplay = Math.max(1.5, depthMeters * depthExaggeration);
  const transferTexture = new THREE.DataTexture(
    transferData,
    transferData.length / 4,
    1,
    THREE.RGBAFormat
  );
  transferTexture.minFilter = THREE.LinearFilter;
  transferTexture.magFilter = THREE.LinearFilter;
  transferTexture.generateMipmaps = false;
  transferTexture.needsUpdate = true;
  const clipMin = uniform(new THREE.Vector3(0, 0, 0));
  const clipMax = uniform(new THREE.Vector3(1, 1, 1));
  const opacityScale = uniform(0.94);
  // WebGPU guarantees a maximum 2D texture dimension of at least 8192. Long
  // captures can exceed that in native slices, while this texture only stores
  // the smoothly interpolated trajectory frame (not radar samples).
  const frameSampleCount = Math.min(
    sliceCount,
    GEORADAR_FRAME_TEXTURE_MAXIMUM_SAMPLES
  );
  const frameData = new Float32Array(frameSampleCount * 3 * 4);
  const frameTexture = new THREE.DataTexture(
    frameData,
    frameSampleCount,
    3,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  frameTexture.minFilter = THREE.LinearFilter;
  frameTexture.magFilter = THREE.LinearFilter;
  frameTexture.generateMipmaps = false;
  frameTexture.unpackAlignment = 1;
  frameTexture.needsUpdate = true;
  const localOffsetForward = uniform(0);
  const localOffsetDown = uniform(0);
  const localOffsetRight = uniform(0);
  const depthAxisDirection = uniform(-1);
  const compositeVolume = uniform(1);
  const reverseDepthOrder = uniform(1);
  let currentDepthDirection: -1 | 1 = -1;
  let currentRenderMode: Capture026GeoradarRenderMode = "volume";
  const stationMinimum = metadata.axes.sliceMeters[0] ?? 0;
  const stationMaximum = metadata.axes.sliceMeters.at(-1) ?? stationMinimum;
  const stationRange = Math.max(1e-6, stationMaximum - stationMinimum);
  const loadSegmentValues = (
    selectedSlices: readonly number[],
    selectedDepths: readonly number[],
    sliceStart: number,
    sliceEndExclusive: number
  ) => {
    const sliceWindows = buildGeoradarLodSampleWindows(
      selectedSlices,
      sliceStart,
      sliceEndExclusive
    );
    const depthWindows = buildGeoradarLodSampleWindows(
      selectedDepths,
      0,
      shape.depth
    );
    return sampleSource.loadSegmentValues({ sliceWindows, depthWindows });
  };

  type SegmentResource = {
    sliceStep: GeoradarLodStep;
    depthStep: GeoradarLodStep;
    selectedSlices: number[];
    selectedDepths: number[];
    texture: THREE.Data3DTexture;
    geometry: THREE.BufferGeometry;
    materials: THREE.NodeMaterial[];
    meshes: THREE.Mesh[];
    horizontal: THREE.InstancedMesh;
    shells: THREE.Mesh[];
  };
  type RenderSegment = ReturnType<
    typeof buildGeoradarRenderSegments
  >[number] & {
    object: THREE.Group;
    localBounds: THREE.Box3;
    worldBounds: THREE.Box3;
    localAnchorCenters: THREE.Vector3[];
    resource?: SegmentResource;
    visible: boolean;
    sliceStep: GeoradarLodStep;
    depthStep: GeoradarLodStep;
    lastVisibleAt: number;
    viewPriority: number;
    resourceRequest?: { key: string; generation: number };
    resourceErrorKey?: string;
  };

  const capGeometry = new THREE.BufferGeometry();
  capGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(new Float32Array(4 * 3), 3)
  );
  capGeometry.setAttribute(
    "capCoordinate",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)
  );
  capGeometry.setIndex([0, 1, 2, 0, 2, 3]);

  const renderSegments = buildGeoradarRenderSegments(
    metadata.axes.sliceMeters,
    metadata.selection.segmentLengthMeter ?? 10
  ).map(
    (segment): RenderSegment => ({
      ...segment,
      object: new THREE.Group(),
      localBounds: new THREE.Box3(),
      worldBounds: new THREE.Box3(),
      localAnchorCenters: [],
      visible: false,
      sliceStep: 1,
      depthStep: 1,
      lastVisibleAt: Number.NEGATIVE_INFINITY,
      viewPriority: Number.POSITIVE_INFINITY,
    })
  );
  for (const segment of renderSegments) group.add(segment.object);

  const createStripGeometry = (
    selectedSlices: readonly number[]
  ): THREE.BufferGeometry => {
    const stationMeters: number[] = [];
    const localSliceUvs: number[] = [];
    const globalSliceUvs: number[] = [];
    const stripVs: number[] = [];
    const indices: number[] = [];
    const positions: number[] = [];
    for (
      let selectedIndex = 0;
      selectedIndex < selectedSlices.length;
      selectedIndex += 1
    ) {
      const slice = selectedSlices[selectedIndex];
      for (let stripV = 0; stripV <= 1; stripV += 1) {
        stationMeters.push(metadata.axes.sliceMeters[slice] ?? stationMinimum);
        localSliceUvs.push((selectedIndex + 0.5) / selectedSlices.length);
        globalSliceUvs.push((slice + 0.5) / shape.slice);
        stripVs.push(stripV);
        positions.push(0, 0, 0);
      }
    }
    for (let slice = 0; slice < selectedSlices.length - 1; slice += 1) {
      const offset = slice * 2;
      indices.push(
        offset,
        offset + 2,
        offset + 3,
        offset,
        offset + 3,
        offset + 1
      );
    }
    const stripGeometry = new THREE.BufferGeometry();
    stripGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    stripGeometry.setAttribute(
      "stationMeters",
      new THREE.Float32BufferAttribute(stationMeters, 1)
    );
    stripGeometry.setAttribute(
      "localSliceUv",
      new THREE.Float32BufferAttribute(localSliceUvs, 1)
    );
    stripGeometry.setAttribute(
      "globalSliceUv",
      new THREE.Float32BufferAttribute(globalSliceUvs, 1)
    );
    stripGeometry.setAttribute(
      "stripV",
      new THREE.Float32BufferAttribute(stripVs, 1)
    );
    stripGeometry.setIndex(indices);
    return stripGeometry;
  };

  type SurfaceKind = "horizontal" | "side" | "cap-start" | "cap-end";
  let xrayMode = false;
  const configureMaterial = (material: THREE.NodeMaterial) => {
    const rendersVolume = currentRenderMode === "volume";
    material.depthTest = !xrayMode;
    material.depthWrite = !xrayMode && !rendersVolume;
    material.transparent = xrayMode || rendersVolume;
    material.alphaTest = rendersVolume ? 0.001 : 0.14;
    material.needsUpdate = true;
  };
  const createMaterial = (
    kind: SurfaceKind,
    volumeTexture: THREE.Data3DTexture,
    textureSliceCount: number,
    textureDepthCount: number,
    depthStep: GeoradarLodStep
  ) => {
    const capAtStart = kind === "cap-start";
    const capSlice = capAtStart ? 0 : sliceCount - 1;
    const stationNode =
      kind === "horizontal" || kind === "side"
        ? float(attribute("stationMeters", "float"))
        : float(metadata.axes.sliceMeters[capSlice] ?? stationMinimum);
    const localSliceUv =
      kind === "horizontal" || kind === "side"
        ? float(attribute("localSliceUv", "float"))
        : float(
            (capAtStart ? 0.5 : textureSliceCount - 0.5) / textureSliceCount
          );
    const globalSliceUv =
      kind === "horizontal" || kind === "side"
        ? float(attribute("globalSliceUv", "float"))
        : float((capSlice + 0.5) / shape.slice);
    const stripV =
      kind === "cap-start" || kind === "cap-end"
        ? vec2(attribute("capCoordinate", "vec2"))
        : vec2(float(attribute("stripV", "float")), float(0));
    const acrossUnit =
      kind === "horizontal"
        ? stripV.x
        : kind === "side"
        ? float(instanceIndex)
        : stripV.x;
    const depthUnit =
      kind === "horizontal"
        ? (() => {
            const cellCount = Math.max(
              1,
              Math.ceil((shape.depth - 1) / depthStep)
            );
            const orderedCell = reverseDepthOrder
              .greaterThan(0.5)
              .select(
                float(cellCount - 1).sub(float(instanceIndex)),
                float(instanceIndex)
              );
            const cellCenter = orderedCell
              .mul(depthStep)
              .add(depthStep * 0.5)
              .clamp(0, shape.depth - 1)
              .div(Math.max(1, shape.depth - 1));
            const layer = float(instanceIndex)
              .mul(depthStep)
              .clamp(0, shape.depth - 1)
              .div(Math.max(1, shape.depth - 1));
            return compositeVolume.greaterThan(0.5).select(cellCenter, layer);
          })()
        : kind === "side"
        ? stripV.x
        : stripV.y;
    const volumeUv = vec3(
      localSliceUv,
      acrossUnit
        .mul(shape.trace - 1)
        .add(0.5)
        .div(shape.trace),
      depthUnit
        .mul(textureDepthCount - 1)
        .add(0.5)
        .div(textureDepthCount)
    );
    const material = new THREE.NodeMaterial();
    material.positionNode = Fn(() => {
      const shiftedStation = stationNode.add(localOffsetForward);
      const clampedStation = shiftedStation.clamp(
        stationMinimum,
        stationMaximum
      );
      const frameU = clampedStation
        .sub(stationMinimum)
        .div(stationRange)
        .mul(frameSampleCount - 1)
        .add(0.5)
        .div(frameSampleCount);
      const center = texture(frameTexture, vec2(frameU, float(0.5 / 3)));
      const across = texture(frameTexture, vec2(frameU, float(1.5 / 3)));
      const along = texture(frameTexture, vec2(frameU, float(2.5 / 3)));
      const outsideDistance = shiftedStation.sub(clampedStation);
      const traceMinimum = metadata.axes.traceMeters[0] ?? -width / 2;
      const traceMaximum = metadata.axes.traceMeters.at(-1) ?? width / 2;
      const traceOffset = float(traceMinimum).add(
        acrossUnit.mul(traceMaximum - traceMinimum)
      );
      const transverseOffset = traceOffset.add(localOffsetRight);
      return vec3(
        center.x
          .add(along.x.mul(outsideDistance))
          .add(across.x.mul(transverseOffset)),
        center.y
          .sub(localOffsetDown)
          .add(depthUnit.mul(depthDisplay).mul(depthAxisDirection)),
        center.z
          .add(along.z.mul(outsideDistance))
          .add(across.z.mul(transverseOffset))
      );
    })();
    material.colorNode = Fn(() => {
      const outside = globalSliceUv
        .lessThan(clipMin.x)
        .or(globalSliceUv.greaterThan(clipMax.x))
        .or(volumeUv.y.lessThan(clipMin.y))
        .or(volumeUv.y.greaterThan(clipMax.y))
        .or(volumeUv.z.lessThan(clipMin.z))
        .or(volumeUv.z.greaterThan(clipMax.z));
      If(outside, () => Discard());
      const value = texture3D(volumeTexture).sample(volumeUv).r;
      const sample = vec4(
        texture(transferTexture, vec2(value, float(0.5)))
      ).toVar();
      const displayAlpha = float(sample.a.mul(opacityScale)).toVar();
      If(compositeVolume.greaterThan(0.5), () => {
        // Each plane represents the cell extending to the next sampled depth.
        // Correcting alpha for the active LOD keeps integrated opacity stable
        // when several native cells are represented by one plane.
        const nativeCellAlpha = displayAlpha.mul(0.08).clamp(0, 0.999);
        displayAlpha.assign(
          nativeCellAlpha.oneMinus().pow(depthStep).oneMinus()
        );
      });
      return vec4(sample.rgb, displayAlpha);
    })();
    material.side = THREE.DoubleSide;
    material.toneMapped = false;
    configureMaterial(material);
    return material;
  };

  const identity = new THREE.Matrix4();
  const depthInstanceCount = (step: GeoradarLodStep) =>
    Math.ceil((shape.depth - 1) / step) + 1;
  const createSegmentResource = (
    segment: RenderSegment,
    sliceStep: GeoradarLodStep,
    depthStep: GeoradarLodStep,
    selectedSlices: number[],
    selectedDepths: number[],
    values: Float32Array
  ): SegmentResource => {
    const volumeTexture = new THREE.Data3DTexture(
      values,
      selectedSlices.length,
      shape.trace,
      selectedDepths.length
    );
    volumeTexture.format = THREE.RedFormat;
    volumeTexture.type = THREE.FloatType;
    volumeTexture.minFilter = THREE.LinearFilter;
    volumeTexture.magFilter = THREE.LinearFilter;
    volumeTexture.generateMipmaps = false;
    volumeTexture.unpackAlignment = 1;
    volumeTexture.needsUpdate = true;
    const stripGeometry = createStripGeometry(selectedSlices);
    const horizontalMaterial = createMaterial(
      "horizontal",
      volumeTexture,
      selectedSlices.length,
      selectedDepths.length,
      depthStep
    );
    const sideMaterial = createMaterial(
      "side",
      volumeTexture,
      selectedSlices.length,
      selectedDepths.length,
      depthStep
    );
    const horizontal = new THREE.InstancedMesh(
      stripGeometry,
      horizontalMaterial,
      shape.depth
    );
    horizontal.count =
      currentRenderMode === "volume"
        ? Math.max(1, Math.ceil((shape.depth - 1) / depthStep))
        : depthInstanceCount(depthStep);
    for (let instance = 0; instance < shape.depth; instance += 1) {
      horizontal.setMatrixAt(instance, identity);
    }
    horizontal.instanceMatrix.needsUpdate = true;
    const sides = new THREE.InstancedMesh(stripGeometry, sideMaterial, 2);
    sides.setMatrixAt(0, identity);
    sides.setMatrixAt(1, identity);
    sides.instanceMatrix.needsUpdate = true;
    const materials = [horizontalMaterial, sideMaterial];
    const meshes: THREE.Mesh[] = [horizontal, sides];
    const shells: THREE.Mesh[] = [sides];
    if (segment.index === 0) {
      const material = createMaterial(
        "cap-start",
        volumeTexture,
        selectedSlices.length,
        selectedDepths.length,
        depthStep
      );
      materials.push(material);
      const cap = new THREE.Mesh(capGeometry, material);
      meshes.push(cap);
      shells.push(cap);
    }
    if (segment.index === renderSegments.length - 1) {
      const material = createMaterial(
        "cap-end",
        volumeTexture,
        selectedSlices.length,
        selectedDepths.length,
        depthStep
      );
      materials.push(material);
      const cap = new THREE.Mesh(capGeometry, material);
      meshes.push(cap);
      shells.push(cap);
    }
    for (const shell of shells) shell.visible = currentRenderMode === "cutaway";
    for (const mesh of meshes) {
      mesh.renderOrder = xrayMode ? 10 : 3;
      mesh.frustumCulled = false;
      segment.object.add(mesh);
    }
    return {
      sliceStep,
      depthStep,
      selectedSlices,
      selectedDepths,
      texture: volumeTexture,
      geometry: stripGeometry,
      materials,
      meshes,
      horizontal,
      shells,
    };
  };

  const disposeSegmentResource = (segment: RenderSegment) => {
    const resource = segment.resource;
    if (!resource) return;
    segment.object.clear();
    resource.geometry.dispose();
    resource.texture.dispose();
    for (const material of resource.materials) material.dispose();
    segment.resource = undefined;
  };

  let resourceRequestGeneration = 0;
  let disposed = false;
  const ensureSegmentResource = (segment: RenderSegment) => {
    const resource = segment.resource;
    if (
      resource?.sliceStep === segment.sliceStep &&
      resource.depthStep === segment.depthStep
    ) {
      return;
    }
    const key = `${segment.sliceStep}:${segment.depthStep}`;
    // Keep at most one request per render segment. Camera/viewport settling can
    // otherwise change the LOD while a range is in flight and start several
    // obsolete requests for the same MDIO chunks.
    if (segment.resourceRequest || segment.resourceErrorKey === key) return;
    const requestedSliceStep = segment.sliceStep;
    const requestedDepthStep = segment.depthStep;
    disposeSegmentResource(segment);
    const selectedSlices = buildGeoradarLodSliceIndices(
      segment.sliceStart,
      segment.sliceEndExclusive,
      requestedSliceStep
    );
    const selectedDepths = buildGeoradarLodSliceIndices(
      0,
      shape.depth,
      requestedDepthStep
    );
    const request = {
      key,
      generation: ++resourceRequestGeneration,
    };
    segment.resourceRequest = request;
    void loadSegmentValues(
      selectedSlices,
      selectedDepths,
      segment.sliceStart,
      segment.sliceEndExclusive
    )
      .then((values) => {
        if (
          disposed ||
          !segment.visible ||
          segment.resourceRequest?.generation !== request.generation ||
          `${segment.sliceStep}:${segment.depthStep}` !== key
        ) {
          return;
        }
        segment.resource = createSegmentResource(
          segment,
          requestedSliceStep,
          requestedDepthStep,
          selectedSlices,
          selectedDepths,
          values
        );
        segment.resourceErrorKey = undefined;
      })
      .catch((reason: unknown) => {
        if (
          disposed ||
          segment.resourceRequest?.generation !== request.generation
        )
          return;
        segment.resourceErrorKey = key;
        onResourceError(reason);
      })
      .finally(() => {
        if (segment.resourceRequest?.generation === request.generation) {
          segment.resourceRequest = undefined;
        }
        onResourceChange();
      });
  };

  let currentMode: TrajectoryAlignmentMode = "surface";
  let currentSurfaceOffsets = new Array(variant.shape.slice).fill(
    0
  ) as number[];
  let currentTrajectoryFrames = calculateTrajectorySliceFrames({
    mode: currentMode,
    centerline,
    origin,
    alongEastNorth,
    acrossEastNorth,
    sliceMeters: metadata.axes.sliceMeters,
    surfaceOffsetsMeters: currentSurfaceOffsets,
  });
  const localOffset = { forward: 0, down: 0, right: 0 };
  const traceMinimum = metadata.axes.traceMeters[0] ?? -width / 2;
  const traceMaximum = metadata.axes.traceMeters.at(-1) ?? width / 2;
  const boundsPoint = new THREE.Vector3();

  const rebuildSegmentBounds = () => {
    for (const segment of renderSegments) {
      segment.localBounds.makeEmpty();
      segment.localAnchorCenters.length = 0;
      for (
        let slice = segment.sliceStart;
        slice < segment.sliceEndExclusive;
        slice += 1
      ) {
        const shiftedStation =
          (metadata.axes.sliceMeters[slice] ?? stationMinimum) +
          localOffset.forward;
        const clampedStation = THREE.MathUtils.clamp(
          shiftedStation,
          stationMinimum,
          stationMaximum
        );
        const frame = sampleTrajectoryFrameAtStation(
          currentTrajectoryFrames,
          metadata.axes.sliceMeters,
          clampedStation
        );
        const outsideDistance = shiftedStation - clampedStation;
        const centerX =
          frame.centerUtm[0] -
          origin[0] +
          frame.alongEastNorth[0] * outsideDistance;
        const centerY = frame.surfaceOffsetMeters - localOffset.down;
        const centerZ =
          -(frame.centerUtm[1] - origin[1]) -
          frame.alongEastNorth[1] * outsideDistance;
        segment.localAnchorCenters.push(
          new THREE.Vector3(centerX, centerY, centerZ)
        );
        for (const traceOffset of [traceMinimum, traceMaximum]) {
          const transverseOffset = traceOffset + localOffset.right;
          const x = centerX + frame.acrossEastNorth[0] * transverseOffset;
          const z = centerZ - frame.acrossEastNorth[1] * transverseOffset;
          segment.localBounds.expandByPoint(boundsPoint.set(x, centerY, z));
          segment.localBounds.expandByPoint(
            boundsPoint.set(
              x,
              centerY + currentDepthDirection * depthDisplay,
              z
            )
          );
        }
      }
      segment.localBounds.expandByScalar(0.02);
    }
  };

  const updateFrameTexture = () => {
    currentTrajectoryFrames = calculateTrajectorySliceFrames({
      mode: currentMode,
      centerline,
      origin,
      alongEastNorth,
      acrossEastNorth,
      sliceMeters: metadata.axes.sliceMeters,
      surfaceOffsetsMeters: currentSurfaceOffsets,
    });
    for (let slice = 0; slice < frameSampleCount; slice += 1) {
      const station =
        stationMinimum +
        (slice / Math.max(1, frameSampleCount - 1)) * stationRange;
      const frame = sampleTrajectoryFrameAtStation(
        currentTrajectoryFrames,
        metadata.axes.sliceMeters,
        station
      );
      const [east, north] = frame.centerUtm;
      const centerOffset = slice * 4;
      frameData[centerOffset] = east - origin[0];
      frameData[centerOffset + 1] = frame.surfaceOffsetMeters;
      frameData[centerOffset + 2] = -(north - origin[1]);
      frameData[centerOffset + 3] = 0;
      const acrossOffset = (frameSampleCount + slice) * 4;
      frameData[acrossOffset] = frame.acrossEastNorth[0];
      frameData[acrossOffset + 1] = 0;
      frameData[acrossOffset + 2] = -frame.acrossEastNorth[1];
      frameData[acrossOffset + 3] = 0;
      const alongOffset = (frameSampleCount * 2 + slice) * 4;
      frameData[alongOffset] = frame.alongEastNorth[0];
      frameData[alongOffset + 1] = 0;
      frameData[alongOffset + 2] = -frame.alongEastNorth[1];
      frameData[alongOffset + 3] = 0;
    }
    frameTexture.needsUpdate = true;
    rebuildSegmentBounds();
  };

  updateFrameTexture();

  const projectionScreenMatrix = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const localBoundingSphere = new THREE.Sphere();
  const worldBoundingSphereCenter = new THREE.Vector3();
  const cameraSpaceCenter = new THREE.Vector3();
  const worldAnchor = new THREE.Vector3();
  const worldDepthAnchor = new THREE.Vector3();
  const cameraSpaceAnchor = new THREE.Vector3();
  const projectedAnchor = new THREE.Vector3();
  const projectedDepthAnchor = new THREE.Vector3();
  const groupWorldSurface = new THREE.Vector3();
  let lastLodEvaluationAt = Number.NEGATIVE_INFINITY;
  let renderDistanceMeters = GEORADAR_DEFAULT_RENDER_DISTANCE_METERS;

  const horizontalDistanceToSegment = (
    segment: RenderSegment,
    camera: SceneCamera
  ) => {
    const deltaX = Math.max(
      segment.worldBounds.min.x - camera.position.x,
      0,
      camera.position.x - segment.worldBounds.max.x
    );
    const deltaZ = Math.max(
      segment.worldBounds.min.z - camera.position.z,
      0,
      camera.position.z - segment.worldBounds.max.z
    );
    return Math.hypot(deltaX, deltaZ);
  };

  const projectedSegmentSizePixels = (
    segment: RenderSegment,
    camera: SceneCamera,
    viewportHeight: number
  ) => {
    segment.localBounds.getBoundingSphere(localBoundingSphere);
    worldBoundingSphereCenter
      .copy(localBoundingSphere.center)
      .applyMatrix4(group.matrixWorld);
    const radius =
      localBoundingSphere.radius * group.matrixWorld.getMaxScaleOnAxis();
    if (camera instanceof THREE.OrthographicCamera) {
      return (
        (radius * 2 * viewportHeight * camera.zoom) /
        Math.max(1e-6, camera.top - camera.bottom)
      );
    }
    cameraSpaceCenter
      .copy(worldBoundingSphereCenter)
      .applyMatrix4(camera.matrixWorldInverse);
    const focalPixels =
      viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    return (
      (radius * 2 * focalPixels) /
      Math.max(camera.near, Math.abs(cameraSpaceCenter.z) - radius)
    );
  };

  const segmentViewPriority = (segment: RenderSegment, camera: SceneCamera) => {
    segment.localBounds.getCenter(worldBoundingSphereCenter);
    worldBoundingSphereCenter.applyMatrix4(group.matrixWorld).project(camera);
    return (
      worldBoundingSphereCenter.x ** 2 +
      worldBoundingSphereCenter.y ** 2 +
      Math.max(0, worldBoundingSphereCenter.z + 1) * 0.05
    );
  };

  const projectAnchor = (
    local: THREE.Vector3,
    camera: SceneCamera,
    viewportWidth: number,
    viewportHeight: number,
    output: THREE.Vector3
  ) => {
    worldAnchor.copy(local).applyMatrix4(group.matrixWorld);
    cameraSpaceAnchor.copy(worldAnchor).applyMatrix4(camera.matrixWorldInverse);
    if (cameraSpaceAnchor.z >= -camera.near) return false;
    output.copy(worldAnchor).project(camera);
    output.set(
      (output.x * 0.5 + 0.5) * viewportWidth,
      (-output.y * 0.5 + 0.5) * viewportHeight,
      output.z
    );
    return Number.isFinite(output.x) && Number.isFinite(output.y);
  };

  const evaluateSegmentLod = (
    segment: RenderSegment,
    camera: SceneCamera,
    viewportWidth: number,
    viewportHeight: number
  ) => {
    let maximumSliceIntervalPixels = 0;
    let maximumDepthIntervalPixels = 0;
    let previousProjected: THREE.Vector3 | undefined;
    const previousPoint = new THREE.Vector3();
    for (const anchor of segment.localAnchorCenters) {
      if (
        projectAnchor(
          anchor,
          camera,
          viewportWidth,
          viewportHeight,
          projectedAnchor
        )
      ) {
        if (previousProjected) {
          maximumSliceIntervalPixels = Math.max(
            maximumSliceIntervalPixels,
            previousProjected.distanceTo(projectedAnchor)
          );
        }
        previousPoint.copy(projectedAnchor);
        previousProjected = previousPoint;
      } else {
        previousProjected = undefined;
      }
      worldDepthAnchor.copy(anchor);
      worldDepthAnchor.y += currentDepthDirection * depthDisplay;
      if (
        projectAnchor(
          worldDepthAnchor,
          camera,
          viewportWidth,
          viewportHeight,
          projectedDepthAnchor
        ) &&
        previousProjected
      ) {
        maximumDepthIntervalPixels = Math.max(
          maximumDepthIntervalPixels,
          previousProjected.distanceTo(projectedDepthAnchor) /
            Math.max(1, shape.depth - 1)
        );
      }
    }
    segment.sliceStep = selectGeoradarLodStep({
      maximumNativeIntervalPixels: maximumSliceIntervalPixels,
      targetIntervalPixels: GEORADAR_LOD_TARGET_INTERVAL_PIXELS,
      previousStep: segment.sliceStep,
    });
    segment.depthStep = selectGeoradarLodStep({
      maximumNativeIntervalPixels: maximumDepthIntervalPixels,
      targetIntervalPixels: GEORADAR_LOD_TARGET_INTERVAL_PIXELS,
      previousStep: segment.depthStep,
    });
  };

  const updateView = (
    camera: SceneCamera,
    viewportWidth: number,
    viewportHeight: number,
    time: number
  ) => {
    group.updateWorldMatrix(true, false);
    group.getWorldPosition(groupWorldSurface);
    reverseDepthOrder.value =
      (camera.position.y - groupWorldSurface.y) * currentDepthDirection < 0
        ? 1
        : 0;
    projectionScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(
      projectionScreenMatrix,
      camera.coordinateSystem,
      camera.reversedDepth
    );
    const clipMinimum = (clipMin.value as THREE.Vector3).x;
    const clipMaximum = (clipMax.value as THREE.Vector3).x;
    const evaluateLod =
      time - lastLodEvaluationAt >=
      GEORADAR_LOD_EVALUATION_INTERVAL_MILLISECONDS;
    if (evaluateLod) lastLodEvaluationAt = time;

    for (const segment of renderSegments) {
      segment.worldBounds
        .copy(segment.localBounds)
        .applyMatrix4(group.matrixWorld);
      const segmentMinimumUnit =
        (segment.sliceStart + 0.5) / Math.max(1, shape.slice);
      const segmentMaximumUnit =
        (segment.sliceEndExclusive - 0.5) / Math.max(1, shape.slice);
      const intersectsClip =
        segmentMaximumUnit >= clipMinimum && segmentMinimumUnit <= clipMaximum;
      const visible =
        group.visible &&
        intersectsClip &&
        horizontalDistanceToSegment(segment, camera) <= renderDistanceMeters &&
        frustum.intersectsBox(segment.worldBounds) &&
        projectedSegmentSizePixels(segment, camera, viewportHeight) >=
          GEORADAR_MINIMUM_PROJECTED_SIZE_PIXELS;
      segment.visible = visible;
      segment.object.visible = visible;
      if (visible) {
        segment.lastVisibleAt = time;
        segment.viewPriority = segmentViewPriority(segment, camera);
        if (evaluateLod) {
          evaluateSegmentLod(segment, camera, viewportWidth, viewportHeight);
        }
      } else if (
        segment.resource &&
        time - segment.lastVisibleAt >= GEORADAR_RESOURCE_RETENTION_MILLISECONDS
      ) {
        disposeSegmentResource(segment);
      }
    }
    renderSegments
      .filter((segment) => segment.visible)
      .sort((left, right) => left.viewPriority - right.viewPriority)
      .forEach(ensureSegmentResource);
  };

  const crossSectionLocalCenter = new THREE.Vector3();
  const crossSectionWorldCenter = new THREE.Vector3();
  const crossSectionWorldMiddle = new THREE.Vector3();
  const crossSectionAcross = new THREE.Vector3();
  const crossSectionDepth = new THREE.Vector3();
  const crossSectionNormal = new THREE.Vector3();
  const crossSectionToCamera = new THREE.Vector3();
  const crossSectionCameraPoint = new THREE.Vector3();
  const crossSectionProjectedPoint = new THREE.Vector3();
  const traceCenter = (traceMinimum + traceMaximum) / 2;
  const finishFaceCandidate = (
    camera: SceneCamera,
    frame: GeoradarFaceFrame
  ) => {
    crossSectionWorldMiddle
      .copy(frame.surfaceCenterWorld)
      .addScaledVector(frame.depthWorld, depthDisplay * 0.5);
    const distance = crossSectionToCamera
      .subVectors(camera.position, crossSectionWorldMiddle)
      .length();
    if (distance <= 1e-6) return null;
    const facing = frame.normalWorld.dot(
      crossSectionToCamera.multiplyScalar(1 / distance)
    );
    if (facing < 0.12) return null;
    crossSectionCameraPoint
      .copy(crossSectionWorldMiddle)
      .applyMatrix4(camera.matrixWorldInverse);
    if (crossSectionCameraPoint.z >= -camera.near) return null;
    crossSectionProjectedPoint.copy(crossSectionWorldMiddle).project(camera);
    if (
      Math.abs(crossSectionProjectedPoint.x) > 1.25 ||
      Math.abs(crossSectionProjectedPoint.y) > 1.25 ||
      crossSectionProjectedPoint.z < -1 ||
      crossSectionProjectedPoint.z > 1
    ) {
      return null;
    }
    return {
      frame,
      score:
        facing * 4 -
        crossSectionProjectedPoint.x ** 2 -
        crossSectionProjectedPoint.y ** 2 -
        distance * 0.0001,
    };
  };

  const createCrossSectionFrame = (
    stationMeters: number,
    outwardDirection: -1 | 1
  ) => {
    const shiftedStation = stationMeters + localOffset.forward;
    const clampedStation = THREE.MathUtils.clamp(
      shiftedStation,
      stationMinimum,
      stationMaximum
    );
    const frame = sampleTrajectoryFrameAtStation(
      currentTrajectoryFrames,
      metadata.axes.sliceMeters,
      clampedStation
    );
    const outsideDistance = shiftedStation - clampedStation;
    const transverseOffset = traceCenter + localOffset.right;
    crossSectionLocalCenter.set(
      frame.centerUtm[0] -
        origin[0] +
        frame.alongEastNorth[0] * outsideDistance +
        frame.acrossEastNorth[0] * transverseOffset,
      frame.surfaceOffsetMeters - localOffset.down,
      -(frame.centerUtm[1] - origin[1]) -
        frame.alongEastNorth[1] * outsideDistance -
        frame.acrossEastNorth[1] * transverseOffset
    );
    group.updateWorldMatrix(true, false);
    crossSectionWorldCenter
      .copy(crossSectionLocalCenter)
      .applyMatrix4(group.matrixWorld);
    crossSectionAcross
      .set(frame.acrossEastNorth[0], 0, -frame.acrossEastNorth[1])
      .transformDirection(group.matrixWorld);
    crossSectionDepth
      .set(0, currentDepthDirection, 0)
      .transformDirection(group.matrixWorld);
    crossSectionNormal
      .set(
        frame.alongEastNorth[0] * outwardDirection,
        0,
        -frame.alongEastNorth[1] * outwardDirection
      )
      .transformDirection(group.matrixWorld);
    return {
      surfaceCenterWorld: crossSectionWorldCenter.clone(),
      horizontalWorld: crossSectionAcross.clone(),
      depthWorld: crossSectionDepth.clone(),
      normalWorld: crossSectionNormal.clone(),
      horizontalAxis: "y",
      horizontalDisplayMeters: width,
      horizontalSourceMeters: width,
      horizontalUnitMinimum: 0,
      horizontalUnitMaximum: 1,
      displayDepthMeters: depthDisplay,
      sourceDepthMeters: depthMeters,
      label: `Schnittfront · X ${stationMeters.toFixed(1)} m`,
    } satisfies GeoradarFaceFrame;
  };

  const createCrossSectionCandidate = (
    camera: SceneCamera,
    stationMeters: number,
    outwardDirection: -1 | 1
  ) =>
    finishFaceCandidate(
      camera,
      createCrossSectionFrame(stationMeters, outwardDirection)
    );

  const createLongitudinalSideCandidate = (
    camera: SceneCamera,
    stationStartMeters: number,
    stationEndMeters: number,
    outwardDirection: -1 | 1
  ) => {
    const stationMiddle = (stationStartMeters + stationEndMeters) / 2;
    const shiftedStation = stationMiddle + localOffset.forward;
    const clampedStation = THREE.MathUtils.clamp(
      shiftedStation,
      stationMinimum,
      stationMaximum
    );
    const frame = sampleTrajectoryFrameAtStation(
      currentTrajectoryFrames,
      metadata.axes.sliceMeters,
      clampedStation
    );
    const outsideDistance = shiftedStation - clampedStation;
    const traceOffset =
      (outwardDirection < 0 ? traceMinimum : traceMaximum) + localOffset.right;
    crossSectionLocalCenter.set(
      frame.centerUtm[0] -
        origin[0] +
        frame.alongEastNorth[0] * outsideDistance +
        frame.acrossEastNorth[0] * traceOffset,
      frame.surfaceOffsetMeters - localOffset.down,
      -(frame.centerUtm[1] - origin[1]) -
        frame.alongEastNorth[1] * outsideDistance -
        frame.acrossEastNorth[1] * traceOffset
    );
    group.updateWorldMatrix(true, false);
    crossSectionWorldCenter
      .copy(crossSectionLocalCenter)
      .applyMatrix4(group.matrixWorld);
    crossSectionAcross
      .set(frame.alongEastNorth[0], 0, -frame.alongEastNorth[1])
      .transformDirection(group.matrixWorld);
    crossSectionDepth
      .set(0, currentDepthDirection, 0)
      .transformDirection(group.matrixWorld);
    crossSectionNormal
      .set(
        frame.acrossEastNorth[0] * outwardDirection,
        0,
        -frame.acrossEastNorth[1] * outwardDirection
      )
      .transformDirection(group.matrixWorld);
    const faceStationStart = Math.min(stationStartMeters, stationEndMeters);
    const faceStationEnd = Math.max(stationStartMeters, stationEndMeters);
    return finishFaceCandidate(camera, {
      surfaceCenterWorld: crossSectionWorldCenter.clone(),
      horizontalWorld: crossSectionAcross.clone(),
      depthWorld: crossSectionDepth.clone(),
      normalWorld: crossSectionNormal.clone(),
      horizontalAxis: "x",
      horizontalDisplayMeters: Math.max(0.1, faceStationEnd - faceStationStart),
      horizontalSourceMeters: stationRange,
      horizontalUnitMinimum: THREE.MathUtils.clamp(
        (faceStationStart - stationMinimum) / stationRange,
        0,
        1
      ),
      horizontalUnitMaximum: THREE.MathUtils.clamp(
        (faceStationEnd - stationMinimum) / stationRange,
        0,
        1
      ),
      displayDepthMeters: depthDisplay,
      sourceDepthMeters: depthMeters,
      transverseUnit: outwardDirection < 0 ? 0 : 1,
      label: `Längsfront · X ${faceStationStart.toFixed(
        1
      )}–${faceStationEnd.toFixed(1)} m`,
    });
  };

  const getUserFacingCrossSection = (camera: SceneCamera) => {
    if (!group.visible) return null;
    const clippedMinimum = THREE.MathUtils.clamp(
      (clipMin.value as THREE.Vector3).x,
      0,
      1
    );
    const clippedMaximum = THREE.MathUtils.clamp(
      (clipMax.value as THREE.Vector3).x,
      clippedMinimum,
      1
    );
    const candidateStations: Array<{
      stationMeters: number;
      outwardDirection: -1 | 1;
    }> = [
      {
        stationMeters: stationMinimum + clippedMinimum * stationRange,
        outwardDirection: -1,
      },
      {
        stationMeters: stationMinimum + clippedMaximum * stationRange,
        outwardDirection: 1,
      },
    ];
    for (const segment of renderSegments) {
      if (!segment.visible) continue;
      candidateStations.push(
        {
          stationMeters:
            metadata.axes.sliceMeters[segment.sliceStart] ?? stationMinimum,
          outwardDirection: -1,
        },
        {
          stationMeters:
            metadata.axes.sliceMeters[
              Math.max(segment.sliceStart, segment.sliceEndExclusive - 1)
            ] ?? stationMaximum,
          outwardDirection: 1,
        }
      );
    }
    const candidates = candidateStations
      .map(({ stationMeters, outwardDirection }) =>
        createCrossSectionCandidate(camera, stationMeters, outwardDirection)
      )
      .filter(
        (candidate): candidate is { frame: GeoradarFaceFrame; score: number } =>
          candidate !== null
      );
    for (const segment of renderSegments) {
      if (!segment.visible) continue;
      const stationStartMeters =
        metadata.axes.sliceMeters[segment.sliceStart] ?? stationMinimum;
      const stationEndMeters =
        metadata.axes.sliceMeters[
          Math.max(segment.sliceStart, segment.sliceEndExclusive - 1)
        ] ?? stationMaximum;
      for (const outwardDirection of [-1, 1] as const) {
        const candidate = createLongitudinalSideCandidate(
          camera,
          stationStartMeters,
          stationEndMeters,
          outwardDirection
        );
        if (candidate) candidates.push(candidate);
      }
    }
    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.frame ?? null;
  };

  const splineClipMiddle = new THREE.Vector3();
  const splineClipToCamera = new THREE.Vector3();
  const splineClipCameraPoint = new THREE.Vector3();
  const splineClipProjectedPoint = new THREE.Vector3();
  const scoreSplineClipFrame = (
    camera: SceneCamera,
    frame: GeoradarFaceFrame
  ) => {
    splineClipMiddle
      .copy(frame.surfaceCenterWorld)
      .addScaledVector(frame.depthWorld, depthDisplay * 0.5);
    splineClipCameraPoint
      .copy(splineClipMiddle)
      .applyMatrix4(camera.matrixWorldInverse);
    if (splineClipCameraPoint.z >= -camera.near) return null;
    splineClipProjectedPoint.copy(splineClipMiddle).project(camera);
    if (
      Math.abs(splineClipProjectedPoint.x) > 1.4 ||
      Math.abs(splineClipProjectedPoint.y) > 1.4 ||
      splineClipProjectedPoint.z < -1 ||
      splineClipProjectedPoint.z > 1
    ) {
      return null;
    }
    const distance = splineClipToCamera
      .subVectors(camera.position, splineClipMiddle)
      .length();
    const facing =
      distance <= 1e-6
        ? 1
        : Math.abs(
            frame.normalWorld.dot(
              splineClipToCamera.multiplyScalar(1 / distance)
            )
          );
    return (
      facing * 3 -
      splineClipProjectedPoint.x ** 2 -
      splineClipProjectedPoint.y ** 2 -
      distance * 0.0001
    );
  };

  const splinePointLocal = new THREE.Vector3();
  const splineAcrossWorld = new THREE.Vector3();
  const splineDepthWorld = new THREE.Vector3();
  const getSplineClipFrames = (
    camera: SceneCamera
  ): GeoradarSplineClipFrame[] => {
    if (!group.visible) return [];
    const clippedMinimum = THREE.MathUtils.clamp(
      (clipMin.value as THREE.Vector3).x,
      0,
      1
    );
    const clippedMaximum = THREE.MathUtils.clamp(
      (clipMax.value as THREE.Vector3).x,
      clippedMinimum,
      1
    );
    const boundaries: Array<{
      boundary: "minimum" | "maximum";
      unit: number;
      outwardDirection: -1 | 1;
    }> = [
      {
        boundary: "minimum",
        unit: clippedMinimum,
        outwardDirection: -1,
      },
      {
        boundary: "maximum",
        unit: clippedMaximum,
        outwardDirection: 1,
      },
    ];

    group.updateWorldMatrix(true, false);
    const pointCount = Math.min(
      128,
      Math.max(32, metadata.axes.sliceMeters.length)
    );
    const points: GeoradarSplineClipFrame["points"] = [];
    for (let index = 0; index < pointCount; index += 1) {
      const unit = index / Math.max(1, pointCount - 1);
      const sourceStation = georadarStationAtClipUnit(
        metadata.axes.sliceMeters,
        unit
      );
      const shiftedStation = sourceStation + localOffset.forward;
      const clampedStation = THREE.MathUtils.clamp(
        shiftedStation,
        stationMinimum,
        stationMaximum
      );
      const frame = sampleTrajectoryFrameAtStation(
        currentTrajectoryFrames,
        metadata.axes.sliceMeters,
        clampedStation
      );
      const outsideDistance = shiftedStation - clampedStation;
      splinePointLocal.set(
        frame.centerUtm[0] -
          origin[0] +
          frame.alongEastNorth[0] * outsideDistance +
          frame.acrossEastNorth[0] * (traceCenter + localOffset.right),
        frame.surfaceOffsetMeters - localOffset.down,
        -(frame.centerUtm[1] - origin[1]) -
          frame.alongEastNorth[1] * outsideDistance -
          frame.acrossEastNorth[1] * (traceCenter + localOffset.right)
      );
      points.push({
        unit,
        world: splinePointLocal.clone().applyMatrix4(group.matrixWorld),
        acrossWorld: splineAcrossWorld
          .set(frame.acrossEastNorth[0], 0, -frame.acrossEastNorth[1])
          .transformDirection(group.matrixWorld)
          .clone(),
        depthWorld: splineDepthWorld
          .set(0, currentDepthDirection, 0)
          .transformDirection(group.matrixWorld)
          .clone(),
      });
    }
    return boundaries
      .map(({ boundary, unit, outwardDirection }) => {
        const stationMeters = georadarStationAtClipUnit(
          metadata.axes.sliceMeters,
          unit
        );
        const plane = createCrossSectionFrame(stationMeters, outwardDirection);
        return {
          points,
          plane,
          boundary,
          unit,
          stationMeters,
          traceMinimumMeters: traceMinimum,
          traceMaximumMeters: traceMaximum,
          traceCenterMeters: traceCenter,
          displayDepthMeters: depthDisplay,
          score: scoreSplineClipFrame(camera, plane) ?? -1_000_000,
        };
      })
      .sort((left, right) => right.score - left.score);
  };

  const getLodStatus = () => {
    const visible = renderSegments.filter((segment) => segment.visible);
    const resident = renderSegments.filter((segment) => segment.resource);
    const pending = renderSegments.filter(
      (segment) => segment.resourceRequest
    ).length;
    const failed = renderSegments.filter(
      (segment) => segment.resourceErrorKey
    ).length;
    const textureBytes = resident.reduce(
      (sum, segment) =>
        sum + (segment.resource?.texture.image.data.byteLength ?? 0),
      0
    );
    const summarizeSteps = (axis: "sliceStep" | "depthStep") =>
      GEORADAR_LOD_STEPS.map((step) => {
        const count = visible.filter(
          (segment) => segment[axis] === step
        ).length;
        return count > 0 ? `${count}×${step}` : "";
      })
        .filter(Boolean)
        .join("/");
    return `${
      currentRenderMode === "volume" ? "Z-Zellvolumen" : "Schnittflächen"
    } · Z ${
      currentDepthDirection > 0 ? "nach oben" : "nach unten"
    } · Radius ${renderDistanceMeters.toFixed(0)} m · Radar-LOD ${
      visible.length
    }/${renderSegments.length} Segmente sichtbar · ${
      resident.length
    } resident / ${pending} lädt${
      failed > 0 ? ` / ${failed} Fehler` : ""
    } · X ${summarizeSteps("sliceStep") || "–"} · Z ${
      summarizeSteps("depthStep") || "–"
    } · ${(textureBytes / 1024 ** 2).toFixed(1)} MB GPU`;
  };

  return {
    group,
    width,
    depthDisplay,
    clipMin,
    clipMax,
    opacityScale,
    setTransferData: (data) => {
      const textureData = transferTexture.image.data as Uint8Array;
      if (textureData.length !== data.length) {
        throw new Error(
          `Transferfunktion hat ${data.length} statt ${textureData.length} Bytes`
        );
      }
      textureData.set(data);
      transferTexture.needsUpdate = true;
    },
    setAlignment: (mode, surfaceOffsetsMeters) => {
      currentMode = mode;
      currentSurfaceOffsets = surfaceOffsetsMeters;
      updateFrameTexture();
    },
    setLocalOffset: (forward, down, right, updateBounds = true) => {
      localOffsetForward.value = forward;
      localOffsetDown.value = down;
      localOffsetRight.value = right;
      localOffset.forward = forward;
      localOffset.down = down;
      localOffset.right = right;
      if (updateBounds) rebuildSegmentBounds();
    },
    setBaseHeight: (height) => {
      group.position.y = height;
      group.updateMatrixWorld();
    },
    setDepthInverted: (inverted) => {
      currentDepthDirection = inverted ? 1 : -1;
      depthAxisDirection.value = currentDepthDirection;
      rebuildSegmentBounds();
      onResourceChange();
    },
    setRenderMode: (mode) => {
      currentRenderMode = mode;
      compositeVolume.value = mode === "volume" ? 1 : 0;
      for (const segment of renderSegments) {
        const resource = segment.resource;
        if (!resource) continue;
        resource.horizontal.count =
          mode === "volume"
            ? Math.max(1, Math.ceil((shape.depth - 1) / resource.depthStep))
            : depthInstanceCount(resource.depthStep);
        for (const shell of resource.shells) {
          shell.visible = mode === "cutaway";
        }
        for (const material of resource.materials) configureMaterial(material);
      }
      onResourceChange();
    },
    setRenderDistance: (distanceMeters) => {
      const nextDistance = THREE.MathUtils.clamp(
        distanceMeters,
        GEORADAR_MINIMUM_RENDER_DISTANCE_METERS,
        GEORADAR_MAXIMUM_RENDER_DISTANCE_METERS
      );
      if (renderDistanceMeters === nextDistance) return;
      renderDistanceMeters = nextDistance;
      lastLodEvaluationAt = Number.NEGATIVE_INFINITY;
      onResourceChange();
    },
    setXrayMode: (enabled) => {
      xrayMode = enabled;
      for (const segment of renderSegments) {
        if (!segment.resource) continue;
        for (const material of segment.resource.materials) {
          configureMaterial(material);
        }
        for (const mesh of segment.resource.meshes) {
          mesh.renderOrder = enabled ? 10 : 3;
        }
      }
    },
    updateView,
    getUserFacingCrossSection,
    getSplineClipFrames,
    getLodStatus,
    dispose: () => {
      disposed = true;
      for (const segment of renderSegments) disposeSegmentResource(segment);
      sampleSource.dispose();
      capGeometry.dispose();
      frameTexture.dispose();
      transferTexture.dispose();
    },
  };
};

const initializeScene = async (
  host: HTMLDivElement,
  manifestUrl: string,
  settings: RuntimeSettings,
  onStatus: (status: SceneStatus) => void,
  onBackend: (backend: string) => void,
  onCameraOrientation: (orientation: {
    bearingDeg: number;
    pitchDeg: number;
  }) => void,
  onPanoramaCalibration: (
    calibration: PanoramaCalibrationStatus | null
  ) => void,
  onRadarCaptureChange: (captureId: number) => void,
  onGeoradarFaceEdit: (edit: GeoradarFaceEditorEdit) => void
): Promise<SceneRuntime> => {
  onStatus({
    summary: "Szene wird geladen …",
    groups: [
      {
        id: "georadar",
        label: "Daten",
        entries: ["Georadar", "3D-Mesh", "orientierte Bilder"],
      },
    ],
  });
  const manifest = await fetchJson<Capture026Manifest>(manifestUrl);
  const survey = await fetchJson<GeoradarSurveyManifest>(
    investigationDataUrl("/georadar-survey/survey.json")
  ).catch(() => null);
  const imageTextureManifestUrl =
    manifest.imageSelection.imageTextureManifestUrl ??
    investigationDataUrl("/capture-026-scene/image-textures.json");
  const imageTextureManifest = await fetchJson<ImageTextureManifest>(
    imageTextureManifestUrl
  );
  const assetAvailability = createAssetAvailabilityProbe();
  const imageTextures = createImageTextureRuntime(
    imageTextureManifest,
    imageTextureManifestUrl,
    assetAvailability
  );
  const panoramaDisplayFilter = createImageDisplayFilter(
    settings.panoramaSaturation,
    settings.panoramaContrast,
    settings.imageEdgeEnhancement
  );
  const planarDisplayFilter = createImageDisplayFilter(
    IMAGE_DISPLAY_DEFAULT_SATURATION,
    IMAGE_DISPLAY_DEFAULT_CONTRAST,
    settings.imageEdgeEnhancement
  );
  const metadataResponse = await fetch(
    resolveInvestigationDataReference(manifest.volume.metadataUrl)
  );
  if (!metadataResponse.ok) {
    throw new Error(
      `${metadataResponse.status} ${metadataResponse.statusText}`
    );
  }
  const metadata = (await metadataResponse.json()) as VolumeMetadata;
  const variants = [metadata.data, ...(metadata.variants ?? [])];
  const variant = variants.find(({ id }) => id === manifest.volume.variantId);
  if (!variant)
    throw new Error(`Volume variant ${manifest.volume.variantId} fehlt`);
  onStatus({
    summary: "Georadardaten werden vorbereitet …",
    groups: [
      {
        id: "georadar",
        label: "Georadar",
        entries: ["Signalindex und Metadaten"],
      },
    ],
  });
  const source = await createGeoradarMdioSource({
    storeUrl: resolveGeoradarMdioStoreUrl(metadataResponse.url),
    expectedShape: variant.shape,
    signalOffset: variant.signalOffset,
    maximumCode: variant.maximumCode,
  });
  const initialElevationSource = settings.surfaceElevationSource;
  onStatus({
    summary: "Höhenprofil wird geladen …",
    groups: [
      {
        id: "surface",
        label: "Oberfläche",
        entries: [
          `${SURFACE_ELEVATION_SOURCES[initialElevationSource].statusLabel} entlang der Trajektorie`,
        ],
      },
    ],
  });
  const zeroProfile = new Array(variant.shape.slice).fill(0) as number[];
  const initialSurfaceProfile = await sampleSurfaceProfile(
    manifest.georeference.centerlineUtm,
    initialElevationSource
  );
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setClearColor(0xd7e4ea, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  await renderer.init();
  host.appendChild(renderer.domElement);
  const performanceOverlay = document.createElement("aside");
  performanceOverlay.className = "capture026-performance-overlay";
  performanceOverlay.setAttribute("aria-label", "CPU- und GPU-Diagnose");
  performanceOverlay.hidden = !settings.meshDebug;
  const performanceTitle = document.createElement("strong");
  performanceTitle.textContent = "Renderdiagnose · vorbereitet";
  const performanceSparkline = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );
  performanceSparkline.classList.add("capture026-performance-sparkline");
  performanceSparkline.setAttribute("viewBox", "0 0 132 28");
  performanceSparkline.setAttribute(
    "aria-label",
    "CPU-Framezeit und GPU-Draws im Zeitverlauf"
  );
  performanceSparkline.setAttribute("role", "img");
  const performanceCpuLine = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline"
  );
  performanceCpuLine.classList.add("is-cpu");
  const performanceGpuLine = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "polyline"
  );
  performanceGpuLine.classList.add("is-gpu");
  performanceSparkline.append(performanceCpuLine, performanceGpuLine);
  const performanceCpu = document.createElement("span");
  performanceCpu.textContent = "CPU · noch keine Messung";
  const performanceGpu = document.createElement("span");
  performanceGpu.textContent = "GPU · noch keine Renderer-Zähler";
  const performanceNote = document.createElement("small");
  performanceNote.textContent =
    "GPU-Zähler und Ressourcen, keine systemweite Auslastung";
  performanceOverlay.append(
    performanceTitle,
    performanceSparkline,
    performanceCpu,
    performanceGpu,
    performanceNote
  );
  host.appendChild(performanceOverlay);
  let sceneDisposed = false;
  let renderLoopReady = false;
  let animationFrame = 0;
  let renderSceneFrame: FrameRequestCallback = () => undefined;
  const requestSceneFrame = () => {
    if (sceneDisposed || !renderLoopReady || animationFrame !== 0) return;
    animationFrame = window.requestAnimationFrame((time) => {
      animationFrame = 0;
      renderSceneFrame(time);
    });
  };
  let notifyMeshViewChanged = () => undefined;
  onBackend(
    (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
      ? "WebGPU"
      : "WebGL2 fallback"
  );

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd7e4ea);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x46575e, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(15, 24, 9);
  scene.add(sun);

  const perspectiveCamera = new THREE.PerspectiveCamera(
    PANORAMA_DEFAULT_FOV_DEGREES,
    1,
    0.03,
    20_000
  );
  const orthographicCamera = new THREE.OrthographicCamera(
    -40,
    40,
    40,
    -40,
    0.03,
    20_000
  );
  perspectiveCamera.position.set(36, 16, 34);
  orthographicCamera.position.copy(perspectiveCamera.position);
  let camera: SceneCamera = perspectiveCamera;
  const controls = createModelNavigationControls(camera, renderer.domElement, {
    x: 0,
    y: -2.2,
    z: 0,
  });
  const historyTargets: Window[] = [window];
  try {
    if (
      window.parent !== window &&
      window.parent.location.origin === window.location.origin
    ) {
      historyTargets.push(window.parent);
    }
  } catch {
    // A cross-origin Storybook host cannot mirror the iframe share state.
  }
  const ownViewUrl = new URL(window.location.href);
  const parentViewUrl =
    historyTargets.length > 1
      ? new URL(historyTargets[1].location.href)
      : undefined;
  const sharedViewUrl =
    ownViewUrl.searchParams.has("camera") ||
    ownViewUrl.searchParams.has("panorama")
      ? ownViewUrl
      : parentViewUrl ?? ownViewUrl;
  const restoredCameraValues = (sharedViewUrl.searchParams.get("camera") ?? "")
    .split(",")
    .map(Number);
  const restoredPanoramaId = sharedViewUrl.searchParams.get("panorama");
  const hasRestoredCamera =
    restoredCameraValues.length === 6 &&
    restoredCameraValues.every(Number.isFinite);
  if (hasRestoredCamera) {
    perspectiveCamera.position.fromArray(restoredCameraValues, 0);
    orthographicCamera.position.copy(perspectiveCamera.position);
    controls.target.fromArray(restoredCameraValues, 3);
  }
  let persistedPanoramaId = restoredPanoramaId ?? undefined;
  const persistSharedView = (
    panoramaId: string | null | undefined = persistedPanoramaId
  ) => {
    persistedPanoramaId = panoramaId ?? undefined;
    const cameraValue = [
      ...camera.position.toArray(),
      ...controls.target.toArray(),
    ]
      .map((value) => value.toFixed(3))
      .join(",");
    for (const targetWindow of historyTargets) {
      const url = new URL(targetWindow.location.href);
      url.searchParams.set("camera", cameraValue);
      if (persistedPanoramaId)
        url.searchParams.set("panorama", persistedPanoramaId);
      else url.searchParams.delete("panorama");
      url.searchParams.set(
        "radar",
        String(manifest.captureId).padStart(3, "0")
      );
      targetWindow.history.replaceState(targetWindow.history.state, "", url);
    }
  };
  const onControlsChange = () => {
    notifyMeshViewChanged();
    requestSceneFrame();
  };
  controls.addEventListener("change", onControlsChange);
  const onControlsEnd = () => persistSharedView();
  controls.addEventListener("end", onControlsEnd);
  controls.update();
  let orthographicViewHeight =
    2 *
    perspectiveCamera.position.distanceTo(controls.target) *
    Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2));
  const updateOrthographicFrustum = (width: number, height: number) => {
    const aspect = width / Math.max(1, height);
    orthographicCamera.left = (-orthographicViewHeight * aspect) / 2;
    orthographicCamera.right = (orthographicViewHeight * aspect) / 2;
    orthographicCamera.top = orthographicViewHeight / 2;
    orthographicCamera.bottom = -orthographicViewHeight / 2;
    orthographicCamera.updateProjectionMatrix();
  };
  const setCameraProjection = (projection: Capture026CameraProjection) => {
    const nextCamera =
      projection === "orthographic" ? orthographicCamera : perspectiveCamera;
    if (camera === nextCamera) return;
    const currentPosition = camera.position.clone();
    const currentUp = camera.up.clone();
    const direction = currentPosition.clone().sub(controls.target).normalize();
    if (nextCamera === orthographicCamera) {
      const distance = Math.max(
        0.1,
        currentPosition.distanceTo(controls.target)
      );
      orthographicViewHeight =
        2 *
        distance *
        Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2));
      orthographicCamera.zoom = 1;
      updateOrthographicFrustum(
        Math.max(1, host.clientWidth),
        Math.max(1, host.clientHeight)
      );
    } else {
      const effectiveViewHeight =
        orthographicViewHeight / Math.max(orthographicCamera.zoom, 0.001);
      const distance =
        effectiveViewHeight /
        (2 * Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov / 2)));
      nextCamera.position
        .copy(controls.target)
        .addScaledVector(direction, Math.max(0.1, distance));
    }
    if (nextCamera === orthographicCamera) {
      nextCamera.position.copy(currentPosition);
    }
    nextCamera.up.copy(currentUp);
    nextCamera.lookAt(controls.target);
    camera = nextCamera;
    controls.object = camera;
    controls.update();
    requestSceneFrame();
  };
  setCameraProjection(settings.cameraProjection);

  const origin = manifest.georeference.originUtm;
  const originLngLat = getFromUTM32ToWGS84(origin) as [number, number];
  const anchorHeightDhhN = manifest.georeference.anchorHeightDhhN;
  const anchorUndulation = await getGcg2016UndulationFromUtm({
    east: origin[0] as Coordinates.ETRS89UTMEastingMeters,
    north: origin[1] as Coordinates.ETRS89UTMNorthingMeters,
    zone: 32,
  });
  const anchorHeight = anchorHeightDhhN + anchorUndulation;
  const ecefToScene = createEcefToSceneMatrix(
    THREE.MathUtils.degToRad(originLngLat[0]),
    THREE.MathUtils.degToRad(originLngLat[1]),
    anchorHeight
  );
  const transferData = buildCutawayTransferData();
  const initialProfile =
    settings.alignmentMode === "straight" ? zeroProfile : initialSurfaceProfile;
  let georadarStreamingError = "";
  const volume = createGeoradarSliceSweep({
    metadata,
    variant,
    sampleSource: source,
    transferData,
    depthExaggeration: manifest.volume.depthExaggeration,
    origin,
    centerline: manifest.georeference.centerlineUtm,
    alongEastNorth: manifest.georeference.alongEastNorth,
    acrossEastNorth: manifest.georeference.acrossEastNorth,
    onResourceChange: requestSceneFrame,
    onResourceError: (reason) => {
      georadarStreamingError = `Georadar-Ladefehler · ${
        reason instanceof Error ? reason.message : String(reason)
      }`;
      requestSceneFrame();
    },
  });
  volume.setAlignment(settings.alignmentMode, initialProfile);
  volume.setRenderDistance(settings.georadarRenderDistance);
  const metricGround = createUtmGridSurface({
    center: origin,
    sizeMeters: 400,
    utm: {
      zone: 32,
      hemisphere: "north",
      ellipsoidName: GRS80_ELLIPSOID.name,
    },
    ellipsoidalHeight:
      anchorHeight +
      manifest.georeference.surfaceHeight.initialOffsetFromCameraMeters,
    projectToWorld: (easting, northing, height, target) =>
      target
        .fromArray(
          utmToEllipsoidSurface(easting, northing, height, {
            zone: 32,
            hemisphere: "north",
            ellipsoid: GRS80_ELLIPSOID,
          }).ecef
        )
        .applyMatrix4(ecefToScene),
    maximumScreenErrorPx: 0.75,
    minorStepMeters: 1,
    majorStepMeters: 10,
    minorLineWidthPx: 0.6,
    majorLineWidthPx: 1.25,
    minorMinimumSpacingPx: 3,
  });
  metricGround.group.visible = settings.radarOnly;
  scene.add(metricGround.group);
  const setVolumeSurfaceHeight = (height: number) => {
    volume.setBaseHeight(height);
    centerline.position.y = height + 0.035;
    metricGround.setEllipsoidalHeight(anchorHeight + height);
  };
  (volume.clipMin.value as THREE.Vector3).set(0, 0, 0);
  (volume.clipMax.value as THREE.Vector3).set(1, 1, 1);
  volume.opacityScale.value = 0.94;
  volume.group.visible = true;
  scene.add(volume.group);

  const centerlineGeometry = new THREE.BufferGeometry().setFromPoints(
    manifest.georeference.centerlineUtm.map(
      ([east, north]) =>
        new THREE.Vector3(east - origin[0], 0, -(north - origin[1]))
    )
  );
  const centerlineMaterial = new THREE.LineBasicMaterial({
    color: 0x00a7bc,
    depthTest: false,
  });
  const centerline = new THREE.Line(centerlineGeometry, centerlineMaterial);
  centerline.renderOrder = 6;
  const georadarAlignmentFrame = new THREE.Group();
  georadarAlignmentFrame.name = "Georadar alignment frame";
  georadarAlignmentFrame.add(volume.group, centerline);
  scene.add(georadarAlignmentFrame);
  setVolumeSurfaceHeight(
    manifest.georeference.surfaceHeight.initialOffsetFromCameraMeters
  );

  const groups = {
    mesh: new THREE.Group(),
    nivPoints: new THREE.Group(),
    planar2: new THREE.Group(),
    planar3: new THREE.Group(),
    planar3Projection: new THREE.Group(),
    panoramas: new THREE.Group(),
    survey: new THREE.Group(),
  };
  const imageryFrame = new THREE.Group();
  imageryFrame.add(groups.planar2, groups.planar3, groups.panoramas);
  scene.add(imageryFrame);
  scene.add(groups.planar3Projection);
  scene.add(groups.survey);
  scene.add(groups.nivPoints);
  const georadarNavigationGraph = survey
    ? buildGeoradarNavigationGraph(survey)
    : null;
  if (survey && georadarNavigationGraph) {
    addGeoradarSurveyOverlay(
      groups.survey,
      survey,
      georadarNavigationGraph,
      origin,
      manifest.captureId
    );
  }
  const panoramaGraticule = createPanoramaGraticule();
  scene.add(panoramaGraticule);

  const surfaceProfileCache = new Map<
    Capture026SurfaceElevationSource,
    number[]
  >();
  surfaceProfileCache.set(initialElevationSource, initialSurfaceProfile);
  let activeElevationSource = initialElevationSource;
  let surfaceProfile = initialSurfaceProfile;
  let elevationStatus = "";
  let elevationRequestId = 0;
  let visualizationStatus = "";
  let nivPointStatus = "Höhenfestpunkte werden geladen …";
  let meshEnabled = settings.showMesh2024;
  let meshAlignmentStatus = "";
  let meshStatus = meshEnabled ? "Mesh 2024 wird geladen …" : "Mesh 2024 aus";
  let meshLoadingStatus = "";
  let radarLodStatus = volume.getLodStatus();
  let projectionStatus = "";
  let panoramaViewStatus = "";
  let imageTextureStatus = imageTextures.getStatus();
  const publishStatus = () => {
    const groups = [
      {
        id: "surface",
        label: "Oberfläche",
        entries: splitStatusEntries(
          `Ellipsoid-Frame · GCG2016 N=${anchorUndulation.toFixed(3)} m`,
          elevationStatus,
          nivPointStatus
        ),
      },
      {
        id: "georadar",
        label: "Georadar",
        entries: splitStatusEntries(
          visualizationStatus,
          radarLodStatus,
          georadarStreamingError
        ),
      },
      {
        id: "mesh",
        label: "3D-Mesh",
        entries: splitStatusEntries(meshStatus, meshLoadingStatus),
      },
      {
        id: "imagery",
        label: "Orientierte Bilder",
        entries: splitStatusEntries(
          projectionStatus,
          imageTextureStatus,
          panoramaViewStatus
        ),
      },
    ] satisfies SceneStatusGroup[];
    onStatus({
      summary: "Szene aktiv",
      groups: groups.filter(({ entries }) => entries.length > 0),
    });
  };
  let alignedSurfaceHeight: number | null = null;
  let aligned = false;
  const meshAlignmentSamples = manifest.georeference.centerlineUtm
    .map(
      ([east, north]) =>
        new THREE.Vector3(east - origin[0], 0, -(north - origin[1]))
    )
    .sort(
      (first, second) =>
        first.x ** 2 + first.z ** 2 - (second.x ** 2 + second.z ** 2)
    )
    .slice(0, 12);
  const alignToMesh = (anchor: THREE.Group) => {
    if (aligned) return;
    anchor.updateWorldMatrix(true, true);
    const expectedSurfaceHeight =
      manifest.georeference.surfaceHeight.initialOffsetFromCameraMeters;
    const hits = meshAlignmentSamples.flatMap((sample) =>
      new THREE.Raycaster(
        new THREE.Vector3(sample.x, 80, sample.z),
        new THREE.Vector3(0, -1, 0),
        0,
        160
      )
        .intersectObject(anchor, true)
        .filter(({ object }) => object instanceof THREE.Mesh)
    );
    const hit = hits.reduce<(typeof hits)[number] | undefined>(
      (closest, candidate) =>
        !closest ||
        Math.abs(candidate.point.y - expectedSurfaceHeight) <
          Math.abs(closest.point.y - expectedSurfaceHeight)
          ? candidate
          : closest,
      undefined
    );
    if (!hit) return;
    aligned = true;
    alignedSurfaceHeight = hit.point.y;
    const datumOffset = hit.point.y - expectedSurfaceHeight;
    setVolumeSurfaceHeight(hit.point.y + 0.025);
    imageryFrame.position.y = datumOffset;
    const overviewDistance = Math.max(
      24,
      metadata.selection.actualLengthMeter * 0.72
    );
    if (!hasRestoredCamera) {
      camera.position.set(
        overviewDistance,
        hit.point.y + overviewDistance * 0.72,
        overviewDistance
      );
      controls.target.set(0, hit.point.y - volume.depthDisplay * 0.42, 0);
      controls.update();
    }
    meshAlignmentStatus = `Mesh-Raycast ${hit.point.y.toFixed(
      2
    )} m · Ellipsoid-Frame ${datumOffset.toFixed(
      2
    )} m · ${manifest.georeference.rigidFit.rmsResidualMeters.toFixed(
      2
    )} m Geradheits-RMS`;
    meshStatus = meshAlignmentStatus;
    publishStatus();
  };
  let currentSettings = settings;
  const snapPanoramasToMesh = (anchor: THREE.Group) => {
    imageryFrame.updateWorldMatrix(true, true);
    let snapped = 0;
    for (const panorama of panoramaMeshes) {
      const pose = panorama.outside.userData.pose as ImagePose;
      const nearActiveTrace = manifest.georeference.centerlineUtm.some(
        ([east, north]) =>
          Math.hypot(pose.utm[0] - east, pose.utm[1] - north) < 35
      );
      if (!nearActiveTrace) continue;
      const current = panorama.outside.getWorldPosition(new THREE.Vector3());
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(current.x, current.y + 30, current.z),
        new THREE.Vector3(0, -1, 0),
        0,
        60
      );
      const hit = raycaster
        .intersectObject(anchor, true)
        .filter(({ object }) => object instanceof THREE.Mesh)
        .sort(
          (left, right) =>
            Math.abs(left.point.y - (current.y - 1.8)) -
            Math.abs(right.point.y - (current.y - 1.8))
        )[0];
      if (!hit) continue;
      const localY = hit.point.y + 1.8 - imageryFrame.position.y;
      panorama.basePosition.y = localY;
      applyPanoramaPosition(
        panorama,
        currentSettings.panoramaOffsetForward,
        currentSettings.panoramaOffsetDown,
        currentSettings.panoramaOffsetRight
      );
      snapped += 1;
    }
    return snapped;
  };
  let contextRefreshTimer = 0;
  const scheduleContextRefresh = (anchor: THREE.Group) => {
    window.clearTimeout(contextRefreshTimer);
    contextRefreshTimer = window.setTimeout(() => {
      anchor.updateWorldMatrix(true, true);
      const projectedTriangles = projectPlanar3OntoMesh(
        groups.planar3Projection,
        groups.planar3,
        anchor
      );
      const snappedPanoramas = snapPanoramasToMesh(anchor);
      projectionStatus = [
        groups.planar3.children.length > 0
          ? `Planar 3 auf Mesh ${projectedTriangles} Dreiecke`
          : "",
        `Panoramen ${snappedPanoramas}/${panoramaCount} bodenbezogen`,
      ]
        .filter(Boolean)
        .join(" · ");
      requestSceneFrame();
      publishStatus();
    }, 350);
  };
  const mesh = createMesh2024TilesRuntime({
    scene,
    renderer,
    camera,
    originLngLat,
    anchorHeightEllipsoidal: anchorHeight,
    opacity: settings.meshOpacity,
    appearance: settings.meshAppearance,
    saturation: settings.meshSaturation,
    contrast: settings.meshContrast,
    edgeEnhancement: settings.imageEdgeEnhancement,
    elevationMinimum: settings.meshElevationMinimum,
    elevationMaximum: settings.meshElevationMaximum,
    elevationColorRamp: settings.meshElevationColorRamp,
    errorTarget: settings.meshErrorTarget,
    centerQualityBoost: settings.meshCenterQualityBoost,
    debug: settings.meshDebug,
    wireframe: settings.meshWireframe,
    tileBounds: settings.meshTileBounds,
    requestRender: requestSceneFrame,
    onModel: (anchor) => {
      alignToMesh(anchor);
      scheduleContextRefresh(anchor);
    },
  });
  notifyMeshViewChanged = mesh.notifyViewChanged;
  meshLoadingStatus = meshEnabled ? mesh.getLoadingStatus() : "";
  groups.mesh = mesh.anchor;

  // Optional Ölberg MLS point cloud delivered as a 3D Tiles tileset. It shares
  // the scene origin with the mesh, so it can be compared against the mesh and
  // the georadar runs without any further alignment.
  const oelbergPointTileset = createPointTilesetRuntime({
    scene,
    renderer,
    camera,
    originLngLat,
    anchorHeightEllipsoidal: anchorHeight,
    url: OELBERG_POINT_TILESET_URL,
    enabled: settings.showOelbergPointTileset ?? false,
    pointSize: settings.oelbergPointTilesetPointSize ?? 2,
    // Mesh 2024 owns the request budget while it is still resolving the
    // current view; the point tileset fills the gaps afterwards.
    isDeferred: () => meshEnabled && mesh.isFetching(),
    requestRender: requestSceneFrame,
  });

  const loadedPlanarImagery = new Set<"planar-2" | "planar-3">();
  const loadPlanarImagery = async (
    imagery: Capture026Manifest["imagery"][number]
  ) => {
    if (loadedPlanarImagery.has(imagery.id)) return;
    loadedPlanarImagery.add(imagery.id);
    const target = imagery.id === "planar-2" ? groups.planar2 : groups.planar3;
    const accent = imagery.id === "planar-2" ? 0x2563eb : 0xf97316;
    await Promise.all(
      imagery.selected.map(async (pose) =>
        addPlanarPose(
          target,
          {
            ...pose,
            utm: [
              pose.utm[0],
              pose.utm[1],
              await dhhn2016ToEllipsoidalHeight(
                {
                  east: pose.utm[0] as Coordinates.ETRS89UTMEastingMeters,
                  north: pose.utm[1] as Coordinates.ETRS89UTMNorthingMeters,
                  zone: 32,
                },
                pose.utm[2] as Altitude.DHHN2016Meters
              ),
            ],
          },
          origin,
          anchorHeight,
          accent,
          imageTextures,
          imagery.id,
          planarDisplayFilter
        )
      )
    );
    if (imagery.id === "planar-3") {
      applyPlanarPoseOffset(
        groups.planar3,
        currentSettings.planar3OffsetForward,
        currentSettings.planar3OffsetUp,
        currentSettings.planar3OffsetRight
      );
    }
  };
  for (const imagery of manifest.imagery) {
    if (imagery.id === "planar-2" && !settings.showPlanar2) continue;
    if (imagery.id === "planar-3" && settings.planar3Mode === "hidden")
      continue;
    await loadPlanarImagery(imagery);
  }
  scheduleContextRefresh(mesh.anchor);

  const panoramaMeshes: PanoramaPoseMeshes[] = [];
  let panoramaPoses: ImagePose[] = [];
  let panoramaNavigationGraph: SurveyNavigationGraph | null = null;
  const panoramaOutsideGeometry = new THREE.SphereGeometry(
    PANORAMA_OUTSIDE_RADIUS_METERS,
    40,
    24
  );
  const panoramaInsideGeometry = new THREE.SphereGeometry(
    PANORAMA_INSIDE_RADIUS_METERS,
    64,
    40
  );
  // Back-side viewing reverses the inner sphere once. Mirror U explicitly to
  // restore the source panorama there, and use that same calibrated longitude
  // convention for the exterior reflection preview.
  for (const geometry of [panoramaOutsideGeometry, panoramaInsideGeometry]) {
    const uv = geometry.getAttribute("uv");
    for (let index = 0; index < uv.count; index += 1) {
      uv.setX(index, 1 - uv.getX(index));
    }
    uv.needsUpdate = true;
  }
  let panoramaCount = 0;
  try {
    panoramaPoses = await loadPanoPoses();
    panoramaNavigationGraph = buildPanoramaNavigationGraph(panoramaPoses);
    for (const pose of panoramaPoses) {
      imageTextures.registerExternal(`panorama/${pose.id}`, pose.imageUrl);
    }
    const results = await Promise.allSettled(
      panoramaPoses.map((pose) =>
        addPanoramaPose(
          groups.panoramas,
          pose,
          origin,
          anchorHeight,
          panoramaOutsideGeometry,
          panoramaInsideGeometry,
          panoramaDisplayFilter
        )
      )
    );
    for (const result of results) {
      if (result.status === "fulfilled") panoramaMeshes.push(result.value);
    }
    panoramaCount = panoramaMeshes.length;
  } catch {
    panoramaCount = 0;
  }
  const panoramaThumbnailFrustum = new THREE.Frustum();
  const panoramaThumbnailProjection = new THREE.Matrix4();
  const panoramaThumbnailPosition = new THREE.Vector3();
  const panoramaThumbnailSphere = new THREE.Sphere(
    new THREE.Vector3(),
    PANORAMA_OUTSIDE_RADIUS_METERS
  );
  const desiredPanoramaThumbnails = new Set<PanoramaPoseMeshes>();
  const loadingPanoramaThumbnails = new Set<PanoramaPoseMeshes>();
  let queuedPanoramaThumbnails: PanoramaPoseMeshes[] = [];
  let panoramaThumbnailWorkingStatus = `Kugel-Working-Set 0/${PANORAMA_THUMBNAIL_VISIBLE_LIMIT}`;
  const refreshPanoramaImageTextureStatus = () => {
    imageTextureStatus = `${imageTextures.getStatus()} · ${panoramaThumbnailWorkingStatus}`;
  };
  const clearPanoramaThumbnail = (panorama: PanoramaPoseMeshes) => {
    const material = panorama.outside.material;
    material.map = null;
    material.emissiveMap = null;
    material.needsUpdate = true;
    imageTextures.releaseThumbnail(panorama.imageLodKey);
  };
  const pumpPanoramaThumbnailQueue = () => {
    while (
      loadingPanoramaThumbnails.size < PANORAMA_THUMBNAIL_CONCURRENT_LOADS &&
      queuedPanoramaThumbnails.length > 0
    ) {
      const panorama = queuedPanoramaThumbnails.shift()!;
      if (
        !desiredPanoramaThumbnails.has(panorama) ||
        panorama.outside.material.map ||
        panorama.outside.userData.thumbnailUnavailable
      )
        continue;
      loadingPanoramaThumbnails.add(panorama);
      void imageTextures
        .loadThumbnail(panorama.imageLodKey)
        .then((texture) => {
          if (sceneDisposed || !desiredPanoramaThumbnails.has(panorama)) {
            imageTextures.releaseThumbnail(panorama.imageLodKey);
            return;
          }
          const material = panorama.outside.material;
          material.map = texture;
          // A low emissive contribution keeps the reflected street image
          // readable while the physical silver and clearcoat retain highlights.
          material.emissiveMap = texture;
          material.needsUpdate = true;
          refreshPanoramaImageTextureStatus();
          requestSceneFrame();
          publishStatus();
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            panorama.outside.userData.thumbnailUnavailable = true;
          }
        })
        .finally(() => {
          loadingPanoramaThumbnails.delete(panorama);
          pumpPanoramaThumbnailQueue();
        });
    }
  };
  const syncPanoramaThumbnails = () => {
    if (panoramaInside || !currentSettings.showPanoramas) {
      queuedPanoramaThumbnails = [];
      for (const panorama of desiredPanoramaThumbnails) {
        clearPanoramaThumbnail(panorama);
      }
      desiredPanoramaThumbnails.clear();
      return;
    }
    camera.updateMatrixWorld();
    panoramaThumbnailProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    panoramaThumbnailFrustum.setFromProjectionMatrix(
      panoramaThumbnailProjection
    );
    let nearestDistance = Number.POSITIVE_INFINITY;
    const candidates = panoramaMeshes
      .flatMap((panorama) => {
        panorama.outside.getWorldPosition(panoramaThumbnailPosition);
        const distance = camera.position.distanceTo(panoramaThumbnailPosition);
        nearestDistance = Math.min(nearestDistance, distance);
        panoramaThumbnailSphere.center.copy(panoramaThumbnailPosition);
        const inWorkingView =
          panoramaThumbnailFrustum.intersectsSphere(panoramaThumbnailSphere) ||
          distance <= 24;
        return distance <= PANORAMA_THUMBNAIL_MAXIMUM_DISTANCE_METERS &&
          inWorkingView
          ? [{ panorama, distance }]
          : [];
      })
      .sort((left, right) => left.distance - right.distance)
      .slice(0, PANORAMA_THUMBNAIL_VISIBLE_LIMIT)
      .map(({ panorama }) => panorama);
    const nextWorkingStatus = `Kugel-Working-Set ${
      candidates.length
    }/${PANORAMA_THUMBNAIL_VISIBLE_LIMIT} · nächste ${
      Number.isFinite(nearestDistance) ? nearestDistance.toFixed(1) : "–"
    } m`;
    if (nextWorkingStatus !== panoramaThumbnailWorkingStatus) {
      panoramaThumbnailWorkingStatus = nextWorkingStatus;
      refreshPanoramaImageTextureStatus();
      publishStatus();
    }
    const nextDesired = new Set(candidates);
    for (const panorama of desiredPanoramaThumbnails) {
      if (!nextDesired.has(panorama)) clearPanoramaThumbnail(panorama);
    }
    desiredPanoramaThumbnails.clear();
    candidates.forEach((panorama) => desiredPanoramaThumbnails.add(panorama));
    queuedPanoramaThumbnails = candidates.filter(
      (panorama) =>
        !panorama.outside.material.map &&
        !loadingPanoramaThumbnails.has(panorama) &&
        !panorama.outside.userData.thumbnailUnavailable
    );
    pumpPanoramaThumbnailQueue();
  };
  const disposePanoramaThumbnails = () => {
    queuedPanoramaThumbnails = [];
    for (const panorama of desiredPanoramaThumbnails) {
      clearPanoramaThumbnail(panorama);
    }
    desiredPanoramaThumbnails.clear();
  };
  projectionStatus = `Panoramen ${panoramaCount}× aus vollständiger Befahrung verfügbar${
    survey
      ? ` · Radargraph ${survey.traces.length} Läufe / ${
          (georadarNavigationGraph?.crossTraceEdges.length ?? 0) / 2
        } Übergänge ≤${survey.maximumConnectionRadiusMeters} m`
      : ""
  }`;
  try {
    const allNivPoints = await loadNivControlPoints();
    const trackNivPoints = filterNivControlPointsNearTrack(
      allNivPoints,
      panoramaPoses.map(({ utm }) => [utm[0], utm[1]]),
      NIV_POINT_TRACK_CORRIDOR_METERS
    );
    addNivControlPointLayer(groups.nivPoints, trackNivPoints, ecefToScene);
    const nearestDistance = trackNivPoints[0]?.distanceToTrackMeters;
    nivPointStatus = `${trackNivPoints.length}/${
      allNivPoints.length
    } aktuelle Höhenfestpunkte ≤${NIV_POINT_TRACK_CORRIDOR_METERS} m zur Panoramabefahrung${
      nearestDistance === undefined
        ? ""
        : ` · nächster ${nearestDistance.toFixed(1)} m`
    }`;
  } catch (reason) {
    nivPointStatus = `Höhenfestpunkte nicht verfügbar · ${
      reason instanceof Error ? reason.message : String(reason)
    }`;
  }
  publishStatus();
  scheduleContextRefresh(mesh.anchor);
  imageTextureStatus = imageTextures.getStatus();
  publishStatus();
  const panoramaPoseById = new Map(
    panoramaPoses.map((pose) => [pose.id, pose])
  );
  let panoramaCorrectionDatabase = readPanoramaCorrectionDatabase();
  let resolvedPanoramaCorrections = panoramaNavigationGraph
    ? resolvePanoramaCorrections(
        panoramaNavigationGraph,
        panoramaCorrectionDatabase
      )
    : new Map<string, ResolvedPanoramaCorrection>();
  const resolvePanoramaCorrection = (panoramaId: string) =>
    resolvedPanoramaCorrections.get(panoramaId) ?? {
      correction: { ...ZERO_PANORAMA_CORRECTION },
      mode: "none" as const,
    };

  const trajectoryCurveOffsets = calculateTrajectoryCurveOffsets({
    centerline: smoothTrajectoryCenterline(manifest.georeference.centerlineUtm),
    origin,
    alongEastNorth: manifest.georeference.alongEastNorth,
    acrossEastNorth: manifest.georeference.acrossEastNorth,
    sliceMeters: metadata.axes.sliceMeters,
  });
  const halfTrajectoryLength = (metadata.axes.sliceMeters.at(-1) ?? 0) / 2;
  const trajectoryAlongOffsets = manifest.georeference.centerlineUtm.map(
    ([east, north], index) => {
      const deltaEast = east - origin[0];
      const deltaNorth = north - origin[1];
      const projectedAlong =
        deltaEast * manifest.georeference.alongEastNorth[0] +
        deltaNorth * manifest.georeference.alongEastNorth[1];
      return (
        projectedAlong -
        ((metadata.axes.sliceMeters[index] ?? 0) - halfTrajectoryLength)
      );
    }
  );
  const rebuildVolume = (next: RuntimeSettings) => {
    currentSettings = next;
    const profile = surfaceProfile;
    const curveOffsets =
      next.alignmentMode === "surface-curve"
        ? trajectoryCurveOffsets
        : zeroProfile;
    const surfaceOffsets =
      next.alignmentMode === "straight" ? zeroProfile : profile;
    volume.setAlignment(next.alignmentMode, surfaceOffsets);
    volume.setLocalOffset(
      next.trajectoryOffsetForward,
      next.trajectoryOffsetDown,
      next.trajectoryOffsetRight
    );
    volume.group.visible = true;
    const position = centerlineGeometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      position.setY(index, surfaceOffsets[index] ?? 0);
    }
    position.needsUpdate = true;
    const modeLabel =
      next.alignmentMode === "straight"
        ? "gerade"
        : next.alignmentMode === "surface"
        ? "oberflächengeführt"
        : "Oberfläche + Kurve";
    const maximumCurveOffset = Math.max(
      0,
      ...curveOffsets.map((offset) => Math.abs(offset))
    );
    const maximumSurfaceOffset = Math.max(
      0,
      ...surfaceOffsets.map((offset) => Math.abs(offset))
    );
    const trajectoryLabel =
      next.alignmentMode === "surface-curve"
        ? `T0-Spline zentriert · längs ±${Math.max(
            ...trajectoryAlongOffsets.map((offset) => Math.abs(offset))
          ).toFixed(2)} m`
        : "starres Horizontalraster";
    const activeSampleCount = source.activeSampleCount;
    const coverageMeters = metadata.axes.sliceMeters.at(-1) ?? 0;
    visualizationStatus = `${modeLabel} · Radar ${String(
      manifest.captureId
    ).padStart(3, "0")} / ${coverageMeters.toLocaleString("de-DE", {
      maximumFractionDigits: 1,
    })} m Georadar · ${trajectoryLabel} · XY-Tiefenlagen ${
      variant.shape.depth
    } × ${Math.max(0, variant.shape.slice - 1).toLocaleString(
      "de-DE"
    )} Längssegmente · ${Math.max(
      0,
      variant.shape.depth - 1
    )} Z-Extrusionen · linear X/Y · ${variant.shape.trace}×${
      variant.shape.depth
    } Trace×Tiefe · direkte Amplitude · ${
      SURFACE_ELEVATION_SOURCES[activeElevationSource].statusLabel
    } ±${maximumSurfaceOffset.toFixed(
      2
    )} m · Querabweichung ${maximumCurveOffset.toFixed(2)} m${
      activeSampleCount === undefined
        ? ""
        : ` · ${activeSampleCount.toLocaleString("de-DE")} aktive Samples`
    }${
      survey
        ? ` · Survey ${survey.traces.length} Läufe / ${
            (georadarNavigationGraph?.crossTraceEdges.length ?? 0) / 2
          } Übergänge ≤${survey.maximumConnectionRadiusMeters} m`
        : ""
    }`;
    requestSceneFrame();
    publishStatus();
  };
  const applyVisualization = (next: RuntimeSettings) => {
    rebuildVolume(next);
  };
  const applyGeoradarTransfer = ({
    toneCurve,
    opacityRamp,
    clampRange,
    colorRamp,
    invertColorRamp,
  }: GeoradarTransferSettings) => {
    volume.setTransferData(
      buildTransferData(
        toneCurve,
        opacityRamp,
        clampRange,
        colorRamp,
        invertColorRamp
      )
    );
    requestSceneFrame();
  };
  const applyGeoradarDisplay = ({
    renderMode,
    depthInverted,
  }: GeoradarDisplaySettings) => {
    volume.setRenderMode(renderMode);
    volume.setDepthInverted(depthInverted);
    requestSceneFrame();
  };
  const applyTrajectoryOffset = (
    forward: number,
    down: number,
    right: number
  ) => {
    volume.setLocalOffset(forward, down, right);
    requestSceneFrame();
  };
  applyTrajectoryOffset(
    settings.trajectoryOffsetForward,
    settings.trajectoryOffsetDown,
    settings.trajectoryOffsetRight
  );
  let activePanorama: PanoramaPoseMeshes | null = null;
  let activePanoramaXUnit = 0.5;
  let panoramaInside = false;
  let panoramaTransitionActive = false;
  let panoramaTransitionGeneration = 0;
  let panoramaYaw = 0;
  let panoramaPitch = 0;
  let panoramaRadarDirection: -1 | 1 = 1;
  let pendingPanoramaEntryOrientation:
    | { yaw: number; pitch: number }
    | undefined;
  const panoramaCenter = new THREE.Vector3();
  const panoramaForward = new THREE.Vector3();
  const panoramaTrajectoryForward = new THREE.Vector3();
  const panoramaBaseCorrection = (): PanoramaCorrection => ({
    forward: currentSettings.panoramaOffsetForward,
    down: currentSettings.panoramaOffsetDown,
    right: currentSettings.panoramaOffsetRight,
    bearing: currentSettings.panoramaBearingOffset,
    pitch: currentSettings.panoramaPitchOffset,
    roll: currentSettings.panoramaRollOffset,
  });
  const applyCorrectedPanoramaPose = (panorama: PanoramaPoseMeshes) => {
    const pose = panorama.outside.userData.pose as ImagePose;
    const correction = resolvePanoramaCorrection(pose.id).correction;
    const base = panoramaBaseCorrection();
    const resource = pose.resourceOrientationCorrection;
    applyPanoramaPosition(
      panorama,
      base.forward + correction.forward,
      base.down + correction.down,
      base.right + correction.right
    );
    applyPanoramaOrientation(
      panorama,
      resource.bearingDegrees + base.bearing + correction.bearing,
      resource.pitchDegrees + base.pitch + correction.pitch,
      resource.rollDegrees + base.roll + correction.roll
    );
  };
  const publishPanoramaCalibration = () => {
    if (!panoramaInside || !activePanorama || !panoramaNavigationGraph) {
      onPanoramaCalibration(null);
      return;
    }
    const pose = activePanorama.outside.userData.pose as ImagePose;
    const node = panoramaNavigationGraph.nodes.get(pose.id);
    if (!node) {
      onPanoramaCalibration(null);
      return;
    }
    const appliedPosition = activePanorama.outside.position;
    const appliedQuaternion = activePanorama.inside.quaternion.toArray();
    onPanoramaCalibration({
      panoramaId: pose.id,
      traceId: node.traceId,
      traceIndex: node.traceIndex,
      sourcePositionUtm: [...pose.utm],
      sourcePositionDhhN: [
        pose.utm[0],
        pose.utm[1],
        pose.sourceHeights.projectedDhhN,
      ],
      sourceOrientationDegrees: {
        heading: THREE.MathUtils.radToDeg(pose.headingRad),
        pitch: THREE.MathUtils.radToDeg(pose.pitchRad),
        roll: THREE.MathUtils.radToDeg(pose.rollRad),
      },
      resourceOrientationCorrection: pose.resourceOrientationCorrection,
      appliedPositionUtm: [
        origin[0] + appliedPosition.x,
        origin[1] - appliedPosition.z,
        anchorHeight + appliedPosition.y,
      ],
      appliedQuaternion: appliedQuaternion as [number, number, number, number],
      baseCorrection: panoramaBaseCorrection(),
      resolved: resolvePanoramaCorrection(pose.id),
      storedCorrection:
        panoramaCorrectionDatabase.controlPoints[pose.id]?.correction,
      controlPointCount: Object.keys(panoramaCorrectionDatabase.controlPoints)
        .length,
    });
  };
  const updatePanoramaCamera = () => {
    if (!panoramaInside || !activePanorama) return;
    activePanorama.outside.getWorldPosition(panoramaCenter);
    panoramaGraticule.position.copy(panoramaCenter);
    const cosPitch = Math.cos(panoramaPitch);
    panoramaForward.set(
      Math.sin(panoramaYaw) * cosPitch,
      Math.sin(panoramaPitch),
      -Math.cos(panoramaYaw) * cosPitch
    );
    camera.position.copy(panoramaCenter);
    camera.up.set(0, 1, 0);
    controls.target.copy(panoramaCenter).add(panoramaForward);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld();
  };
  let currentClipping: Capture026Clipping = {
    x: { min: 0, max: 1 },
    y: { min: 0, max: 1 },
    z: { min: 0, max: 1 },
    depthMode: "surface",
  };
  const updateVolumeClipping = () => {
    const lengthMeters = Math.max(1, metadata.selection.actualLengthMeter);
    const segmentLengthMeters = metadata.selection.segmentLengthMeter ?? 10;
    const centerline = manifest.georeference.centerlineUtm;
    const centerlineIndex = Math.round(
      activePanoramaXUnit * Math.max(0, centerline.length - 1)
    );
    const previousCenterline = centerline[Math.max(0, centerlineIndex - 1)];
    const nextCenterline =
      centerline[Math.min(centerline.length - 1, centerlineIndex + 1)];
    if (panoramaInside && previousCenterline && nextCenterline) {
      panoramaTrajectoryForward
        .set(
          nextCenterline[0] - previousCenterline[0],
          0,
          -(nextCenterline[1] - previousCenterline[1])
        )
        .normalize();
      const viewingDirection = panoramaForward.dot(panoramaTrajectoryForward);
      if (Math.abs(viewingDirection) > 0.12) {
        panoramaRadarDirection = viewingDirection >= 0 ? 1 : -1;
      }
    }
    const activeMeter = activePanoramaXUnit * lengthMeters;
    const activeSegmentStart =
      Math.floor(activeMeter / segmentLengthMeters) * segmentLengthMeters;
    const activeSegmentEnd = activeSegmentStart + segmentLengthMeters;
    const panoramaMinimumMeter =
      panoramaRadarDirection > 0
        ? activeSegmentStart
        : activeSegmentEnd - segmentLengthMeters * 3;
    const panoramaMaximumMeter =
      panoramaRadarDirection > 0
        ? activeSegmentStart + segmentLengthMeters * 3
        : activeSegmentEnd;
    const panoramaMinimumUnit = THREE.MathUtils.clamp(
      panoramaMinimumMeter / lengthMeters,
      0,
      1
    );
    const panoramaMaximumUnit = THREE.MathUtils.clamp(
      panoramaMaximumMeter / lengthMeters,
      0,
      1
    );
    const xMinimum = panoramaInside
      ? Math.max(currentClipping.x.min, panoramaMinimumUnit)
      : currentClipping.x.min;
    const xMaximum = panoramaInside
      ? Math.min(currentClipping.x.max, panoramaMaximumUnit)
      : currentClipping.x.max;
    (volume.clipMin.value as THREE.Vector3).set(
      xMinimum,
      currentClipping.y.min,
      currentClipping.z.min
    );
    (volume.clipMax.value as THREE.Vector3).set(
      xMaximum,
      currentClipping.y.max,
      currentClipping.z.max
    );
  };
  const applyClipping = (clipping: Capture026Clipping) => {
    currentClipping = clipping;
    updateVolumeClipping();
    requestSceneFrame();
  };
  const previewGeoradarFaceEdit = (edit: GeoradarFaceEditorEdit) => {
    if (edit.kind === "offset") {
      currentSettings = {
        ...currentSettings,
        trajectoryOffsetForward: edit.offsetForwardMeters,
        trajectoryOffsetRight: edit.offsetRightMeters,
        trajectoryOffsetDown: edit.offsetDownMeters,
      };
      volume.setLocalOffset(
        edit.offsetForwardMeters,
        edit.offsetDownMeters,
        edit.offsetRightMeters,
        false
      );
    } else {
      currentClipping = {
        ...currentClipping,
        x: { ...edit.clipX },
        y: { ...edit.clipY },
        z: { ...edit.clipZ },
      };
      updateVolumeClipping();
    }
  };
  const georadarFaceEditor = createGeoradarFaceEditor(host, {
    onPreview: previewGeoradarFaceEdit,
    onCommit: (edit) => {
      if (edit.kind === "offset") {
        volume.setLocalOffset(
          edit.offsetForwardMeters,
          edit.offsetDownMeters,
          edit.offsetRightMeters
        );
      }
      onGeoradarFaceEdit(edit);
    },
    requestRender: requestSceneFrame,
  });
  const getClippingMetrics = (): SceneClippingMetrics => ({
    lengthMeters: metadata.selection.actualLengthMeter,
    sliceMeters: [...metadata.axes.sliceMeters],
    segmentCount: Math.ceil(
      metadata.selection.actualLengthMeter /
        (metadata.selection.segmentLengthMeter ?? 10)
    ),
    segmentLengthMeters: metadata.selection.segmentLengthMeter ?? 10,
    widthMeters: volume.width,
    sourceDepthMeters: metadata.axes.depthMillimeters.at(-1)! / 1000,
    relativeTopMeters: -Math.max(0, ...surfaceProfile),
    relativeBottomMeters:
      metadata.axes.depthMillimeters.at(-1)! / 1000 -
      Math.min(0, ...surfaceProfile),
    referenceSurfaceDhhN:
      anchorHeightDhhN +
      manifest.georeference.surfaceHeight.initialOffsetFromCameraMeters,
  });
  const applyElevationSource = async (
    source: Capture026SurfaceElevationSource
  ) => {
    if (source === activeElevationSource && surfaceProfileCache.has(source)) {
      return getClippingMetrics();
    }
    const requestId = ++elevationRequestId;
    const descriptor = SURFACE_ELEVATION_SOURCES[source];
    elevationStatus = `${descriptor.statusLabel}-Höhenprofil wird geladen`;
    publishStatus();
    try {
      const profile =
        surfaceProfileCache.get(source) ??
        (await sampleSurfaceProfile(
          manifest.georeference.centerlineUtm,
          source
        ));
      if (sceneDisposed || requestId !== elevationRequestId) {
        return getClippingMetrics();
      }
      surfaceProfileCache.set(source, profile);
      activeElevationSource = source;
      surfaceProfile = profile;
      elevationStatus = "";
      rebuildVolume(currentSettings);
      updateVolumeClipping();
      requestSceneFrame();
    } catch (reason) {
      if (sceneDisposed || requestId !== elevationRequestId) {
        return getClippingMetrics();
      }
      elevationStatus = `${
        descriptor.statusLabel
      }-Höhenprofil fehlgeschlagen · ${
        reason instanceof Error ? reason.message : String(reason)
      }`;
      publishStatus();
      throw reason;
    }
    requestSceneFrame();
    return getClippingMetrics();
  };
  const applySceneLayerVisibility = () => {
    const showMeshThroughPanorama =
      panoramaInside &&
      (panoramaTransitionActive ||
        currentSettings.panoramaBlendMode !== "panorama-only");
    volume.group.visible = currentSettings.showGeoradar;
    centerline.visible = currentSettings.showGeoradar && !panoramaInside;
    groups.mesh.visible =
      meshEnabled && (!panoramaInside || showMeshThroughPanorama);
    groups.planar2.visible = currentSettings.showPlanar2 && !panoramaInside;
    groups.planar3.visible =
      (currentSettings.planar3Mode === "camera-plane" ||
        currentSettings.planar3Mode === "both") &&
      !panoramaInside;
    groups.planar3Projection.visible =
      (currentSettings.planar3Mode === "mesh-projection" ||
        currentSettings.planar3Mode === "both") &&
      !panoramaInside;
    groups.nivPoints.visible = currentSettings.showNivPoints && !panoramaInside;
    groups.survey.visible = !panoramaInside;
    groups.panoramas.visible = currentSettings.showPanoramas;
    panoramaGraticule.visible = Boolean(
      panoramaInside &&
        !panoramaTransitionActive &&
        activePanorama &&
        currentSettings.panoramaCalibrationVisible
    );
  };
  const updatePanoramaViewStatus = () => {
    const activeIndex = activePanorama
      ? panoramaMeshes.indexOf(activePanorama)
      : -1;
    panoramaViewStatus =
      panoramaInside && activeIndex >= 0
        ? `Panorama ${activeIndex + 1}/${
            panoramaMeshes.length
          } · Pfeiltasten/WASD: blickgerichtet wechseln · Ziehen: Pan/Pitch · Mausrad zurück oder Zwei-Finger-Zoom-out: verlassen · Esc: verlassen · Georadar-Röntgenoverlay: aktuelles + 2 Segmente in Blickrichtung`
        : "";
    publishPanoramaCalibration();
  };
  let cameraFlight: CameraFlight | null = null;
  const setPanoramaInside = (inside: boolean) => {
    if (panoramaInside === inside) return;
    panoramaInside = inside;
    if (inside && activePanorama) {
      setCameraProjection("perspective");
      const entryOrientation = pendingPanoramaEntryOrientation;
      if (entryOrientation) {
        panoramaYaw = entryOrientation.yaw;
        panoramaPitch = entryOrientation.pitch;
      } else {
        panoramaForward.copy(controls.target).sub(camera.position).normalize();
        panoramaYaw = Math.atan2(panoramaForward.x, -panoramaForward.z);
        panoramaPitch = Math.asin(
          THREE.MathUtils.clamp(panoramaForward.y, -1, 1)
        );
      }
      pendingPanoramaEntryOrientation = undefined;
      controls.enabled = false;
      updatePanoramaCamera();
    } else if (!cameraFlight) {
      setCameraProjection(currentSettings.cameraProjection);
      controls.enabled = true;
    }
    for (const panorama of panoramaMeshes) {
      panorama.outside.visible = !inside;
      panorama.inside.visible = inside && panorama === activePanorama;
    }
    // The panorama acts as an opaque background. Inside it, the georadar is a
    // stable X-ray overlay: no mesh/photo depth can hide the supplied samples.
    volume.setXrayMode(inside);
    volume.opacityScale.value = inside ? 0.42 : 0.94;
    updatePanoramaViewStatus();
    updateVolumeClipping();
    applySceneLayerVisibility();
    const panoramaId =
      inside && activePanorama
        ? (activePanorama.outside.userData.pose as ImagePose | undefined)?.id
        : undefined;
    persistSharedView(panoramaId ?? null);
    requestSceneFrame();
    publishStatus();
  };
  const applySettings = (next: RuntimeSettings) => {
    const previous = currentSettings;
    currentSettings = next;
    metricGround.group.visible = next.radarOnly;
    if (previous.georadarRenderDistance !== next.georadarRenderDistance) {
      volume.setRenderDistance(next.georadarRenderDistance);
    }
    const planar3OffsetChanged =
      previous.planar3OffsetForward !== next.planar3OffsetForward ||
      previous.planar3OffsetUp !== next.planar3OffsetUp ||
      previous.planar3OffsetRight !== next.planar3OffsetRight;
    if (planar3OffsetChanged) {
      applyPlanarPoseOffset(
        groups.planar3,
        next.planar3OffsetForward,
        next.planar3OffsetUp,
        next.planar3OffsetRight
      );
      if (
        next.planar3Mode === "mesh-projection" ||
        next.planar3Mode === "both"
      ) {
        scheduleContextRefresh(mesh.anchor);
      }
    }
    if (!panoramaInside && !cameraFlight) {
      setCameraProjection(next.cameraProjection);
    }
    const wasMeshEnabled = meshEnabled;
    meshEnabled = next.showMesh2024;
    oelbergPointTileset.setEnabled(next.showOelbergPointTileset ?? false);
    oelbergPointTileset.setPointSize(next.oelbergPointTilesetPointSize ?? 2);
    if (previous.meshErrorTarget !== next.meshErrorTarget) {
      mesh.applyErrorTarget(next.meshErrorTarget);
    }
    if (
      previous.meshAppearance !== next.meshAppearance ||
      previous.meshSaturation !== next.meshSaturation ||
      previous.meshContrast !== next.meshContrast ||
      previous.imageEdgeEnhancement !== next.imageEdgeEnhancement ||
      previous.meshElevationMinimum !== next.meshElevationMinimum ||
      previous.meshElevationMaximum !== next.meshElevationMaximum ||
      previous.meshElevationColorRamp !== next.meshElevationColorRamp
    ) {
      mesh.applyAppearance(
        next.meshAppearance,
        next.meshSaturation,
        next.meshContrast,
        next.imageEdgeEnhancement,
        next.meshElevationMinimum,
        next.meshElevationMaximum,
        next.meshElevationColorRamp
      );
    }
    if (
      previous.panoramaSaturation !== next.panoramaSaturation ||
      previous.panoramaContrast !== next.panoramaContrast ||
      previous.imageEdgeEnhancement !== next.imageEdgeEnhancement
    ) {
      panoramaDisplayFilter.setValues(
        next.panoramaSaturation,
        next.panoramaContrast,
        next.imageEdgeEnhancement
      );
      planarDisplayFilter.setValues(
        IMAGE_DISPLAY_DEFAULT_SATURATION,
        IMAGE_DISPLAY_DEFAULT_CONTRAST,
        next.imageEdgeEnhancement
      );
      requestSceneFrame();
    }
    if (previous.meshCenterQualityBoost !== next.meshCenterQualityBoost) {
      mesh.applyCenterQualityBoost(next.meshCenterQualityBoost);
    }
    if (previous.meshDebug !== next.meshDebug) {
      mesh.applyDebug(next.meshDebug);
      performanceOverlay.hidden = !next.meshDebug;
      performanceTitle.textContent = next.meshDebug
        ? "Renderdiagnose · Messung wird vorbereitet"
        : "Renderdiagnose · aus";
    }
    if (previous.meshWireframe !== next.meshWireframe) {
      mesh.applyWireframe(next.meshWireframe);
    }
    if (previous.meshTileBounds !== next.meshTileBounds) {
      mesh.applyTileBounds(next.meshTileBounds);
    }
    if (
      meshEnabled &&
      (!panoramaInside || next.panoramaBlendMode !== "panorama-only")
    ) {
      meshStatus = meshAlignmentStatus || "Mesh 2024 wird geladen …";
      meshLoadingStatus = mesh.getLoadingStatus();
      if (!wasMeshEnabled) {
        mesh.resize(
          camera,
          Math.max(1, renderer.domElement.clientWidth),
          Math.max(1, renderer.domElement.clientHeight)
        );
        mesh.resetFailures();
        mesh.retryFailedTiles();
      }
    } else {
      meshStatus = meshEnabled
        ? "Mesh 2024 im Panorama ausgeblendet"
        : "Mesh 2024 aus";
      meshLoadingStatus = "";
    }
    if (!next.showPanoramas) {
      activePanorama = null;
      setPanoramaInside(false);
    }
    for (const panorama of panoramaMeshes) {
      applyCorrectedPanoramaPose(panorama);
      applyPanoramaAppearance(
        panorama,
        next.panoramaOpacity,
        next.panoramaBlendMode
      );
    }
    publishPanoramaCalibration();
    if (panoramaInside && !panoramaTransitionActive) updatePanoramaCamera();
    if (next.showPlanar2 && !loadedPlanarImagery.has("planar-2")) {
      const planar2 = manifest.imagery.find(({ id }) => id === "planar-2");
      if (planar2) {
        void loadPlanarImagery(planar2).then(() => {
          imageTextureStatus = imageTextures.getStatus();
          applySceneLayerVisibility();
          scheduleContextRefresh(mesh.anchor);
          publishStatus();
        });
      }
    }
    if (next.planar3Mode !== "hidden" && !loadedPlanarImagery.has("planar-3")) {
      const planar3 = manifest.imagery.find(({ id }) => id === "planar-3");
      if (planar3) {
        void loadPlanarImagery(planar3).then(() => {
          if (
            currentSettings.planar3Mode === "mesh-projection" ||
            currentSettings.planar3Mode === "both"
          ) {
            const projectedTriangles = projectPlanar3OntoMesh(
              groups.planar3Projection,
              groups.planar3,
              mesh.anchor
            );
            projectionStatus = `Planar 3 auf Mesh ${projectedTriangles} Dreiecke · Panoramen ${panoramaCount}× verfügbar`;
          }
          imageTextureStatus = imageTextures.getStatus();
          applySceneLayerVisibility();
          scheduleContextRefresh(mesh.anchor);
          publishStatus();
        });
      }
    }
    applySceneLayerVisibility();
    if (previous.meshOpacity !== next.meshOpacity) {
      mesh.applyOpacity(next.meshOpacity);
    }
    requestSceneFrame();
    publishStatus();
  };
  applyVisualization(settings);
  applySettings(settings);

  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    perspectiveCamera.aspect = width / height;
    perspectiveCamera.updateProjectionMatrix();
    updateOrthographicFrustum(width, height);
    mesh.resize(camera, width, height);
    requestSceneFrame();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const panoramaTrajectoryUnit = (panorama: PanoramaPoseMeshes) => {
    const pose = panorama.outside.userData.pose as ImagePose;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (
      let index = 0;
      index < manifest.georeference.centerlineUtm.length;
      index += 1
    ) {
      const [east, north] = manifest.georeference.centerlineUtm[index];
      const distance = Math.hypot(pose.utm[0] - east, pose.utm[1] - north);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    return (
      nearestIndex / Math.max(1, manifest.georeference.centerlineUtm.length - 1)
    );
  };
  panoramaMeshes.sort((left, right) => {
    const leftPose = left.outside.userData.pose as ImagePose;
    const rightPose = right.outside.userData.pose as ImagePose;
    return leftPose.id.localeCompare(rightPose.id, undefined, {
      numeric: true,
    });
  });
  if (restoredPanoramaId) {
    let fadeRestoredPanoramaOnArrival = false;
    let restoredPanoramaArrivalOrientation:
      | { yaw: number; pitch: number }
      | undefined;
    try {
      const transitionValue = window.sessionStorage.getItem(
        PANORAMA_SWITCH_ARRIVAL_FADE_KEY
      );
      if (transitionValue) {
        const transition = JSON.parse(transitionValue) as {
          panoramaId?: string;
          yaw?: number;
          pitch?: number;
        };
        fadeRestoredPanoramaOnArrival =
          transition.panoramaId === restoredPanoramaId;
        if (
          fadeRestoredPanoramaOnArrival &&
          Number.isFinite(transition.yaw) &&
          Number.isFinite(transition.pitch)
        ) {
          restoredPanoramaArrivalOrientation = {
            yaw: transition.yaw!,
            pitch: transition.pitch!,
          };
        }
      }
      if (fadeRestoredPanoramaOnArrival) {
        window.sessionStorage.removeItem(PANORAMA_SWITCH_ARRIVAL_FADE_KEY);
      }
    } catch {
      // Session storage is optional; URL restoration still works without it.
    }
    const restoredPanorama =
      panoramaMeshes.find(
        (panorama) =>
          (panorama.outside.userData.pose as ImagePose | undefined)?.id ===
          restoredPanoramaId
      ) ?? null;
    if (
      restoredPanorama &&
      (await imageTextures.isLoadable(restoredPanorama.imageLodKey))
    ) {
      try {
        await imageTextures.activate(
          restoredPanorama.imageLodKey,
          restoredPanorama.inside.material,
          requestSceneFrame
        );
        activePanorama = restoredPanorama;
        activePanoramaXUnit = panoramaTrajectoryUnit(activePanorama);
        activePanorama.outside.getWorldPosition(panoramaCenter);
        camera.position.copy(panoramaCenter);
        if (restoredPanoramaArrivalOrientation) {
          pendingPanoramaEntryOrientation = restoredPanoramaArrivalOrientation;
        }
        if (fadeRestoredPanoramaOnArrival) {
          panoramaTransitionActive = true;
          activePanorama.inside.material.opacity = 0;
          activePanorama.inside.material.transparent = true;
          activePanorama.inside.material.needsUpdate = true;
        }
        setPanoramaInside(true);
        if (fadeRestoredPanoramaOnArrival) {
          const transitionGeneration = ++panoramaTransitionGeneration;
          await animatePanoramaOpacity(
            activePanorama,
            0,
            currentSettings.panoramaOpacity,
            PANORAMA_SWITCH_FADE_IN_MILLISECONDS,
            requestSceneFrame,
            () =>
              !sceneDisposed &&
              transitionGeneration === panoramaTransitionGeneration
          );
          applyPanoramaAppearance(
            activePanorama,
            currentSettings.panoramaOpacity,
            currentSettings.panoramaBlendMode
          );
          panoramaTransitionActive = false;
          applySceneLayerVisibility();
          requestSceneFrame();
        }
      } catch {
        imageTextures.markUnavailable(restoredPanorama.imageLodKey);
        persistSharedView(null);
      }
    } else {
      persistSharedView(null);
    }
  }
  const setTopDownView = () => {
    panoramaTransitionGeneration += 1;
    panoramaTransitionActive = false;
    cameraFlight = null;
    pendingPanoramaEntryOrientation = undefined;
    if (panoramaInside) setPanoramaInside(false);
    activePanorama = null;
    setCameraProjection(currentSettings.cameraProjection);
    const target = controls.target.clone();
    const distance = Math.max(12, camera.position.distanceTo(target));
    camera.position.set(target.x, target.y + distance, target.z);
    camera.up.set(0, 0, -1);
    camera.lookAt(target);
    controls.target.copy(target);
    controls.enabled = true;
    controls.update();
    persistSharedView(null);
  };
  const panoramaNavigation = document.createElement("div");
  panoramaNavigation.className = "capture026-panorama-navigation";
  panoramaNavigation.setAttribute("aria-label", "Benachbarte Panoramen");
  host.appendChild(panoramaNavigation);
  const adjacentPanoramaPosition = new THREE.Vector3();
  const adjacentPanoramaCameraSpace = new THREE.Vector3();
  const adjacentPanoramaProjected = new THREE.Vector3();
  const activePanoramaPosition = new THREE.Vector3();
  const activePanoramaProjected = new THREE.Vector3();
  const continuationPanoramaPosition = new THREE.Vector3();
  const continuationPanoramaProjected = new THREE.Vector3();
  const panoramaById = new Map(
    panoramaMeshes.map((panorama) => [
      (panorama.outside.userData.pose as ImagePose).id,
      panorama,
    ])
  );
  const radarTraceByCaptureId = new Map<
    number,
    GeoradarSurveyManifest["traces"][number]
  >((survey?.traces ?? []).map((trace) => [trace.captureId, trace]));
  const radarLoadability = new Map<number, Promise<boolean>>();
  const canLoadRadarCapture = (captureId: number) => {
    let result = radarLoadability.get(captureId);
    if (result) return result;
    result = (async () => {
      const trace = radarTraceByCaptureId.get(captureId);
      if (!trace) return false;
      const [sceneManifest, volumeMetadata] = await Promise.all([
        fetchJson<Capture026Manifest>(
          resolveInvestigationDataReference(trace.sceneManifestUrl)
        ),
        fetchJson<VolumeMetadata>(
          resolveInvestigationDataReference(trace.volumeMetadataUrl)
        ),
      ]);
      const variant = [
        volumeMetadata.data,
        ...(volumeMetadata.variants ?? []),
      ].find(({ id }) => id === sceneManifest.volume.variantId);
      if (!variant) return false;
      const volumeUrl = new URL(
        variant.url,
        new URL(
          resolveInvestigationDataReference(trace.volumeMetadataUrl),
          window.location.href
        )
      ).href;
      return assetAvailability.isLoadable(volumeUrl);
    })().catch(() => false);
    radarLoadability.set(captureId, result);
    return result;
  };
  const canLoadPanoramaTarget = async (
    navigationTarget: PanoramaNavigationTarget,
    activePose: ImagePose
  ) => {
    const target = panoramaById.get(navigationTarget.node.id);
    if (!target || !(await imageTextures.isLoadable(target.imageLodKey)))
      return false;
    const targetCaptureId = Number(navigationTarget.node.traceId);
    return navigationTarget.node.traceId === getPanoramaTraceId(activePose.id)
      ? true
      : Number.isFinite(targetCaptureId) &&
          (await canLoadRadarCapture(targetCaptureId));
  };
  let panoramaSwitchGeneration = 0;
  const panoramaSwitchSourcePosition = new THREE.Vector3();
  const panoramaSwitchTargetPosition = new THREE.Vector3();
  const panoramaSwitchForward = new THREE.Vector3();
  const flyBetweenPanoramas = (
    source: PanoramaPoseMeshes,
    target: PanoramaPoseMeshes
  ) =>
    new Promise<void>((resolve) => {
      source.outside.getWorldPosition(panoramaSwitchSourcePosition);
      target.outside.getWorldPosition(panoramaSwitchTargetPosition);
      camera.getWorldDirection(panoramaSwitchForward).normalize();
      const lookDistance = Math.max(
        1,
        camera.position.distanceTo(controls.target)
      );
      const flightDistance = panoramaSwitchSourcePosition.distanceTo(
        panoramaSwitchTargetPosition
      );
      setCameraProjection("perspective");
      cameraFlight = {
        startedAt: performance.now(),
        durationMs: THREE.MathUtils.clamp(220 + flightDistance * 45, 240, 650),
        fromPosition: camera.position.clone(),
        fromTarget: camera.position
          .clone()
          .addScaledVector(panoramaSwitchForward, lookDistance),
        fromFov: perspectiveCamera.fov,
        fromUp: camera.up.clone(),
        toPosition: panoramaSwitchTargetPosition.clone(),
        toTarget: panoramaSwitchTargetPosition
          .clone()
          .addScaledVector(panoramaSwitchForward, lookDistance),
        toFov: perspectiveCamera.fov,
        toUp: camera.up.clone(),
        onComplete: resolve,
      };
      controls.enabled = false;
      requestSceneFrame();
    });
  const switchToPanorama = async (targetId: string) => {
    if (!panoramaInside || !activePanorama || panoramaTransitionActive) return;
    const sourcePanorama = activePanorama;
    const target = panoramaById.get(targetId);
    const activePose = activePanorama.outside.userData.pose as ImagePose;
    const targetPose = target?.outside.userData.pose as ImagePose | undefined;
    const navigationTarget = panoramaNavigationGraph
      ? getPanoramaNavigationTargets(
          panoramaNavigationGraph,
          activePose.id
        ).find(({ node }) => node.id === targetId)
      : undefined;
    if (!target || !targetPose || !navigationTarget) return;
    const generation = ++panoramaSwitchGeneration;
    if (!(await canLoadPanoramaTarget(navigationTarget, activePose))) return;
    if (
      generation !== panoramaSwitchGeneration ||
      activePanorama !== sourcePanorama
    )
      return;
    const activeTraceId = getPanoramaTraceId(activePose.id);
    const targetTraceId = getPanoramaTraceId(targetPose.id);
    const transitionGeneration = ++panoramaTransitionGeneration;
    const transitionContinues = () =>
      !sceneDisposed && transitionGeneration === panoramaTransitionGeneration;
    panoramaTransitionActive = true;
    panoramaNavigationRequestSignature = "";
    applySceneLayerVisibility();
    requestSceneFrame();
    const sourceOpacity = sourcePanorama.inside.material.opacity;
    if (
      !(await animatePanoramaOpacity(
        sourcePanorama,
        sourceOpacity,
        0,
        PANORAMA_SWITCH_FADE_OUT_MILLISECONDS,
        requestSceneFrame,
        transitionContinues
      ))
    )
      return;
    sourcePanorama.inside.visible = false;

    if (targetTraceId === activeTraceId) {
      try {
        await imageTextures.activate(
          target.imageLodKey,
          target.inside.material,
          () => {
            imageTextureStatus = imageTextures.getStatus();
            requestSceneFrame();
            publishStatus();
          }
        );
      } catch {
        imageTextures.markUnavailable(target.imageLodKey);
        sourcePanorama.inside.visible = true;
        await animatePanoramaOpacity(
          sourcePanorama,
          0,
          currentSettings.panoramaOpacity,
          PANORAMA_SWITCH_FADE_IN_MILLISECONDS,
          requestSceneFrame,
          transitionContinues
        );
        applyPanoramaAppearance(
          sourcePanorama,
          currentSettings.panoramaOpacity,
          currentSettings.panoramaBlendMode
        );
        panoramaTransitionActive = false;
        panoramaNavigationRequestSignature = "";
        applySceneLayerVisibility();
        requestSceneFrame();
        return;
      }
      if (!transitionContinues()) return;
    }

    await flyBetweenPanoramas(sourcePanorama, target);
    if (!transitionContinues()) return;
    if (targetTraceId !== activeTraceId) {
      window.sessionStorage.setItem(
        PANORAMA_SWITCH_ARRIVAL_FADE_KEY,
        JSON.stringify({
          panoramaId: targetPose.id,
          yaw: panoramaYaw,
          pitch: panoramaPitch,
        })
      );
      persistSharedView(targetPose.id);
      onRadarCaptureChange(Number(targetTraceId));
      return;
    }

    activePanorama = target;
    activePanoramaXUnit = panoramaTrajectoryUnit(target);
    for (const panorama of panoramaMeshes) {
      panorama.outside.visible = false;
      panorama.inside.visible = panorama === target;
    }
    target.inside.material.opacity = 0;
    target.inside.material.transparent = true;
    target.inside.material.needsUpdate = true;
    updatePanoramaCamera();
    updateVolumeClipping();
    await animatePanoramaOpacity(
      target,
      0,
      currentSettings.panoramaOpacity,
      PANORAMA_SWITCH_FADE_IN_MILLISECONDS,
      requestSceneFrame,
      transitionContinues
    );
    if (!transitionContinues()) return;
    applyPanoramaAppearance(
      target,
      currentSettings.panoramaOpacity,
      currentSettings.panoramaBlendMode
    );
    panoramaTransitionActive = false;
    panoramaNavigationRequestSignature = "";
    updatePanoramaViewStatus();
    applySceneLayerVisibility();
    persistSharedView(targetPose.id);
    requestSceneFrame();
    publishStatus();
  };
  type PanoramaNavigationButton = {
    target: PanoramaNavigationTarget;
    button: HTMLButtonElement;
    arrow: HTMLSpanElement;
    street: HTMLSpanElement;
  };
  let panoramaNavigationButtons: PanoramaNavigationButton[] = [];
  const switchToPanoramaAtViewBearing = (bearingOffsetRadians: number) => {
    const activePose = activePanorama?.outside.userData.pose as
      | ImagePose
      | undefined;
    if (!activePose) return;
    const target = selectPanoramaNavigationTargetForBearing({
      targets: panoramaNavigationButtons.map(({ target }) => target),
      activePosition: [activePose.utm[0], activePose.utm[1]],
      bearingRadians: panoramaYaw + bearingOffsetRadians,
    });
    if (target) void switchToPanorama(target.node.id);
  };
  let panoramaNavigationRequestSignature = "";
  let panoramaNavigationRequestGeneration = 0;
  const renderPanoramaNavigationButtons = (
    targets: PanoramaNavigationTarget[],
    activePose: ImagePose
  ) => {
    panoramaNavigation.replaceChildren();
    panoramaNavigationButtons = targets.map((target) => {
      const { node } = target;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "capture026-panorama-arrow";
      button.hidden = true;
      const bearing = document.createElement("span");
      bearing.className = "capture026-panorama-bearing";
      bearing.setAttribute("aria-hidden", "true");
      const groundPlane = document.createElement("span");
      groundPlane.className = "capture026-panorama-ground-plane";
      const arrow = document.createElement("span");
      arrow.className = "capture026-panorama-arrow-glyph";
      arrow.textContent = "↑";
      const street = document.createElement("span");
      street.className = "capture026-panorama-street";
      const changesTrace = node.traceId !== getPanoramaTraceId(activePose.id);
      street.hidden = !changesTrace;
      street.textContent = changesTrace ? node.streetName : "";
      groundPlane.appendChild(arrow);
      bearing.appendChild(groundPlane);
      button.append(bearing, street);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void switchToPanorama(node.id);
      });
      panoramaNavigation.appendChild(button);
      return { target, button, arrow, street };
    });
  };
  const syncPanoramaNavigationButtons = () => {
    const activePose = activePanorama?.outside.userData.pose as
      | ImagePose
      | undefined;
    const targets =
      panoramaInside &&
      !panoramaTransitionActive &&
      activePose &&
      panoramaNavigationGraph
        ? getPanoramaNavigationTargets(panoramaNavigationGraph, activePose.id)
        : [];
    const signature = `${activePose?.id ?? ""}:${targets
      .map(({ node: { id } }) => id)
      .join(",")}`;
    if (signature === panoramaNavigationRequestSignature) return;
    panoramaNavigationRequestSignature = signature;
    const generation = ++panoramaNavigationRequestGeneration;
    panoramaNavigation.replaceChildren();
    panoramaNavigationButtons = [];
    if (!activePose) return;
    void Promise.all(
      targets.map(async (target) => ({
        target,
        loadable: await canLoadPanoramaTarget(target, activePose),
      }))
    ).then((results) => {
      if (
        sceneDisposed ||
        generation !== panoramaNavigationRequestGeneration ||
        activePanorama?.outside.userData.pose !== activePose
      )
        return;
      renderPanoramaNavigationButtons(
        results.filter(({ loadable }) => loadable).map(({ target }) => target),
        activePose
      );
      requestSceneFrame();
    });
  };
  const updatePanoramaNavigation = () => {
    syncPanoramaNavigationButtons();
    const width = Math.max(1, renderer.domElement.clientWidth);
    const height = Math.max(1, renderer.domElement.clientHeight);
    camera.updateMatrixWorld();
    for (const navigationButton of panoramaNavigationButtons) {
      const target = panoramaById.get(navigationButton.target.node.id);
      const activePose = activePanorama?.outside.userData.pose as
        | ImagePose
        | undefined;
      const targetPose = target?.outside.userData.pose as ImagePose | undefined;
      if (!panoramaInside || !activePose || !targetPose || !target) {
        navigationButton.button.hidden = true;
        continue;
      }
      target.outside.getWorldPosition(adjacentPanoramaPosition);
      adjacentPanoramaCameraSpace
        .copy(adjacentPanoramaPosition)
        .applyMatrix4(camera.matrixWorldInverse);
      adjacentPanoramaProjected.copy(adjacentPanoramaPosition).project(camera);
      const continuation = navigationButton.target.continuation
        ? panoramaById.get(navigationButton.target.continuation.id)
        : undefined;
      let directionX: number;
      let directionY: number;
      if (continuation) {
        continuation.outside.getWorldPosition(continuationPanoramaPosition);
        continuationPanoramaProjected
          .copy(continuationPanoramaPosition)
          .project(camera);
        directionX =
          (continuationPanoramaProjected.x - adjacentPanoramaProjected.x) *
          width *
          0.5;
        directionY =
          -(continuationPanoramaProjected.y - adjacentPanoramaProjected.y) *
          height *
          0.5;
      } else {
        activePanorama?.outside.getWorldPosition(activePanoramaPosition);
        activePanoramaProjected.copy(activePanoramaPosition).project(camera);
        directionX =
          (adjacentPanoramaProjected.x - activePanoramaProjected.x) *
          width *
          0.5;
        directionY =
          -(adjacentPanoramaProjected.y - activePanoramaProjected.y) *
          height *
          0.5;
      }
      if (Math.hypot(directionX, directionY) > 0.5) {
        const groundPlaneForeshortening = Math.cos(
          THREE.MathUtils.degToRad(70)
        );
        navigationButton.arrow.style.transform = `rotate(${Math.atan2(
          directionX * groundPlaneForeshortening,
          -directionY
        )}rad)`;
      }
      const changesTrace =
        getPanoramaTraceId(targetPose.id) !== getPanoramaTraceId(activePose.id);
      const label = changesTrace
        ? `Panorama auf ${navigationButton.target.node.streetName} wechseln`
        : `Benachbartes Panorama ${targetPose.id}`;
      navigationButton.button.setAttribute("aria-label", label);
      navigationButton.button.title = label;
      const targetIsInView =
        adjacentPanoramaCameraSpace.z < -camera.near &&
        adjacentPanoramaProjected.x >= -1 &&
        adjacentPanoramaProjected.x <= 1 &&
        adjacentPanoramaProjected.y >= -1 &&
        adjacentPanoramaProjected.y <= 1;
      if (!targetIsInView) {
        navigationButton.button.hidden = true;
        continue;
      }
      navigationButton.button.hidden = false;
      navigationButton.button.style.left = `${THREE.MathUtils.clamp(
        width * (adjacentPanoramaProjected.x * 0.5 + 0.5),
        88,
        width - 88
      )}px`;
      navigationButton.button.style.top = `${THREE.MathUtils.clamp(
        height * (-adjacentPanoramaProjected.y * 0.5 + 0.5),
        62,
        height - 62
      )}px`;
    }
  };
  const panoramaExitHorizontalForward = new THREE.Vector3();
  const panoramaExitUp = new THREE.Vector3(0, PANORAMA_EXIT_UPWARD_METERS, 0);
  let panoramaZoomOutDistance = 0;
  let lastPanoramaZoomAt = Number.NEGATIVE_INFINITY;
  const panoramaTouches = new Map<number, { x: number; y: number }>();
  let panoramaPinch:
    | {
        lastDistance: number;
        lastCenterY: number;
      }
    | undefined;
  const clearPanoramaGesture = () => {
    panoramaZoomOutDistance = 0;
    lastPanoramaZoomAt = Number.NEGATIVE_INFINITY;
    panoramaPinch = undefined;
  };
  const exitPanoramaView = () => {
    if (!panoramaInside || !activePanorama || panoramaTransitionActive) return;
    activePanorama.outside.getWorldPosition(panoramaCenter);
    const cosPitch = Math.cos(panoramaPitch);
    panoramaForward.set(
      Math.sin(panoramaYaw) * cosPitch,
      Math.sin(panoramaPitch),
      -Math.cos(panoramaYaw) * cosPitch
    );
    panoramaExitHorizontalForward.set(
      Math.sin(panoramaYaw),
      0,
      -Math.cos(panoramaYaw)
    );
    cameraFlight = {
      startedAt: performance.now(),
      durationMs: 1_050,
      fromPosition: panoramaCenter.clone(),
      fromTarget: panoramaCenter.clone().add(panoramaForward),
      fromFov: perspectiveCamera.fov,
      fromUp: camera.up.clone(),
      toPosition: panoramaCenter
        .clone()
        .addScaledVector(
          panoramaExitHorizontalForward,
          -PANORAMA_EXIT_BACKWARD_METERS
        )
        .add(panoramaExitUp),
      toTarget: panoramaCenter.clone(),
      toFov: PANORAMA_DEFAULT_FOV_DEGREES,
      toUp: new THREE.Vector3(0, 1, 0),
    };
    requestSceneFrame();
    clearPanoramaGesture();
    pendingPanoramaEntryOrientation = undefined;
    panoramaTouches.clear();
    setPanoramaInside(false);
    activePanorama = null;
    controls.enabled = false;
  };
  const applyPanoramaZoomGesture = (
    delta: number,
    degreesPerUnit: number,
    exitDistance: number
  ) => {
    if (!panoramaInside || delta === 0) return;
    const now = performance.now();
    if (now - lastPanoramaZoomAt > 350 || delta < 0) {
      panoramaZoomOutDistance = 0;
    }
    lastPanoramaZoomAt = now;
    if (delta < 0) {
      perspectiveCamera.fov = THREE.MathUtils.clamp(
        perspectiveCamera.fov + delta * degreesPerUnit,
        PANORAMA_MIN_FOV_DEGREES,
        PANORAMA_DEFAULT_FOV_DEGREES
      );
      perspectiveCamera.updateProjectionMatrix();
      updatePanoramaCamera();
      requestSceneFrame();
      return;
    }
    const requestedDegrees = delta * degreesPerUnit;
    const availableDegrees = Math.max(
      0,
      PANORAMA_DEFAULT_FOV_DEGREES - perspectiveCamera.fov
    );
    const appliedDegrees = Math.min(requestedDegrees, availableDegrees);
    perspectiveCamera.fov += appliedDegrees;
    perspectiveCamera.updateProjectionMatrix();
    updatePanoramaCamera();
    panoramaZoomOutDistance +=
      (requestedDegrees - appliedDegrees) / degreesPerUnit;
    if (panoramaZoomOutDistance >= exitDistance) exitPanoramaView();
    requestSceneFrame();
  };
  let pointerDown: { x: number; y: number } | null = null;
  let panoramaDrag:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        startYaw: number;
        startPitch: number;
      }
    | undefined;
  const onPointerDown = (event: PointerEvent) => {
    if (panoramaTransitionActive) return;
    if (panoramaInside) {
      pointerDown = null;
      renderer.domElement.setPointerCapture(event.pointerId);
      if (event.pointerType === "touch") {
        event.preventDefault();
        panoramaTouches.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        if (panoramaTouches.size >= 2) {
          const [first, second] = [...panoramaTouches.values()];
          panoramaPinch = {
            lastDistance: Math.hypot(second.x - first.x, second.y - first.y),
            lastCenterY: (first.y + second.y) / 2,
          };
          panoramaDrag = undefined;
          return;
        }
      }
      panoramaDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startYaw: panoramaYaw,
        startPitch: panoramaPitch,
      };
      return;
    }
    pointerDown = { x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: PointerEvent) => {
    if (
      panoramaInside &&
      event.pointerType === "touch" &&
      panoramaTouches.has(event.pointerId)
    ) {
      event.preventDefault();
      panoramaTouches.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
      if (panoramaTouches.size >= 2) {
        const [first, second] = [...panoramaTouches.values()];
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const centerY = (first.y + second.y) / 2;
        if (panoramaPinch) {
          const pinchDelta = panoramaPinch.lastDistance - distance;
          const swipeDelta = centerY - panoramaPinch.lastCenterY;
          const zoomDelta =
            Math.abs(pinchDelta) >= Math.abs(swipeDelta)
              ? pinchDelta
              : swipeDelta;
          applyPanoramaZoomGesture(
            zoomDelta,
            0.12,
            PANORAMA_EXIT_TOUCH_DISTANCE
          );
        }
        if (panoramaInside) {
          panoramaPinch = {
            lastDistance: distance,
            lastCenterY: centerY,
          };
        }
        return;
      }
    }
    if (!panoramaDrag || event.pointerId !== panoramaDrag.pointerId) return;
    panoramaYaw =
      panoramaDrag.startYaw + (panoramaDrag.startX - event.clientX) * 0.004;
    panoramaPitch = THREE.MathUtils.clamp(
      panoramaDrag.startPitch + (event.clientY - panoramaDrag.startY) * 0.004,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01
    );
    updatePanoramaCamera();
    updateVolumeClipping();
    requestSceneFrame();
  };
  const onPointerUp = async (event: PointerEvent) => {
    if (event.pointerType === "touch" && panoramaTouches.has(event.pointerId)) {
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      panoramaTouches.delete(event.pointerId);
      panoramaPinch = undefined;
      panoramaDrag = undefined;
      const remainingTouch = panoramaTouches.entries().next().value as
        | [number, { x: number; y: number }]
        | undefined;
      if (panoramaInside && remainingTouch) {
        panoramaDrag = {
          pointerId: remainingTouch[0],
          startX: remainingTouch[1].x,
          startY: remainingTouch[1].y,
          startYaw: panoramaYaw,
          startPitch: panoramaPitch,
        };
      }
      pointerDown = null;
      return;
    }
    if (panoramaDrag && event.pointerId === panoramaDrag.pointerId) {
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      panoramaDrag = undefined;
      pointerDown = null;
      return;
    }
    if (
      !pointerDown ||
      Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) >
        5
    ) {
      pointerDown = null;
      return;
    }
    pointerDown = null;
    const bounds = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(
      [groups.planar2, groups.planar3, groups.panoramas, groups.survey],
      true
    );
    let navigationObject: THREE.Object3D | null = null;
    for (const intersection of intersections) {
      let candidate: THREE.Object3D | null = intersection.object;
      while (candidate && !candidate.userData.navigation) {
        candidate = candidate.parent;
      }
      if (candidate) {
        navigationObject = candidate;
        break;
      }
    }
    if (!navigationObject) return;
    const navigation = navigationObject.userData.navigation as
      | {
          kind: "panorama";
          headingRad: number;
        }
      | {
          kind: "planar";
          cameraPosition: THREE.Vector3;
          target: THREE.Vector3;
          up: THREE.Vector3;
          worldSpace: boolean;
        }
      | {
          kind: "georadar-trace";
          captureId: number;
        };
    if (navigation.kind === "georadar-trace") {
      if (
        navigation.captureId !== manifest.captureId &&
        (await canLoadRadarCapture(navigation.captureId))
      ) {
        onRadarCaptureChange(navigation.captureId);
      }
      return;
    }
    let toPosition: THREE.Vector3;
    let toTarget: THREE.Vector3;
    let toUp: THREE.Vector3;
    let fromTarget = controls.target.clone();
    if (navigation.kind === "panorama") {
      const selectedPanorama =
        panoramaMeshes.find(
          (panorama) => panorama.outside === navigationObject
        ) ?? null;
      if (
        !selectedPanorama ||
        !(await imageTextures.isLoadable(selectedPanorama.imageLodKey))
      )
        return;
      try {
        await imageTextures.activate(
          selectedPanorama.imageLodKey,
          selectedPanorama.inside.material,
          () => {
            imageTextureStatus = imageTextures.getStatus();
            requestSceneFrame();
            publishStatus();
          }
        );
      } catch {
        imageTextures.markUnavailable(selectedPanorama.imageLodKey);
        return;
      }
      activePanorama = selectedPanorama;
      activePanoramaXUnit = panoramaTrajectoryUnit(activePanorama);
      toPosition = navigationObject.getWorldPosition(new THREE.Vector3());
      camera.updateMatrixWorld();
      const entryForward = camera
        .getWorldDirection(new THREE.Vector3())
        .normalize();
      const entryYaw = Math.atan2(entryForward.x, -entryForward.z);
      const entryPitch = Math.max(
        0,
        Math.asin(THREE.MathUtils.clamp(entryForward.y, -1, 1))
      );
      const entryCosPitch = Math.cos(entryPitch);
      const panoramaEntryForward = new THREE.Vector3(
        Math.sin(entryYaw) * entryCosPitch,
        Math.sin(entryPitch),
        -Math.cos(entryYaw) * entryCosPitch
      );
      const targetDistance = Math.max(
        1,
        camera.position.distanceTo(controls.target)
      );
      pendingPanoramaEntryOrientation = {
        yaw: entryYaw,
        pitch: entryPitch,
      };
      fromTarget = camera.position
        .clone()
        .addScaledVector(entryForward, targetDistance);
      toTarget = toPosition
        .clone()
        .addScaledVector(panoramaEntryForward, targetDistance);
      toUp = camera.up.clone();
    } else {
      pendingPanoramaEntryOrientation = undefined;
      activePanorama = null;
      setPanoramaInside(false);
      navigationObject.parent?.updateWorldMatrix(true, false);
      const parentMatrix =
        navigationObject.parent?.matrixWorld ?? new THREE.Matrix4();
      toTarget = navigation.worldSpace
        ? navigation.target.clone()
        : navigation.target.clone().applyMatrix4(parentMatrix);
      toPosition = navigation.worldSpace
        ? navigation.cameraPosition.clone()
        : navigation.cameraPosition.clone().applyMatrix4(parentMatrix);
      toUp = navigation.worldSpace
        ? navigation.up.clone()
        : navigation.up.clone().transformDirection(parentMatrix);
      if (navigationObject instanceof THREE.Mesh) {
        const imageLodKey = navigationObject.userData.imageLodKey as
          | string
          | undefined;
        if (
          imageLodKey &&
          navigationObject.material instanceof THREE.MeshBasicMaterial
        ) {
          void imageTextures.activate(
            imageLodKey,
            navigationObject.material,
            () => {
              imageTextureStatus = imageTextures.getStatus();
              requestSceneFrame();
              publishStatus();
            }
          );
        }
      }
    }
    setCameraProjection("perspective");
    cameraFlight = {
      startedAt: performance.now(),
      durationMs: 850,
      fromPosition: camera.position.clone(),
      fromTarget,
      fromFov: perspectiveCamera.fov,
      fromUp: camera.up.clone(),
      toPosition,
      toTarget,
      toFov: PANORAMA_DEFAULT_FOV_DEGREES,
      toUp,
    };
    requestSceneFrame();
    controls.enabled = false;
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerType === "touch") {
      panoramaTouches.delete(event.pointerId);
      panoramaPinch = undefined;
    }
    if (panoramaDrag?.pointerId !== event.pointerId) return;
    panoramaDrag = undefined;
    pointerDown = null;
  };
  const onWheel = (event: WheelEvent) => {
    if (!panoramaInside) return;
    event.preventDefault();
    if (panoramaTransitionActive) return;
    const deltaScale =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? renderer.domElement.clientHeight
        : 1;
    applyPanoramaZoomGesture(
      event.deltaY * deltaScale,
      0.025,
      PANORAMA_EXIT_WHEEL_DISTANCE
    );
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!panoramaInside || panoramaTransitionActive) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.matches("input, textarea, select, [role='slider']"))
    )
      return;
    if (event.key === "Escape") {
      event.preventDefault();
      exitPanoramaView();
      return;
    }
    const bearingOffset =
      event.code === "ArrowUp" || event.code === "KeyW"
        ? 0
        : event.code === "ArrowRight" || event.code === "KeyD"
        ? Math.PI / 2
        : event.code === "ArrowDown" || event.code === "KeyS"
        ? Math.PI
        : event.code === "ArrowLeft" || event.code === "KeyA"
        ? -Math.PI / 2
        : undefined;
    if (
      bearingOffset === undefined ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    event.preventDefault();
    switchToPanoramaAtViewBearing(bearingOffset);
  };
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointercancel", onPointerCancel);
  renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  const applyPanoramaCorrectionDatabase = () => {
    resolvedPanoramaCorrections = panoramaNavigationGraph
      ? resolvePanoramaCorrections(
          panoramaNavigationGraph,
          panoramaCorrectionDatabase
        )
      : new Map<string, ResolvedPanoramaCorrection>();
    for (const panorama of panoramaMeshes) {
      applyCorrectedPanoramaPose(panorama);
    }
    if (panoramaInside) updatePanoramaCamera();
    updateVolumeClipping();
    publishPanoramaCalibration();
    requestSceneFrame();
  };
  const persistPanoramaCorrectionDatabase = () => {
    try {
      writePanoramaCorrectionDatabase(panoramaCorrectionDatabase);
      projectionStatus = `Panorama-Mikrokorrekturen ${
        Object.keys(panoramaCorrectionDatabase.controlPoints).length
      } Stützpunkte · LocalStorage`;
    } catch (reason) {
      projectionStatus = `Panorama-Mikrokorrekturen nicht speicherbar · ${
        reason instanceof Error ? reason.message : String(reason)
      }`;
    }
    publishStatus();
  };
  const setActivePanoramaCorrection = (correction: PanoramaCorrection) => {
    if (!panoramaInside || !activePanorama) return;
    const pose = activePanorama.outside.userData.pose as ImagePose;
    panoramaCorrectionDatabase = setPanoramaCorrectionControlPoint(
      panoramaCorrectionDatabase,
      pose.id,
      correction
    );
    persistPanoramaCorrectionDatabase();
    applyPanoramaCorrectionDatabase();
  };
  const deleteActivePanoramaCorrection = () => {
    if (!panoramaInside || !activePanorama) return;
    const pose = activePanorama.outside.userData.pose as ImagePose;
    panoramaCorrectionDatabase = deletePanoramaCorrectionControlPoint(
      panoramaCorrectionDatabase,
      pose.id
    );
    persistPanoramaCorrectionDatabase();
    applyPanoramaCorrectionDatabase();
  };
  const exportPanoramaCorrections = () => {
    if (!panoramaNavigationGraph) return;
    const resolved = resolvePanoramaCorrections(
      panoramaNavigationGraph,
      panoramaCorrectionDatabase
    );
    const sourcePose = (pose: ImagePose, node: SurveyNavigationNode) => ({
      panoramaId: pose.id,
      traceId: node.traceId,
      traceIndex: node.traceIndex,
      positionUtm: pose.utm,
      sourceHeights: pose.sourceHeights,
      orientationDegrees: {
        heading: THREE.MathUtils.radToDeg(pose.headingRad),
        pitch: THREE.MathUtils.radToDeg(pose.pitchRad),
        roll: THREE.MathUtils.radToDeg(pose.rollRad),
      },
      imageUrl: pose.imageUrl,
    });
    const controlPoints = Object.values(
      panoramaCorrectionDatabase.controlPoints
    )
      .map((controlPoint) => {
        const pose = panoramaPoseById.get(controlPoint.panoramaId);
        const node = panoramaNavigationGraph!.nodes.get(
          controlPoint.panoramaId
        );
        return pose && node
          ? {
              sourcePose: sourcePose(pose, node),
              correction: controlPoint.correction,
              updatedAt: controlPoint.updatedAt,
            }
          : null;
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((left, right) =>
        left.sourcePose.panoramaId.localeCompare(
          right.sourcePose.panoramaId,
          undefined,
          { numeric: true }
        )
      );
    const resolvedCorrections = panoramaPoses.flatMap((pose) => {
      const node = panoramaNavigationGraph!.nodes.get(pose.id);
      const correction = resolved.get(pose.id);
      return node && correction && correction.mode !== "none"
        ? [
            {
              sourcePose: sourcePose(pose, node),
              correction: correction.correction,
              interpolation: {
                mode: correction.mode,
                fromPanoramaId: correction.fromPanoramaId,
                toPanoramaId: correction.toPanoramaId,
                fraction: correction.fraction,
              },
            },
          ]
        : [];
    });
    const artifact = {
      format: "carma-panorama-corrections-export-v1",
      exportedAt: new Date().toISOString(),
      sources: {
        panoramaReference: PANORAMA_REFERENCE_URL,
        meshTileset: WUPP_MESH_2024.url,
        activeRadarSceneManifest: new URL(manifestUrl, window.location.href)
          .href,
        horizontalCrs: "EPSG:25832",
        verticalCoordinate:
          "ETRS89 ellipsoidal height from altitude_ellipsoidal in the delivered panorama reference.csv; projectedZ retained as DHHN2016 source height",
        resourceOrientationCorrection: PANORAMA_RESOURCE_ORIENTATION_CORRECTION,
      },
      convention: {
        interpolation:
          "piecewise linear by cumulative planimetric station within one trace; nearest control point held outside its interval",
        position: "meters along panorama-local forward, down, right axes",
        orientation:
          "degrees applied to the image sphere as local bearing(Y), pitch(X), roll(Z)",
        resourceOrientation:
          "PANO-HEADING-2024-v1 is an empirical whole-resource bias against Mesh 2024, not a CRS/grid-convergence transform",
        baseCorrection: panoramaBaseCorrection(),
      },
      database: panoramaCorrectionDatabase,
      controlPoints,
      resolvedCorrections,
    } as const;
    const blob = new Blob([JSON.stringify(artifact, null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `panorama-corrections-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  let lastRuntimeStatusUpdate = Number.NEGATIVE_INFINITY;
  let lastCameraOrientationUpdate = Number.NEGATIVE_INFINITY;
  let lastPanoramaThumbnailSyncAt = Number.NEGATIVE_INFINITY;
  let performanceWindowStartedAt = performance.now();
  let lastPerformanceFrameAt = Number.NEGATIVE_INFINITY;
  let performanceCpuMilliseconds = 0;
  let performanceFrameCount = 0;
  let performanceCpuHistory: number[] = [];
  let performanceGpuHistory: number[] = [];
  let performanceIdleTimer = 0;
  const activePanoramaCenter = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraScreenUp = new THREE.Vector3();
  renderSceneFrame = (time) => {
    const cpuStartedAt = performance.now();
    if (time - lastPerformanceFrameAt > 500) {
      performanceWindowStartedAt = time;
      performanceCpuMilliseconds = 0;
      performanceFrameCount = 0;
    }
    lastPerformanceFrameAt = time;
    if (cameraFlight) {
      const unit = Math.min(
        1,
        (time - cameraFlight.startedAt) / cameraFlight.durationMs
      );
      const eased = unit * unit * (3 - 2 * unit);
      camera.position.lerpVectors(
        cameraFlight.fromPosition,
        cameraFlight.toPosition,
        eased
      );
      controls.target.lerpVectors(
        cameraFlight.fromTarget,
        cameraFlight.toTarget,
        eased
      );
      camera.up
        .lerpVectors(cameraFlight.fromUp, cameraFlight.toUp, eased)
        .normalize();
      perspectiveCamera.fov = THREE.MathUtils.lerp(
        cameraFlight.fromFov,
        cameraFlight.toFov,
        eased
      );
      perspectiveCamera.updateProjectionMatrix();
      if (unit >= 1) {
        const completedFlight = cameraFlight;
        cameraFlight = null;
        if (!panoramaInside) {
          setCameraProjection(currentSettings.cameraProjection);
        }
        controls.enabled = !panoramaInside;
        persistSharedView(
          panoramaInside && activePanorama
            ? (activePanorama.outside.userData.pose as ImagePose | undefined)
                ?.id
            : null
        );
        completedFlight.onComplete?.();
      }
    }
    controls.update();
    if (time - lastPanoramaThumbnailSyncAt >= 160) {
      lastPanoramaThumbnailSyncAt = time;
      syncPanoramaThumbnails();
    }
    if (activePanorama && currentSettings.showPanoramas) {
      if (panoramaInside && !panoramaTransitionActive) updatePanoramaCamera();
      activePanorama.outside.getWorldPosition(activePanoramaCenter);
      updatePanoramaNavigation();
      if (!panoramaTransitionActive) {
        const distance = camera.position.distanceTo(activePanoramaCenter);
        const shouldBeInside = panoramaInside
          ? distance < 0.82
          : distance < 0.62;
        setPanoramaInside(shouldBeInside);
        if (!cameraFlight && !shouldBeInside && distance >= 0.82) {
          activePanorama = null;
        }
      }
    } else {
      setPanoramaInside(false);
      updatePanoramaNavigation();
    }
    camera.updateMatrixWorld();
    volume.updateView(
      camera,
      Math.max(1, host.clientWidth),
      Math.max(1, host.clientHeight),
      time
    );
    georadarFaceEditor.update({
      camera,
      frame: volume.getUserFacingCrossSection(camera),
      splineClips: volume.getSplineClipFrames(camera),
      state: {
        clipX: currentClipping.x,
        clipY: currentClipping.y,
        clipZ: currentClipping.z,
        offsetForwardMeters: currentSettings.trajectoryOffsetForward,
        offsetRightMeters: currentSettings.trajectoryOffsetRight,
        offsetDownMeters: currentSettings.trajectoryOffsetDown,
      },
      visible:
        currentSettings.showGeoradar &&
        !panoramaInside &&
        !panoramaTransitionActive,
    });
    if (time - lastCameraOrientationUpdate >= 80) {
      lastCameraOrientationUpdate = time;
      camera.getWorldDirection(cameraForward);
      const horizontalForward = Math.hypot(cameraForward.x, cameraForward.z);
      let bearingDeg: number;
      if (horizontalForward > 0.05) {
        bearingDeg = THREE.MathUtils.radToDeg(
          Math.atan2(cameraForward.x, -cameraForward.z)
        );
      } else {
        cameraScreenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        bearingDeg = THREE.MathUtils.radToDeg(
          Math.atan2(cameraScreenUp.x, -cameraScreenUp.z)
        );
      }
      onCameraOrientation({
        bearingDeg: (bearingDeg + 360) % 360,
        pitchDeg: THREE.MathUtils.clamp(
          THREE.MathUtils.radToDeg(
            Math.acos(THREE.MathUtils.clamp(-cameraForward.y, 0, 1))
          ),
          0,
          85
        ),
      });
    }
    if (meshEnabled) {
      // Keep the camera and renderer resolution current before every traversal,
      // matching the three-geospatial and 3DTilesRendererJS reference loops.
      // A throwing mesh traversal (for example a failing root fetch) must not
      // abort the frame — everything after it would silently stop updating.
      try {
        mesh.setActiveCamera(camera);
        mesh.tiles.setResolutionFromRenderer(
          camera,
          renderer as unknown as ThreeWebGLRenderer
        );
        mesh.updateCoverageCamera(
          camera,
          Math.max(1, host.clientWidth),
          Math.max(1, host.clientHeight)
        );
        mesh.tiles.update();
      } catch {
        // The mesh runtime reports its own load issues.
      }
    }
    // Ölberg MLS as a 3D Tiles point cloud, anchored on the same scene origin
    // as the mesh so both deliveries are directly comparable.
    oelbergPointTileset?.setResolutionFromRenderer();
    oelbergPointTileset?.update();
    if (!panoramaInside && time - lastRuntimeStatusUpdate >= 500) {
      lastRuntimeStatusUpdate = time;
      const nextMeshLoadingStatus = meshEnabled
        ? mesh.getLoadingStatus()
        : meshLoadingStatus;
      const nextRadarLodStatus = volume.getLodStatus();
      if (
        nextMeshLoadingStatus !== meshLoadingStatus ||
        nextRadarLodStatus !== radarLodStatus
      ) {
        meshLoadingStatus = nextMeshLoadingStatus;
        radarLodStatus = nextRadarLodStatus;
        publishStatus();
      }
    }
    if (metricGround.group.visible) {
      metricGround.update(
        camera,
        new THREE.Vector2(
          Math.max(1, host.clientWidth),
          Math.max(1, host.clientHeight)
        )
      );
    }
    renderer.render(scene, camera);
    const cpuMilliseconds = performance.now() - cpuStartedAt;
    mesh.reportFrameTime(cpuMilliseconds);
    performanceCpuMilliseconds += cpuMilliseconds;
    performanceFrameCount += 1;
    const performanceWindowMilliseconds = time - performanceWindowStartedAt;
    const renderInfo = renderer.info.render;
    const memoryInfo = renderer.info.memory;
    performanceCpuHistory = appendHistoryValue(
      performanceCpuHistory,
      cpuMilliseconds
    );
    performanceGpuHistory = appendHistoryValue(
      performanceGpuHistory,
      renderInfo.drawCalls
    );
    performanceCpuLine.setAttribute(
      "points",
      createSparklinePoints(performanceCpuHistory, 132, 28)
    );
    performanceGpuLine.setAttribute(
      "points",
      createSparklinePoints(performanceGpuHistory, 132, 28)
    );
    performanceTitle.textContent = "Renderdiagnose · aktiv";
    performanceCpu.textContent = `CPU · ${cpuMilliseconds.toFixed(
      1
    )} ms/Frame · ${performanceFrameCount} Render-Request${
      performanceFrameCount === 1 ? "" : "s"
    }`;
    performanceGpu.textContent = `GPU · ${
      renderInfo.drawCalls
    } Draws · ${Math.round(renderInfo.triangles).toLocaleString(
      "de-DE"
    )} Dreiecke · ${memoryInfo.textures} Texturen · ${
      memoryInfo.geometries
    } Geometrien`;
    if (currentSettings.meshDebug && performanceWindowMilliseconds >= 500) {
      const averageCpuMilliseconds =
        performanceCpuMilliseconds / Math.max(1, performanceFrameCount);
      const rendersPerSecond =
        (performanceFrameCount * 1_000) /
        Math.max(1, performanceWindowMilliseconds);
      performanceCpu.textContent = `CPU · ${averageCpuMilliseconds.toFixed(
        1
      )} ms/Frame · ${rendersPerSecond.toFixed(1)} Render/s`;
      performanceWindowStartedAt = time;
      performanceCpuMilliseconds = 0;
      performanceFrameCount = 0;
    }
    window.clearTimeout(performanceIdleTimer);
    if (currentSettings.meshDebug) {
      performanceIdleTimer = window.setTimeout(() => {
        if (sceneDisposed) return;
        performanceTitle.textContent = "Renderdiagnose · ruht";
      }, 300);
    }
    if (cameraFlight) requestSceneFrame();
  };
  renderLoopReady = true;
  requestSceneFrame();
  return {
    renderer,
    volume,
    source,
    metadata,
    variant,
    groups,
    clippingMetrics: getClippingMetrics(),
    signalHistogram256: source.histogram256,
    applyVisualization,
    applyGeoradarTransfer,
    applyGeoradarDisplay,
    applyElevationSource,
    applyClipping,
    applyTrajectoryOffset,
    applySettings,
    setActivePanoramaCorrection,
    deleteActivePanoramaCorrection,
    exportPanoramaCorrections,
    setTopDownView,
    dispose: () => {
      sceneDisposed = true;
      panoramaTransitionGeneration += 1;
      onPanoramaCalibration(null);
      elevationRequestId += 1;
      window.clearTimeout(contextRefreshTimer);
      window.clearTimeout(performanceIdleTimer);
      observer.disconnect();
      window.cancelAnimationFrame(animationFrame);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      panoramaNavigation.remove();
      performanceOverlay.remove();
      georadarFaceEditor.dispose();
      controls.removeEventListener("change", onControlsChange);
      controls.removeEventListener("end", onControlsEnd);
      controls.dispose();
      mesh.dispose();
      oelbergPointTileset.dispose();
      volume.dispose();
      metricGround.dispose();
      centerlineGeometry.dispose();
      centerlineMaterial.dispose();
      disposePanoramaThumbnails();
      disposeObject(groups.planar2);
      disposeObject(groups.planar3);
      disposeObject(groups.planar3Projection);
      disposeObject(groups.panoramas);
      disposeObject(groups.survey);
      disposeObject(groups.nivPoints);
      disposeObject(panoramaGraticule);
      imageTextures.dispose();
      assetAvailability.clear();
      panoramaOutsideGeometry.dispose();
      panoramaInsideGeometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
};

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const width = 84;
  const height = 22;
  const padding = 2;
  const points = createSparklinePoints(values, width, height, padding);
  return (
    <svg
      className="capture026-sparkline"
      viewBox={"0 0 " + width + " " + height}
      role="img"
      aria-label={label}
    >
      <path
        d={
          "M " + padding + " " + (height - padding) + " H " + (width - padding)
        }
      />
      <polyline points={points} />
    </svg>
  );
}

function SectionVisibilityButton({
  label,
  visible,
  onChange,
}: {
  label: string;
  visible: boolean;
  onChange: (visible: boolean) => void;
}) {
  const actionLabel = `${label} ${visible ? "ausblenden" : "anzeigen"}`;
  return (
    <Tooltip title={actionLabel} placement="left">
      <button
        type="button"
        className="capture026-section-visibility"
        aria-label={actionLabel}
        aria-pressed={visible}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onChange(!visible);
        }}
      >
        <FontAwesomeIcon icon={visible ? faEye : faEyeSlash} />
      </button>
    </Tooltip>
  );
}

function OptionsSubsection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="capture026-options-subsection"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>{title}</span>
        {summary ? <small>{summary}</small> : null}
      </summary>
      <div className="capture026-options-subsection-body">{children}</div>
    </details>
  );
}

function InlineInfo({ label, text }: { label: string; text: string }) {
  return (
    <Tooltip title={text} placement="top">
      <button
        type="button"
        className="capture026-inline-info"
        aria-label={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <FontAwesomeIcon icon={faCircleInfo} />
      </button>
    </Tooltip>
  );
}

function SandwichRange({
  label,
  valueLabel,
  range,
  onChange,
}: {
  label: string;
  valueLabel: string;
  range: ClipRange;
  onChange: (range: ClipRange) => void;
}) {
  return (
    <div className="capture026-clip-range">
      <span>
        <strong>{label}</strong>
        <output>{valueLabel}</output>
      </span>
      <Slider
        aria-label={label}
        range={{ draggableTrack: true }}
        min={0}
        max={1}
        step={0.01}
        value={[range.min, range.max]}
        tooltip={{ formatter: (value) => value?.toFixed(2) }}
        onChange={(values: number | number[]) => {
          if (!Array.isArray(values)) return;
          const [min, max] = values;
          if (min === undefined || max === undefined) return;
          onChange({ min, max });
        }}
      />
    </div>
  );
}

function OffsetSlider({
  label,
  value,
  onChange,
  min = -10,
  max = 10,
  step = 0.05,
  precision = 2,
  unit = "m",
  valueLabel = `${label} Offset`,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  valueLabel?: string;
  disabled?: boolean;
}) {
  const formatValue = (next?: number) =>
    next === undefined
      ? ""
      : `${next.toFixed(precision)}${unit ? ` ${unit}` : ""}`;
  return (
    <div className="capture026-offset-slider">
      <strong>{label}</strong>
      <div className="capture026-offset-inputs">
        <Slider
          aria-label={valueLabel}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          tooltip={{ formatter: formatValue }}
          onChange={onChange}
        />
        <InputNumber
          aria-label={`${valueLabel} als Zahl`}
          min={min}
          max={max}
          step={step}
          precision={precision}
          value={value}
          disabled={disabled}
          addonAfter={unit || undefined}
          onChange={(next) => {
            if (typeof next === "number") onChange(next);
          }}
        />
      </div>
    </div>
  );
}

export function Capture026CollocatedScene({
  manifestUrl,
  radarOnly = false,
  radarSegmentCount = 27,
  showGeoradar = true,
  georadarRenderDistance = GEORADAR_DEFAULT_RENDER_DISTANCE_METERS,
  georadarRenderMode = "volume",
  georadarDepthInverted = false,
  showMesh2024 = true,
  showOelbergPointTileset = false,
  oelbergPointTilesetPointSize = 2,
  showNivPoints = true,
  showPlanar2 = false,
  planar3Mode = "hidden",
  planar3OffsetForward = 0,
  planar3OffsetUp = 0,
  planar3OffsetRight = 0,
  showPanoramas = true,
  panoramaOpacity = 1,
  panoramaSaturation = IMAGE_DISPLAY_DEFAULT_SATURATION,
  panoramaContrast = IMAGE_DISPLAY_DEFAULT_CONTRAST,
  panoramaBlendMode = "alpha",
  imageEdgeEnhancement = IMAGE_DISPLAY_DEFAULT_EDGE_ENHANCEMENT,
  panoramaOffsetForward = 0,
  panoramaOffsetDown = 0,
  panoramaOffsetRight = 0,
  panoramaBearingOffset = 0,
  panoramaPitchOffset = 0,
  panoramaRollOffset = 0,
  meshOpacity = 1,
  meshAppearance = MESH_DEFAULT_APPEARANCE,
  meshSaturation = MESH_DEFAULT_SATURATION,
  meshContrast = MESH_DEFAULT_CONTRAST,
  meshElevationMinimum = MESH_DEFAULT_ELEVATION_MINIMUM_METERS,
  meshElevationMaximum = MESH_DEFAULT_ELEVATION_MAXIMUM_METERS,
  meshElevationColorRamp = MESH_DEFAULT_ELEVATION_COLOR_RAMP,
  meshErrorTarget = MESH_DEFAULT_ERROR_TARGET_PIXELS,
  meshCenterQualityBoost = false,
  meshDebug = false,
  meshWireframe = false,
  meshTileBounds = false,
  surfaceElevationSource = "dgm-2020",
  cameraProjection = "perspective",
  alignmentMode = "surface-curve",
  trajectoryOffsetForward = 0,
  trajectoryOffsetDown = 0,
  trajectoryOffsetRight = 0,
}: Capture026CollocatedSceneProps) {
  const [activeRadarCaptureId, setActiveRadarCaptureId] = useState(
    readInitialRadarCaptureId
  );
  const resolvedManifestUrl =
    activeRadarCaptureId === 26
      ? manifestUrl ?? CAPTURE_026_MANIFEST_BY_SEGMENT_COUNT[radarSegmentCount]
      : `/georadar-survey/capture-${String(activeRadarCaptureId).padStart(
          3,
          "0"
        )}-scene.json`;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const [georadarVisible, setGeoradarVisible] = useState(showGeoradar);
  const [activeGeoradarRenderMode, setActiveGeoradarRenderMode] =
    useState<Capture026GeoradarRenderMode>(georadarRenderMode);
  const [activeGeoradarDepthInverted, setActiveGeoradarDepthInverted] =
    useState(georadarDepthInverted);
  const georadarDisplayRef = useRef<GeoradarDisplaySettings>({
    renderMode: activeGeoradarRenderMode,
    depthInverted: activeGeoradarDepthInverted,
  });
  const [meshVisible, setMeshVisible] = useState(
    radarOnly ? false : showMesh2024
  );
  const [nivPointsVisible, setNivPointsVisible] = useState(
    radarOnly ? false : showNivPoints
  );
  const [activeMeshOpacity, setActiveMeshOpacity] = useState(meshOpacity);
  const [activeMeshAppearance, setActiveMeshAppearance] =
    useState<Mesh2024AppearanceMode>(meshAppearance);
  const [activeMeshSaturation, setActiveMeshSaturation] =
    useState(meshSaturation);
  const [activeMeshContrast, setActiveMeshContrast] = useState(meshContrast);
  const [activeMeshElevationMinimum, setActiveMeshElevationMinimum] =
    useState(meshElevationMinimum);
  const [activeMeshElevationMaximum, setActiveMeshElevationMaximum] =
    useState(meshElevationMaximum);
  const [activeMeshElevationColorRamp, setActiveMeshElevationColorRamp] =
    useState<Mesh2024ElevationColorRamp>(meshElevationColorRamp);
  const [activeMeshErrorTarget, setActiveMeshErrorTarget] =
    useState(meshErrorTarget);
  const [centerQualityBoost, setCenterQualityBoost] = useState(
    meshCenterQualityBoost
  );
  const [planar2Visible, setPlanar2Visible] = useState(
    radarOnly ? false : showPlanar2
  );
  const [activePlanar3Mode, setActivePlanar3Mode] = useState(
    radarOnly ? "hidden" : planar3Mode
  );
  const lastVisiblePlanar3ModeRef = useRef<VisibleCapture026Planar3Mode>(
    planar3Mode === "hidden" ? "mesh-projection" : planar3Mode
  );
  const [panoramasVisible, setPanoramasVisible] = useState(
    radarOnly ? false : showPanoramas
  );
  const [activeElevationSource, setActiveElevationSource] = useState(
    surfaceElevationSource
  );
  const [cameraProjectionMode, setCameraProjectionMode] =
    useState(cameraProjection);
  const [offsetForward, setOffsetForward] = useState(trajectoryOffsetForward);
  const [offsetDown, setOffsetDown] = useState(trajectoryOffsetDown);
  const [offsetRight, setOffsetRight] = useState(trajectoryOffsetRight);
  const [activePanoramaOpacity, setActivePanoramaOpacity] =
    useState(panoramaOpacity);
  const [activePanoramaSaturation, setActivePanoramaSaturation] =
    useState(panoramaSaturation);
  const [activePanoramaContrast, setActivePanoramaContrast] =
    useState(panoramaContrast);
  const [activePanoramaBlendMode, setActivePanoramaBlendMode] =
    useState(panoramaBlendMode);
  const [activeImageEdgeEnhancement, setActiveImageEdgeEnhancement] =
    useState(imageEdgeEnhancement);
  const [panoramaForward, setPanoramaForward] = useState(0);
  const [panoramaDown, setPanoramaDown] = useState(0);
  const [panoramaRight, setPanoramaRight] = useState(0);
  const [panoramaBearing, setPanoramaBearing] = useState(0);
  const [panoramaPitchOffsetDegrees, setPanoramaPitchOffsetDegrees] =
    useState(0);
  const [panoramaRoll, setPanoramaRoll] = useState(0);
  const [panoramaCalibration, setPanoramaCalibration] =
    useState<PanoramaCalibrationStatus | null>(null);
  const [planar3Forward, setPlanar3Forward] = useState(planar3OffsetForward);
  const [planar3Up, setPlanar3Up] = useState(planar3OffsetUp);
  const [planar3Right, setPlanar3Right] = useState(planar3OffsetRight);
  const [debugOverlayVisible, setDebugOverlayVisible] = useState(meshDebug);
  const [meshWireframeVisible, setMeshWireframeVisible] =
    useState(meshWireframe);
  const [meshTileBoundsVisible, setMeshTileBoundsVisible] =
    useState(meshTileBounds);
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const [openOptionsSection, setOpenOptionsSection] =
    useState<OptionsSection | null>("georadar");
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [georadarToneCurve, setGeoradarToneCurve] = useState<CurvePoint[]>(() =>
    copyCurve(DEFAULT_GEORADAR_TONE_CURVE)
  );
  const [georadarOpacityRamp, setGeoradarOpacityRamp] = useState<CurvePoint[]>(
    () => copyCurve(DEFAULT_GEORADAR_ALPHA_RAMP)
  );
  const [georadarClampRange, setGeoradarClampRange] = useState<ClipRange>(
    () => ({
      ...DEFAULT_GEORADAR_CLAMP_RANGE,
    })
  );
  const [georadarColorRamp, setGeoradarColorRamp] = useState<RampName>(
    DEFAULT_GEORADAR_COLOR_RAMP
  );
  const [georadarColorRampInverted, setGeoradarColorRampInverted] = useState(
    DEFAULT_GEORADAR_COLOR_RAMP_INVERTED
  );
  const georadarTransferRef = useRef<GeoradarTransferSettings>({
    toneCurve: georadarToneCurve,
    opacityRamp: georadarOpacityRamp,
    clampRange: georadarClampRange,
    colorRamp: georadarColorRamp,
    invertColorRamp: georadarColorRampInverted,
  });
  const [georadarHistogram, setGeoradarHistogram] = useState<number[]>(
    () => new Array(256).fill(0) as number[]
  );
  const settingsRef = useRef<RuntimeSettings>({
    radarOnly,
    showGeoradar: georadarVisible,
    georadarRenderDistance,
    showMesh2024: meshVisible,
    showOelbergPointTileset,
    oelbergPointTilesetPointSize,
    showNivPoints: nivPointsVisible,
    showPlanar2: planar2Visible,
    planar3Mode: activePlanar3Mode,
    planar3OffsetForward: planar3Forward,
    planar3OffsetUp: planar3Up,
    planar3OffsetRight: planar3Right,
    showPanoramas: panoramasVisible,
    panoramaOpacity: activePanoramaOpacity,
    panoramaSaturation: activePanoramaSaturation,
    panoramaContrast: activePanoramaContrast,
    panoramaBlendMode: activePanoramaBlendMode,
    imageEdgeEnhancement: activeImageEdgeEnhancement,
    panoramaOffsetForward,
    panoramaOffsetDown,
    panoramaOffsetRight,
    panoramaBearingOffset,
    panoramaPitchOffset,
    panoramaRollOffset,
    panoramaCalibrationVisible: false,
    meshOpacity: activeMeshOpacity,
    meshAppearance: activeMeshAppearance,
    meshSaturation: activeMeshSaturation,
    meshContrast: activeMeshContrast,
    meshElevationMinimum: activeMeshElevationMinimum,
    meshElevationMaximum: activeMeshElevationMaximum,
    meshElevationColorRamp: activeMeshElevationColorRamp,
    meshErrorTarget: activeMeshErrorTarget,
    meshCenterQualityBoost: centerQualityBoost,
    meshDebug: debugOverlayVisible,
    meshWireframe: meshWireframeVisible,
    meshTileBounds: meshTileBoundsVisible,
    surfaceElevationSource: activeElevationSource,
    cameraProjection: cameraProjectionMode,
    alignmentMode,
    trajectoryOffsetForward: offsetForward,
    trajectoryOffsetDown: offsetDown,
    trajectoryOffsetRight: offsetRight,
  });
  const [status, setStatus] = useState<SceneStatus>({
    summary: "Initialisiere …",
    groups: [],
  });
  const [statusHistory, setStatusHistory] = useState<StatusHistory>({
    georadar: [],
    mesh: [],
    imagery: [],
  });
  const [backend, setBackend] = useState("WebGPU wird geprüft");
  const [cameraOrientation, setCameraOrientation] = useState({
    bearingDeg: 0,
    pitchDeg: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [clipX, setClipX] = useState<ClipRange>({ min: 0, max: 1 });
  const [clipY, setClipY] = useState<ClipRange>({ min: 0, max: 1 });
  const [clipZ, setClipZ] = useState<ClipRange>({ min: 0, max: 1 });
  const [depthClipMode, setDepthClipMode] =
    useState<Capture026DepthClipMode>("surface");
  const [clippingMetrics, setClippingMetrics] = useState<
    SceneRuntime["clippingMetrics"] | null
  >(null);
  const selectRadarCapture = (captureId: number) => {
    for (const candidate of [window, window.parent]) {
      try {
        if (candidate.location.origin !== window.location.origin) continue;
        const url = new URL(candidate.location.href);
        url.searchParams.set("radar", String(captureId).padStart(3, "0"));
        candidate.history.replaceState(candidate.history.state, "", url);
      } catch {
        // Ignore a cross-origin Storybook parent.
      }
    }
    setActiveRadarCaptureId(captureId);
  };
  const saveActivePanoramaCorrection = (patch: Partial<PanoramaCorrection>) => {
    const correction = {
      forward: panoramaForward,
      down: panoramaDown,
      right: panoramaRight,
      bearing: panoramaBearing,
      pitch: panoramaPitchOffsetDegrees,
      roll: panoramaRoll,
      ...patch,
    };
    setPanoramaForward(correction.forward);
    setPanoramaDown(correction.down);
    setPanoramaRight(correction.right);
    setPanoramaBearing(correction.bearing);
    setPanoramaPitchOffsetDegrees(correction.pitch);
    setPanoramaRoll(correction.roll);
    runtimeRef.current?.setActivePanoramaCorrection(correction);
  };

  useEffect(() => {
    setGeoradarVisible(showGeoradar);
  }, [showGeoradar]);

  useEffect(() => {
    setActiveGeoradarRenderMode(georadarRenderMode);
  }, [georadarRenderMode]);

  useEffect(() => {
    setActiveGeoradarDepthInverted(georadarDepthInverted);
  }, [georadarDepthInverted]);

  useEffect(() => {
    setMeshVisible(radarOnly ? false : showMesh2024);
  }, [radarOnly, showMesh2024]);

  useEffect(() => {
    setNivPointsVisible(radarOnly ? false : showNivPoints);
  }, [radarOnly, showNivPoints]);

  useEffect(() => {
    setActiveMeshOpacity(meshOpacity);
  }, [meshOpacity]);

  useEffect(() => {
    setActiveMeshAppearance(meshAppearance);
  }, [meshAppearance]);

  useEffect(() => {
    setActiveMeshSaturation(meshSaturation);
  }, [meshSaturation]);

  useEffect(() => {
    setActiveMeshContrast(meshContrast);
  }, [meshContrast]);

  useEffect(() => {
    setActiveMeshElevationMinimum(meshElevationMinimum);
  }, [meshElevationMinimum]);

  useEffect(() => {
    setActiveMeshElevationMaximum(meshElevationMaximum);
  }, [meshElevationMaximum]);

  useEffect(() => {
    setActiveMeshElevationColorRamp(meshElevationColorRamp);
  }, [meshElevationColorRamp]);

  useEffect(() => {
    setActiveMeshErrorTarget(meshErrorTarget);
  }, [meshErrorTarget]);

  useEffect(() => {
    setCenterQualityBoost(meshCenterQualityBoost);
  }, [meshCenterQualityBoost]);

  useEffect(() => {
    setPlanar2Visible(radarOnly ? false : showPlanar2);
  }, [radarOnly, showPlanar2]);

  useEffect(() => {
    setActivePlanar3Mode(radarOnly ? "hidden" : planar3Mode);
  }, [planar3Mode, radarOnly]);

  useEffect(() => {
    if (activePlanar3Mode !== "hidden") {
      lastVisiblePlanar3ModeRef.current = activePlanar3Mode;
    }
  }, [activePlanar3Mode]);

  useEffect(() => {
    setPanoramasVisible(radarOnly ? false : showPanoramas);
  }, [radarOnly, showPanoramas]);

  useEffect(() => {
    setActiveElevationSource(surfaceElevationSource);
  }, [surfaceElevationSource]);

  useEffect(() => {
    setCameraProjectionMode(cameraProjection);
  }, [cameraProjection]);

  useEffect(() => {
    setOffsetForward(trajectoryOffsetForward);
  }, [trajectoryOffsetForward]);

  useEffect(() => {
    setOffsetDown(trajectoryOffsetDown);
  }, [trajectoryOffsetDown]);

  useEffect(() => {
    setOffsetRight(trajectoryOffsetRight);
  }, [trajectoryOffsetRight]);

  useEffect(() => {
    setActivePanoramaOpacity(panoramaOpacity);
  }, [panoramaOpacity]);

  useEffect(() => {
    setActivePanoramaSaturation(panoramaSaturation);
  }, [panoramaSaturation]);

  useEffect(() => {
    setActivePanoramaContrast(panoramaContrast);
  }, [panoramaContrast]);

  useEffect(() => {
    setActivePanoramaBlendMode(panoramaBlendMode);
  }, [panoramaBlendMode]);

  useEffect(() => {
    setActiveImageEdgeEnhancement(imageEdgeEnhancement);
  }, [imageEdgeEnhancement]);

  useEffect(() => {
    setPlanar3Forward(planar3OffsetForward);
  }, [planar3OffsetForward]);

  useEffect(() => {
    setPlanar3Up(planar3OffsetUp);
  }, [planar3OffsetUp]);

  useEffect(() => {
    setPlanar3Right(planar3OffsetRight);
  }, [planar3OffsetRight]);

  useEffect(() => {
    setDebugOverlayVisible(meshDebug);
  }, [meshDebug]);

  useEffect(() => {
    setMeshWireframeVisible(meshWireframe);
  }, [meshWireframe]);

  useEffect(() => {
    setMeshTileBoundsVisible(meshTileBounds);
  }, [meshTileBounds]);

  useEffect(() => {
    if (error) setStatusExpanded(true);
  }, [error]);

  useEffect(() => {
    const settings = {
      renderMode: activeGeoradarRenderMode,
      depthInverted: activeGeoradarDepthInverted,
    } satisfies GeoradarDisplaySettings;
    georadarDisplayRef.current = settings;
    runtimeRef.current?.applyGeoradarDisplay(settings);
  }, [activeGeoradarDepthInverted, activeGeoradarRenderMode]);

  useEffect(() => {
    const settings = {
      toneCurve: georadarToneCurve,
      opacityRamp: georadarOpacityRamp,
      clampRange: georadarClampRange,
      colorRamp: georadarColorRamp,
      invertColorRamp: georadarColorRampInverted,
    } satisfies GeoradarTransferSettings;
    georadarTransferRef.current = settings;
    runtimeRef.current?.applyGeoradarTransfer(settings);
  }, [
    georadarClampRange,
    georadarColorRamp,
    georadarColorRampInverted,
    georadarOpacityRamp,
    georadarToneCurve,
  ]);

  useEffect(() => {
    const next = {
      radarOnly,
      showGeoradar: georadarVisible,
      georadarRenderDistance,
      showMesh2024: meshVisible,
      showOelbergPointTileset,
      oelbergPointTilesetPointSize,
      showNivPoints: nivPointsVisible,
      showPlanar2: planar2Visible,
      planar3Mode: activePlanar3Mode,
      planar3OffsetForward: planar3Forward,
      planar3OffsetUp: planar3Up,
      planar3OffsetRight: planar3Right,
      showPanoramas: panoramasVisible,
      panoramaOpacity: activePanoramaOpacity,
      panoramaSaturation: activePanoramaSaturation,
      panoramaContrast: activePanoramaContrast,
      panoramaBlendMode: activePanoramaBlendMode,
      imageEdgeEnhancement: activeImageEdgeEnhancement,
      panoramaOffsetForward,
      panoramaOffsetDown,
      panoramaOffsetRight,
      panoramaBearingOffset,
      panoramaPitchOffset,
      panoramaRollOffset,
      panoramaCalibrationVisible:
        optionsExpanded && openOptionsSection === "panorama",
      meshOpacity: activeMeshOpacity,
      meshAppearance: activeMeshAppearance,
      meshSaturation: activeMeshSaturation,
      meshContrast: activeMeshContrast,
      meshElevationMinimum: activeMeshElevationMinimum,
      meshElevationMaximum: activeMeshElevationMaximum,
      meshElevationColorRamp: activeMeshElevationColorRamp,
      meshErrorTarget: activeMeshErrorTarget,
      meshCenterQualityBoost: centerQualityBoost,
      meshDebug: debugOverlayVisible,
      meshWireframe: meshWireframeVisible,
      meshTileBounds: meshTileBoundsVisible,
      surfaceElevationSource: activeElevationSource,
      cameraProjection: cameraProjectionMode,
      alignmentMode,
      trajectoryOffsetForward: offsetForward,
      trajectoryOffsetDown: offsetDown,
      trajectoryOffsetRight: offsetRight,
    };
    const previous = settingsRef.current;
    settingsRef.current = next;
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (previous.alignmentMode !== next.alignmentMode) {
      runtime.applyVisualization(next);
    }
    if (previous.surfaceElevationSource !== next.surfaceElevationSource) {
      setError(null);
      void runtime
        .applyElevationSource(next.surfaceElevationSource)
        .then((metrics) => {
          if (
            runtimeRef.current === runtime &&
            settingsRef.current.surfaceElevationSource ===
              next.surfaceElevationSource
          ) {
            setClippingMetrics(metrics);
          }
        })
        .catch((reason: unknown) => {
          if (runtimeRef.current === runtime) {
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        });
    }
    if (
      previous.trajectoryOffsetForward !== next.trajectoryOffsetForward ||
      previous.trajectoryOffsetDown !== next.trajectoryOffsetDown ||
      previous.trajectoryOffsetRight !== next.trajectoryOffsetRight
    ) {
      runtime.applyTrajectoryOffset(
        next.trajectoryOffsetForward,
        next.trajectoryOffsetDown,
        next.trajectoryOffsetRight
      );
    }
    runtime.applySettings(next);
  }, [
    radarOnly,
    alignmentMode,
    activeMeshAppearance,
    activeMeshSaturation,
    activeMeshContrast,
    activeMeshElevationMinimum,
    activeMeshElevationMaximum,
    activeMeshElevationColorRamp,
    activeMeshErrorTarget,
    centerQualityBoost,
    debugOverlayVisible,
    meshWireframeVisible,
    meshTileBoundsVisible,
    activeMeshOpacity,
    activeElevationSource,
    cameraProjectionMode,
    georadarVisible,
    georadarRenderDistance,
    meshVisible,
    nivPointsVisible,
    panoramasVisible,
    activePanoramaOpacity,
    activePanoramaSaturation,
    activePanoramaContrast,
    activePanoramaBlendMode,
    activeImageEdgeEnhancement,
    panoramaOffsetForward,
    panoramaOffsetDown,
    panoramaOffsetRight,
    panoramaBearingOffset,
    panoramaPitchOffset,
    panoramaRollOffset,
    optionsExpanded,
    openOptionsSection,
    planar2Visible,
    activePlanar3Mode,
    planar3Forward,
    planar3Up,
    planar3Right,
    offsetForward,
    offsetDown,
    offsetRight,
  ]);

  useEffect(() => {
    runtimeRef.current?.applyClipping({
      x: clipX,
      y: clipY,
      z: clipZ,
      depthMode: depthClipMode,
    });
  }, [clipX, clipY, clipZ, depthClipMode]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    setError(null);
    setPanoramaCalibration(null);
    setGeoradarHistogram(new Array(256).fill(0) as number[]);
    setStatusHistory({ georadar: [], mesh: [], imagery: [] });
    initializeScene(
      host,
      resolvedManifestUrl,
      settingsRef.current,
      (nextStatus) => {
        setStatus(nextStatus);
        setStatusHistory((current) => {
          let next = current;
          for (const group of nextStatus.groups) {
            if (!isTemporalStatusGroup(group.id)) continue;
            const metric = getStatusGroupMetric(group);
            if (metric === undefined) continue;
            if (next === current) next = { ...current };
            next[group.id] = appendHistoryValue(current[group.id], metric);
          }
          return next;
        });
      },
      setBackend,
      setCameraOrientation,
      (calibration) => {
        if (cancelled) return;
        setPanoramaCalibration(calibration);
        const correction =
          calibration?.storedCorrection ??
          calibration?.resolved.correction ??
          ZERO_PANORAMA_CORRECTION;
        setPanoramaForward(correction.forward);
        setPanoramaDown(correction.down);
        setPanoramaRight(correction.right);
        setPanoramaBearing(correction.bearing);
        setPanoramaPitchOffsetDegrees(correction.pitch);
        setPanoramaRoll(correction.roll);
      },
      selectRadarCapture,
      (edit) => {
        if (cancelled) return;
        if (edit.kind === "offset") {
          setOffsetForward(edit.offsetForwardMeters);
          setOffsetRight(edit.offsetRightMeters);
          setOffsetDown(edit.offsetDownMeters);
        } else {
          setClipX({ ...edit.clipX });
          setClipY({ ...edit.clipY });
          setClipZ({ ...edit.clipZ });
        }
      }
    )
      .then((runtime) => {
        if (cancelled) {
          runtime.dispose();
          return;
        }
        runtimeRef.current = runtime;
        setClippingMetrics(runtime.clippingMetrics);
        setGeoradarHistogram(runtime.signalHistogram256);
        runtime.applyGeoradarTransfer(georadarTransferRef.current);
        runtime.applyGeoradarDisplay(georadarDisplayRef.current);
        void runtime
          .applyElevationSource(settingsRef.current.surfaceElevationSource)
          .then((metrics) => {
            if (!cancelled && runtimeRef.current === runtime) {
              setClippingMetrics(metrics);
            }
          })
          .catch((reason: unknown) => {
            if (!cancelled && runtimeRef.current === runtime) {
              setError(
                reason instanceof Error ? reason.message : String(reason)
              );
            }
          });
        runtime.applyVisualization(settingsRef.current);
        runtime.applyClipping({
          x: clipX,
          y: clipY,
          z: clipZ,
          depthMode: depthClipMode,
        });
        runtime.applySettings(settingsRef.current);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [resolvedManifestUrl]);

  const lengthMeters = clippingMetrics?.lengthMeters ?? 10;
  const sliceMeters = clippingMetrics?.sliceMeters ?? [0, lengthMeters];
  const loadedSegmentCount = clippingMetrics?.segmentCount ?? radarSegmentCount;
  const segmentLengthMeters = clippingMetrics?.segmentLengthMeters ?? 10;
  const widthMeters = clippingMetrics?.widthMeters ?? 4;
  const relativeTop = clippingMetrics?.relativeTopMeters ?? -0.05;
  const relativeBottom = clippingMetrics?.relativeBottomMeters ?? 0.25;
  const surfaceDepth = clippingMetrics?.sourceDepthMeters ?? 0.197;
  const surfaceDhhN = clippingMetrics?.referenceSurfaceDhhN ?? 160.28;
  const interpolate = (range: ClipRange, start: number, end: number) =>
    [
      start + range.min * (end - start),
      start + range.max * (end - start),
    ] as const;
  const [relativeMin, relativeMax] = interpolate(
    clipZ,
    relativeTop,
    relativeBottom
  );
  const [displayRelativeMin, displayRelativeMax] = activeGeoradarDepthInverted
    ? ([-relativeMax, -relativeMin] as const)
    : ([relativeMin, relativeMax] as const);
  const depthValueLabel =
    depthClipMode === "surface"
      ? `${(clipZ.min * surfaceDepth).toFixed(3)}–${(
          clipZ.max * surfaceDepth
        ).toFixed(3)} m ${
          activeGeoradarDepthInverted ? "über" : "unter"
        } lokaler Oberfläche`
      : depthClipMode === "absolute"
      ? `${(surfaceDhhN - displayRelativeMax).toFixed(2)}–${(
          surfaceDhhN - displayRelativeMin
        ).toFixed(2)} m DHHN`
      : `${displayRelativeMin.toFixed(3)}–${displayRelativeMax.toFixed(
          3
        )} m zur Referenzfläche`;
  const georadarTransferIsDefault =
    JSON.stringify(georadarToneCurve) ===
      JSON.stringify(DEFAULT_GEORADAR_TONE_CURVE) &&
    JSON.stringify(georadarOpacityRamp) ===
      JSON.stringify(DEFAULT_GEORADAR_ALPHA_RAMP) &&
    georadarClampRange.min === DEFAULT_GEORADAR_CLAMP_RANGE.min &&
    georadarClampRange.max === DEFAULT_GEORADAR_CLAMP_RANGE.max &&
    georadarColorRamp === DEFAULT_GEORADAR_COLOR_RAMP &&
    !georadarColorRampInverted;
  const resetGeoradarTransfer = () => {
    const defaults = createDefaultGeoradarTransferSettings();
    setGeoradarToneCurve(defaults.toneCurve);
    setGeoradarOpacityRamp(defaults.opacityRamp);
    setGeoradarClampRange(defaults.clampRange);
    setGeoradarColorRamp(defaults.colorRamp);
    setGeoradarColorRampInverted(defaults.invertColorRamp);
  };
  const toggleOptionsSection = (section: OptionsSection) =>
    setOpenOptionsSection((current) => (current === section ? null : section));
  const visibleStatusGroups: SceneStatusGroup[] = [
    ...status.groups.filter(
      ({ id }) => !radarOnly || id === "surface" || id === "georadar"
    ),
    {
      id: "display",
      label: "Darstellung",
      entries: [
        !georadarVisible
          ? "Georadar ausgeblendet"
          : "Direkte Amplitude · Transferkurve nur für Darstellung",
        "Tiefenskalierung 10×",
      ],
    },
  ];
  const panoramaCorrectionMode = panoramaCalibration
    ? panoramaCalibration.resolved.mode === "stored"
      ? "gespeicherter Stützpunkt"
      : panoramaCalibration.resolved.mode === "interpolated"
      ? `${panoramaCalibration.resolved.fromPanoramaId} → ${
          panoramaCalibration.resolved.toPanoramaId
        } · ${Math.round((panoramaCalibration.resolved.fraction ?? 0) * 100)} %`
      : panoramaCalibration.resolved.mode === "held"
      ? `nächster Stützpunkt ${panoramaCalibration.resolved.fromPanoramaId}`
      : "keine Mikrokorrektur"
    : "Panorama betreten, um eine Pose zu korrigieren";
  return (
    <div className="capture026-scene">
      <div ref={hostRef} className="capture026-canvas" />
      <div className="capture026-camera-tools" aria-label="Kamerasteuerung">
        <Tooltip
          title={
            cameraProjectionMode === "orthographic"
              ? "Zur perspektivischen Projektion wechseln"
              : "Zur orthografischen Projektion wechseln"
          }
          placement="right"
        >
          <ControlButtonStyler
            type="button"
            aria-label={
              cameraProjectionMode === "orthographic"
                ? "Perspektivische Projektion"
                : "Orthografische Projektion"
            }
            aria-pressed={cameraProjectionMode === "orthographic"}
            dataTestId="capture026-projection"
            onClick={() =>
              setCameraProjectionMode((projection) =>
                projection === "perspective" ? "orthographic" : "perspective"
              )
            }
          >
            <FontAwesomeIcon
              icon={cameraProjectionMode === "orthographic" ? faMap : faCube}
            />
          </ControlButtonStyler>
        </Tooltip>
        <Tooltip title="Senkrecht von oben · Norden oben" placement="right">
          <ControlButtonStyler
            type="button"
            aria-label="Senkrecht von oben, Norden oben"
            dataTestId="capture026-compass"
            onClick={() => runtimeRef.current?.setTopDownView()}
          >
            <span className="capture026-compass-needle">
              <CompassNeedleSVG
                heading={cameraOrientation.bearingDeg}
                pitch={cameraOrientation.pitchDeg}
              />
            </span>
          </ControlButtonStyler>
        </Tooltip>
      </div>
      <div
        className="capture026-options-shell"
        data-expanded={optionsExpanded || undefined}
      >
        <button
          type="button"
          className="capture026-options-toggle"
          aria-expanded={optionsExpanded}
          aria-controls="capture026-options-panel"
          title={optionsExpanded ? "Optionen einklappen" : "Optionen öffnen"}
          onClick={() => setOptionsExpanded((expanded) => !expanded)}
        >
          <FontAwesomeIcon icon={faSliders} />
          <span>Darstellung und Ausrichtung</span>
        </button>
        {optionsExpanded ? (
          <div
            id="capture026-options-panel"
            className="capture026-clip-panel"
            data-radar-only={radarOnly || undefined}
          >
            <details
              className="capture026-options-section is-georadar"
              open={openOptionsSection === "georadar"}
            >
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  toggleOptionsSection("georadar");
                }}
              >
                <span>Georadar</span>
                <SectionVisibilityButton
                  label="Georadar"
                  visible={georadarVisible}
                  onChange={setGeoradarVisible}
                />
              </summary>
              <div className="capture026-options-section-body">
                <OptionsSubsection
                  title="Volumendarstellung"
                  summary="3D-Textur · Z-Zellen"
                  defaultOpen
                >
                  <label className="capture026-depth-mode">
                    <span>Renderer</span>
                    <Select
                      size="small"
                      aria-label="Georadar-Renderer"
                      value={activeGeoradarRenderMode}
                      options={[
                        {
                          value: "volume",
                          label: "Volumen · Z-Zellen komponiert",
                        },
                        {
                          value: "cutaway",
                          label: "Schnittflächen · Diagnose",
                        },
                      ]}
                      onChange={setActiveGeoradarRenderMode}
                    />
                  </label>
                  <label className="capture026-transfer-invert capture026-depth-invert">
                    <span>Z-Achse invertieren · Radar oberhalb der Straße</span>
                    <Switch
                      size="small"
                      aria-label="Georadar-Z-Achse invertieren"
                      checked={activeGeoradarDepthInverted}
                      onChange={setActiveGeoradarDepthInverted}
                    />
                  </label>
                </OptionsSubsection>
                <OptionsSubsection
                  title="Signaltransfer"
                  summary="Clamp → Ton → Farbe → Opazität"
                >
                  <SandwichRange
                    label="Werte-Clamp"
                    valueLabel={`${georadarClampRange.min.toFixed(
                      3
                    )}–${georadarClampRange.max.toFixed(3)}`}
                    range={georadarClampRange}
                    onChange={setGeoradarClampRange}
                  />
                  <div className="capture026-transfer-heading">
                    <strong>Tonkurve</strong>
                    <Select
                      size="small"
                      aria-label="Tonkurven-Preset"
                      defaultValue="structure"
                      options={Object.keys(GEORADAR_TONE_CURVE_PRESETS).map(
                        (name) => ({ value: name, label: name })
                      )}
                      onChange={(name) =>
                        setGeoradarToneCurve(
                          copyCurve(GEORADAR_TONE_CURVE_PRESETS[name])
                        )
                      }
                    />
                  </div>
                  <TransferCurveEditor
                    histogram={georadarHistogram}
                    points={georadarToneCurve}
                    onChange={setGeoradarToneCurve}
                    ariaLabel="Histogramm und editierbare Georadar-Transferkurve"
                  />
                  <div className="capture026-transfer-ramp">
                    <label>
                      <span>Farbrampe</span>
                      <Select
                        size="small"
                        aria-label="Georadar-Farbrampe"
                        value={georadarColorRamp}
                        options={RAMP_NAMES.map((name) => ({
                          value: name,
                          label: name,
                        }))}
                        onChange={(name) => setGeoradarColorRamp(name)}
                      />
                    </label>
                    <span
                      className="volume-ramp-preview"
                      style={{
                        backgroundImage: rampCssGradient(georadarColorRamp),
                        transform: georadarColorRampInverted
                          ? "scaleX(-1)"
                          : undefined,
                      }}
                      aria-hidden="true"
                    />
                    <label className="capture026-transfer-invert">
                      <span>invertieren</span>
                      <Switch
                        size="small"
                        aria-label="Farbrampe invertieren"
                        checked={georadarColorRampInverted}
                        onChange={setGeoradarColorRampInverted}
                      />
                    </label>
                  </div>
                  <div className="capture026-transfer-heading">
                    <strong>Opazitätsrampe</strong>
                    <Select
                      size="small"
                      aria-label="Opazitätsrampen-Preset"
                      defaultValue="structure"
                      options={Object.keys(GEORADAR_ALPHA_RAMP_PRESETS).map(
                        (name) => ({ value: name, label: name })
                      )}
                      onChange={(name) =>
                        setGeoradarOpacityRamp(
                          copyCurve(GEORADAR_ALPHA_RAMP_PRESETS[name])
                        )
                      }
                    />
                  </div>
                  <TransferCurveEditor
                    histogram={georadarHistogram}
                    points={georadarOpacityRamp}
                    onChange={setGeoradarOpacityRamp}
                    ariaLabel="Editierbare Georadar-Opazitätsrampe mit Kontrollpunkten"
                    axisLabel="Signalstärke → Opazität"
                    kind="opacity"
                  />
                  <Button
                    size="small"
                    disabled={georadarTransferIsDefault}
                    onClick={resetGeoradarTransfer}
                  >
                    Signaltransfer zurücksetzen
                  </Button>
                </OptionsSubsection>
                <OptionsSubsection
                  title="Referenz und Ausschnitt"
                  summary={`${loadedSegmentCount}×${segmentLengthMeters.toFixed(
                    0
                  )} m`}
                >
                  <label className="capture026-depth-mode">
                    <span>Höhenquelle</span>
                    <Select
                      size="small"
                      value={activeElevationSource}
                      options={CAPTURE_026_SURFACE_ELEVATION_SOURCES.map(
                        (source) => ({
                          value: source,
                          label: SURFACE_ELEVATION_SOURCES[source].label,
                        })
                      )}
                      onChange={(value) =>
                        setActiveElevationSource(
                          value as Capture026SurfaceElevationSource
                        )
                      }
                    />
                  </label>
                  <label className="capture026-depth-mode">
                    <span className="capture026-label-with-info">
                      Z-Wertanzeige
                      <InlineInfo
                        label="Hinweis zur Z-Wertanzeige"
                        text="Nur das Zahlenformat ändert sich. Höhenquelle und Ausrichtung bestimmen die räumliche Lage."
                      />
                    </span>
                    <Select
                      size="small"
                      value={depthClipMode}
                      options={[
                        {
                          value: "surface",
                          label: `Tiefe zur lokalen ${SURFACE_ELEVATION_SOURCES[activeElevationSource].statusLabel}-Oberfläche`,
                        },
                        {
                          value: "relative",
                          label: "Abstand zur Referenzfläche",
                        },
                        { value: "absolute", label: "Höhe in DHHN" },
                      ]}
                      onChange={(value) =>
                        setDepthClipMode(value as Capture026DepthClipMode)
                      }
                    />
                  </label>
                  <SandwichRange
                    label="X · längs"
                    valueLabel={`${georadarStationAtClipUnit(
                      sliceMeters,
                      clipX.min
                    ).toFixed(2)}–${georadarStationAtClipUnit(
                      sliceMeters,
                      clipX.max
                    ).toFixed(2)} m`}
                    range={clipX}
                    onChange={setClipX}
                  />
                  <SandwichRange
                    label="Y · quer"
                    valueLabel={`${((clipY.min - 0.5) * widthMeters).toFixed(
                      2
                    )}–${((clipY.max - 0.5) * widthMeters).toFixed(2)} m`}
                    range={clipY}
                    onChange={setClipY}
                  />
                  <SandwichRange
                    label="Z · Tiefe"
                    valueLabel={depthValueLabel}
                    range={clipZ}
                    onChange={setClipZ}
                  />
                </OptionsSubsection>
                <OptionsSubsection
                  title="Ausrichtung"
                  summary="lokal zur Spine"
                >
                  <OffsetSlider
                    label="Vorwärts"
                    value={offsetForward}
                    onChange={setOffsetForward}
                  />
                  <OffsetSlider
                    label="Abwärts"
                    value={offsetDown}
                    onChange={setOffsetDown}
                  />
                  <OffsetSlider
                    label="Rechts"
                    value={offsetRight}
                    onChange={setOffsetRight}
                  />
                  <Button
                    size="small"
                    disabled={
                      offsetForward === 0 &&
                      offsetDown === 0 &&
                      offsetRight === 0
                    }
                    onClick={() => {
                      setOffsetForward(0);
                      setOffsetDown(0);
                      setOffsetRight(0);
                    }}
                  >
                    Offset zurücksetzen
                  </Button>
                </OptionsSubsection>
              </div>
            </details>
            <details
              className="capture026-options-section is-mesh"
              open={openOptionsSection === "mesh"}
            >
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  toggleOptionsSection("mesh");
                }}
              >
                <span>Mesh 2024</span>
                <SectionVisibilityButton
                  label="Mesh 2024"
                  visible={meshVisible}
                  onChange={setMeshVisible}
                />
              </summary>
              <div className="capture026-options-section-body">
                <h4 className="capture026-options-subheading">Darstellung</h4>
                <label className="capture026-depth-mode">
                  <span>Material</span>
                  <Select
                    size="small"
                    value={activeMeshAppearance}
                    options={[
                      { value: "textured", label: "Textur" },
                      { value: "clay", label: "Clay" },
                      { value: "elevation", label: "Höhe" },
                    ]}
                    onChange={(value) =>
                      setActiveMeshAppearance(value as Mesh2024AppearanceMode)
                    }
                  />
                </label>
                <OffsetSlider
                  label="Deckkraft"
                  value={activeMeshOpacity}
                  min={0}
                  max={1}
                  step={0.02}
                  precision={2}
                  unit=""
                  valueLabel="Mesh-Deckkraft"
                  onChange={setActiveMeshOpacity}
                />
                {activeMeshAppearance === "textured" ? (
                  <>
                    <OffsetSlider
                      label="Sättigung"
                      value={activeMeshSaturation}
                      min={0}
                      max={1}
                      step={0.02}
                      precision={2}
                      unit=""
                      valueLabel="Mesh-Farbsättigung"
                      onChange={setActiveMeshSaturation}
                    />
                    <OffsetSlider
                      label="Kontrast"
                      value={activeMeshContrast}
                      min={0}
                      max={2}
                      step={0.02}
                      precision={2}
                      unit=""
                      valueLabel="Mesh-Kontrast"
                      onChange={setActiveMeshContrast}
                    />
                  </>
                ) : null}
                {activeMeshAppearance === "elevation" ? (
                  <div className="capture026-elevation-style">
                    <div className="capture026-elevation-ramp">
                      <span>Farbskala</span>
                      <Select
                        size="small"
                        aria-label="Mesh-Höhenfarbskala"
                        value={activeMeshElevationColorRamp}
                        options={MESH_ELEVATION_COLOR_RAMPS.map((name) => ({
                          value: name,
                          label: name,
                        }))}
                        onChange={(name) =>
                          setActiveMeshElevationColorRamp(
                            name as Mesh2024ElevationColorRamp
                          )
                        }
                      />
                      <span
                        className="volume-ramp-preview"
                        style={{
                          backgroundImage: rampCssGradient(
                            activeMeshElevationColorRamp
                          ),
                        }}
                        aria-hidden="true"
                      />
                    </div>
                    <OffsetSlider
                      label="Von"
                      value={activeMeshElevationMinimum}
                      min={MESH_ELEVATION_RANGE_MINIMUM_METERS}
                      max={activeMeshElevationMaximum - 0.1}
                      step={0.1}
                      precision={1}
                      valueLabel="Höhenbereich von · Ellipsoid"
                      onChange={setActiveMeshElevationMinimum}
                    />
                    <OffsetSlider
                      label="Bis"
                      value={activeMeshElevationMaximum}
                      min={activeMeshElevationMinimum + 0.1}
                      max={MESH_ELEVATION_RANGE_MAXIMUM_METERS}
                      step={0.1}
                      precision={1}
                      valueLabel="Höhenbereich bis · Ellipsoid"
                      onChange={setActiveMeshElevationMaximum}
                    />
                    <div
                      className="capture026-contour-legend"
                      aria-label="Höhenlinien: 0,1 Meter fein, 1 Meter normal, 5 Meter stark"
                    >
                      <span data-weight="hairline">0,1 m</span>
                      <span data-weight="meter">1 m</span>
                      <span data-weight="major">5 m</span>
                      <small>ETRS89-Ellipsoid</small>
                    </div>
                  </div>
                ) : null}
                <h4 className="capture026-options-subheading">Detail</h4>
                <OffsetSlider
                  label="Qualität"
                  value={activeMeshErrorTarget}
                  min={MESH_MINIMUM_ERROR_TARGET_PIXELS}
                  max={MESH_MAXIMUM_ERROR_TARGET_PIXELS}
                  step={0.05}
                  precision={2}
                  unit="px"
                  valueLabel="Ziel-Screenfehler"
                  onChange={setActiveMeshErrorTarget}
                />
                <label className="capture026-depth-mode">
                  <span>Zentrum maximal verfeinern</span>
                  <Switch
                    size="small"
                    checked={centerQualityBoost}
                    onChange={setCenterQualityBoost}
                  />
                </label>
                <h4 className="capture026-options-subheading">
                  Debugdarstellung
                </h4>
                <label className="capture026-depth-mode">
                  <span>Wireframe</span>
                  <Switch
                    size="small"
                    checked={meshWireframeVisible}
                    onChange={setMeshWireframeVisible}
                  />
                </label>
                <label className="capture026-depth-mode">
                  <span>Tile-Bounding-Boxen</span>
                  <Switch
                    size="small"
                    checked={meshTileBoundsVisible}
                    onChange={setMeshTileBoundsVisible}
                  />
                </label>
              </div>
            </details>
            <details className="capture026-options-section is-niv is-visibility-only">
              <summary
                onClick={(event) => {
                  event.preventDefault();
                }}
              >
                <span>Höhenfestpunkte</span>
                <SectionVisibilityButton
                  label="Höhenfestpunkte"
                  visible={nivPointsVisible}
                  onChange={setNivPointsVisible}
                />
              </summary>
            </details>
            <details className="capture026-options-section is-planar2 is-visibility-only">
              <summary
                onClick={(event) => {
                  event.preventDefault();
                }}
              >
                <span>Planar 2</span>
                <SectionVisibilityButton
                  label="Planar 2"
                  visible={planar2Visible}
                  onChange={setPlanar2Visible}
                />
              </summary>
            </details>
            <details
              className="capture026-options-section is-planar3"
              open={openOptionsSection === "planar3"}
            >
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  toggleOptionsSection("planar3");
                }}
              >
                <span>Planar 3</span>
                <SectionVisibilityButton
                  label="Planar 3"
                  visible={activePlanar3Mode !== "hidden"}
                  onChange={(visible) =>
                    setActivePlanar3Mode(
                      visible ? lastVisiblePlanar3ModeRef.current : "hidden"
                    )
                  }
                />
              </summary>
              <div className="capture026-options-section-body">
                <label className="capture026-depth-mode">
                  <span>Darstellung</span>
                  <Select
                    size="small"
                    disabled={activePlanar3Mode === "hidden"}
                    value={
                      activePlanar3Mode === "hidden"
                        ? lastVisiblePlanar3ModeRef.current
                        : activePlanar3Mode
                    }
                    options={[
                      {
                        value: "mesh-projection",
                        label: "Mesh-Projektion",
                      },
                      { value: "camera-plane", label: "Kameraebene" },
                      { value: "both", label: "beides" },
                    ]}
                    onChange={(value) =>
                      setActivePlanar3Mode(
                        value as VisibleCapture026Planar3Mode
                      )
                    }
                  />
                </label>
                <h4 className="capture026-options-subheading">
                  Position · lokale Kameraachsen
                </h4>
                <OffsetSlider
                  label="Vorwärts"
                  value={planar3Forward}
                  min={-5}
                  max={5}
                  onChange={setPlanar3Forward}
                />
                <OffsetSlider
                  label="Aufwärts"
                  value={planar3Up}
                  min={-5}
                  max={5}
                  onChange={setPlanar3Up}
                />
                <OffsetSlider
                  label="Rechts"
                  value={planar3Right}
                  min={-5}
                  max={5}
                  onChange={setPlanar3Right}
                />
                <Button
                  size="small"
                  disabled={
                    planar3Forward === 0 &&
                    planar3Up === 0 &&
                    planar3Right === 0
                  }
                  onClick={() => {
                    setPlanar3Forward(0);
                    setPlanar3Up(0);
                    setPlanar3Right(0);
                  }}
                >
                  Position zurücksetzen
                </Button>
              </div>
            </details>
            <details
              className="capture026-options-section is-panorama"
              open={openOptionsSection === "panorama"}
            >
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  toggleOptionsSection("panorama");
                }}
              >
                <span>Panorama</span>
                <SectionVisibilityButton
                  label="Panorama"
                  visible={panoramasVisible}
                  onChange={setPanoramasVisible}
                />
              </summary>
              <div className="capture026-options-section-body capture026-panorama-controls">
                <h4 className="capture026-options-subheading">Darstellung</h4>
                <label className="capture026-depth-mode">
                  <span>Überblendung</span>
                  <Select
                    size="small"
                    value={activePanoramaBlendMode}
                    options={[
                      { value: "panorama-only", label: "nur Panorama" },
                      {
                        value: "alpha",
                        label: "Normal · Alpha",
                      },
                      { value: "multiply", label: "Multiplizieren" },
                      { value: "screen", label: "Negativ multiplizieren" },
                      {
                        value: "difference",
                        label: "Differenz · Mesh − Panorama",
                      },
                      { value: "additive", label: "Additiv" },
                      { value: "subtractive", label: "Subtraktiv" },
                    ]}
                    onChange={(value) =>
                      setActivePanoramaBlendMode(
                        value as Capture026PanoramaBlendMode
                      )
                    }
                  />
                </label>
                <OffsetSlider
                  label="Deckkraft"
                  value={activePanoramaOpacity}
                  min={0}
                  max={1}
                  step={0.02}
                  precision={2}
                  unit=""
                  valueLabel="Panorama-Deckkraft"
                  onChange={setActivePanoramaOpacity}
                />
                <h4 className="capture026-options-subheading">
                  <span>Bildfilter</span>
                  <InlineInfo
                    label="Hinweis zum Kantenfilter"
                    text="Der Kantenfilter hebt Helligkeitssprünge im Bildschirmraum hervor und wirkt identisch auf Panoramen, Planarbilder und die Mesh-Textur."
                  />
                </h4>
                <OffsetSlider
                  label="Sättigung"
                  value={activePanoramaSaturation}
                  min={0}
                  max={1}
                  step={0.02}
                  precision={2}
                  unit=""
                  valueLabel="Panorama-Sättigung"
                  onChange={setActivePanoramaSaturation}
                />
                <OffsetSlider
                  label="Kontrast"
                  value={activePanoramaContrast}
                  min={0}
                  max={2}
                  step={0.02}
                  precision={2}
                  unit=""
                  valueLabel="Panorama-Kontrast"
                  onChange={setActivePanoramaContrast}
                />
                <OffsetSlider
                  label="Kanten"
                  value={activeImageEdgeEnhancement}
                  min={0}
                  max={IMAGE_DISPLAY_MAXIMUM_EDGE_ENHANCEMENT}
                  step={0.02}
                  precision={2}
                  unit=""
                  valueLabel="Kantenfilter für Bilder und Mesh"
                  onChange={setActiveImageEdgeEnhancement}
                />
                <h4 className="capture026-options-subheading">
                  Ausrichtung · Bildkugel
                </h4>
                <OffsetSlider
                  label="Bearing"
                  value={panoramaBearing}
                  min={-8}
                  max={8}
                  step={0.1}
                  precision={1}
                  unit="°"
                  valueLabel="Panorama-Bearing"
                  disabled={!panoramaCalibration}
                  onChange={(bearing) =>
                    saveActivePanoramaCorrection({ bearing })
                  }
                />
                <OffsetSlider
                  label="Pitch"
                  value={panoramaPitchOffsetDegrees}
                  min={-8}
                  max={8}
                  step={0.1}
                  precision={1}
                  unit="°"
                  valueLabel="Panorama-Pitch"
                  disabled={!panoramaCalibration}
                  onChange={(pitch) => saveActivePanoramaCorrection({ pitch })}
                />
                <OffsetSlider
                  label="Roll"
                  value={panoramaRoll}
                  min={-8}
                  max={8}
                  step={0.1}
                  precision={1}
                  unit="°"
                  valueLabel="Panorama-Roll"
                  disabled={!panoramaCalibration}
                  onChange={(roll) => saveActivePanoramaCorrection({ roll })}
                />
                <Button
                  size="small"
                  disabled={
                    !panoramaCalibration ||
                    (panoramaBearing === 0 &&
                      panoramaPitchOffsetDegrees === 0 &&
                      panoramaRoll === 0)
                  }
                  onClick={() =>
                    saveActivePanoramaCorrection({
                      bearing: 0,
                      pitch: 0,
                      roll: 0,
                    })
                  }
                >
                  Ausrichtung zurücksetzen
                </Button>
                <small>
                  Türkis markiert den waagerechten Horizont; das Raster bleibt
                  beim Verschieben und Drehen weltfest.
                </small>
                <h4 className="capture026-options-subheading">
                  Position · lokale Poseachsen
                </h4>
                <OffsetSlider
                  label="Vorwärts"
                  value={panoramaForward}
                  min={-5}
                  max={5}
                  disabled={!panoramaCalibration}
                  onChange={(forward) =>
                    saveActivePanoramaCorrection({ forward })
                  }
                />
                <OffsetSlider
                  label="Abwärts"
                  value={panoramaDown}
                  min={-5}
                  max={5}
                  disabled={!panoramaCalibration}
                  onChange={(down) => saveActivePanoramaCorrection({ down })}
                />
                <OffsetSlider
                  label="Rechts"
                  value={panoramaRight}
                  min={-5}
                  max={5}
                  disabled={!panoramaCalibration}
                  onChange={(right) => saveActivePanoramaCorrection({ right })}
                />
                <Button
                  size="small"
                  disabled={
                    !panoramaCalibration ||
                    (panoramaForward === 0 &&
                      panoramaDown === 0 &&
                      panoramaRight === 0)
                  }
                  onClick={() =>
                    saveActivePanoramaCorrection({
                      forward: 0,
                      down: 0,
                      right: 0,
                    })
                  }
                >
                  Position zurücksetzen
                </Button>
                <div className="capture026-panorama-calibration-state">
                  <strong>
                    {panoramaCalibration?.panoramaId ?? "Kein aktives Panorama"}
                  </strong>
                  <span>{panoramaCorrectionMode}</span>
                  <small>
                    Änderungen werden als Stützpunkt im Browser gespeichert;
                    Zwischenbilder desselben Laufs werden nach Wegstrecke
                    interpoliert.
                  </small>
                </div>
                <div className="capture026-panorama-calibration-actions">
                  <Button
                    size="small"
                    danger
                    disabled={!panoramaCalibration?.storedCorrection}
                    onClick={() =>
                      runtimeRef.current?.deleteActivePanoramaCorrection()
                    }
                  >
                    Stützpunkt löschen
                  </Button>
                  <Button
                    size="small"
                    onClick={() =>
                      runtimeRef.current?.exportPanoramaCorrections()
                    }
                  >
                    Korrekturen exportieren
                  </Button>
                </div>
              </div>
            </details>
            <small>
              Posekugel oder Kameraebene anklicken: zur Kamera fliegen
            </small>
          </div>
        ) : null}
      </div>
      <div
        className={
          error ? "capture026-status-shell is-error" : "capture026-status-shell"
        }
        data-expanded={statusExpanded || undefined}
      >
        <div className="capture026-status-header">
          <button
            type="button"
            className="capture026-status-toggle"
            aria-expanded={statusExpanded}
            aria-controls="capture026-status-panel"
            title={
              statusExpanded ? "Szeneninfo einklappen" : "Szeneninfo öffnen"
            }
            onClick={() => setStatusExpanded((expanded) => !expanded)}
          >
            <FontAwesomeIcon icon={faCircleInfo} />
            <span>Szeneninfo</span>
            <small>
              {error ? "Fehler" : status.summary} · {backend}
            </small>
          </button>
          {statusExpanded ? (
            <Tooltip
              title="CPU-Framezeit und Renderer-Ressourcen anzeigen"
              placement="top"
            >
              <div className="capture026-status-diagnostics-toggle">
                <span>Diagnose</span>
                <Switch
                  size="small"
                  aria-label="CPU/GPU-Diagnose"
                  checked={debugOverlayVisible}
                  onChange={setDebugOverlayVisible}
                />
              </div>
            </Tooltip>
          ) : null}
        </div>
        {statusExpanded ? (
          <div
            id="capture026-status-panel"
            className="capture026-status-panel"
            aria-live="polite"
          >
            {error ? (
              <p className="capture026-status-error">{error}</p>
            ) : (
              <dl className="capture026-status-groups">
                {visibleStatusGroups.map((group) => {
                  const preview = getStatusGroupPreview(group);
                  return (
                    <div key={group.id}>
                      <dt>{group.label}</dt>
                      <dd>{preview || "Keine Daten"}</dd>
                      {isTemporalStatusGroup(group.id) ? (
                        <Sparkline
                          values={statusHistory[group.id]}
                          label={group.label + " im Zeitverlauf"}
                        />
                      ) : (
                        <span className="capture026-sparkline-placeholder" />
                      )}
                    </div>
                  );
                })}
              </dl>
            )}
            {!error && debugOverlayVisible && panoramaCalibration ? (
              <dl className="capture026-panorama-debug-status">
                <div>
                  <dt>Panorama</dt>
                  <dd>
                    {panoramaCalibration.panoramaId} · Lauf{" "}
                    {panoramaCalibration.traceId}/
                    {panoramaCalibration.traceIndex}
                  </dd>
                </div>
                <div>
                  <dt>Quelle · UTM + Ellipsoid</dt>
                  <dd>
                    E {panoramaCalibration.sourcePositionUtm[0].toFixed(3)} · N{" "}
                    {panoramaCalibration.sourcePositionUtm[1].toFixed(3)} · Z{" "}
                    {panoramaCalibration.sourcePositionUtm[2].toFixed(3)} m
                  </dd>
                </div>
                <div>
                  <dt>Quelle · DHHN2016</dt>
                  <dd>
                    E {panoramaCalibration.sourcePositionDhhN[0].toFixed(3)} · N{" "}
                    {panoramaCalibration.sourcePositionDhhN[1].toFixed(3)} · H{" "}
                    {panoramaCalibration.sourcePositionDhhN[2].toFixed(3)} m
                  </dd>
                </div>
                <div>
                  <dt>Quelle · Pose</dt>
                  <dd>
                    H{" "}
                    {panoramaCalibration.sourceOrientationDegrees.heading.toFixed(
                      3
                    )}
                    ° · P{" "}
                    {panoramaCalibration.sourceOrientationDegrees.pitch.toFixed(
                      3
                    )}
                    ° · R{" "}
                    {panoramaCalibration.sourceOrientationDegrees.roll.toFixed(
                      3
                    )}
                    °
                  </dd>
                </div>
                <div>
                  <dt>Ressourcen-Korrektur</dt>
                  <dd>
                    {panoramaCalibration.resourceOrientationCorrection.id} · B +
                    {panoramaCalibration.resourceOrientationCorrection.bearingDegrees.toFixed(
                      3
                    )}
                    °
                  </dd>
                </div>
                <div>
                  <dt>Angewandt · Ellipsoid</dt>
                  <dd>
                    E {panoramaCalibration.appliedPositionUtm[0].toFixed(3)} · N{" "}
                    {panoramaCalibration.appliedPositionUtm[1].toFixed(3)} · Z{" "}
                    {panoramaCalibration.appliedPositionUtm[2].toFixed(3)} m
                  </dd>
                </div>
                <div>
                  <dt>Quaternion</dt>
                  <dd>
                    {panoramaCalibration.appliedQuaternion
                      .map((value) => value.toFixed(5))
                      .join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt>Korrektur</dt>
                  <dd>
                    F{" "}
                    {panoramaCalibration.resolved.correction.forward.toFixed(3)}{" "}
                    · D{" "}
                    {panoramaCalibration.resolved.correction.down.toFixed(3)} ·
                    R {panoramaCalibration.resolved.correction.right.toFixed(3)}{" "}
                    m · B{" "}
                    {panoramaCalibration.resolved.correction.bearing.toFixed(3)}
                    ° · P{" "}
                    {panoramaCalibration.resolved.correction.pitch.toFixed(3)}°
                    · R{" "}
                    {panoramaCalibration.resolved.correction.roll.toFixed(3)}°
                  </dd>
                </div>
                <div>
                  <dt>Interpolation</dt>
                  <dd>
                    {panoramaCorrectionMode} ·{" "}
                    {panoramaCalibration.controlPointCount} Stützpunkte · Basis
                    F/D/R{" "}
                    {panoramaCalibration.baseCorrection.forward.toFixed(2)}/
                    {panoramaCalibration.baseCorrection.down.toFixed(2)}/
                    {panoramaCalibration.baseCorrection.right.toFixed(2)} m
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
