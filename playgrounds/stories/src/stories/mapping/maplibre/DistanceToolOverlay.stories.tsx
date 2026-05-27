import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";

import {
  ANNOTATION_TYPES,
  ANNOTATION_LINE_COMPONENT_KINDS,
  formatMeasurementShortLabelToken,
  getAnnotationLineComponentCssColor,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";
import {
  createDistanceToolPlugin,
  createPointToolPlugin,
} from "@carma-mapping/annotations/builtin-tools";
import type {
  AddAnnotationOptions,
  AnnotationEdge,
  AnnotationNode,
  AnnotationNodeLink,
  AnnotationNodeLinkId,
  AnnotationToolDraftState,
  AnnotationToolDraftStore,
  AnnotationToolSessionContext,
  AnnotationToolVisualModelContext,
  AnnotationsStoreState,
  CesiumGeographicCoordinate,
  RuntimeEdgeRenderModel,
  RuntimePointLabelRenderModel,
  RuntimePointMarkerRenderModel,
  StoredAnnotation,
} from "@carma-mapping/annotations/runtime";
import {
  applyLineLabel,
  buildPreviewDistanceTriangleLabelReferences,
  measurementVisualDefaults,
  PointMarkerOverlayShell,
  previewLineLabelVisualDefaults,
  RUNTIME_POINT_LABEL_COORDINATE_SELECTION,
} from "@carma-mapping/annotations/runtime";
import {
  LibreContextProvider,
  useLibreContext,
} from "@carma-mapping/engines/maplibre";
import {
  POINT_LABEL_ATTACH,
  PointLabel,
  type PointLabelAttach,
} from "@carma-providers/label-overlay";
import { degToRad, formatLengthMeters } from "@carma-units";
import type { CssPixelPosition, Degrees, Radians } from "@carma-units";
import type { Meta, StoryObj } from "@storybook/react";
import maplibregl, {
  type CustomLayerInterface,
  type Map as MapLibreMap,
  type MapMouseEvent,
} from "maplibre-gl";
import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";

import {
  SAMPLE_MEASUREMENTS_STORY_CENTER,
  createSampleMeasurementAnnotationData,
  type MapLibreDistanceAnnotationData,
} from "./sample-distance-annotation-data";
import {
  SURFACE_TILE_LABELS,
  SURFACE_TILE_OPTIONS,
  WUPPERTAL_TERRAIN_SOURCE_ID,
  createWuppertalStoryStyle,
  type SurfaceTileMode,
} from "./maplibre-story-style";
import {
  removeMapLibreLod2Layer,
  syncMapLibreLod2Layer,
} from "./maplibre-lod2-layer";
import {
  BUGA_BRIDGE_ASSET_URI,
  BUGA_BRIDGE_POSITION,
  addModelAxesToScene,
  addBugaBridgeAssetToScene,
  disposeObject,
} from "./sample-gltf-asset";

import "maplibre-gl/dist/maplibre-gl.css";

const EARTH_RADIUS_METERS = 6371008.8;

const THREE_LAYER_ID = "carma-story-maplibre-distance-tool-three";
const THREE_DRAFT_LAYER_ID = "carma-story-maplibre-distance-tool-three-draft";
const GROUND_SOURCE_ID = "carma-story-maplibre-distance-tool-ground-source";
const GROUND_LAYER_ID = "carma-story-maplibre-distance-tool-ground";
const MEASUREMENT_LINE_WIDTH = measurementVisualDefaults.sizes.edgeStrokeWidth;
const AUTHORING_THREE_LINE_WIDTH_PX = 3;
const MODEL_AXES_LENGTH_METERS = 40;
const MEASUREMENT_DIRECT_COLOR = getAnnotationLineComponentCssColor(
  ANNOTATION_LINE_COMPONENT_KINDS.DIRECT
);
const MEASUREMENT_VERTICAL_COLOR = getAnnotationLineComponentCssColor(
  ANNOTATION_LINE_COMPONENT_KINDS.VERTICAL
);
const MEASUREMENT_HORIZONTAL_COLOR = getAnnotationLineComponentCssColor(
  ANNOTATION_LINE_COMPONENT_KINDS.HORIZONTAL
);
const CONTROL_CATEGORY_MAP = "Map settings";
const CONTROL_CATEGORY_LINE = "Line";
const CONTROL_CATEGORY_OVERLAY = "Overlay";

const DISTANCE_TRIANGLE_ANCHOR_END_COORDINATE = "end-coordinate";

type MapLibreDistanceToolStoryArgs = {
  lineWidthPx: number;
  showThreePrimitives: boolean;
  showThreeVerticalDrops: boolean;
  showGroundReference: boolean;
  showOverlay: boolean;
  showRuntimeBadgeLabels: boolean;
  showDistanceTriangle: boolean;
  showBugaBridge: boolean;
  showModelAxes: boolean;
  clickHeightOffsetMeters: number;
  fallbackAltitudeMeters: number;
  showAuthoringStatus: boolean;
  showDraftPreview: boolean;
  surfaceTiles: SurfaceTileMode;
  showLod2Buildings: boolean;
  terrainEnabled: boolean;
  terrainExaggeration: number;
  pitch: number;
  bearing: number;
  zoom: number;
};

type ThreeLayerSyncOptions = Pick<
  MapLibreDistanceToolStoryArgs,
  | "lineWidthPx"
  | "showThreePrimitives"
  | "showThreeVerticalDrops"
  | "showBugaBridge"
  | "showModelAxes"
> & {
  selectedMeasurementId: string | null;
  onProjectionSync?: (state: ThreeProjectionState) => void;
};

type RuntimeVisualModelsForStory = {
  points: readonly RuntimePointMarkerRenderModel[];
  edges: readonly RuntimeEdgeRenderModel[];
  pointLabels: readonly RuntimePointLabelRenderModel[];
};

type MapLibreRenderArgs = {
  defaultProjectionData?: {
    mainMatrix?: ArrayLike<number>;
  };
  modelViewProjectionMatrix?: ArrayLike<number>;
};

type ThreeProjectionState = {
  origin: {
    x: number;
    y: number;
    z: number;
  };
  matrix: number[];
  width: number;
  height: number;
};

type ScreenCoordinate = {
  coordinate: CesiumGeographicCoordinate;
  x: number;
  y: number;
  groundX: number;
  groundY: number;
};

type ProjectedPointMarker = RuntimePointMarkerRenderModel & {
  screen: ScreenCoordinate;
};

type ProjectedPointLabel = RuntimePointLabelRenderModel & {
  screen: ScreenCoordinate;
};

type ProjectedDistanceTriangle = {
  anchor: ScreenCoordinate;
  target: ScreenCoordinate;
  auxiliary: ScreenCoordinate;
  directOutsideReferencePoint: CssPixelPosition | null;
  verticalOutsideReferencePoint: CssPixelPosition | null;
  horizontalOutsideReferencePoint: CssPixelPosition | null;
  directLabelText: string;
  verticalLabelText: string;
  horizontalLabelText: string;
};

type ProjectedRuntimeEdge = RuntimeEdgeRenderModel & {
  screenCoordinates: ScreenCoordinate[];
  directLabelText: string;
  triangle: ProjectedDistanceTriangle | null;
};

type ProjectedLinkedNodeGroup = {
  id: string;
  x: number;
  y: number;
  count: number;
};

type ProjectedOverlayModels = {
  points: ProjectedPointMarker[];
  edges: ProjectedRuntimeEdge[];
  pointLabels: ProjectedPointLabel[];
  linkedNodeGroups: ProjectedLinkedNodeGroup[];
};

type TerrainClickQueryResult = {
  coordinate: CesiumGeographicCoordinate;
  screenPosition: CssPixelPosition;
  terrainElevationMeters: number | null;
  altitudeMeters: number;
  source: "terrain" | "fallback";
};

type CssVariableProperties = CSSProperties & Record<`--${string}`, string>;

const { DISTANCE: ANNOTATION_TYPE_DISTANCE } = ANNOTATION_TYPES;

const DEFAULT_FORMAT_OPTIONS = {
  lengthMeters: {
    locale: "de-DE",
    maximumFractionDigitsMeters: 1,
    maximumFractionDigitsKilometers: 2,
  },
} satisfies AnnotationToolVisualModelContext["formatOptions"];

const EMPTY_DRAFT_STATES =
  {} satisfies AnnotationToolVisualModelContext["draftStatesByToolType"];
const EMPTY_DRAFT_STATE: AnnotationToolDraftState = {
  coordinates: [],
  linkedNodeGroupIds: [],
};
const EMPTY_INTERACTIVE_DATA: MapLibreDistanceAnnotationData = {
  nodes: [],
  edges: [],
  linkedNodeGroups: [],
  annotationEntries: [],
};
const AUTHORING_STORAGE_KEY =
  "carma:stories:maplibre-distance-terrain-authoring:v1";

type PersistedAuthoringState = {
  version: 1;
  data: MapLibreDistanceAnnotationData;
};

const STORY_CENTER = SAMPLE_MEASUREMENTS_STORY_CENTER;

const storyShellStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  minHeight: 640,
  overflow: "hidden",
  background: "#d8dee9",
};

const mapContainerStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
};

const overlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};

const authoringStatusStyle: CSSProperties = {
  position: "absolute",
  left: 16,
  bottom: 16,
  display: "flex",
  alignItems: "center",
  gap: 10,
  maxWidth: "calc(100% - 32px)",
  padding: "8px 10px",
  background: "rgba(17, 24, 39, 0.78)",
  color: "#f8fafc",
  fontFamily: "Helvetica Neue, Arial, sans-serif",
  fontSize: 13,
  lineHeight: 1.35,
  pointerEvents: "auto",
};

const authoringStatusButtonStyle: CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.52)",
  background: "rgba(255, 255, 255, 0.14)",
  color: "#ffffff",
  cursor: "pointer",
  font: "inherit",
  padding: "4px 8px",
};

const finiteNumber = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? value : fallback;

const clampNumber = (
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
) => Math.min(max, Math.max(min, finiteNumber(value, fallback)));

const createThreeProjectionStateKey = (state: ThreeProjectionState) =>
  [
    state.width,
    state.height,
    state.origin.x.toFixed(12),
    state.origin.y.toFixed(12),
    state.origin.z.toFixed(12),
    ...state.matrix.map((value) => value.toFixed(8)),
  ].join("|");

const useMapLibreThreeProjectionState = () => {
  const projectionStateKeyRef = useRef("");
  const [threeProjectionState, setThreeProjectionState] =
    useState<ThreeProjectionState | null>(null);

  const handleThreeProjectionSync = useCallback(
    (state: ThreeProjectionState) => {
      const key = createThreeProjectionStateKey(state);

      if (projectionStateKeyRef.current === key) {
        return;
      }

      projectionStateKeyRef.current = key;
      // Keep DOM overlays on the same frame as the MapLibre custom layer.
      flushSync(() => {
        setThreeProjectionState(state);
      });
    },
    []
  );

  const resetThreeProjectionState = useCallback(() => {
    projectionStateKeyRef.current = "";
    setThreeProjectionState(null);
  }, []);

  return {
    handleThreeProjectionSync,
    resetThreeProjectionState,
    threeProjectionState,
  };
};

const isIgnorableMapLibreStoryError = (message: string | undefined) =>
  !message ||
  message === "__publicField is not defined" ||
  message === "Ge is not defined" ||
  message.startsWith(
    "AJAXError:  (400): https://geodaten.metropoleruhr.de/spw2"
  );

const toLocalMercatorVector = (
  coordinate: maplibregl.MercatorCoordinate,
  origin: maplibregl.MercatorCoordinate
) =>
  new THREE.Vector3(
    coordinate.x - origin.x,
    coordinate.y - origin.y,
    coordinate.z - origin.z
  );

const removeLayerIfPresent = (map: MapLibreMap, layerId: string) => {
  try {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  } catch {
    // MapLibre may already have disposed its style during Storybook unmount.
  }
};

const removeSourceIfPresent = (map: MapLibreMap, sourceId: string) => {
  try {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  } catch {
    // MapLibre may already have disposed its style during Storybook unmount.
  }
};

const normalizeCssColorForThree = (cssColor: string) => {
  const rgbaMatch = cssColor.match(
    /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*[^)]+\)$/i
  );

  if (rgbaMatch) {
    return `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
  }

  return cssColor;
};

const createThreeColor = (cssColor: string | undefined, fallback: string) => {
  const value = cssColor?.trim();
  if (!value || value.includes("display-p3")) {
    return new THREE.Color(fallback);
  }

  try {
    return new THREE.Color(normalizeCssColorForThree(value));
  } catch {
    return new THREE.Color(fallback);
  }
};

const isFiniteVector3 = (point: THREE.Vector3) =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  Number.isFinite(point.z);

const setLineGeometryUnbounded = (geometry: THREE.BufferGeometry) => {
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, 0),
    Number.POSITIVE_INFINITY
  );
};

const cloneDraftStates = (
  draftByToolType: ReadonlyMap<AnnotationToolId, AnnotationToolDraftState>
) => {
  const nextDraftStates: Partial<
    Record<AnnotationToolId, AnnotationToolDraftState>
  > = {};

  for (const [toolId, draft] of draftByToolType) {
    nextDraftStates[toolId] = draft;
  }

  return nextDraftStates;
};

const createInteractiveDistanceDraftStore = (
  onDraftStatesChange: (
    draftStates: Partial<Record<AnnotationToolId, AnnotationToolDraftState>>
  ) => void
): AnnotationToolDraftStore => {
  const draftByToolType = new Map<AnnotationToolId, AnnotationToolDraftState>();
  const listenersByToolType = new Map<AnnotationToolId, Set<() => void>>();

  const emit = (toolId: AnnotationToolId) => {
    onDraftStatesChange(cloneDraftStates(draftByToolType));
    listenersByToolType.get(toolId)?.forEach((listener) => listener());
  };

  return {
    get: (toolId) => draftByToolType.get(toolId) ?? EMPTY_DRAFT_STATE,
    set: (toolId, draft) => {
      draftByToolType.set(toolId, draft);
      emit(toolId);
    },
    clear: (toolId) => {
      draftByToolType.delete(toolId);
      emit(toolId);
    },
    subscribe: (toolId, listener) => {
      const listeners =
        listenersByToolType.get(toolId) ?? new Set<() => void>();
      listeners.add(listener);
      listenersByToolType.set(toolId, listeners);

      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByToolType.delete(toolId);
        }
      };
    },
  };
};

const queryMapLibreTerrainClickPosition = ({
  map,
  event,
  heightOffsetMeters,
  fallbackAltitudeMeters,
}: {
  map: MapLibreMap;
  event: MapMouseEvent;
  heightOffsetMeters: number;
  fallbackAltitudeMeters: number;
}): TerrainClickQueryResult => {
  const terrainElevation = map.queryTerrainElevation([
    event.lngLat.lng,
    event.lngLat.lat,
  ]);
  const source = Number.isFinite(terrainElevation) ? "terrain" : "fallback";
  const terrainAltitude =
    source === "terrain" ? terrainElevation : fallbackAltitudeMeters;
  const altitudeMeters =
    finiteNumber(terrainAltitude ?? undefined, fallbackAltitudeMeters) +
    heightOffsetMeters;

  return {
    coordinate: {
      longitude: event.lngLat.lng,
      latitude: event.lngLat.lat,
      altitude: altitudeMeters,
    },
    screenPosition: {
      x: event.point.x,
      y: event.point.y,
    } as CssPixelPosition,
    terrainElevationMeters: source === "terrain" ? terrainAltitude : null,
    altitudeMeters,
    source,
  };
};

const buildRuntimeVisualModels = ({
  args,
  data = createSampleMeasurementAnnotationData(),
  draftStatesByToolType = EMPTY_DRAFT_STATES,
  elevationReferenceAnnotationId,
  selectedAnnotationId,
  setElevationReferenceAnnotationId,
  setSelectedAnnotationId,
}: {
  args: MapLibreDistanceToolStoryArgs;
  data?: MapLibreDistanceAnnotationData;
  draftStatesByToolType?: AnnotationToolVisualModelContext["draftStatesByToolType"];
  elevationReferenceAnnotationId: string | null;
  selectedAnnotationId: string | null;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  setSelectedAnnotationId: (annotationId: string | null) => void;
}) => {
  const distanceTool = createDistanceToolPlugin({
    measurementLineStyleOptions: {
      strokeWidthPx: clampNumber(
        args.lineWidthPx,
        MEASUREMENT_LINE_WIDTH,
        0.5,
        6
      ),
    },
  });
  const pointTool = createPointToolPlugin();
  const visualModelContext: AnnotationToolVisualModelContext = {
    nodes: data.nodes,
    edges: data.edges,
    linkedNodeGroups: data.linkedNodeGroups,
    annotationEntries: data.annotationEntries,
    draftStatesByToolType,
    elevationReferenceAnnotationId,
    selectedAnnotationId,
    selectedAnnotationIds: selectedAnnotationId ? [selectedAnnotationId] : [],
    isSelectionAdditiveModifierPressed: false,
    setSelectedAnnotationId,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode: () => undefined,
    formatOptions: DEFAULT_FORMAT_OPTIONS,
  };
  const distanceVisualModels =
    distanceTool.visualModels?.build(visualModelContext);
  const pointVisualModels = pointTool.visualModels?.build(visualModelContext);

  return {
    data,
    visualModels: {
      points: [
        ...(distanceVisualModels?.points ?? []),
        ...(pointVisualModels?.points ?? []),
      ],
      edges: distanceVisualModels?.edges ?? [],
      pointLabels: [
        ...(distanceVisualModels?.pointLabels ?? []),
        ...(pointVisualModels?.pointLabels ?? []),
      ],
    } satisfies RuntimeVisualModelsForStory,
  };
};

const toGroundLineGeoJson = (
  edges: readonly RuntimeEdgeRenderModel[]
): GeoJSON.FeatureCollection<GeoJSON.LineString> => ({
  type: "FeatureCollection",
  features: edges.map((edge) => ({
    type: "Feature",
    properties: {
      id: edge.id,
    },
    geometry: {
      type: "LineString",
      coordinates: edge.coordinates.map((coordinate) => [
        coordinate.longitude,
        coordinate.latitude,
      ]),
    },
  })),
});

const toMercatorCoordinate = (coordinate: CesiumGeographicCoordinate) =>
  maplibregl.MercatorCoordinate.fromLngLat(
    [coordinate.longitude, coordinate.latitude],
    coordinate.altitude
  );

const horizontalDistanceMeters = (
  start: CesiumGeographicCoordinate,
  end: CesiumGeographicCoordinate
) => {
  const startLatitude = THREE.MathUtils.degToRad(start.latitude);
  const endLatitude = THREE.MathUtils.degToRad(end.latitude);
  const deltaLatitude = endLatitude - startLatitude;
  const deltaLongitude = THREE.MathUtils.degToRad(
    end.longitude - start.longitude
  );
  const sinLatitude = Math.sin(deltaLatitude / 2);
  const sinLongitude = Math.sin(deltaLongitude / 2);
  const haversine =
    sinLatitude * sinLatitude +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      sinLongitude *
      sinLongitude;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
  );
};

const directDistanceMeters = (
  start: CesiumGeographicCoordinate,
  end: CesiumGeographicCoordinate
) => {
  const horizontalDistance = horizontalDistanceMeters(start, end);
  const verticalDistance = end.altitude - start.altitude;
  return Math.hypot(horizontalDistance, verticalDistance);
};

const formatMeters = (meters: number) =>
  formatLengthMeters(meters, DEFAULT_FORMAT_OPTIONS.lengthMeters);

const midpoint = (start: ScreenCoordinate, end: ScreenCoordinate) =>
  ({
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
  } as CssPixelPosition);

const toCssPoint = (point: Pick<ScreenCoordinate, "x" | "y">) =>
  ({
    x: point.x,
    y: point.y,
  } as CssPixelPosition);

const clampOverlayPointToMap = (
  map: MapLibreMap,
  point: CssPixelPosition,
  marginPx = 36
) => {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;

  return {
    x: Math.min(width - marginPx, Math.max(marginPx, point.x)),
    y: Math.min(height - marginPx, Math.max(marginPx, point.y)),
  } as CssPixelPosition;
};

const clampScreenCoordinateToMap = (
  map: MapLibreMap,
  screen: ScreenCoordinate,
  marginPx = 36
): ScreenCoordinate => ({
  ...screen,
  ...clampOverlayPointToMap(map, toCssPoint(screen), marginPx),
});

const projectMercatorCoordinateWithMatrix = (
  state: ThreeProjectionState,
  matrix: THREE.Matrix4,
  mercatorCoordinate: Pick<maplibregl.MercatorCoordinate, "x" | "y" | "z">
) => {
  const clip = new THREE.Vector4(
    mercatorCoordinate.x - state.origin.x,
    mercatorCoordinate.y - state.origin.y,
    mercatorCoordinate.z - state.origin.z,
    1
  ).applyMatrix4(matrix);

  if (!Number.isFinite(clip.w) || Math.abs(clip.w) < 1e-12) {
    return null;
  }

  const normalizedX = clip.x / clip.w;
  const normalizedY = clip.y / clip.w;

  if (!Number.isFinite(normalizedX) || !Number.isFinite(normalizedY)) {
    return null;
  }

  return {
    x: ((normalizedX + 1) / 2) * state.width,
    y: ((1 - normalizedY) / 2) * state.height,
  };
};

const projectCoordinateWithThreeProjection = (
  state: ThreeProjectionState,
  coordinate: CesiumGeographicCoordinate
): ScreenCoordinate | null => {
  const matrix = new THREE.Matrix4().fromArray(state.matrix);
  const elevatedMercator = toMercatorCoordinate(coordinate);
  const groundMercator = toMercatorCoordinate({
    ...coordinate,
    altitude: 0,
  });
  const elevated = projectMercatorCoordinateWithMatrix(
    state,
    matrix,
    elevatedMercator
  );
  const ground = projectMercatorCoordinateWithMatrix(
    state,
    matrix,
    groundMercator
  );

  if (!elevated || !ground) {
    return null;
  }

  return {
    coordinate,
    x: elevated.x,
    y: elevated.y,
    groundX: ground.x,
    groundY: ground.y,
  };
};

const projectDistanceTriangleWithThreeProjection = (
  state: ThreeProjectionState,
  edge: RuntimeEdgeRenderModel
): ProjectedDistanceTriangle | null => {
  const startCoordinate = edge.coordinates[0];
  const endCoordinate = edge.coordinates[edge.coordinates.length - 1];

  if (
    !startCoordinate ||
    !endCoordinate ||
    edge.distanceTriangleOverlay === undefined
  ) {
    return null;
  }

  const anchorIsEnd =
    edge.distanceTriangleOverlay.anchorCoordinateRole ===
    DISTANCE_TRIANGLE_ANCHOR_END_COORDINATE;
  const anchorCoordinate = anchorIsEnd ? endCoordinate : startCoordinate;
  const targetCoordinate = anchorIsEnd ? startCoordinate : endCoordinate;
  const auxiliaryCoordinate: CesiumGeographicCoordinate = {
    longitude: anchorCoordinate.longitude,
    latitude: anchorCoordinate.latitude,
    altitude: targetCoordinate.altitude,
  };

  const anchor = projectCoordinateWithThreeProjection(state, anchorCoordinate);
  const target = projectCoordinateWithThreeProjection(state, targetCoordinate);
  const auxiliary = projectCoordinateWithThreeProjection(
    state,
    auxiliaryCoordinate
  );

  if (!anchor || !target || !auxiliary) {
    return null;
  }

  const labelReferences = buildPreviewDistanceTriangleLabelReferences({
    anchor,
    target,
    aux: auxiliary,
    anchorAltitudeMeters: anchorCoordinate.altitude,
    targetAltitudeMeters: targetCoordinate.altitude,
  });
  const horizontalDistance = horizontalDistanceMeters(
    auxiliaryCoordinate,
    targetCoordinate
  );
  const verticalDistance = Math.abs(
    auxiliaryCoordinate.altitude - anchorCoordinate.altitude
  );

  return {
    anchor,
    target,
    auxiliary,
    directOutsideReferencePoint: labelReferences.directOutsideReferencePoint,
    verticalOutsideReferencePoint:
      labelReferences.verticalOutsideReferencePoint,
    horizontalOutsideReferencePoint:
      labelReferences.horizontalOutsideReferencePoint,
    directLabelText: formatMeters(
      directDistanceMeters(anchorCoordinate, targetCoordinate)
    ),
    verticalLabelText: formatMeters(verticalDistance),
    horizontalLabelText: formatMeters(horizontalDistance),
  };
};

const projectPointLabelWithThreeProjection = (
  state: ThreeProjectionState,
  label: RuntimePointLabelRenderModel
): ProjectedPointLabel | null => {
  const projectedCandidates = label.coordinateCandidates
    ?.map((candidate) =>
      projectCoordinateWithThreeProjection(state, candidate.coordinate)
    )
    .filter(
      (candidate): candidate is ScreenCoordinate =>
        candidate !== null &&
        Number.isFinite(candidate.x) &&
        Number.isFinite(candidate.y)
    );
  const fallback = projectCoordinateWithThreeProjection(
    state,
    label.coordinate
  );

  if (!projectedCandidates?.length && !fallback) {
    return null;
  }

  let selectedScreen = projectedCandidates?.[0] ?? fallback;

  if (
    projectedCandidates?.length &&
    label.coordinateSelection ===
      RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
  ) {
    selectedScreen = projectedCandidates.reduce((leftMost, candidate) =>
      candidate.x < leftMost.x ? candidate : leftMost
    );
  }

  if (
    projectedCandidates?.length &&
    label.coordinateSelection ===
      RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE
  ) {
    selectedScreen = projectedCandidates.reduce((rightMost, candidate) =>
      candidate.x > rightMost.x ? candidate : rightMost
    );
  }

  if (!selectedScreen) {
    return null;
  }

  return {
    ...label,
    screen: selectedScreen,
  };
};

type DistanceToolThreeLayerConfig = {
  visualModels: RuntimeVisualModelsForStory;
  lineWidthPx: number;
  selectedMeasurementId: string | null;
  showThreePrimitives: boolean;
  showThreeVerticalDrops: boolean;
  showBugaBridge: boolean;
  showModelAxes: boolean;
  onProjectionSync?: (state: ThreeProjectionState) => void;
};

type DraftDistanceThreeLayerConfig = {
  anchorCoordinate: CesiumGeographicCoordinate;
  hoverCoordinate: CesiumGeographicCoordinate;
  lineWidthPx: number;
};

class DistanceToolThreeLayer implements CustomLayerInterface {
  id = THREE_LAYER_ID;
  type: "custom" = "custom";
  renderingMode: "3d" = "3d";

  private camera: THREE.Camera | null = null;
  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private readonly origin: maplibregl.MercatorCoordinate;
  private readonly screenLineMaterials: LineMaterial[] = [];
  private bridgeLoadCancelled = false;

  constructor(private readonly config: DistanceToolThreeLayerConfig) {
    const firstCoordinate =
      config.visualModels.edges[0]?.coordinates[0] ?? BUGA_BRIDGE_POSITION;
    this.origin = toMercatorCoordinate(firstCoordinate);
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;

    if (this.config.showThreePrimitives) {
      this.addRuntimeEdges();
    }

    if (this.config.showThreeVerticalDrops) {
      this.addVerticalDrops();
    }

    if (this.config.showBugaBridge) {
      this.addBugaBridgeAsset();
    }

    map.triggerRepaint();
  }

  render(
    _gl: WebGLRenderingContext | WebGL2RenderingContext,
    args: MapLibreRenderArgs
  ) {
    if (!this.camera || !this.renderer || !this.scene) return;

    const projectionMatrix =
      args.defaultProjectionData?.mainMatrix ?? args.modelViewProjectionMatrix;
    if (!projectionMatrix) return;

    this.syncScreenLineResolution();

    const mapProjection = new THREE.Matrix4().fromArray(
      Array.from(projectionMatrix)
    );
    const modelTransform = new THREE.Matrix4().makeTranslation(
      this.origin.x,
      this.origin.y,
      this.origin.z
    );

    this.camera.projectionMatrix = mapProjection.multiply(modelTransform);
    this.syncProjectionState();
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  onRemove() {
    this.bridgeLoadCancelled = true;
    if (this.scene) {
      disposeObject(this.scene);
    }
    this.camera = null;
    this.map = null;
    this.renderer = null;
    this.scene = null;
    this.screenLineMaterials.length = 0;
  }

  private syncScreenLineResolution() {
    for (const material of this.screenLineMaterials) {
      this.syncScreenLineMaterialResolution(material);
    }
  }

  private syncScreenLineMaterialResolution(material: LineMaterial) {
    const canvas = this.map?.getCanvas();
    if (!canvas) return;

    material.resolution.set(
      Math.max(1, canvas.clientWidth || canvas.width || 1),
      Math.max(1, canvas.clientHeight || canvas.height || 1)
    );
  }

  private registerScreenPixelLine(
    line: Line2 | LineSegments2,
    material: LineMaterial
  ) {
    this.screenLineMaterials.push(material);
    // MapLibre owns a DPR-scaled drawing buffer; keep LineMaterial in CSS pixels.
    line.onBeforeRender = () => {
      this.syncScreenLineMaterialResolution(material);
    };
    this.syncScreenLineMaterialResolution(material);
  }

  private syncProjectionState() {
    if (!this.camera || !this.map || !this.config.onProjectionSync) return;

    const canvas = this.map.getCanvas();
    this.config.onProjectionSync({
      origin: {
        x: this.origin.x,
        y: this.origin.y,
        z: this.origin.z,
      },
      matrix: Array.from(this.camera.projectionMatrix.elements),
      width: canvas.clientWidth || canvas.width,
      height: canvas.clientHeight || canvas.height,
    });
  }

  private addRuntimeEdges() {
    if (!this.scene) return;

    for (const edge of this.config.visualModels.edges) {
      const localPoints = edge.coordinates.map((coordinate) =>
        this.toLocalVector(coordinate)
      );
      if (localPoints.some((point) => !isFiniteVector3(point))) {
        continue;
      }

      const geometry = new LineGeometry();
      geometry.setPositions(localPoints.flatMap((point) => point.toArray()));
      setLineGeometryUnbounded(geometry);
      const material = new LineMaterial({
        color: createThreeColor(edge.stroke, "#ffffff").getHex(),
        linewidth: edge.strokeWidth,
        opacity: 0.96,
        transparent: true,
        worldUnits: false,
      });
      const line = new Line2(geometry, material);
      line.frustumCulled = false;
      this.registerScreenPixelLine(line, material);
      this.scene.add(line);
    }

    this.syncScreenLineResolution();
  }

  private addVerticalDrops() {
    if (!this.scene) return;

    const positions: number[] = [];
    for (const point of this.config.visualModels.points) {
      const elevatedPoint = this.toLocalVector(point.coordinate);
      const groundPoint = this.toLocalVector({
        ...point.coordinate,
        altitude: 0,
      });
      positions.push(
        elevatedPoint.x,
        elevatedPoint.y,
        elevatedPoint.z,
        groundPoint.x,
        groundPoint.y,
        groundPoint.z
      );
    }
    if (!positions.length) return;

    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    setLineGeometryUnbounded(geometry);
    const material = new LineMaterial({
      color: createThreeColor(MEASUREMENT_VERTICAL_COLOR, "#6fa8ff").getHex(),
      linewidth: this.config.lineWidthPx,
      opacity: 0.6,
      transparent: true,
      worldUnits: false,
    });
    const lines = new LineSegments2(geometry, material);
    lines.frustumCulled = false;
    this.registerScreenPixelLine(lines, material);
    this.scene.add(lines);
    this.syncScreenLineResolution();
  }

  private addBugaBridgeAsset() {
    if (!this.scene) return;

    addBugaBridgeAssetToScene({
      scene: this.scene,
      origin: this.origin,
      isCancelled: () => this.bridgeLoadCancelled || !this.scene || !this.map,
      onLoaded: (bridge) => {
        if (this.scene && this.config.showModelAxes) {
          addModelAxesToScene({
            scene: this.scene,
            name: bridge.name,
            length: MODEL_AXES_LENGTH_METERS,
            matrix: bridge.matrix,
          });
        }
        this.map?.triggerRepaint();
      },
      onError: (error) => {
        console.warn("[MapLibre distance-tool story] bridge GLB load failed", {
          source: BUGA_BRIDGE_ASSET_URI,
          error,
        });
        this.map?.triggerRepaint();
      },
    });
  }

  private toLocalVector(coordinate: CesiumGeographicCoordinate) {
    return toLocalMercatorVector(toMercatorCoordinate(coordinate), this.origin);
  }
}

class DraftDistanceThreeLayer implements CustomLayerInterface {
  id = THREE_DRAFT_LAYER_ID;
  type: "custom" = "custom";
  renderingMode: "3d" = "3d";

  private camera: THREE.Camera | null = null;
  private map: MapLibreMap | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private readonly origin: maplibregl.MercatorCoordinate;
  private screenLineMaterial: LineMaterial | null = null;

  constructor(private readonly config: DraftDistanceThreeLayerConfig) {
    this.origin = toMercatorCoordinate(config.anchorCoordinate);
  }

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.camera = new THREE.Camera();
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    });
    this.renderer.autoClear = false;
    this.addDraftLine();
    map.triggerRepaint();
  }

  render(
    _gl: WebGLRenderingContext | WebGL2RenderingContext,
    args: MapLibreRenderArgs
  ) {
    if (!this.camera || !this.renderer || !this.scene) return;

    const projectionMatrix =
      args.defaultProjectionData?.mainMatrix ?? args.modelViewProjectionMatrix;
    if (!projectionMatrix) return;

    this.syncScreenLineMaterialResolution();

    const mapProjection = new THREE.Matrix4().fromArray(
      Array.from(projectionMatrix)
    );
    const modelTransform = new THREE.Matrix4().makeTranslation(
      this.origin.x,
      this.origin.y,
      this.origin.z
    );

    this.camera.projectionMatrix = mapProjection.multiply(modelTransform);
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
  }

  onRemove() {
    if (this.scene) {
      disposeObject(this.scene);
    }
    this.camera = null;
    this.map = null;
    this.renderer = null;
    this.scene = null;
    this.screenLineMaterial = null;
  }

  private addDraftLine() {
    if (!this.scene) return;

    const points = [
      this.toLocalVector(this.config.anchorCoordinate),
      this.toLocalVector(this.config.hoverCoordinate),
    ];
    if (points.some((point) => !isFiniteVector3(point))) {
      return;
    }

    const geometry = new LineGeometry();
    geometry.setPositions(points.flatMap((point) => point.toArray()));
    setLineGeometryUnbounded(geometry);
    const material = new LineMaterial({
      color: createThreeColor(MEASUREMENT_DIRECT_COLOR, "#ffffff").getHex(),
      linewidth: clampNumber(
        this.config.lineWidthPx,
        MEASUREMENT_LINE_WIDTH,
        0.5,
        6
      ),
      opacity: 0.96,
      transparent: true,
      worldUnits: false,
    });
    const line = new Line2(geometry, material);
    line.frustumCulled = false;
    line.onBeforeRender = () => this.syncScreenLineMaterialResolution();
    this.screenLineMaterial = material;
    this.syncScreenLineMaterialResolution();
    this.scene.add(line);
  }

  private syncScreenLineMaterialResolution() {
    const canvas = this.map?.getCanvas();
    if (!canvas || !this.screenLineMaterial) return;

    this.screenLineMaterial.resolution.set(
      Math.max(1, canvas.clientWidth || canvas.width || 1),
      Math.max(1, canvas.clientHeight || canvas.height || 1)
    );
  }

  private toLocalVector(coordinate: CesiumGeographicCoordinate) {
    return toLocalMercatorVector(toMercatorCoordinate(coordinate), this.origin);
  }
}

const syncGroundLineLayer = (
  map: MapLibreMap,
  edges: readonly RuntimeEdgeRenderModel[],
  showGroundReference: boolean
) => {
  removeLayerIfPresent(map, GROUND_LAYER_ID);

  if (!showGroundReference) {
    removeSourceIfPresent(map, GROUND_SOURCE_ID);
    return;
  }

  const data = toGroundLineGeoJson(edges);
  const source = map.getSource(GROUND_SOURCE_ID) as
    | maplibregl.GeoJSONSource
    | undefined;

  if (source) {
    source.setData(data);
  } else {
    map.addSource(GROUND_SOURCE_ID, {
      type: "geojson",
      data,
    });
  }

  map.addLayer({
    id: GROUND_LAYER_ID,
    type: "line",
    source: GROUND_SOURCE_ID,
    paint: {
      "line-color": MEASUREMENT_HORIZONTAL_COLOR,
      "line-width": MEASUREMENT_LINE_WIDTH,
      "line-opacity": 0.68,
    },
  });
};

const syncThreeDistanceLayer = (
  map: MapLibreMap,
  options: ThreeLayerSyncOptions,
  visualModels: RuntimeVisualModelsForStory
) => {
  removeLayerIfPresent(map, THREE_LAYER_ID);

  if (
    options.showThreePrimitives !== true &&
    options.showThreeVerticalDrops !== true &&
    options.showBugaBridge !== true &&
    options.showModelAxes !== true &&
    !options.onProjectionSync
  ) {
    return;
  }

  map.addLayer(
    new DistanceToolThreeLayer({
      visualModels,
      lineWidthPx: finiteNumber(options.lineWidthPx, MEASUREMENT_LINE_WIDTH),
      selectedMeasurementId: options.selectedMeasurementId,
      showThreePrimitives: options.showThreePrimitives === true,
      showThreeVerticalDrops: options.showThreeVerticalDrops === true,
      showBugaBridge: options.showBugaBridge === true,
      showModelAxes: options.showModelAxes === true,
      onProjectionSync: options.onProjectionSync,
    })
  );
  map.triggerRepaint();
};

const syncThreeDraftDistanceLayer = (
  map: MapLibreMap,
  config: DraftDistanceThreeLayerConfig | null
) => {
  removeLayerIfPresent(map, THREE_DRAFT_LAYER_ID);

  if (!config) {
    return;
  }

  map.addLayer(new DraftDistanceThreeLayer(config));
  map.triggerRepaint();
};

const syncTerrain = (
  map: MapLibreMap,
  terrainEnabled: boolean,
  terrainExaggeration: number
) => {
  if (
    !WUPPERTAL_TERRAIN_SOURCE_ID ||
    !map.getSource(WUPPERTAL_TERRAIN_SOURCE_ID)
  ) {
    return;
  }

  if (terrainEnabled) {
    map.setTerrain({
      source: WUPPERTAL_TERRAIN_SOURCE_ID,
      exaggeration: clampNumber(terrainExaggeration, 1, 0, 4),
    });
  } else if (map.terrain) {
    map.setTerrain(null);
  }

  map.triggerRepaint();
};

const lineLabelStyle = (kind: "direct" | "vertical" | "horizontal") =>
  ({
    "--carma-annotation-overlay-line-label-font-family":
      previewLineLabelVisualDefaults.fontFamily,
    "--carma-annotation-overlay-line-label-font-weight": `${previewLineLabelVisualDefaults.fontWeight}`,
    "--carma-annotation-overlay-line-label-glow-color":
      measurementVisualDefaults.colors.componentLabelAccents[kind],
  } as CssVariableProperties);

const RuntimeLineLabel = ({
  end,
  flipReadingDirection,
  kind,
  outsideReferencePoint,
  start,
  text,
}: {
  end: Pick<ScreenCoordinate, "x" | "y">;
  flipReadingDirection?: boolean;
  kind: "direct" | "vertical" | "horizontal";
  outsideReferencePoint?: CssPixelPosition | null;
  start: Pick<ScreenCoordinate, "x" | "y">;
  text: string;
}) => {
  const elementRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    applyLineLabel({
      element,
      text,
      start,
      end,
      outsideReferencePoint,
      flipReadingDirection,
    });
  }, [
    end.x,
    end.y,
    flipReadingDirection,
    kind,
    outsideReferencePoint?.x,
    outsideReferencePoint?.y,
    start.x,
    start.y,
    text,
  ]);

  return (
    <div
      ref={elementRef}
      className="carma-annotation-overlay-line-label"
      data-annotation-overlay-line-label-kind={kind}
      data-annotation-overlay-line-label-short-edge-offset-px={
        previewLineLabelVisualDefaults.shortEdgeOffsetPx
      }
      data-annotation-overlay-line-label-theme={
        previewLineLabelVisualDefaults.theme
      }
      style={lineLabelStyle(kind)}
    >
      <div className="carma-annotation-overlay-line-label__frame">
        <div
          aria-hidden="true"
          className="carma-annotation-overlay-line-label__backdrop"
          data-annotation-overlay-line-label-background-style={
            previewLineLabelVisualDefaults.backgroundStyle
          }
        />
        <span
          className="carma-annotation-overlay-line-label__text"
          data-annotation-overlay-line-label-text="true"
        />
      </div>
    </div>
  );
};

const pointOverlayStyle = (
  screen: Pick<ScreenCoordinate, "x" | "y">,
  zIndex = 1200
): CSSProperties => ({
  position: "absolute",
  left: screen.x,
  top: screen.y,
  width: 0,
  height: 0,
  pointerEvents: "none",
  zIndex,
});

const pointLabelDistancePx = 28;

const mapLibrePitchToCesiumPitchRad = (mapPitchDeg: number): Radians =>
  degToRad((clampNumber(mapPitchDeg, 0, 0, 85) - 90) as Degrees);

const resolvePointLabelPlacement = (
  preferredAttach: PointLabelAttach | undefined
): {
  attach: PointLabelAttach;
  distance: number;
} => {
  if (preferredAttach === POINT_LABEL_ATTACH.LEFT) {
    return {
      attach: POINT_LABEL_ATTACH.RIGHT,
      distance: pointLabelDistancePx,
    };
  }

  if (preferredAttach === POINT_LABEL_ATTACH.RIGHT) {
    return {
      attach: POINT_LABEL_ATTACH.LEFT,
      distance: pointLabelDistancePx,
    };
  }

  return {
    attach: POINT_LABEL_ATTACH.LEFT,
    distance: pointLabelDistancePx,
  };
};

const RuntimePointMarkerOverlay = ({
  point,
}: {
  point: ProjectedPointMarker;
}) => (
  <div style={pointOverlayStyle(point.screen, 1150)}>
    <PointMarkerOverlayShell
      interactive={Boolean(
        point.onClick || point.onHoverChange || point.onLongPress
      )}
      longPressDurationMs={point.longPressDurationMs}
      markerStyle={{
        width: `${point.pixelSize}px`,
        height: `${point.pixelSize}px`,
        background: point.fill,
        border: `${point.outlineWidth}px solid ${point.outline}`,
      }}
      onClick={point.onClick}
      onHoverChange={point.onHoverChange}
      onLongPress={point.onLongPress}
    />
  </div>
);

const RuntimePointLabelOverlay = ({
  label,
  onSelect,
  pitch,
}: {
  label: ProjectedPointLabel;
  onSelect: (measurementId: string | null) => void;
  pitch: Radians;
}) => {
  const placement = resolvePointLabelPlacement(label.preferredAttach);
  const handleClick = () => {
    label.onClick?.();
    onSelect(label.measurementId ?? null);
  };
  const handleDoubleClick = () => {
    label.onDoubleClick?.();
    onSelect(label.measurementId ?? null);
  };

  return (
    <div style={pointOverlayStyle(label.screen, label.selected ? 1300 : 1200)}>
      <PointLabel
        badgeContent={label.badgeContent}
        collapse={label.collapse}
        content={label.content}
        fontFamily={label.fontFamily}
        fontSize={label.fontSize}
        fontWeight={label.fontWeight}
        hideLabelAndStem={label.hideLabelAndStem}
        hideMarker={label.hideMarker}
        hoverBackgroundColor={label.hoverBackgroundColor}
        labelAttach={placement.attach}
        labelDistance={placement.distance}
        labelStyle={label.labelStyle}
        lineColor={label.lineColor}
        longPressDurationMs={label.longPressDurationMs}
        markerBackgroundColor={label.markerBackgroundColor}
        markerCursor="pointer"
        markerOnlyPointerEvents={label.markerOnlyPointerEvents}
        markerSize={label.markerPixelSize}
        markerStrokeWidth={label.markerOutlineWidth}
        markerTextColor={label.markerTextColor}
        onClick={handleClick}
        onDoubleClick={label.onDoubleClick ? handleDoubleClick : undefined}
        onHoverChange={label.onHoverChange}
        onLongPress={label.onLongPress}
        pitch={pitch}
        pointId={label.id}
        preserveFillOnSelection={label.preserveFillOnSelection}
        selected={label.selected}
        selectedBackgroundColor={label.selectedBackgroundColor}
        selectedGlowColor={label.selectedGlowColor}
        selectedGlowRadiusPx={label.selectedGlowRadiusPx}
        selectedTextColor={label.selectedTextColor}
        stemStartDistance={label.stemStartDistance}
        textBackgroundColor={label.textBackgroundColor}
        textColor={label.textColor}
      />
    </div>
  );
};

const DistanceToolOverlay = ({
  lineWidthPx,
  projectedModels,
  showRuntimeBadgeLabels,
  showDistanceTriangle,
  onSelectMeasurement,
  pitch,
}: {
  lineWidthPx: number;
  projectedModels: ProjectedOverlayModels;
  showRuntimeBadgeLabels: boolean;
  showDistanceTriangle: boolean;
  onSelectMeasurement: (measurementId: string | null) => void;
  pitch: Radians;
}) => {
  const dashPattern = measurementVisualDefaults.patterns.edgeDashPattern;
  const dashedEdges = projectedModels.edges.filter(
    (edge) => edge.overlayDashed
  );
  const triangleEdges = showDistanceTriangle
    ? projectedModels.edges.filter((edge) => edge.triangle)
    : [];
  const hasDashedOverlayLines =
    dashedEdges.length > 0 || triangleEdges.length > 0;

  return (
    <>
      {hasDashedOverlayLines ? (
        <svg aria-hidden="true" style={overlayStyle}>
          {dashedEdges.map((edge) => {
            const points = edge.screenCoordinates
              .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
              .join(" ");

            return (
              <polyline
                key={`${edge.id}-overlay-dashed`}
                fill="none"
                points={points}
                stroke={edge.stroke}
                strokeDasharray={edge.overlayDashPattern ?? dashPattern}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={0.86}
                strokeWidth={resolveOverlayStrokeWidth(
                  edge.strokeWidth,
                  lineWidthPx
                )}
              />
            );
          })}
          {triangleEdges.flatMap((edge) => {
            const triangle = edge.triangle;
            if (!triangle) {
              return [];
            }

            return [
              <line
                key={`${edge.id}-overlay-vertical`}
                stroke={edge.stroke}
                strokeDasharray={edge.overlayDashPattern ?? dashPattern}
                strokeLinecap="round"
                strokeOpacity={0.94}
                strokeWidth={resolveOverlayStrokeWidth(
                  edge.strokeWidth,
                  lineWidthPx
                )}
                x1={triangle.anchor.x}
                x2={triangle.auxiliary.x}
                y1={triangle.anchor.y}
                y2={triangle.auxiliary.y}
              />,
              <line
                key={`${edge.id}-overlay-horizontal`}
                stroke={edge.stroke}
                strokeDasharray={edge.overlayDashPattern ?? dashPattern}
                strokeLinecap="round"
                strokeOpacity={0.94}
                strokeWidth={resolveOverlayStrokeWidth(
                  edge.strokeWidth,
                  lineWidthPx
                )}
                x1={triangle.auxiliary.x}
                x2={triangle.target.x}
                y1={triangle.auxiliary.y}
                y2={triangle.target.y}
              />,
              <circle
                key={`${edge.id}-auxiliary`}
                cx={triangle.auxiliary.x}
                cy={triangle.auxiliary.y}
                fill={edge.stroke}
                fillOpacity={0.9}
                r={3}
              />,
            ];
          })}
        </svg>
      ) : null}
      {projectedModels.points.map((point) => (
        <RuntimePointMarkerOverlay key={point.id} point={point} />
      ))}
      {projectedModels.edges.flatMap((edge) => {
        const first = edge.screenCoordinates[0];
        const last = edge.screenCoordinates[edge.screenCoordinates.length - 1];
        if (!first || !last) {
          return [];
        }

        const triangle = edge.triangle;

        return [
          <RuntimeLineLabel
            key={`${edge.id}-direct-label`}
            end={triangle?.target ?? last}
            kind="direct"
            outsideReferencePoint={
              triangle?.directOutsideReferencePoint ?? null
            }
            start={triangle?.anchor ?? first}
            text={edge.directLabelText}
          />,
        ];
      })}
      {showDistanceTriangle
        ? projectedModels.edges.flatMap((edge) => {
            const triangle = edge.triangle;
            if (!triangle) {
              return [];
            }

            return [
              <RuntimeLineLabel
                key={`${edge.id}-vertical-label`}
                end={triangle.auxiliary}
                flipReadingDirection
                kind="vertical"
                outsideReferencePoint={triangle.verticalOutsideReferencePoint}
                start={triangle.anchor}
                text={triangle.verticalLabelText}
              />,
              <RuntimeLineLabel
                key={`${edge.id}-horizontal-label`}
                end={triangle.target}
                kind="horizontal"
                outsideReferencePoint={triangle.horizontalOutsideReferencePoint}
                start={triangle.auxiliary}
                text={triangle.horizontalLabelText}
              />,
            ];
          })
        : null}
      {showRuntimeBadgeLabels
        ? projectedModels.pointLabels.map((label) => (
            <RuntimePointLabelOverlay
              key={label.id}
              label={label}
              onSelect={onSelectMeasurement}
              pitch={pitch}
            />
          ))
        : null}
    </>
  );
};

const resolveOverlayStrokeWidth = (
  strokeWidth: number,
  maxStrokeWidth: number
) =>
  Math.min(
    clampNumber(strokeWidth, MEASUREMENT_LINE_WIDTH, 0.5, 6),
    clampNumber(maxStrokeWidth, MEASUREMENT_LINE_WIDTH, 0.5, 6)
  );

type ProjectedDraftDistancePreview = {
  anchor: ScreenCoordinate;
  hover: ScreenCoordinate;
  labelText: string;
  strokeColor: string;
  strokeWidth: number;
};

const projectRuntimeEdgeWithThreeProjection = (
  state: ThreeProjectionState,
  edge: RuntimeEdgeRenderModel
): ProjectedRuntimeEdge | null => {
  const screenCoordinates = edge.coordinates
    .map((coordinate) =>
      projectCoordinateWithThreeProjection(state, coordinate)
    )
    .filter(
      (coordinate): coordinate is ScreenCoordinate => coordinate !== null
    );

  if (
    screenCoordinates.length !== edge.coordinates.length ||
    screenCoordinates.length < 2
  ) {
    return null;
  }

  const first = screenCoordinates[0];
  const last = screenCoordinates[screenCoordinates.length - 1];
  const firstCoordinate = edge.coordinates[0];
  const lastCoordinate = edge.coordinates[edge.coordinates.length - 1];

  if (!first || !last || !firstCoordinate || !lastCoordinate) {
    return null;
  }

  return {
    ...edge,
    screenCoordinates,
    directLabelText: formatMeters(
      directDistanceMeters(firstCoordinate, lastCoordinate)
    ),
    triangle: projectDistanceTriangleWithThreeProjection(state, edge),
  };
};

const EMPTY_PROJECTED_OVERLAY_MODELS: ProjectedOverlayModels = {
  points: [],
  edges: [],
  pointLabels: [],
  linkedNodeGroups: [],
};

const projectLinkedNodeGroupsWithThreeProjection = (
  state: ThreeProjectionState,
  data: MapLibreDistanceAnnotationData
): ProjectedLinkedNodeGroup[] => {
  const nodeCoordinateById = new Map(
    data.nodes.map((node) => [node.id, node.coordinate] as const)
  );

  return data.linkedNodeGroups.flatMap((group) => {
    const projected = group.nodeIds
      .map((nodeId) => {
        const coordinate = nodeCoordinateById.get(nodeId);
        return coordinate
          ? projectCoordinateWithThreeProjection(state, coordinate)
          : null;
      })
      .filter(
        (coordinate): coordinate is ScreenCoordinate => coordinate !== null
      );

    if (!projected.length) {
      return [];
    }

    return [
      {
        id: group.id,
        x:
          projected.reduce((sum, coordinate) => sum + coordinate.x, 0) /
          projected.length,
        y:
          projected.reduce((sum, coordinate) => sum + coordinate.y, 0) /
          projected.length,
        count: group.nodeIds.length,
      },
    ];
  });
};

const isScreenCoordinateInViewport = (
  state: ThreeProjectionState,
  point: Pick<ScreenCoordinate, "x" | "y">
) =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  point.x >= 0 &&
  point.x <= state.width &&
  point.y >= 0 &&
  point.y <= state.height;

const buildOutsideEndpointMeasurementIds = (
  state: ThreeProjectionState,
  edges: readonly ProjectedRuntimeEdge[]
) => {
  const measurementIds = new Set<string>();

  edges.forEach((edge) => {
    const first = edge.screenCoordinates[0];
    const last = edge.screenCoordinates[edge.screenCoordinates.length - 1];
    if (!edge.measurementId || !first || !last) {
      return;
    }

    if (
      !isScreenCoordinateInViewport(state, first) &&
      !isScreenCoordinateInViewport(state, last)
    ) {
      measurementIds.add(edge.measurementId);
    }
  });

  return measurementIds;
};

const projectOverlayModelsWithThreeProjection = ({
  projectionState,
  visualModels,
  data,
}: {
  projectionState: ThreeProjectionState;
  visualModels: RuntimeVisualModelsForStory;
  data: MapLibreDistanceAnnotationData;
}): ProjectedOverlayModels => {
  const edges = visualModels.edges
    .map((edge) => projectRuntimeEdgeWithThreeProjection(projectionState, edge))
    .filter((edge): edge is ProjectedRuntimeEdge => edge !== null);
  const outsideEndpointMeasurementIds = buildOutsideEndpointMeasurementIds(
    projectionState,
    edges
  );
  const points = visualModels.points
    .map((point) => {
      const screen = projectCoordinateWithThreeProjection(
        projectionState,
        point.coordinate
      );

      return screen ? { ...point, screen } : null;
    })
    .filter((point): point is ProjectedPointMarker => point !== null)
    .filter(
      (point) =>
        !point.measurementId ||
        !outsideEndpointMeasurementIds.has(point.measurementId)
    );
  const pointLabels = visualModels.pointLabels
    .map((label) =>
      projectPointLabelWithThreeProjection(projectionState, label)
    )
    .filter((label): label is ProjectedPointLabel => label !== null);

  return {
    points,
    edges,
    pointLabels,
    linkedNodeGroups: projectLinkedNodeGroupsWithThreeProjection(
      projectionState,
      data
    ),
  };
};

const useProjectedThreeOverlayModels = ({
  map,
  projectionState,
  visualModels,
  data,
  enabled,
}: {
  map: MapLibreMap | null;
  projectionState: ThreeProjectionState | null;
  visualModels: RuntimeVisualModelsForStory;
  data: MapLibreDistanceAnnotationData;
  enabled: boolean;
}) =>
  useMemo(() => {
    if (!map || !projectionState || !enabled) {
      return EMPTY_PROJECTED_OVERLAY_MODELS;
    }

    return projectOverlayModelsWithThreeProjection({
      projectionState,
      visualModels,
      data,
    });
  }, [data, enabled, map, projectionState, visualModels]);

const projectDraftDistancePreviewWithThreeProjection = ({
  projectionState,
  draftCoordinates,
  hoverQuery,
  lineWidthPx,
}: {
  projectionState: ThreeProjectionState;
  draftCoordinates: readonly CesiumGeographicCoordinate[];
  hoverQuery: TerrainClickQueryResult | null;
  lineWidthPx: number;
}): ProjectedDraftDistancePreview | null => {
  const anchorCoordinate = draftCoordinates[draftCoordinates.length - 1];
  const hoverCoordinate = hoverQuery?.coordinate ?? null;

  if (!anchorCoordinate || !hoverCoordinate) {
    return null;
  }

  const anchor = projectCoordinateWithThreeProjection(
    projectionState,
    anchorCoordinate
  );
  const hover = projectCoordinateWithThreeProjection(
    projectionState,
    hoverCoordinate
  );

  if (!anchor || !hover) {
    return null;
  }

  return {
    anchor,
    hover,
    labelText: formatMeters(
      directDistanceMeters(anchorCoordinate, hoverCoordinate)
    ),
    strokeColor: MEASUREMENT_DIRECT_COLOR,
    strokeWidth: resolveOverlayStrokeWidth(lineWidthPx, lineWidthPx),
  };
};

const DistanceAuthoringOverlay = ({
  map,
  projectionState,
  visualModels,
  data,
  draftCoordinates,
  hoverQuery,
  enabled,
  showRuntimeBadgeLabels,
  showDistanceTriangle,
  showDraftPreview,
  lineWidthPx,
  onSelectMeasurement,
}: {
  map: MapLibreMap | null;
  projectionState: ThreeProjectionState | null;
  visualModels: RuntimeVisualModelsForStory;
  data: MapLibreDistanceAnnotationData;
  draftCoordinates: readonly CesiumGeographicCoordinate[];
  hoverQuery: TerrainClickQueryResult | null;
  enabled: boolean;
  showRuntimeBadgeLabels: boolean;
  showDistanceTriangle: boolean;
  showDraftPreview: boolean;
  lineWidthPx: number;
  onSelectMeasurement: (measurementId: string | null) => void;
}) => {
  const projectedModels = useProjectedThreeOverlayModels({
    map,
    projectionState,
    visualModels,
    data,
    enabled,
  });
  const projectedEdges = projectedModels.edges;
  const projectedPointLabels = showRuntimeBadgeLabels
    ? projectedModels.pointLabels
    : [];

  const draftPreview = useMemo(() => {
    if (
      !map ||
      !projectionState ||
      !enabled ||
      !showDraftPreview ||
      draftCoordinates.length === 0
    ) {
      return null;
    }

    return projectDraftDistancePreviewWithThreeProjection({
      projectionState,
      draftCoordinates,
      hoverQuery,
      lineWidthPx,
    });
  }, [
    draftCoordinates,
    enabled,
    hoverQuery,
    lineWidthPx,
    map,
    projectionState,
    showDraftPreview,
  ]);

  if (!enabled || !map || !projectionState) {
    return null;
  }

  const dashPattern = measurementVisualDefaults.patterns.edgeDashPattern;
  const dashedEdges = projectedEdges.filter((edge) => edge.overlayDashed);
  const triangleEdges = showDistanceTriangle
    ? projectedEdges.filter((edge) => edge.triangle)
    : [];
  const hasDashedOverlayLines =
    dashedEdges.length > 0 || triangleEdges.length > 0 || draftPreview !== null;
  const labelPitch = mapLibrePitchToCesiumPitchRad(map.getPitch());

  return (
    <>
      {hasDashedOverlayLines ? (
        <svg aria-hidden="true" style={overlayStyle}>
          {dashedEdges.map((edge) => {
            const points = edge.screenCoordinates
              .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
              .join(" ");

            return (
              <polyline
                key={`${edge.id}-authoring-dashed`}
                fill="none"
                points={points}
                stroke={edge.stroke}
                strokeDasharray={edge.overlayDashPattern ?? dashPattern}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity={0.86}
                strokeWidth={resolveOverlayStrokeWidth(
                  edge.strokeWidth,
                  lineWidthPx
                )}
              />
            );
          })}
          {triangleEdges.flatMap((edge) => {
            const triangle = edge.triangle;
            if (!triangle) return [];

            return [
              <line
                key={`${edge.id}-authoring-vertical`}
                stroke={edge.stroke}
                strokeDasharray={edge.overlayDashPattern ?? dashPattern}
                strokeLinecap="round"
                strokeOpacity={0.94}
                strokeWidth={resolveOverlayStrokeWidth(
                  edge.strokeWidth,
                  lineWidthPx
                )}
                x1={triangle.anchor.x}
                x2={triangle.auxiliary.x}
                y1={triangle.anchor.y}
                y2={triangle.auxiliary.y}
              />,
              <line
                key={`${edge.id}-authoring-horizontal`}
                stroke={edge.stroke}
                strokeDasharray={edge.overlayDashPattern ?? dashPattern}
                strokeLinecap="round"
                strokeOpacity={0.94}
                strokeWidth={resolveOverlayStrokeWidth(
                  edge.strokeWidth,
                  lineWidthPx
                )}
                x1={triangle.auxiliary.x}
                x2={triangle.target.x}
                y1={triangle.auxiliary.y}
                y2={triangle.target.y}
              />,
            ];
          })}
          {draftPreview ? (
            <polyline
              fill="none"
              points={`${draftPreview.anchor.x.toFixed(
                1
              )},${draftPreview.anchor.y.toFixed(
                1
              )} ${draftPreview.hover.x.toFixed(
                1
              )},${draftPreview.hover.y.toFixed(1)}`}
              stroke={draftPreview.strokeColor}
              strokeDasharray={dashPattern}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.86}
              strokeWidth={draftPreview.strokeWidth}
            />
          ) : null}
        </svg>
      ) : null}
      {projectedEdges.flatMap((edge) => {
        const first = edge.screenCoordinates[0];
        const last = edge.screenCoordinates[edge.screenCoordinates.length - 1];
        if (!first || !last) {
          return [];
        }

        const triangle = edge.triangle;

        return [
          <RuntimeLineLabel
            key={`${edge.id}-authoring-direct-label`}
            end={triangle?.target ?? last}
            kind="direct"
            outsideReferencePoint={
              triangle?.directOutsideReferencePoint ?? null
            }
            start={triangle?.anchor ?? first}
            text={edge.directLabelText}
          />,
        ];
      })}
      {triangleEdges.flatMap((edge) => {
        const triangle = edge.triangle;
        if (!triangle) {
          return [];
        }

        return [
          <RuntimeLineLabel
            key={`${edge.id}-authoring-vertical-label`}
            end={triangle.auxiliary}
            flipReadingDirection
            kind="vertical"
            outsideReferencePoint={triangle.verticalOutsideReferencePoint}
            start={triangle.anchor}
            text={triangle.verticalLabelText}
          />,
          <RuntimeLineLabel
            key={`${edge.id}-authoring-horizontal-label`}
            end={triangle.target}
            kind="horizontal"
            outsideReferencePoint={triangle.horizontalOutsideReferencePoint}
            start={triangle.auxiliary}
            text={triangle.horizontalLabelText}
          />,
        ];
      })}
      {draftPreview ? (
        <RuntimeLineLabel
          end={draftPreview.hover}
          kind="direct"
          start={draftPreview.anchor}
          text={draftPreview.labelText}
        />
      ) : null}
      {projectedModels.points.map((point) => (
        <RuntimePointMarkerOverlay key={point.id} point={point} />
      ))}
      {projectedPointLabels.map((label) => (
        <RuntimePointLabelOverlay
          key={label.id}
          label={label}
          onSelect={onSelectMeasurement}
          pitch={labelPitch}
        />
      ))}
    </>
  );
};

const isPersistedAuthoringData = (
  value: unknown
): value is MapLibreDistanceAnnotationData => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MapLibreDistanceAnnotationData>;

  return (
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    Array.isArray(candidate.linkedNodeGroups) &&
    Array.isArray(candidate.annotationEntries)
  );
};

const readPersistedAuthoringData = (): MapLibreDistanceAnnotationData => {
  if (typeof window === "undefined") {
    return EMPTY_INTERACTIVE_DATA;
  }

  try {
    const rawValue = window.localStorage.getItem(AUTHORING_STORAGE_KEY);
    if (!rawValue) {
      return EMPTY_INTERACTIVE_DATA;
    }

    const parsed = JSON.parse(rawValue) as Partial<PersistedAuthoringState>;
    return parsed.version === 1 && isPersistedAuthoringData(parsed.data)
      ? parsed.data
      : EMPTY_INTERACTIVE_DATA;
  } catch {
    return EMPTY_INTERACTIVE_DATA;
  }
};

const hasAuthoringData = (data: MapLibreDistanceAnnotationData) =>
  data.annotationEntries.length > 0 ||
  data.nodes.length > 0 ||
  data.edges.length > 0 ||
  data.linkedNodeGroups.length > 0;

const writePersistedAuthoringData = (data: MapLibreDistanceAnnotationData) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!hasAuthoringData(data)) {
      window.localStorage.removeItem(AUTHORING_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      AUTHORING_STORAGE_KEY,
      JSON.stringify({ version: 1, data } satisfies PersistedAuthoringState)
    );
  } catch {
    // Story-only persistence should never break authoring.
  }
};

const readMaxNumericSuffix = (ids: readonly string[], prefix: string): number =>
  ids.reduce((maxSuffix, id) => {
    const expectedPrefix = `${prefix}-`;
    if (!id.startsWith(expectedPrefix)) {
      return maxSuffix;
    }

    const suffix = Number.parseInt(id.slice(expectedPrefix.length), 10);
    return Number.isFinite(suffix) ? Math.max(maxSuffix, suffix) : maxSuffix;
  }, 0);

const resolveAuthoringSequenceCounters = (
  data: MapLibreDistanceAnnotationData
) => ({
  measurements: readMaxNumericSuffix(
    data.annotationEntries.map((annotationEntry) => annotationEntry.id),
    ANNOTATION_TYPE_DISTANCE
  ),
  nodes: readMaxNumericSuffix(
    data.nodes.map((node) => node.id),
    "node"
  ),
  edges: readMaxNumericSuffix(
    data.edges.map((edge) => edge.id),
    "edge"
  ),
});

const createInteractiveInitialStoreState = (
  data: MapLibreDistanceAnnotationData = EMPTY_INTERACTIVE_DATA
) =>
  ({
    annotationToolType: ANNOTATION_TYPE_DISTANCE,
    selectionState: {
      selectedAnnotationIds: [],
      previousSelectedAnnotationId: null,
    },
    annotationEntries: data.annotationEntries,
    nodes: data.nodes,
    linkedNodeGroups: data.linkedNodeGroups,
    edges: data.edges,
    infoBoxState: {
      activeAnnotationId: null,
    },
    settingsState: {
      pointTemporaryMode: false,
      elevationReferenceAnnotationId: null,
      nextShortLabelCounterByToolType: {},
    },
  } satisfies AnnotationsStoreState);

const formatQueryCoordinate = (query: TerrainClickQueryResult | null) => {
  if (!query) return "last: none";

  const { coordinate } = query;
  return [
    `last: ${coordinate.latitude.toFixed(7)}, ${coordinate.longitude.toFixed(
      7
    )}`,
    `${formatMeters(query.altitudeMeters)} z`,
    query.source,
  ].join(" | ");
};

const AuthoringStatusBar = ({
  measurementCount,
  draftPointCount,
  lastQuery,
  onReset,
}: {
  measurementCount: number;
  draftPointCount: number;
  lastQuery: TerrainClickQueryResult | null;
  onReset: () => void;
}) => (
  <div style={authoringStatusStyle}>
    <span>distance tool</span>
    <span>{`draft ${draftPointCount}/2`}</span>
    <span>{`measurements ${measurementCount}`}</span>
    <span>{formatQueryCoordinate(lastQuery)}</span>
    <button onClick={onReset} style={authoringStatusButtonStyle} type="button">
      Reset
    </button>
  </div>
);

const MapLibreDistanceToolScene = (args: MapLibreDistanceToolStoryArgs) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCameraRef = useRef({
    bearing: clampNumber(args.bearing, -96, -180, 180),
    pitch: clampNumber(args.pitch, 70, 0, 85),
    zoom: clampNumber(args.zoom, 16.4, 13, 18),
  });
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [elevationReferenceAnnotationId, setElevationReferenceAnnotationId] =
    useState<string | null>(null);
  const { setMap, setMapStyle } = useLibreContext();
  const {
    handleThreeProjectionSync,
    resetThreeProjectionState,
    threeProjectionState,
  } = useMapLibreThreeProjectionState();

  const { data, visualModels } = useMemo(
    () =>
      buildRuntimeVisualModels({
        args,
        elevationReferenceAnnotationId,
        selectedAnnotationId,
        setElevationReferenceAnnotationId,
        setSelectedAnnotationId,
      }),
    [args, elevationReferenceAnnotationId, selectedAnnotationId]
  );

  const projectedModels = useProjectedThreeOverlayModels({
    map: mapInstance,
    projectionState: threeProjectionState,
    visualModels,
    data,
    enabled: args.showOverlay === true,
  });

  const threeLayerOptions = useMemo<ThreeLayerSyncOptions>(
    () => ({
      lineWidthPx: finiteNumber(args.lineWidthPx, MEASUREMENT_LINE_WIDTH),
      selectedMeasurementId: selectedAnnotationId,
      showThreePrimitives: args.showThreePrimitives === true,
      showThreeVerticalDrops: args.showThreeVerticalDrops === true,
      showBugaBridge: args.showBugaBridge === true,
      showModelAxes: args.showModelAxes === true,
      onProjectionSync:
        args.showOverlay === true ? handleThreeProjectionSync : undefined,
    }),
    [
      args.showOverlay,
      args.lineWidthPx,
      args.showBugaBridge,
      args.showModelAxes,
      args.showThreePrimitives,
      args.showThreeVerticalDrops,
      handleThreeProjectionSync,
      selectedAnnotationId,
    ]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createWuppertalStoryStyle(args.surfaceTiles),
      center: STORY_CENTER,
      zoom: initialCameraRef.current.zoom,
      pitch: initialCameraRef.current.pitch,
      bearing: initialCameraRef.current.bearing,
      maxPitch: 85,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showZoom: true, showCompass: true }),
      "top-right"
    );

    const handleReady = () => {
      setStyleReady(true);
      setMapStyle(map.getStyle());
    };
    const handleMapError = (event: { error?: Error }) => {
      const message = event.error?.message;
      if (!isIgnorableMapLibreStoryError(message)) {
        console.warn("[MapLibre distance-tool story]", message);
      }
    };

    map.on("load", handleReady);
    map.on("error", handleMapError);

    mapRef.current = map;
    setMapInstance(map);
    setMap(map);

    const resizeFrame = window.requestAnimationFrame(() => map.resize());

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      map.off("load", handleReady);
      map.off("error", handleMapError);
      setMap(null);
      setMapInstance(null);
      resetThreeProjectionState();
      setStyleReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, [args.surfaceTiles, resetThreeProjectionState, setMap, setMapStyle]);

  useEffect(() => {
    if (!mapInstance) return;

    mapInstance.jumpTo({
      center: STORY_CENTER,
      zoom: clampNumber(args.zoom, 16.4, 13, 18),
      pitch: clampNumber(args.pitch, 70, 0, 85),
      bearing: clampNumber(args.bearing, -96, -180, 180),
    });
  }, [args.bearing, args.pitch, args.zoom, mapInstance]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    syncTerrain(
      mapInstance,
      args.terrainEnabled === true,
      args.terrainExaggeration
    );
  }, [args.terrainEnabled, args.terrainExaggeration, mapInstance, styleReady]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    const sync = () => {
      if (!mapInstance.isStyleLoaded()) return;
      syncGroundLineLayer(
        mapInstance,
        visualModels.edges,
        args.showGroundReference
      );
      syncThreeDistanceLayer(mapInstance, threeLayerOptions, visualModels);
    };

    sync();
    mapInstance.on("style.load", sync);

    return () => {
      mapInstance.off("style.load", sync);
      removeLayerIfPresent(mapInstance, THREE_LAYER_ID);
      removeLayerIfPresent(mapInstance, GROUND_LAYER_ID);
      removeSourceIfPresent(mapInstance, GROUND_SOURCE_ID);
    };
  }, [
    args.showGroundReference,
    mapInstance,
    styleReady,
    threeLayerOptions,
    visualModels,
  ]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    let cancelled = false;
    const sync = () => {
      if (cancelled || !mapInstance.isStyleLoaded()) return;
      syncMapLibreLod2Layer({
        enabled: args.showLod2Buildings === true,
        keepLayerIdsOnTop: [THREE_LAYER_ID, THREE_DRAFT_LAYER_ID],
        map: mapInstance,
      }).catch((error: unknown) => {
        if (!cancelled) {
          console.warn("[MapLibre distance-tool story] LOD2 layer", error);
        }
      });
    };

    sync();
    mapInstance.on("style.load", sync);

    return () => {
      cancelled = true;
      mapInstance.off("style.load", sync);
      removeMapLibreLod2Layer(mapInstance);
    };
  }, [args.showLod2Buildings, mapInstance, styleReady]);

  return (
    <div style={storyShellStyle}>
      <div ref={containerRef} style={mapContainerStyle} />
      {args.showOverlay ? (
        <DistanceToolOverlay
          lineWidthPx={clampNumber(
            args.lineWidthPx,
            MEASUREMENT_LINE_WIDTH,
            0.5,
            6
          )}
          onSelectMeasurement={setSelectedAnnotationId}
          pitch={mapLibrePitchToCesiumPitchRad(
            mapInstance?.getPitch() ?? args.pitch
          )}
          projectedModels={projectedModels}
          showDistanceTriangle={args.showDistanceTriangle}
          showRuntimeBadgeLabels={args.showRuntimeBadgeLabels}
        />
      ) : null}
    </div>
  );
};

const MapLibreDistanceTerrainAuthoringScene = (
  args: MapLibreDistanceToolStoryArgs
) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCameraRef = useRef({
    bearing: clampNumber(args.bearing, -69, -180, 180),
    pitch: clampNumber(args.pitch, 64, 0, 85),
    zoom: clampNumber(args.zoom, 17.1, 13, 18),
  });
  const initialAuthoringDataRef = useRef<MapLibreDistanceAnnotationData | null>(
    null
  );
  if (initialAuthoringDataRef.current === null) {
    initialAuthoringDataRef.current = readPersistedAuthoringData();
  }
  const initialAuthoringData = initialAuthoringDataRef.current;
  const initialAuthoringCounters =
    resolveAuthoringSequenceCounters(initialAuthoringData);
  const measurementSequenceRef = useRef(initialAuthoringCounters.measurements);
  const nodeSequenceRef = useRef(initialAuthoringCounters.nodes);
  const edgeSequenceRef = useRef(initialAuthoringCounters.edges);
  const mapRef = useRef<MapLibreMap | null>(null);
  const runtimeStateRef = useRef<AnnotationsStoreState>(
    createInteractiveInitialStoreState(initialAuthoringData)
  );
  const draftStoreRef = useRef<AnnotationToolDraftStore | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [styleReady, setStyleReady] = useState(false);
  const [data, setData] =
    useState<MapLibreDistanceAnnotationData>(initialAuthoringData);
  const [draftStatesByToolType, setDraftStatesByToolType] = useState<
    Partial<Record<AnnotationToolId, AnnotationToolDraftState>>
  >({});
  const [hoverQuery, setHoverQuery] = useState<TerrainClickQueryResult | null>(
    null
  );
  const [lastQuery, setLastQuery] = useState<TerrainClickQueryResult | null>(
    null
  );
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [
    elevationReferenceAnnotationId,
    setElevationReferenceAnnotationIdState,
  ] = useState<string | null>(
    runtimeStateRef.current.settingsState.elevationReferenceAnnotationId
  );
  const { setMap, setMapStyle } = useLibreContext();
  const {
    handleThreeProjectionSync,
    resetThreeProjectionState,
    threeProjectionState,
  } = useMapLibreThreeProjectionState();

  if (!draftStoreRef.current) {
    draftStoreRef.current = createInteractiveDistanceDraftStore(
      setDraftStatesByToolType
    );
  }

  const draftStore = draftStoreRef.current;
  const distanceSessionTool = useMemo(() => createDistanceToolPlugin(), []);
  const setElevationReferenceAnnotationId = useCallback(
    (annotationId: string | null) => {
      runtimeStateRef.current = {
        ...runtimeStateRef.current,
        settingsState: {
          ...runtimeStateRef.current.settingsState,
          elevationReferenceAnnotationId: annotationId,
        },
      };
      setElevationReferenceAnnotationIdState(annotationId);
    },
    []
  );

  const addAnnotation = useCallback(
    (
      toolType: StoredAnnotation["toolType"],
      coordinates: readonly CesiumGeographicCoordinate[],
      options?: AddAnnotationOptions,
      linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
      sourceToolId?: AnnotationToolId
    ) => {
      const previousState = runtimeStateRef.current;
      const resolvedOptions =
        distanceSessionTool.addAnnotation?.resolveOptions({
          annotationType: toolType,
          toolId: sourceToolId ?? distanceSessionTool.id,
          scene: null,
          coordinates,
          options,
          linkedNodeGroupIds,
        }) ?? options;
      const nextShortLabel =
        resolvedOptions?.shortLabel?.trim() ||
        formatMeasurementShortLabelToken(
          toolType,
          previousState.annotationEntries.filter(
            (annotationEntry) => annotationEntry.toolType === toolType
          ).length + 1
        );
      measurementSequenceRef.current += 1;
      const annotationEntryId = `${toolType}-${measurementSequenceRef.current}`;
      const nodes: AnnotationNode[] = coordinates.map((coordinate) => {
        nodeSequenceRef.current += 1;

        return {
          id: `node-${nodeSequenceRef.current}`,
          coordinate,
        };
      });
      const linkedNodeGroups: AnnotationNodeLink[] = nodes.map(
        (node, index) => {
          const nodeLinkId = linkedNodeGroupIds?.[index];
          const normalizedNodeLinkId =
            typeof nodeLinkId === "string" && nodeLinkId.trim().length > 0
              ? nodeLinkId.trim()
              : node.id;

          return {
            id: normalizedNodeLinkId,
            nodeIds: [node.id],
          };
        }
      );
      const edges: AnnotationEdge[] = nodes
        .slice(0, -1)
        .flatMap((node, index) => {
          const endNode = nodes[index + 1];
          if (!endNode) return [];

          edgeSequenceRef.current += 1;

          return [
            {
              id: `edge-${edgeSequenceRef.current}`,
              startNodeId: node.id,
              endNodeId: endNode.id,
            },
          ];
        });
      const annotationEntry: StoredAnnotation = {
        id: annotationEntryId,
        toolType,
        ...resolvedOptions,
        shortLabel: nextShortLabel,
        nodeIds: nodes.map((node) => node.id),
        edgeIds: edges.map((edge) => edge.id),
      };

      runtimeStateRef.current = {
        ...previousState,
        annotationEntries: [
          ...previousState.annotationEntries,
          annotationEntry,
        ],
        nodes: [...previousState.nodes, ...nodes],
        linkedNodeGroups: [
          ...previousState.linkedNodeGroups,
          ...linkedNodeGroups,
        ],
        edges: [...previousState.edges, ...edges],
        selectionState: {
          previousSelectedAnnotationId:
            previousState.selectionState.selectedAnnotationIds[
              previousState.selectionState.selectedAnnotationIds.length - 1
            ] ?? null,
          selectedAnnotationIds: [annotationEntry.id],
        },
        infoBoxState: {
          activeAnnotationId: annotationEntry.id,
        },
      };
      setData((previousData) => ({
        nodes: [...previousData.nodes, ...nodes],
        edges: [...previousData.edges, ...edges],
        linkedNodeGroups: [
          ...previousData.linkedNodeGroups,
          ...linkedNodeGroups,
        ],
        annotationEntries: [...previousData.annotationEntries, annotationEntry],
      }));
      setSelectedAnnotationId(annotationEntry.id);

      return annotationEntry;
    },
    [distanceSessionTool]
  );

  const sessionContext = useMemo<AnnotationToolSessionContext>(
    () => ({
      getState: () => runtimeStateRef.current,
      dispatch: ((action) =>
        action) as AnnotationToolSessionContext["dispatch"],
      setActiveToolType: (toolId) => {
        runtimeStateRef.current = {
          ...runtimeStateRef.current,
          annotationToolType: toolId,
        };
      },
      drafts: draftStore,
      addAnnotation,
    }),
    [addAnnotation, draftStore]
  );
  const distanceSession = useMemo(
    () => distanceSessionTool.session?.createSession(sessionContext) ?? null,
    [distanceSessionTool, sessionContext]
  );

  useEffect(() => {
    distanceSession?.requestStart();

    return () => {
      distanceSession?.discardDraft();
    };
  }, [distanceSession]);

  useEffect(() => {
    writePersistedAuthoringData(data);
  }, [data]);

  const resetMeasurements = useCallback(() => {
    measurementSequenceRef.current = 0;
    nodeSequenceRef.current = 0;
    edgeSequenceRef.current = 0;
    draftStore.clear(ANNOTATION_TYPE_DISTANCE);
    runtimeStateRef.current = createInteractiveInitialStoreState();
    setData(EMPTY_INTERACTIVE_DATA);
    setHoverQuery(null);
    setLastQuery(null);
    setElevationReferenceAnnotationIdState(null);
    setSelectedAnnotationId(null);
  }, [draftStore]);

  const { visualModels } = useMemo(
    () =>
      buildRuntimeVisualModels({
        args,
        data,
        draftStatesByToolType,
        elevationReferenceAnnotationId,
        selectedAnnotationId,
        setElevationReferenceAnnotationId,
        setSelectedAnnotationId,
      }),
    [
      args,
      data,
      draftStatesByToolType,
      elevationReferenceAnnotationId,
      selectedAnnotationId,
      setElevationReferenceAnnotationId,
    ]
  );

  const draftCoordinates =
    draftStatesByToolType[ANNOTATION_TYPE_DISTANCE]?.coordinates ?? [];
  const draftThreeLineConfig =
    useMemo<DraftDistanceThreeLayerConfig | null>(() => {
      const anchorCoordinate = draftCoordinates[draftCoordinates.length - 1];
      const hoverCoordinate = hoverQuery?.coordinate ?? null;

      if (
        args.showThreePrimitives !== true ||
        args.showDraftPreview !== true ||
        !anchorCoordinate ||
        !hoverCoordinate
      ) {
        return null;
      }

      return {
        anchorCoordinate,
        hoverCoordinate,
        lineWidthPx: finiteNumber(args.lineWidthPx, MEASUREMENT_LINE_WIDTH),
      };
    }, [
      args.lineWidthPx,
      args.showDraftPreview,
      args.showThreePrimitives,
      draftCoordinates,
      hoverQuery,
    ]);

  const threeLayerOptions = useMemo<ThreeLayerSyncOptions>(
    () => ({
      lineWidthPx: finiteNumber(args.lineWidthPx, MEASUREMENT_LINE_WIDTH),
      selectedMeasurementId: selectedAnnotationId,
      showThreePrimitives: args.showThreePrimitives === true,
      showThreeVerticalDrops: args.showThreeVerticalDrops === true,
      showBugaBridge: args.showBugaBridge === true,
      showModelAxes: args.showModelAxes === true,
      onProjectionSync:
        args.showOverlay === true ? handleThreeProjectionSync : undefined,
    }),
    [
      args.showOverlay,
      handleThreeProjectionSync,
      args.lineWidthPx,
      args.showBugaBridge,
      args.showModelAxes,
      args.showThreePrimitives,
      args.showThreeVerticalDrops,
      selectedAnnotationId,
    ]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createWuppertalStoryStyle(args.surfaceTiles),
      center: STORY_CENTER,
      zoom: initialCameraRef.current.zoom,
      pitch: initialCameraRef.current.pitch,
      bearing: initialCameraRef.current.bearing,
      maxPitch: 85,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    });

    map.addControl(
      new maplibregl.NavigationControl({ showZoom: true, showCompass: true }),
      "top-right"
    );

    const handleReady = () => {
      setStyleReady(true);
      setMapStyle(map.getStyle());
    };
    const handleMapError = (event: { error?: Error }) => {
      const message = event.error?.message;
      if (!isIgnorableMapLibreStoryError(message)) {
        console.warn("[MapLibre distance-authoring story]", message);
      }
    };

    map.on("load", handleReady);
    map.on("error", handleMapError);

    mapRef.current = map;
    setMapInstance(map);
    setMap(map);

    const resizeFrame = window.requestAnimationFrame(() => map.resize());

    return () => {
      window.cancelAnimationFrame(resizeFrame);
      map.off("load", handleReady);
      map.off("error", handleMapError);
      setMap(null);
      setMapInstance(null);
      resetThreeProjectionState();
      setStyleReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, [args.surfaceTiles, resetThreeProjectionState, setMap, setMapStyle]);

  useEffect(() => {
    if (!mapInstance) return;

    mapInstance.jumpTo({
      center: STORY_CENTER,
      zoom: clampNumber(args.zoom, 17.1, 13, 18),
      pitch: clampNumber(args.pitch, 64, 0, 85),
      bearing: clampNumber(args.bearing, -69, -180, 180),
    });
  }, [args.bearing, args.pitch, args.zoom, mapInstance]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    syncTerrain(
      mapInstance,
      args.terrainEnabled === true,
      args.terrainExaggeration
    );
  }, [args.terrainEnabled, args.terrainExaggeration, mapInstance, styleReady]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    const heightOffsetMeters = finiteNumber(args.clickHeightOffsetMeters, 0);
    const fallbackAltitudeMeters = finiteNumber(args.fallbackAltitudeMeters, 0);
    const queryEvent = (event: MapMouseEvent) =>
      queryMapLibreTerrainClickPosition({
        map: mapInstance,
        event,
        heightOffsetMeters,
        fallbackAltitudeMeters,
      });
    const handleClick = (event: MapMouseEvent) => {
      const query = queryEvent(event);
      setLastQuery(query);
      setHoverQuery(null);
      distanceSession?.onNodeCreated(query.coordinate, null);
      mapInstance.triggerRepaint();
    };
    const handleMouseMove = (event: MapMouseEvent) => {
      if (
        !args.showDraftPreview ||
        draftStore.get(ANNOTATION_TYPE_DISTANCE).coordinates.length === 0
      ) {
        setHoverQuery(null);
        return;
      }

      setHoverQuery(queryEvent(event));
    };
    const clearHover = () => setHoverQuery(null);
    const canvas = mapInstance.getCanvas();
    const previousCursor = canvas.style.cursor;

    canvas.style.cursor = "crosshair";
    mapInstance.on("click", handleClick);
    mapInstance.on("mousemove", handleMouseMove);
    mapInstance.on("mouseout", clearHover);

    return () => {
      canvas.style.cursor = previousCursor;
      mapInstance.off("click", handleClick);
      mapInstance.off("mousemove", handleMouseMove);
      mapInstance.off("mouseout", clearHover);
    };
  }, [
    args.clickHeightOffsetMeters,
    args.fallbackAltitudeMeters,
    args.showDraftPreview,
    distanceSession,
    draftStore,
    mapInstance,
    styleReady,
  ]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    const sync = () => {
      if (!mapInstance.isStyleLoaded()) return;
      syncGroundLineLayer(
        mapInstance,
        visualModels.edges,
        args.showGroundReference
      );
      syncThreeDistanceLayer(mapInstance, threeLayerOptions, visualModels);
    };

    sync();
    mapInstance.on("style.load", sync);

    return () => {
      mapInstance.off("style.load", sync);
      removeLayerIfPresent(mapInstance, THREE_LAYER_ID);
      removeLayerIfPresent(mapInstance, GROUND_LAYER_ID);
      removeSourceIfPresent(mapInstance, GROUND_SOURCE_ID);
    };
  }, [
    args.showGroundReference,
    mapInstance,
    styleReady,
    threeLayerOptions,
    visualModels,
  ]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    const sync = () => {
      if (!mapInstance.isStyleLoaded()) return;
      syncThreeDraftDistanceLayer(mapInstance, draftThreeLineConfig);
    };

    sync();
    mapInstance.on("style.load", sync);

    return () => {
      mapInstance.off("style.load", sync);
      removeLayerIfPresent(mapInstance, THREE_DRAFT_LAYER_ID);
    };
  }, [draftThreeLineConfig, mapInstance, styleReady]);

  useEffect(() => {
    if (!mapInstance || !styleReady) return;

    let cancelled = false;
    const sync = () => {
      if (cancelled || !mapInstance.isStyleLoaded()) return;
      syncMapLibreLod2Layer({
        enabled: args.showLod2Buildings === true,
        keepLayerIdsOnTop: [THREE_LAYER_ID, THREE_DRAFT_LAYER_ID],
        map: mapInstance,
      }).catch((error: unknown) => {
        if (!cancelled) {
          console.warn("[MapLibre distance-authoring story] LOD2 layer", error);
        }
      });
    };

    sync();
    mapInstance.on("style.load", sync);

    return () => {
      cancelled = true;
      mapInstance.off("style.load", sync);
      removeMapLibreLod2Layer(mapInstance);
    };
  }, [args.showLod2Buildings, mapInstance, styleReady]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      distanceSessionTool.keyboard?.onKeyDown({
        event,
        activeToolType: ANNOTATION_TYPE_DISTANCE,
        activeToolSession: distanceSession,
        requestFinishMeasurement: () =>
          distanceSession?.requestFinish() ?? false,
        requestActivateTool: () => {
          distanceSession?.requestStart();
        },
        requestModeChange: (toolId) => {
          runtimeStateRef.current = {
            ...runtimeStateRef.current,
            annotationToolType: toolId,
          };
        },
        sessionContext,
      });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [distanceSession, distanceSessionTool, sessionContext]);

  return (
    <div style={storyShellStyle}>
      <div ref={containerRef} style={mapContainerStyle} />
      <DistanceAuthoringOverlay
        data={data}
        draftCoordinates={draftCoordinates}
        enabled={args.showOverlay === true}
        hoverQuery={hoverQuery}
        lineWidthPx={clampNumber(
          args.lineWidthPx,
          MEASUREMENT_LINE_WIDTH,
          0.5,
          6
        )}
        map={mapInstance}
        onSelectMeasurement={setSelectedAnnotationId}
        projectionState={threeProjectionState}
        showDistanceTriangle={args.showDistanceTriangle}
        showDraftPreview={args.showDraftPreview}
        showRuntimeBadgeLabels={args.showRuntimeBadgeLabels}
        visualModels={visualModels}
      />
      {args.showAuthoringStatus ? (
        <AuthoringStatusBar
          draftPointCount={draftCoordinates.length}
          lastQuery={lastQuery}
          measurementCount={data.annotationEntries.length}
          onReset={resetMeasurements}
        />
      ) : null}
    </div>
  );
};

const MapLibreDistanceToolStory = (args: MapLibreDistanceToolStoryArgs) => (
  <LibreContextProvider>
    <MapLibreDistanceToolScene {...args} />
  </LibreContextProvider>
);

const MapLibreDistanceTerrainAuthoringStory = (
  args: MapLibreDistanceToolStoryArgs
) => (
  <LibreContextProvider>
    <MapLibreDistanceTerrainAuthoringScene {...args} />
  </LibreContextProvider>
);

const meta: Meta<MapLibreDistanceToolStoryArgs> = {
  title: "MapLibre Playground",
  render: (args) => <MapLibreDistanceToolStory {...args} />,
  args: {
    lineWidthPx: MEASUREMENT_LINE_WIDTH,
    showThreePrimitives: true,
    showThreeVerticalDrops: false,
    showGroundReference: false,
    showOverlay: true,
    showRuntimeBadgeLabels: true,
    showDistanceTriangle: false,
    showBugaBridge: true,
    showModelAxes: false,
    clickHeightOffsetMeters: 0,
    fallbackAltitudeMeters: 0,
    showAuthoringStatus: true,
    showDraftPreview: true,
    surfaceTiles: "stadtplan",
    showLod2Buildings: false,
    terrainEnabled: true,
    terrainExaggeration: 1,
    pitch: 70,
    bearing: -96,
    zoom: 16.4,
  },
  argTypes: {
    lineWidthPx: {
      control: { type: "range", min: 0.5, max: 6, step: 0.5 },
      description:
        "Distance tool measurementLineStyleOptions.strokeWidthPx; used by the runtime edge model and overlay.",
      table: { category: CONTROL_CATEGORY_LINE },
    },
    showThreePrimitives: {
      control: { type: "boolean" },
      table: { category: CONTROL_CATEGORY_LINE },
    },
    showThreeVerticalDrops: {
      control: { type: "boolean" },
      description:
        "Render ground-to-elevated drop lines in the MapLibre Three custom layer.",
      table: { category: CONTROL_CATEGORY_OVERLAY },
    },
    showGroundReference: {
      control: { type: "boolean" },
      table: { category: CONTROL_CATEGORY_OVERLAY },
    },
    showOverlay: {
      control: { type: "boolean" },
      table: { category: CONTROL_CATEGORY_OVERLAY },
    },
    showRuntimeBadgeLabels: {
      if: { arg: "showOverlay", eq: true },
      control: { type: "boolean" },
      table: { category: CONTROL_CATEGORY_OVERLAY },
    },
    showDistanceTriangle: {
      if: { arg: "showOverlay", eq: true },
      control: { type: "boolean" },
      table: { category: CONTROL_CATEGORY_OVERLAY },
    },
    showBugaBridge: {
      name: "show 3D bridge asset",
      control: { type: "boolean" },
      table: { category: CONTROL_CATEGORY_MAP },
    },
    showModelAxes: {
      name: "show model axes",
      control: { type: "boolean" },
      description:
        "Show generic local axes for each Three.js model in the story scene.",
      table: { category: CONTROL_CATEGORY_MAP },
    },
    clickHeightOffsetMeters: {
      name: "click height offset",
      control: { type: "range", min: -50, max: 250, step: 1 },
      description:
        "Meters added to the MapLibre terrain elevation returned for each authored point.",
      table: { category: CONTROL_CATEGORY_LINE },
    },
    fallbackAltitudeMeters: {
      name: "fallback altitude",
      control: { type: "range", min: 0, max: 400, step: 1 },
      description:
        "Altitude used when MapLibre cannot return terrain elevation for a clicked point.",
      table: { category: CONTROL_CATEGORY_LINE },
    },
    showAuthoringStatus: {
      name: "show authoring status",
      control: { type: "boolean" },
      table: { category: CONTROL_CATEGORY_OVERLAY },
    },
    showDraftPreview: {
      name: "show draft preview",
      control: { type: "boolean" },
      table: { category: CONTROL_CATEGORY_OVERLAY },
    },
    terrainEnabled: {
      name: "render terrain surface",
      control: { type: "boolean" },
      description:
        "Render MapLibre raster-dem terrain. Disable when the terrain tile skirts get in the way of inspecting the custom geometry.",
      table: { category: CONTROL_CATEGORY_MAP },
    },
    surfaceTiles: {
      name: "basemap",
      options: SURFACE_TILE_OPTIONS,
      control: { type: "inline-radio", labels: SURFACE_TILE_LABELS },
      description: "Vector map or Luftbild raster basemap.",
      table: { category: CONTROL_CATEGORY_MAP },
    },
    showLod2Buildings: {
      name: "show LOD2 buildings",
      control: { type: "boolean" },
      description:
        "Load the basemap.de LOD2 buildings as an optional MapLibre custom layer.",
      table: { category: CONTROL_CATEGORY_MAP },
    },
    terrainExaggeration: {
      if: { arg: "terrainEnabled", eq: true },
      control: { type: "range", min: 0, max: 4, step: 0.1 },
      table: { category: CONTROL_CATEGORY_MAP },
    },
    pitch: {
      control: { type: "range", min: 0, max: 85, step: 1 },
      table: { category: CONTROL_CATEGORY_MAP },
    },
    bearing: {
      control: { type: "range", min: -180, max: 180, step: 1 },
      table: { category: CONTROL_CATEGORY_MAP },
    },
    zoom: {
      control: { type: "range", min: 13, max: 18, step: 0.1 },
      table: { category: CONTROL_CATEGORY_MAP },
    },
  },
  parameters: {
    controls: {
      include: [
        "render terrain surface",
        "basemap",
        "show LOD2 buildings",
        "terrainExaggeration",
        "pitch",
        "bearing",
        "zoom",
        "lineWidthPx",
        "showThreePrimitives",
        "showThreeVerticalDrops",
        "showGroundReference",
        "showOverlay",
        "showRuntimeBadgeLabels",
        "showDistanceTriangle",
        "show 3D bridge asset",
        "show model axes",
      ],
    },
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const DistanceToolOverlayMapLibreThree: Story = {
  name: "Distance Tool Overlay (MapLibre + Three)",
  args: {
    surfaceTiles: "luftbild",
  },
};

export const DistanceToolTerrainAuthoringMapLibreThree: Story = {
  name: "Distance Tool Terrain Authoring (MapLibre + Three)",
  render: (args) => <MapLibreDistanceTerrainAuthoringStory {...args} />,
  args: {
    lineWidthPx: AUTHORING_THREE_LINE_WIDTH_PX,
    showThreePrimitives: true,
    showThreeVerticalDrops: false,
    showGroundReference: false,
    showOverlay: true,
    showRuntimeBadgeLabels: true,
    showDistanceTriangle: false,
    showBugaBridge: true,
    showModelAxes: false,
    clickHeightOffsetMeters: 0,
    fallbackAltitudeMeters: 0,
    showAuthoringStatus: true,
    showDraftPreview: true,
    surfaceTiles: "luftbild",
    showLod2Buildings: false,
    terrainEnabled: true,
    terrainExaggeration: 1,
    pitch: 64,
    bearing: -69,
    zoom: 17.1,
  },
  parameters: {
    controls: {
      include: [
        "render terrain surface",
        "basemap",
        "show LOD2 buildings",
        "terrainExaggeration",
        "pitch",
        "bearing",
        "zoom",
        "lineWidthPx",
        "click height offset",
        "fallback altitude",
        "showThreePrimitives",
        "showThreeVerticalDrops",
        "showGroundReference",
        "showOverlay",
        "showRuntimeBadgeLabels",
        "showDistanceTriangle",
        "show 3D bridge asset",
        "show model axes",
        "show draft preview",
        "show authoring status",
      ],
    },
    layout: "fullscreen",
  },
};
