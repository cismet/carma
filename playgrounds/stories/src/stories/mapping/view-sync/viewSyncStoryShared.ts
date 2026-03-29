import { type CSSProperties } from "react";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import L from "leaflet";
import { PI_OVER_TWO } from "@carma/math";
import { CAMERA_TYPE } from "@carma-commons/camera/model";
import {
  METROPOLERUHR_WMTS_SPW2_WEBMERCATOR_HQ,
  WUPPERTAL,
} from "@carma-commons/resources";
import {
  buildViewState,
  deriveView,
  applyToCesium,
  type ViewState,
  type DerivedView,
  type AngleBasedViewInput,
  type WritePriority,
} from "@carma-mapping/engines-interop/view-state";
import {
  type CesiumWidget,
  type SerializedCameraStateHeadingPitchRoll,
} from "@carma/cesium";
import {
  degToRadNumeric,
  negativePiToPi,
  radToDegNumeric,
} from "@carma/units/helpers";
import {
  CARMA_STORY_MAPPING_ENGINES,
  type StoryMappingEngine,
} from "./mappingEngines";
import { initializeTerrainProviders } from "../../map-engine-switcher/helpers/cesium-setup";
import {
  readStoryCesiumScene,
  requestStoryCesiumRender,
} from "../../shared/cesiumRuntimeGuards";

export type SlotConfig = {
  id: string;
  engine: StoryMappingEngine;
};

export type SlotMountConfig = {
  id: string;
  engine: StoryMappingEngine;
  registerWithViewSync: boolean;
  reportStatus: boolean;
  layer: "base" | "overlay" | "underlay";
};

export type SlotViewSyncHandle = {
  claimControl: (priority?: WritePriority) => boolean;
  releaseControl: () => void;
  pushState: (state: ViewState, priority?: WritePriority) => void;
};

export type CesiumRuntimeHandle = {
  engine: typeof CARMA_STORY_MAPPING_ENGINES.CESIUM;
  widget: CesiumWidget;
  container: HTMLDivElement;
  terrainProviders: Awaited<ReturnType<typeof initializeTerrainProviders>>;
  viewSync: SlotViewSyncHandle | null;
};

export type LeafletRuntimeHandle = {
  engine: typeof CARMA_STORY_MAPPING_ENGINES.LEAFLET;
  map: L.Map;
  container: HTMLDivElement;
  viewSync: SlotViewSyncHandle | null;
};

export type MapLibreRuntimeHandle = {
  engine: typeof CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL;
  map: MapLibreMap;
  container: HTMLDivElement;
  viewSync: SlotViewSyncHandle | null;
};

export type SlotRuntimeHandle =
  | CesiumRuntimeHandle
  | LeafletRuntimeHandle
  | MapLibreRuntimeHandle;

export type SlotTransitionRequest = {
  sourceMountId: string;
  targetMountId: string;
  sourceEngine:
    | typeof CARMA_STORY_MAPPING_ENGINES.LEAFLET
    | typeof CARMA_STORY_MAPPING_ENGINES.CESIUM;
  targetEngine:
    | typeof CARMA_STORY_MAPPING_ENGINES.LEAFLET
    | typeof CARMA_STORY_MAPPING_ENGINES.CESIUM;
  restoreControllerAfterTransition: boolean;
};

type StoryHomePoseValues = {
  lngDeg: number;
  latDeg: number;
  bearingDeg: number;
  pitchDeg: number;
  altitudeM: number;
};

export type ViewSyncStoryProps = {
  longitudeDeg?: number;
  latitudeDeg?: number;
  altitudeM?: number;
  bearingDeg?: number;
  pitchDeg?: number;
  rangeM?: number;
  fovVerticalDeg?: number;
  nearPlaneM?: number;
  farPlaneM?: number;
  allowLeafletFractionalZoom?: boolean;
};

export const DEFAULT_FOV_RAD = Math.PI / 3;
export const DEFAULT_ANCHOR_ALTITUDE_M = 200;
export const PANEL_MIN_WIDTH_PX = 256;

export const GEO_PORTAL_MAPLIBRE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "source-basemap": {
      type: "raster",
      tiles: [METROPOLERUHR_WMTS_SPW2_WEBMERCATOR_HQ.layers.spw2_light.url],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: "layer-basemap",
      type: "raster",
      source: "source-basemap",
      paint: {
        "raster-opacity": 1,
      },
    },
  ],
};

export const LEAFLET_TO_CESIUM_TRANSITION_OPTIONS = {
  step1_prepare2dViewMaxZoom: 20,
  step1_zoomOutDurationMs: 300,
  step1_zoomOutEaseLinearity: 0.75,
  step2_initialRenderTimeoutMs: 100,
  step3_resourceWaitTimeoutMs: 100,
  step4_cssTransitionDurationMs: 600,
  step5_postCssDelayMs: 100,
  step6_cameraAnimationDurationMs: 800,
} as const;

export const shellStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  background:
    "linear-gradient(180deg, rgba(226,232,240,0.92) 0%, rgba(203,213,225,0.98) 100%)",
  overflow: "hidden",
};

export const overlayLayerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 40,
  pointerEvents: "none",
};

export const panelsRowStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  gap: 0,
  padding: 0,
  boxSizing: "border-box",
  overflowX: "auto",
  overflowY: "hidden",
  alignItems: "stretch",
};

export const addButtonStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  right: 12,
  zIndex: 60,
  transform: "translateY(-50%)",
};

export const panelSlotStyle: CSSProperties = {
  flex: "1 1 0",
  width: 0,
  minWidth: PANEL_MIN_WIDTH_PX,
  minHeight: 0,
  display: "flex",
};

// Align the multiview story center with the Geoportal home position at
// Rathaus Barmen while keeping the oblique story presentation.
export const RATHAUS_BARMEN_HOME_POSE = {
  lngDeg: 7.1999207,
  latDeg: 51.2725716,
  bearingDeg: 154.69,
  pitchDeg: 45,
  altitudeM: 157,
} satisfies StoryHomePoseValues;

export const DEFAULT_STORY_RANGE_M = 620;

export const MIN_COMPASS_PITCH_DEG = 0;
export const MAX_COMPASS_PITCH_DEG = 85;
export const COMPASS_DRAG_FACTOR_DEG_PER_PX = 0.3;
export const META_VISUAL_WIDTH_PX = 176;
export const META_VISUAL_HEIGHT_PX = 176;
export const INITIAL_SLOT_BOOT_DELAY_STEP_MS = 220;
export const VIEW_SYNC_CONTROL_SOURCE_ENGINE = "view-sync-control";
export const COMPASS_CLICK_DELAY_MS = 180;
export const COMPASS_DRAG_THRESHOLD_PX = 3;
export const COMPASS_ALIGN_NORTH_DURATION_MS = 700;
export const COMPASS_ALIGN_NORTH_NADIR_DURATION_MS = 900;
export const ZOOM_CONTROL_DURATION_MS = 280;
export const ANIMATION_MIN_DURATION_MS = 1;

export const createStoryTargetState = ({
  longitudeDeg = RATHAUS_BARMEN_HOME_POSE.lngDeg,
  latitudeDeg = RATHAUS_BARMEN_HOME_POSE.latDeg,
  altitudeM = RATHAUS_BARMEN_HOME_POSE.altitudeM,
  bearingDeg = RATHAUS_BARMEN_HOME_POSE.bearingDeg,
  pitchDeg = RATHAUS_BARMEN_HOME_POSE.pitchDeg,
  rangeM,
  fovVerticalDeg = radToDegNumeric(DEFAULT_FOV_RAD),
  nearPlaneM,
  farPlaneM,
}: ViewSyncStoryProps = {}): ViewState => {
  const resolvedRangeM =
    typeof rangeM === "number" && Number.isFinite(rangeM)
      ? rangeM
      : DEFAULT_STORY_RANGE_M;

  const input: AngleBasedViewInput = {
    longitude: degToRadNumeric(longitudeDeg),
    latitude: degToRadNumeric(latitudeDeg),
    altitude: altitudeM,
    bearing: degToRadNumeric(bearingDeg),
    pitch: degToRadNumeric(pitchDeg),
    range: resolvedRangeM ?? DEFAULT_STORY_RANGE_M,
    intrinsics: {
      type: CAMERA_TYPE.PERSPECTIVE,
      fov: degToRadNumeric(fovVerticalDeg),
      ...(Number.isFinite(nearPlaneM) || Number.isFinite(farPlaneM)
        ? {
            frustum: {
              ...(Number.isFinite(nearPlaneM) ? { near: nearPlaneM } : {}),
              ...(Number.isFinite(farPlaneM) ? { far: farPlaneM } : {}),
            },
          }
        : {}),
    },
    metadata: {
      frameId: 0,
      timestampMs: Date.now(),
      sourceId: "bootstrap",
      source: "restore",
    },
  };

  return buildViewState(input);
};

export const noopApplyViewState = (_state: ViewState) => {};

export const isLeafletCesiumMappingEngine = (
  engine: StoryMappingEngine
): engine is
  | typeof CARMA_STORY_MAPPING_ENGINES.LEAFLET
  | typeof CARMA_STORY_MAPPING_ENGINES.CESIUM =>
  engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET ||
  engine === CARMA_STORY_MAPPING_ENGINES.CESIUM;

export const isLeafletCesiumTransition = (
  fromEngine: StoryMappingEngine,
  toEngine: StoryMappingEngine
): boolean =>
  isLeafletCesiumMappingEngine(fromEngine) &&
  isLeafletCesiumMappingEngine(toEngine);

export const getCurrentAnchorAltitude = (state: ViewState | null): number =>
  state
    ? (state.anchorCartographic.altitude as number)
    : DEFAULT_ANCHOR_ALTITUDE_M;

export const getCurrentVerticalFov = (state: ViewState | null): number => {
  if (!state) return DEFAULT_FOV_RAD;
  const fov = state.intrinsics.fov;
  return typeof fov === "number" && Number.isFinite(fov)
    ? fov
    : DEFAULT_FOV_RAD;
};

export const applyViewStateToCesiumWidget = ({
  widget,
  state,
}: {
  widget: CesiumWidget;
  state: ViewState;
}): boolean => {
  if (typeof widget.isDestroyed === "function" && widget.isDestroyed()) {
    return false;
  }

  const scene = readStoryCesiumScene(widget);
  if (!scene) {
    return false;
  }

  applyToCesium(scene, state);
  requestStoryCesiumRender(scene);
  return true;
};

export const readCesiumTransitionTargetCameraState = (
  state: ViewState | null | undefined
): SerializedCameraStateHeadingPitchRoll | null => {
  if (!state) {
    return null;
  }

  const view = deriveView(state);

  return {
    longitude: view.longitude as number,
    latitude: view.latitude as number,
    altitude: view.altitude as number,
    heading: view.bearing as number,
    pitch: ((view.pitch as number) - PI_OVER_TWO) as number,
    ...(Number.isFinite(view.roll) ? { roll: view.roll as number } : {}),
    ...(Number.isFinite(state.intrinsics.fov)
      ? { fov: state.intrinsics.fov as number }
      : {}),
  };
};

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) * 0.5;

export const interpolateLinear = (
  startValue: number,
  endValue: number,
  t: number
): number => startValue + (endValue - startValue) * t;

export const interpolateAngle = (
  startAngleRad: number,
  endAngleRad: number,
  t: number
): number =>
  startAngleRad + (negativePiToPi(endAngleRad - startAngleRad) as number) * t;

export const toCompassPitchDeg = (pitchRad: number): number =>
  Math.max(
    MIN_COMPASS_PITCH_DEG,
    Math.min(MAX_COMPASS_PITCH_DEG, radToDegNumeric(pitchRad))
  );

export const fromCompassPitchDeg = (pitchDeg: number): number =>
  degToRadNumeric(pitchDeg);

export const buildFromDerived = (
  derived: DerivedView,
  overrides: Partial<{
    bearing: number;
    pitch: number;
    range: number;
  }>,
  intrinsics: ViewState["intrinsics"],
  sourceId: string,
  source: ViewState["metadata"]["source"] = "user-interaction"
): ViewState => {
  const input: AngleBasedViewInput = {
    longitude: derived.longitude as number,
    latitude: derived.latitude as number,
    altitude: derived.altitude as number,
    bearing: overrides.bearing ?? (derived.bearing as number),
    pitch: overrides.pitch ?? (derived.pitch as number),
    range: overrides.range ?? (derived.range as number),
    intrinsics,
    metadata: {
      frameId: 0,
      timestampMs: Date.now(),
      sourceId,
      source,
    },
  };
  return buildViewState(input);
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const buildMapLibreCameraOptionsFromState = (
  state: ViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
} | null => {
  const view = deriveView(state, viewportWidthPx, viewportHeightPx);
  const lngDeg = radToDegNumeric(view.longitude as number);
  const latDeg = radToDegNumeric(view.latitude as number);
  const bearingDeg = radToDegNumeric(view.bearing as number);
  const pitchDeg = radToDegNumeric(view.pitch as number);

  if (
    !Number.isFinite(lngDeg) ||
    !Number.isFinite(latDeg) ||
    !Number.isFinite(view.zoom)
  ) {
    return null;
  }

  return {
    center: [lngDeg, latDeg],
    zoom: view.zoom,
    bearing: Number.isFinite(bearingDeg) ? bearingDeg : 0,
    pitch: Number.isFinite(pitchDeg) ? pitchDeg : 0,
  };
};

export const buildLeafletViewFromState = (
  state: ViewState,
  viewportWidthPx?: number,
  viewportHeightPx?: number
): { center: { lat: number; lng: number }; zoom: number } | null => {
  const view = deriveView(state, viewportWidthPx, viewportHeightPx);
  const lngDeg = radToDegNumeric(view.longitude as number);
  const latDeg = radToDegNumeric(view.latitude as number);

  if (
    !Number.isFinite(lngDeg) ||
    !Number.isFinite(latDeg) ||
    !Number.isFinite(view.zoom)
  ) {
    return null;
  }

  return {
    center: { lat: latDeg, lng: lngDeg },
    zoom: view.zoom + 1,
  };
};

export const isViewState = (
  value: ViewState | null | undefined
): value is ViewState =>
  Boolean(
    value &&
      typeof value === "object" &&
      value.anchor &&
      value.cameraPosition &&
      value.orientation &&
      value.anchorCartographic
  );
