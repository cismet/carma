/* @refresh reset */
import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useRef,
  Dispatch,
  SetStateAction,
  useEffect,
} from "react";
import {
  Cartesian2,
  Cartesian3,
  Cartesian4,
  BoundingSphere,
  type Scene,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  cartesian3FromJson,
  getEllipsoidalAltitudeOrZero,
  getDegreesFromCartesian,
  getLocalUpDirectionAtAnchor,
  getPositionFromLocalFrame,
  getPositionInLocalFrame,
  getPositionWithVerticalOffsetFromAnchor,
  getSignedAngleDegAroundAxis,
  normalizeDirection,
  projectPointToHorizontalPlaneAtAnchor,
  resolveLocalFrameVectors,
} from "@carma/cesium";
import { useLabelOverlay } from "@carma-providers/label-overlay";

import {
  isKeyboardTargetEditable,
  normalizeOptions,
} from "@carma-commons/utils";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  DEFAULT_LINEAR_SEGMENT_LINE_MODE,
  DEFAULT_POINT_LABEL_METRIC_MODE,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  SELECT_TOOL_TYPE,
  AnnotationContextsProvider,
  PLANAR_TOOL_CREATION_MODE_POLYGON,
  PLANAR_TOOL_CREATION_MODE_POLYLINE,
  isPointAnnotationEntry,
  type AnnotationEditContextType,
  type AnnotationModeOptionsContextType,
  type AnnotationSelectionContextType,
  type AnnotationVisibilityContextType,
  type AnnotationsContextType,
  type AnnotationCollection,
  type AnnotationEntry,
  useAnnotationEditState,
  useAnnotationEntryMutations,
  useAnnotationCoreState,
  useAnnotationSelectionMutations,
  useAnnotationVisibilityState,
  useAnnotationCollectionSelectors,
  useAnnotationPointMarkerBadges,
  useSelectionToolState,
  normalizeLabelAppearance,
  buildPointGeometryRows,
  buildDesiredPointLabelAnchorById,
  buildStandaloneDistancePointSets,
  applyDesiredPointLabelAnchors,
  collectCollapsedPillPointIds,
  collectPointIdsWithoutSelfLabelAnchor,
  collectLabelAnchorPointIdsWithForcedVisibility,
  applyLabelAppearance,
  formatNumber,
  getCustomPointAnnotationName,
  type AnnotationGeometryEdge,
  type AnnotationGeometryPoint,
  type AnnotationLabelAnchor,
  type AnnotationLabelAppearance,
  type AnnotationMode,
  type AnnotationPersistenceEnvelopeV2,
  type AnnotationCreatePayload,
  type PlanarGroupBadgeKind,
  type PlanarToolCreationMode,
  type PlanarPolygonGroup,
  type PlanarPolygonGroupVertex,
  type PlanarPolygonPlane,
  type PlanarPolygonSourceKind,
  type PolygonSurfacePreset,
  type PointDistanceRelation,
  type PointLabelMetricMode,
  type ReferenceLineLabelKind,
  type DirectLineLabelMode,
  type LinearSegmentLineMode,
  type AnnotationListType,
} from "@carma-mapping/annotations/core";

import { useCesiumContext } from "@carma-mapping/engines/cesium";
import { flyToBoundingSphereExtent } from "@carma-mapping/engines/cesium/api";

import {
  useCesiumOverlaySync,
  type CesiumLabelLayoutConfigOverrides,
  type PointMarkerBadge,
} from "@carma-mapping/annotations/cesium";
import {
  ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE,
  ANNOTATION_LIVE_PREVIEW_TYPE_NONE,
  ANNOTATION_LIVE_PREVIEW_TYPE_POINT,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL,
  ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE,
  type AnnotationLivePreviewDescriptor,
  useAnnotationLivePreviewState,
} from "./hooks/useAnnotationLivePreviewState";
import { useAnnotationVisualizerAdapter } from "./hooks/useAnnotationVisualizerAdapter";
import { usePointCreateConfigState } from "./hooks/usePointCreateConfigState";
import { usePointQueryCreationController } from "./hooks/usePointQueryCreationController";
import { useAnnotationPointEditingController } from "./hooks/useAnnotationPointEditingController";
import {
  getNextPointLabelMetricMode,
  runPointLabelClickInteraction,
} from "./utils/pointLabelInteractions";
import {
  applyDeltaToSelectedPoints,
  computeMoveDelta,
  getSelectedPointIds,
  hasReferencePointInSelection,
  shouldMoveSelectionAsGroup,
} from "./utils/selectionGroupMove";
import type { DerivedPolylinePath } from "./types/derivedPolylinePath";
import {
  buildEdgeRelationIdsForPolygon,
  computePolygonGroupDerivedData,
  computePolylinePlanarAngleSumDeg,
  createPlaneFromThreePoints,
  distancePointToPlane,
  orientPlaneNormalTowardPosition,
  projectPointOntoPlane,
} from "./utils/planarPolygon";
import {
  buildFacadeAutoCloseRectangle,
  getFacadeRectanglePreviewAreaSquareMeters,
  getVerticalPolygonAxisRotationSuffix,
} from "./utils/cartesianGeometry";

type MoveGizmoStartOptions = {
  axisDirection?: Cartesian3 | null;
  axisTitle?: string | null;
  preferredAxisId?: string | null;
  axisCandidates?: Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null;
  verticalOffsetEditMode?:
    | typeof ANNOTATION_TYPE_POINT
    | typeof ANNOTATION_TYPE_POLYLINE
    | null;
  verticalOffsetPlanarGroupId?: string | null;
};

const VERTICAL_POLYGON_AXIS_ALIGNMENT_DOT_EPSILON = 0.999;
const VERTICAL_POLYGON_EN_MATCH_EPSILON_METERS = 0.05;
const VERTICAL_POLYGON_AXIS_ID_ENU_UP = "enu-up";
const VERTICAL_POLYGON_AXIS_ID_ENU_EAST = "enu-east";
const VERTICAL_POLYGON_AXIS_ID_ENU_NORTH = "enu-north";
const ROOF_POLYGON_AXIS_ID_NORMAL = "roof-normal";
const ROOF_POLYGON_AXIS_ID_IN_PLANE_PRIMARY = "roof-in-plane-primary";
const ROOF_POLYGON_AXIS_ID_IN_PLANE_SECONDARY = "roof-in-plane-secondary";

export interface AnnotationsAdapterContextType {
  annotationMode: AnnotationMode;
  setAnnotationMode: Dispatch<SetStateAction<AnnotationMode>>;
  annotations: AnnotationCollection;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  selectedMeasurementId: string | null;
  activeMeasurementId: string | null;
  selectedMeasurementIds: string[];
  selectMeasurementIds: (ids: string[], additive?: boolean) => void;
  selectionModeActive: boolean;
  setSelectionModeActive: Dispatch<SetStateAction<boolean>>;
  selectModeAdditive: boolean;
  setSelectModeAdditive: Dispatch<SetStateAction<boolean>>;
  selectModeRectangle: boolean;
  setSelectModeRectangle: Dispatch<SetStateAction<boolean>>;
  selectMeasurementById: (id: string | null) => void;
  updateAnnotationNameById: (id: string, name: string) => void;
  updatePointLabelAppearanceById: (
    id: string,
    appearance: AnnotationLabelAppearance | undefined
  ) => void;
  toggleAnnotationLockById: (id: string) => void;
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  selectPlanarPolygonGroupById: (id: string | null) => void;
  updatePlanarPolygonNameById: (id: string, name: string) => void;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  startMoveGizmoForMeasurementId: (
    id: string,
    options?: MoveGizmoStartOptions
  ) => void;
  stopMoveGizmo: () => void;
  setPointAnnotationElevationById: (
    id: string,
    elevationMeters: number
  ) => void;
  setPointAnnotationCoordinatesById: (
    id: string,
    latitude: number,
    longitude: number,
    elevationMeters?: number
  ) => void;
  // utility functions
  clearAllMeasurements: () => void;
  clearAnnotationsByIds: (ids: string[]) => void;
  deleteSelectedPointAnnotations: () => void;
  clearMeasurementsByType: (type: AnnotationMode) => void;
  flyToMeasurementById: (id: string) => void;
  flyToAllMeasurements: () => void;
  // visibility options
  showLabels: boolean;
  setShowLabels: Dispatch<SetStateAction<boolean>>;
  // generic options
  temporaryMode: boolean;
  setTemporaryMode: Dispatch<SetStateAction<boolean>>;
  // per measurement type options
  pointRadius: number;
  setPointRadius: Dispatch<SetStateAction<number>>;
  pointVerticalOffsetMeters: number;
  setPointVerticalOffsetMeters: Dispatch<SetStateAction<number>>;
  polylineVerticalOffsetMeters: number;
  setPolylineVerticalOffsetMeters: Dispatch<SetStateAction<number>>;
  polylineVerticalOffsetVisualOnly: boolean;
  setPolylineVerticalOffsetVisualOnly: Dispatch<SetStateAction<boolean>>;
  polylineSegmentLineMode: LinearSegmentLineMode;
  setPolylineSegmentLineMode: Dispatch<SetStateAction<LinearSegmentLineMode>>;
  planarToolCreationMode: PlanarToolCreationMode;
  setPlanarToolCreationMode: Dispatch<
    SetStateAction<PlanarToolCreationMode>
  >;
  polygonSurfaceTypePreset: PolygonSurfacePreset;
  setPolygonSurfaceTypePreset: Dispatch<SetStateAction<PolygonSurfacePreset>>;
  distanceModeStickyToFirstPoint: boolean;
  setDistanceModeStickyToFirstPoint: Dispatch<SetStateAction<boolean>>;
  distanceCreationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  setDistanceCreationLineVisibilityByKind: (
    kind: "direct" | "vertical" | "horizontal",
    visible: boolean
  ) => void;
  heightOffset: number;
  setHeightOffset: Dispatch<SetStateAction<number>>;
  referencePoint: Cartesian3 | null;
  livePreviewPointECEF: Cartesian3 | null;
  hasDistancePreviewAnchor: boolean;
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>;
  referenceElevation: number; // derived from referencePoint
  geometryNodeTable: Record<string, AnnotationGeometryPoint>;
  distanceRelations: PointDistanceRelation[];
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  planarPolygonGroups: PlanarPolygonGroup[];
  polylineGroups: PlanarPolygonGroup[];
  areaPolygonGroups: PlanarPolygonGroup[];
  planarSurfacePolygonGroups: PlanarPolygonGroup[];
  verticalPolygonGroups: PlanarPolygonGroup[];
  setPlanarPolygonGroups: Dispatch<SetStateAction<PlanarPolygonGroup[]>>;
  polylines: DerivedPolylinePath[];
  setPolylines: Dispatch<SetStateAction<DerivedPolylinePath[]>>;
  showSelectedReferenceLine: boolean;
  setShowSelectedReferenceLine: Dispatch<SetStateAction<boolean>>;
  showSelectedReferenceLineComponents: boolean;
  setShowSelectedReferenceLineComponents: Dispatch<SetStateAction<boolean>>;
  occlusionChecksEnabled: boolean;
  setOcclusionChecksEnabled: Dispatch<SetStateAction<boolean>>;
  setPointLabelMetricModeById: (id: string, mode: PointLabelMetricMode) => void;
  pointLabelOnCreate: boolean;
  setPointLabelOnCreate: Dispatch<SetStateAction<boolean>>;
  labelInputPromptPointId: string | null;
  confirmPointLabelInputById: (id: string) => void;
  pointMarkerBadgeByPointId: Readonly<Record<string, PointMarkerBadge>>;
  pendingPolylinePromotionRingClosurePointId: string | null;
  confirmPolylineRingPromotion: (surfaceType: PolygonSurfacePreset) => void;
  cancelPolylineRingPromotion: () => void;
}

const AnnotationsAdapterContext = createContext<
  AnnotationsAdapterContextType | undefined
>(undefined);

export type AnnotationsAdapterOptions = {
  temporary?: boolean;
  pointQueries?: {
    enabled?: boolean;
    radius?: number;
    verticalOffsetMeters?: number;
    heightOffset?: number;
  };
  cartographicCRS?: "string";
  mode?: AnnotationMode;
  initialPersistenceState?: AnnotationPersistenceEnvelopeV2 | null;
  onPersistenceStateChange?: (state: AnnotationPersistenceEnvelopeV2) => void;
  labels?: CesiumLabelLayoutConfigOverrides;
  moveGizmo?: {
    markerSizeScale?: number;
    labelDistanceScale?: number;
    snapPlaneDragToGround?: boolean;
    showRotationHandle?: boolean;
  };
};

const defaultOptions: AnnotationsAdapterOptions = {
  temporary: false,
  mode: ANNOTATION_TYPE_POINT,
};

const defaultPointQueryOptions: AnnotationsAdapterOptions["pointQueries"] = {
  enabled: true,
  radius: 1,
  verticalOffsetMeters: 0,
  heightOffset: 1.5,
};
const defaultMoveGizmoOptions: NonNullable<
  AnnotationsAdapterOptions["moveGizmo"]
> = {
  markerSizeScale: 1,
  labelDistanceScale: 1,
  snapPlaneDragToGround: false,
  showRotationHandle: true,
};
const POINT_LABEL_LONG_PRESS_DURATION_MS = 300;
const REFERENCE_POINT_SYNC_EPSILON_METERS = 0.001;
const PERSISTENCE_RESTORE_DELAY_MS = 250;
const PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS = 0.2;
const PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG = 150;
const DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY: Record<
  ReferenceLineLabelKind,
  boolean
> = {
  direct: true,
  vertical: true,
  horizontal: true,
};
const DEFAULT_DIRECT_LINE_LABEL_MODE: DirectLineLabelMode = "segment";
const getNextDirectLineLabelMode = (
  currentMode: DirectLineLabelMode
): DirectLineLabelMode => {
  if (currentMode === "segment") return "none";
  return "segment";
};

type PlanarGroupSeedConfig = {
  surfaceType: PolygonSurfacePreset;
  measurementKind: PlanarPolygonSourceKind;
  segmentLineMode: LinearSegmentLineMode;
};

const resolvePlanarGroupSeedConfig = ({
  planarToolCreationMode,
  polygonSurfaceTypePreset,
  defaultPolylineSegmentLineMode,
}: {
  planarToolCreationMode: PlanarToolCreationMode;
  polygonSurfaceTypePreset: PolygonSurfacePreset;
  defaultPolylineSegmentLineMode: LinearSegmentLineMode;
}): PlanarGroupSeedConfig => {
  if (
    planarToolCreationMode !== PLANAR_TOOL_CREATION_MODE_POLYGON
  ) {
    return {
      surfaceType: "roof",
      measurementKind: ANNOTATION_TYPE_POLYLINE,
      segmentLineMode: defaultPolylineSegmentLineMode,
    };
  }

  const surfaceType = polygonSurfaceTypePreset;
  const measurementKind =
    surfaceType === "facade"
      ? ANNOTATION_TYPE_AREA_VERTICAL
      : surfaceType === "roof"
      ? ANNOTATION_TYPE_AREA_PLANAR
      : ANNOTATION_TYPE_AREA_GROUND;
  const segmentLineMode =
    measurementKind === ANNOTATION_TYPE_AREA_GROUND &&
    surfaceType === "terrain"
      ? defaultPolylineSegmentLineMode
      : LINEAR_SEGMENT_LINE_MODE_DIRECT;

  return {
    surfaceType,
    measurementKind,
    segmentLineMode,
  };
};

const getConnectedOpenPolylineGroupIds = (
  groups: PlanarPolygonGroup[],
  startGroupId: string
) => {
  const openGroups = groups.filter((group) => !group.closed);
  const startGroup = openGroups.find((group) => group.id === startGroupId);
  if (!startGroup) return new Set<string>();

  const groupById = new Map(openGroups.map((group) => [group.id, group]));
  const vertexIdsByGroupId = new Map(
    openGroups.map((group) => [group.id, new Set(group.vertexPointIds)])
  );

  const connectedIds = new Set<string>();
  const queue: string[] = [startGroupId];

  while (queue.length > 0) {
    const groupId = queue.shift();
    if (!groupId || connectedIds.has(groupId)) continue;
    const currentVertices = vertexIdsByGroupId.get(groupId);
    if (!currentVertices) continue;
    connectedIds.add(groupId);

    groupById.forEach((candidateGroup, candidateId) => {
      if (connectedIds.has(candidateId)) return;
      const candidateVertices = vertexIdsByGroupId.get(candidateId);
      if (!candidateVertices) return;

      const sharesVertex = Array.from(currentVertices).some((vertexId) =>
        candidateVertices.has(vertexId)
      );
      if (sharesVertex) {
        queue.push(candidateGroup.id);
      }
    });
  }

  return connectedIds;
};

const getMeasurementEdgeId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `edge:${left}:${right}`;
};

const getDistanceRelationId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `distance-relation:${left}:${right}`;
};

const withDistanceRelationEdgeId = (
  relation: PointDistanceRelation
): PointDistanceRelation => ({
  ...relation,
  edgeId:
    relation.edgeId && relation.edgeId.length > 0
      ? relation.edgeId
      : getMeasurementEdgeId(relation.pointAId, relation.pointBId),
});

const isSameDistanceRelationPair = (
  relation: PointDistanceRelation,
  pointAId: string,
  pointBId: string
) =>
  (relation.pointAId === pointAId && relation.pointBId === pointBId) ||
  (relation.pointAId === pointBId && relation.pointBId === pointAId);

const hasAnyVisibleDistanceRelationLine = (relation: PointDistanceRelation) =>
  Boolean(
    relation.showDirectLine ||
      relation.showVerticalLine ||
      relation.showHorizontalLine ||
      relation.showComponentLines
  );

const getPointById = (annotations: AnnotationCollection, id: string) =>
  annotations.find(
    (measurement) =>
      isPointAnnotationEntry(measurement) && measurement.id === id
  );

const getPointPositionMap = (
  annotations: AnnotationCollection,
  overrides?: Record<string, Cartesian3>
) => {
  const map = new Map<string, Cartesian3>();
  annotations.forEach((measurement) => {
    if (!isPointAnnotationEntry(measurement)) return;
    map.set(measurement.id, measurement.geometryECEF);
  });
  if (overrides) {
    Object.entries(overrides).forEach(([id, position]) => {
      map.set(id, position);
    });
  }
  return map;
};

const getPolylineComputationPointPositionMap = (
  annotations: AnnotationCollection,
  useOffsetAnchors: boolean
) => {
  const map = new Map<string, Cartesian3>();
  annotations.forEach((measurement) => {
    if (!isPointAnnotationEntry(measurement)) return;
    if (useOffsetAnchors && measurement.verticalOffsetAnchorECEF) {
      map.set(
        measurement.id,
        new Cartesian3(
          measurement.verticalOffsetAnchorECEF.x,
          measurement.verticalOffsetAnchorECEF.y,
          measurement.verticalOffsetAnchorECEF.z
        )
      );
      return;
    }
    map.set(measurement.id, measurement.geometryECEF);
  });
  return map;
};

const buildPolygonGroupVertexTable = (
  groups: PlanarPolygonGroup[]
): PlanarPolygonGroupVertex[] =>
  groups.flatMap((group) =>
    group.vertexPointIds.map((pointId, order) => ({
      id: `${group.id}:${order}`,
      groupId: group.id,
      pointId,
      order,
    }))
  );

const buildGeometryEdgeTable = (
  relations: PointDistanceRelation[],
  groups: PlanarPolygonGroup[]
): AnnotationGeometryEdge[] => {
  const byEdgeId = new Map<string, AnnotationGeometryEdge>();

  relations.forEach((relation) => {
    const edgeId =
      relation.edgeId && relation.edgeId.length > 0
        ? relation.edgeId
        : getMeasurementEdgeId(relation.pointAId, relation.pointBId);
    if (!byEdgeId.has(edgeId)) {
      byEdgeId.set(edgeId, {
        id: edgeId,
        pointAId: relation.pointAId,
        pointBId: relation.pointBId,
      });
    }
  });

  groups.forEach((group) => {
    const vertexIds = group.vertexPointIds;
    if (vertexIds.length < 2) return;
    for (let index = 0; index < vertexIds.length - 1; index += 1) {
      const pointAId = vertexIds[index];
      const pointBId = vertexIds[index + 1];
      if (!pointAId || !pointBId) continue;
      const edgeId = getMeasurementEdgeId(pointAId, pointBId);
      if (!byEdgeId.has(edgeId)) {
        byEdgeId.set(edgeId, { id: edgeId, pointAId, pointBId });
      }
    }
    if (group.closed && vertexIds.length >= 3) {
      const pointAId = vertexIds[vertexIds.length - 1];
      const pointBId = vertexIds[0];
      if (!pointAId || !pointBId) return;
      const edgeId = getMeasurementEdgeId(pointAId, pointBId);
      if (!byEdgeId.has(edgeId)) {
        byEdgeId.set(edgeId, { id: edgeId, pointAId, pointBId });
      }
    }
  });

  return Array.from(byEdgeId.values());
};

const getPlanarGroupMeasurementKind = (
  group: Pick<PlanarPolygonGroup, "measurementKind">
): PlanarPolygonSourceKind => group.measurementKind;

const buildDerivedPolylinePath = (
  group: PlanarPolygonGroup,
  pointById: Map<string, Cartesian3>,
  verticalOffsetMeters: number = 0
): DerivedPolylinePath | null => {
  if (
    group.closed ||
    getPlanarGroupMeasurementKind(group) !== ANNOTATION_TYPE_POLYLINE ||
    group.vertexPointIds.length < 2
  ) {
    return null;
  }

  const applyGroupVerticalOffset = (position: Cartesian3) =>
    Math.abs(verticalOffsetMeters) > 1e-9
      ? getPositionWithVerticalOffsetFromAnchor(position, verticalOffsetMeters)
      : position;

  const segmentLengthsMeters: number[] = [];
  const segmentLengthsCumulativeMeters: number[] = [0];
  const vertexHeightsMeters = group.vertexPointIds.map((pointId) => {
    const point = pointById.get(pointId);
    if (!point) return 0;
    const pointWGS84 = getDegreesFromCartesian(applyGroupVerticalOffset(point));
    return pointWGS84.altitude ?? 0;
  });
  let totalLengthMeters = 0;
  const edgeRelationIds: string[] = [];

  for (let index = 0; index < group.vertexPointIds.length - 1; index += 1) {
    const startId = group.vertexPointIds[index];
    const endId = group.vertexPointIds[index + 1];
    if (!startId || !endId) continue;
    const start = pointById.get(startId);
    const end = pointById.get(endId);
    if (!start || !end) continue;
    const segmentLength = Cartesian3.distance(
      applyGroupVerticalOffset(start),
      applyGroupVerticalOffset(end)
    );
    segmentLengthsMeters.push(segmentLength);
    totalLengthMeters += segmentLength;
    segmentLengthsCumulativeMeters.push(totalLengthMeters);
    edgeRelationIds.push(getDistanceRelationId(startId, endId));
  }

  if (segmentLengthsMeters.length === 0) {
    return null;
  }

  const hasStartPoint =
    !!group.distanceMeasurementStartPointId &&
    group.vertexPointIds.includes(group.distanceMeasurementStartPointId);

  return {
    id: group.id,
    name: group.name,
    vertexPointIds: [...group.vertexPointIds],
    edgeRelationIds,
    distanceMeasurementStartPointId: hasStartPoint
      ? group.distanceMeasurementStartPointId ?? null
      : group.vertexPointIds[0] ?? null,
    vertexHeightsMeters,
    segmentLengthsMeters,
    segmentLengthsCumulativeMeters,
    totalLengthMeters,
  };
};

interface AnnotationsAdapterProviderProps {
  children: React.ReactNode;
  options?: AnnotationsAdapterOptions;
  enabled?: boolean;
}

const deleteFromHideMeasurementsOfType =
  (type: AnnotationMode) => (prev: Set<AnnotationMode>) => {
    // prevent rerenders on non-changes
    if (!prev.has(type)) return prev;
    const newSet = new Set(prev);
    newSet.delete(type);
    return newSet;
  };

const FLY_TO_MIN_RADIUS_METERS = 50;
const FLY_TO_PADDING_FACTOR = 1.1;

const getMeasurementEntryFlyToPoints = (
  measurement: AnnotationEntry
): Cartesian3[] => {
  if (isPointAnnotationEntry(measurement)) {
    return [measurement.geometryECEF];
  }

  if (Array.isArray(measurement.geometryECEF)) {
    return measurement.geometryECEF;
  }

  return [];
};

const flyToMeasurementPointGroup = (
  scene: Scene | null | undefined,
  points: Cartesian3[]
) => {
  if (!scene || scene.isDestroyed() || points.length === 0) {
    return;
  }

  const sphere = BoundingSphere.fromPoints(points);
  sphere.radius = Math.max(sphere.radius, FLY_TO_MIN_RADIUS_METERS);

  flyToBoundingSphereExtent(scene.camera, sphere, {
    minRange: FLY_TO_MIN_RADIUS_METERS,
    paddingFactor: FLY_TO_PADDING_FACTOR,
  });
};

export const AnnotationsAdapterProvider: React.FC<
  AnnotationsAdapterProviderProps
> = ({ children, options, enabled = true }) => {
  const { getScene } = useCesiumContext();
  const scene = getScene();
  const getPreferredPlaneFacingPosition = useCallback((): Cartesian3 | null => {
    if (!scene || scene.isDestroyed()) return null;
    return scene.camera.positionWC;
  }, [scene]);
  const orientPlaneTowardSceneCamera = useCallback(
    (plane: PlanarPolygonPlane): PlanarPolygonPlane =>
      orientPlaneNormalTowardPosition(plane, getPreferredPlaneFacingPosition()),
    [getPreferredPlaneFacingPosition]
  );
  const computePolygonGroupDerivedDataWithCamera = useCallback(
    (group: PlanarPolygonGroup, pointById: Map<string, Cartesian3>) =>
      computePolygonGroupDerivedData(group, pointById, {
        preferredFacingPositionECEF: getPreferredPlaneFacingPosition(),
      }),
    [getPreferredPlaneFacingPosition]
  );
  const requestUpdateCallback = useCesiumOverlaySync();
  const overlayContext = useLabelOverlay();

  useEffect(() => {
    if (overlayContext && overlayContext.updatePositions) {
      requestUpdateCallback(overlayContext.updatePositions);
    }
  }, [overlayContext, requestUpdateCallback]);

  const pointQueryOptions = normalizeOptions(
    options?.pointQueries,
    defaultPointQueryOptions
  );
  const pointQueryEnabled = pointQueryOptions.enabled !== false;

  const moveGizmoOptions = normalizeOptions(
    options?.moveGizmo,
    defaultMoveGizmoOptions
  );

  const normalizedOptions = normalizeOptions(options, defaultOptions);
  const {
    mode: initialMeasurementMode,
    temporary: initialTemporary,
    initialPersistenceState,
    onPersistenceStateChange,
  } = normalizedOptions;
  const isInteractionActive = enabled;

  const {
    annotationMode,
    setAnnotationMode,
    annotations,
    setAnnotations,
    selectedMeasurementId,
    setSelectedMeasurementId,
    selectedMeasurementIds,
    setSelectedMeasurementIds,
    selectedMeasurementIdRef,
    updateAnnotationNameById,
    toggleAnnotationLockById,
    showLabels,
    setShowLabels,
  } = useAnnotationCoreState<AnnotationMode, AnnotationEntry>({
    initialMode: initialMeasurementMode ?? ANNOTATION_TYPE_POINT,
  });

  const previousMeasurementModeRef = useRef<AnnotationMode>(annotationMode);
  const hoveredLivePreviewPointIdRef = useRef<string | null>(null);

  const [pointRadius, setPointRadius] = useState(pointQueryOptions.radius ?? 1);
  const [pointVerticalOffsetMeters, setPointVerticalOffsetMeters] = useState(
    pointQueryOptions.verticalOffsetMeters ?? 0
  );
  const [
    defaultPolylineVerticalOffsetMeters,
    setDefaultPolylineVerticalOffsetMeters,
  ] = useState(pointQueryOptions.verticalOffsetMeters ?? 0);
  const polylineVerticalOffsetVisualOnly = true;
  const setPolylineVerticalOffsetVisualOnly = useCallback<
    Dispatch<SetStateAction<boolean>>
  >(() => {
    // Polyline offset is intentionally always interpreted as visual-only.
  }, []);
  const [defaultPolylineSegmentLineMode, setDefaultPolylineSegmentLineMode] =
    useState<LinearSegmentLineMode>(DEFAULT_LINEAR_SEGMENT_LINE_MODE);
  const [planarToolCreationMode, setPlanarToolCreationMode] =
    useState<PlanarToolCreationMode>(
      PLANAR_TOOL_CREATION_MODE_POLYLINE
    );
  const [polygonSurfaceTypePreset, setPolygonSurfaceTypePreset] =
    useState<PolygonSurfacePreset>("facade");
  const [distanceModeStickyToFirstPoint, setDistanceModeStickyToFirstPoint] =
    useState(false);
  const [distanceCreationLineVisibility, setDistanceCreationLineVisibility] =
    useState({
      direct: true,
      vertical: true,
      horizontal: true,
    });
  const [heightOffset, setHeightOffset] = useState(
    pointQueryOptions.heightOffset ?? 1.5
  );
  const [temporaryMode, setTemporaryMode] = useState<boolean>(
    initialTemporary ?? false
  );
  const [pointLabelOnCreate, setPointLabelOnCreate] = useState(false);
  const [labelInputPromptPointId, setLabelInputPromptPointId] = useState<
    string | null
  >(null);
  const {
    hideMeasurementsOfType,
    setHideMeasurementsOfType,
    hideLabelsOfType,
    setHideLabelsOfType,
  } = useAnnotationVisibilityState<AnnotationMode>();
  const {
    selectionModeActive,
    setSelectionModeActive,
    selectModeAdditive,
    setSelectModeAdditive,
    selectModeRectangle,
    setSelectModeRectangle,
    effectiveSelectModeAdditive,
  } = useSelectionToolState();

  useEffect(() => {
    if (
      !scene ||
      scene.isDestroyed() ||
      !selectionModeActive ||
      !effectiveSelectModeAdditive
    ) {
      return;
    }

    const plusCursor = document.createElement("div");
    plusCursor.textContent = "+";
    plusCursor.style.position = "fixed";
    plusCursor.style.pointerEvents = "none";
    plusCursor.style.userSelect = "none";
    plusCursor.style.zIndex = "10000";
    plusCursor.style.fontSize = "16px";
    plusCursor.style.fontWeight = "700";
    plusCursor.style.lineHeight = "1";
    plusCursor.style.color = "rgba(255, 255, 255, 0.95)";
    plusCursor.style.textShadow = "0 0 2px rgba(0, 0, 0, 0.85)";
    plusCursor.style.display = "none";
    document.body.appendChild(plusCursor);

    const updatePlusCursorPosition = (event: PointerEvent) => {
      const canvasRect = scene.canvas.getBoundingClientRect();
      const insideCanvas =
        event.clientX >= canvasRect.left &&
        event.clientX <= canvasRect.right &&
        event.clientY >= canvasRect.top &&
        event.clientY <= canvasRect.bottom;

      if (!insideCanvas) {
        plusCursor.style.display = "none";
        return;
      }

      plusCursor.style.left = `${event.clientX + 10}px`;
      plusCursor.style.top = `${event.clientY + 8}px`;
      plusCursor.style.display = "block";
    };

    const hidePlusCursor = () => {
      plusCursor.style.display = "none";
    };

    window.addEventListener("pointermove", updatePlusCursorPosition, true);
    scene.canvas.addEventListener("pointerleave", hidePlusCursor);
    window.addEventListener("blur", hidePlusCursor, true);

    return () => {
      window.removeEventListener("pointermove", updatePlusCursorPosition, true);
      scene.canvas.removeEventListener("pointerleave", hidePlusCursor);
      window.removeEventListener("blur", hidePlusCursor, true);
      plusCursor.remove();
    };
  }, [scene, selectionModeActive, effectiveSelectModeAdditive]);

  const [moveGizmoPointId, setMoveGizmoPointId] = useState<string | null>(null);
  const [moveGizmoAxisDirection, setMoveGizmoAxisDirection] =
    useState<Cartesian3 | null>(null);
  const [moveGizmoAxisTitle, setMoveGizmoAxisTitle] = useState<string | null>(
    null
  );
  const [moveGizmoAxisCandidates, setMoveGizmoAxisCandidates] = useState<Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null>(null);
  const [moveGizmoPreferredAxisId, setMoveGizmoPreferredAxisId] = useState<
    string | null
  >(null);
  const [moveGizmoVerticalOffsetEditMode, setMoveGizmoVerticalOffsetEditMode] =
    useState<
      typeof ANNOTATION_TYPE_POINT | typeof ANNOTATION_TYPE_POLYLINE | null
    >(null);
  const [
    moveGizmoVerticalOffsetPlanarGroupId,
    setMoveGizmoVerticalOffsetPlanarGroupId,
  ] = useState<string | null>(null);
  const [isMoveGizmoDragging, setIsMoveGizmoDragging] =
    useState<boolean>(false);
  const {
    lockedEditMeasurementId,
    setLockedEditMeasurementId,
    clearLockedEditMeasurementId,
  } = useAnnotationEditState();

  useEffect(() => {
    if (moveGizmoPointId) return;
    setMoveGizmoPreferredAxisId(null);
    setMoveGizmoVerticalOffsetEditMode(null);
    setMoveGizmoVerticalOffsetPlanarGroupId(null);
  }, [moveGizmoPointId]);

  const isSceneReady = Boolean(scene && !scene.isDestroyed());

  const [referencePoint, setReferencePoint] = useState<Cartesian3 | null>(null);
  const [occlusionChecksEnabled, setOcclusionChecksEnabled] =
    useState<boolean>(true);
  const [distanceRelations, setDistanceRelations] = useState<
    PointDistanceRelation[]
  >([]);
  const [planarPolygonGroups, setPlanarPolygonGroups] = useState<
    PlanarPolygonGroup[]
  >([]);
  const [polylines, setPolylines] = useState<DerivedPolylinePath[]>([]);
  const [activePlanarPolygonGroupId, setActivePlanarPolygonGroupId] = useState<
    string | null
  >(null);
  const [selectedPlanarPolygonGroupId, setSelectedPlanarPolygonGroupId] =
    useState<string | null>(null);
  const [previousSelectedMeasurementId, setPreviousSelectedMeasurementId] =
    useState<string | null>(null);
  const [doubleClickChainSourcePointId, setDoubleClickChainSourcePointId] =
    useState<string | null>(null);
  const [
    pendingPolylinePromotionRingClosurePointId,
    setPendingPolylinePromotionRingClosurePointId,
  ] = useState<string | null>(null);

  const geometryPointsTable = useMemo(
    () => buildPointGeometryRows(annotations.filter(isPointAnnotationEntry)),
    [annotations]
  );
  const geometryNodeTable = useMemo(
    () =>
      geometryPointsTable.reduce<Record<string, AnnotationGeometryPoint>>(
        (table, node) => {
          table[node.id] = node;
          return table;
        },
        {}
      ),
    [geometryPointsTable]
  );
  const geometryEdgesTable = useMemo(
    () => buildGeometryEdgeTable(distanceRelations, planarPolygonGroups),
    [distanceRelations, planarPolygonGroups]
  );
  const planarPolygonGroupVerticesTable = useMemo(
    () => buildPolygonGroupVertexTable(planarPolygonGroups),
    [planarPolygonGroups]
  );

  const hasAppliedInitialPersistenceStateRef = useRef(false);
  const lastSavedPersistenceStateRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isSceneReady || hasAppliedInitialPersistenceStateRef.current) {
      return;
    }

    if (initialPersistenceState) {
      setTimeout(() => {
        setAnnotations(initialPersistenceState.tables.annotations);
        setDistanceRelations(
          initialPersistenceState.tables.distanceRelations.map(
            withDistanceRelationEdgeId
          )
        );
        setPlanarPolygonGroups(initialPersistenceState.tables.planarPolygonGroups);
      }, PERSISTENCE_RESTORE_DELAY_MS);
    }

    hasAppliedInitialPersistenceStateRef.current = true;
  }, [initialPersistenceState, isSceneReady, setAnnotations]);

  useEffect(() => {
    setPlanarPolygonGroups((prev) => {
      let hasChanges = false;
      const nextGroups = prev.map((group) => {
        if (group.segmentLineMode) {
          return group;
        }
        hasChanges = true;
        return {
          ...group,
          segmentLineMode: group.closed
            ? LINEAR_SEGMENT_LINE_MODE_DIRECT
            : defaultPolylineSegmentLineMode,
        };
      });
      return hasChanges ? nextGroups : prev;
    });
  }, [defaultPolylineSegmentLineMode]);

  useEffect(() => {
    if (
      !onPersistenceStateChange ||
      !hasAppliedInitialPersistenceStateRef.current
    ) {
      return;
    }

    const persistenceState: AnnotationPersistenceEnvelopeV2 = {
      version: 2,
      geometry: {
        points: geometryPointsTable,
        edges: geometryEdgesTable,
      },
      tables: {
        annotations,
        distanceRelations: distanceRelations.map(withDistanceRelationEdgeId),
        planarPolygonGroups,
        planarPolygonGroupVertices: planarPolygonGroupVerticesTable,
      },
    };

    const serialized = JSON.stringify(persistenceState);
    if (serialized === lastSavedPersistenceStateRef.current) {
      return;
    }

    onPersistenceStateChange(persistenceState);
    lastSavedPersistenceStateRef.current = serialized;
  }, [
    distanceRelations,
    geometryEdgesTable,
    geometryPointsTable,
    annotations,
    onPersistenceStateChange,
    planarPolygonGroupVerticesTable,
    planarPolygonGroups,
  ]);

  const referenceElevation = useMemo(() => {
    if (!referencePoint || !scene) return 0;
    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(referencePoint);
    return cartographic?.height ?? 0;
  }, [referencePoint, scene]);

  const derivedPolylines = useMemo(() => {
    const pointById = getPolylineComputationPointPositionMap(
      annotations,
      polylineVerticalOffsetVisualOnly
    );
    return planarPolygonGroups
      .map((group) =>
        buildDerivedPolylinePath(
          group,
          pointById,
          group.verticalOffsetMeters ?? defaultPolylineVerticalOffsetMeters
        )
      )
      .filter((collection): collection is DerivedPolylinePath =>
        Boolean(collection)
      );
  }, [
    defaultPolylineVerticalOffsetMeters,
    annotations,
    planarPolygonGroups,
    polylineVerticalOffsetVisualOnly,
  ]);

  useEffect(() => {
    setPolylines(derivedPolylines);
  }, [derivedPolylines]);

  const focusedPlanarPolygonGroupId =
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId;
  const polylineVerticalOffsetMeters = useMemo(() => {
    if (!focusedPlanarPolygonGroupId) {
      return defaultPolylineVerticalOffsetMeters;
    }
    const focusedGroup = planarPolygonGroups.find(
      (group) => group.id === focusedPlanarPolygonGroupId
    );
    return (
      focusedGroup?.verticalOffsetMeters ?? defaultPolylineVerticalOffsetMeters
    );
  }, [
    defaultPolylineVerticalOffsetMeters,
    focusedPlanarPolygonGroupId,
    planarPolygonGroups,
  ]);
  const setPolylineVerticalOffsetMeters = useCallback<
    Dispatch<SetStateAction<number>>
  >(
    (nextOffsetOrUpdater) => {
      const nextOffsetMeters =
        typeof nextOffsetOrUpdater === "function"
          ? nextOffsetOrUpdater(polylineVerticalOffsetMeters)
          : nextOffsetOrUpdater;

      if (!Number.isFinite(nextOffsetMeters)) {
        return;
      }

      if (Math.abs(nextOffsetMeters - polylineVerticalOffsetMeters) <= 1e-9) {
        return;
      }

      setDefaultPolylineVerticalOffsetMeters(nextOffsetMeters);

      if (!focusedPlanarPolygonGroupId) {
        return;
      }

      const focusedGroup = planarPolygonGroups.find(
        (group) => group.id === focusedPlanarPolygonGroupId
      );
      if (!focusedGroup) {
        return;
      }

      setPlanarPolygonGroups((prev) =>
        prev.map((group) =>
          group.id === focusedPlanarPolygonGroupId
            ? {
                ...group,
                verticalOffsetMeters: nextOffsetMeters,
              }
            : group
        )
      );

      const focusedVertexIdSet = new Set(focusedGroup.vertexPointIds);
      if (focusedVertexIdSet.size === 0) {
        return;
      }

      setAnnotations((prev) =>
        prev.map((measurement) => {
          if (
            !isPointAnnotationEntry(measurement) ||
            !focusedVertexIdSet.has(measurement.id) ||
            !measurement.verticalOffsetAnchorECEF
          ) {
            return measurement;
          }

          const anchorECEF = new Cartesian3(
            measurement.verticalOffsetAnchorECEF.x,
            measurement.verticalOffsetAnchorECEF.y,
            measurement.verticalOffsetAnchorECEF.z
          );
          const nextPointPosition = getPositionWithVerticalOffsetFromAnchor(
            anchorECEF,
            nextOffsetMeters
          );
          const nextWGS84 = getDegreesFromCartesian(nextPointPosition);

          return {
            ...measurement,
            geometryECEF: nextPointPosition,
            geometryWGS84: {
              longitude: nextWGS84.longitude,
              latitude: nextWGS84.latitude,
              altitude: getEllipsoidalAltitudeOrZero(nextWGS84.altitude),
            },
          };
        })
      );
    },
    [
      focusedPlanarPolygonGroupId,
      planarPolygonGroups,
      polylineVerticalOffsetMeters,
      setAnnotations,
    ]
  );

  const activeLivePreviewDescriptor =
    useMemo<AnnotationLivePreviewDescriptor>(() => {
      if (annotationMode === ANNOTATION_TYPE_POINT) {
        if (pointLabelOnCreate && labelInputPromptPointId) {
          return {
            type: ANNOTATION_LIVE_PREVIEW_TYPE_NONE,
            verticalOffsetMeters: 0,
          };
        }
        return {
          type: ANNOTATION_LIVE_PREVIEW_TYPE_POINT,
          verticalOffsetMeters: pointLabelOnCreate
            ? 0
            : pointVerticalOffsetMeters,
        };
      }

      if (annotationMode === ANNOTATION_TYPE_DISTANCE) {
        return {
          type: ANNOTATION_LIVE_PREVIEW_TYPE_DISTANCE,
          verticalOffsetMeters: 0,
        };
      }

      if (annotationMode !== ANNOTATION_TYPE_POLYLINE) {
        return {
          type: ANNOTATION_LIVE_PREVIEW_TYPE_NONE,
          verticalOffsetMeters: 0,
        };
      }

      if (
        planarToolCreationMode ===
        PLANAR_TOOL_CREATION_MODE_POLYLINE
      ) {
        return {
          type: ANNOTATION_LIVE_PREVIEW_TYPE_POLYLINE,
          verticalOffsetMeters: polylineVerticalOffsetMeters,
        };
      }

      const activeOpenPolygonGroup = activePlanarPolygonGroupId
        ? planarPolygonGroups.find(
            (group) => group.id === activePlanarPolygonGroupId && !group.closed
          ) ?? null
        : null;
      const effectiveSurfaceType =
        activeOpenPolygonGroup?.surfaceType ?? polygonSurfaceTypePreset;

      if (effectiveSurfaceType === "facade") {
        const firstVertexPointId =
          activeOpenPolygonGroup?.vertexPointIds.length === 1
            ? activeOpenPolygonGroup.vertexPointIds[0]
            : null;
        if (firstVertexPointId && activeOpenPolygonGroup) {
          return {
            type: ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL,
            verticalOffsetMeters: 0,
            verticalPolygonContext: {
              groupId: activeOpenPolygonGroup.id,
              firstVertexPointId,
            },
          };
        }
        return {
          type: ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_VERTICAL,
          verticalOffsetMeters: 0,
        };
      }

      if (effectiveSurfaceType === "footprint") {
        return {
          type: ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_GROUND,
          verticalOffsetMeters: 0,
        };
      }

      if (effectiveSurfaceType === "roof") {
        return {
          type: ANNOTATION_LIVE_PREVIEW_TYPE_POLYGON_PLANAR,
          verticalOffsetMeters: 0,
        };
      }

      return {
        type: ANNOTATION_LIVE_PREVIEW_TYPE_NONE,
        verticalOffsetMeters: 0,
      };
    }, [
      activePlanarPolygonGroupId,
      annotationMode,
      labelInputPromptPointId,
      planarToolCreationMode,
      planarPolygonGroups,
      pointLabelOnCreate,
      pointVerticalOffsetMeters,
      polygonSurfaceTypePreset,
      polylineVerticalOffsetMeters,
    ]);

  const {
    livePreviewPointECEF,
    livePreviewSurfaceNormalECEF,
    livePreviewVerticalOffsetAnchorECEF,
    handlePointQueryPointerMove,
    previewIsPolylineCreateMode,
    hasActivePreviewNode,
    activePreviewSupportsDistanceLine,
    activePreviewUsesPolylineDistanceRules,
    activePreviewForceDirectDistanceLine,
    isLivePointPreviewModeActive,
  } = useAnnotationLivePreviewState({
    scene,
    activePreview: activeLivePreviewDescriptor,
    pointQueryEnabled,
    moveGizmoPointId,
    isMoveGizmoDragging,
    annotations,
    setPlanarPolygonGroups,
    getPositionWithVerticalOffsetFromAnchor,
    getFacadeRectanglePreviewAreaSquareMeters,
  });

  const handlePointLabelHoverChange = useCallback(
    (pointId: string, hovered: boolean) => {
      if (!pointQueryEnabled || moveGizmoPointId || isMoveGizmoDragging) return;
      if (!hasActivePreviewNode) return;

      if (hovered) {
        const hoveredPoint = getPointById(annotations, pointId);
        if (!hoveredPoint || !isPointAnnotationEntry(hoveredPoint)) return;
        hoveredLivePreviewPointIdRef.current = pointId;
        const localUp = getLocalUpDirectionAtAnchor(hoveredPoint.geometryECEF);
        handlePointQueryPointerMove(
          hoveredPoint.geometryECEF,
          undefined,
          localUp
        );
        return;
      }

      if (hoveredLivePreviewPointIdRef.current !== pointId) return;
      hoveredLivePreviewPointIdRef.current = null;
      handlePointQueryPointerMove(null, undefined, null);
    },
    [
      pointQueryEnabled,
      moveGizmoPointId,
      isMoveGizmoDragging,
      hasActivePreviewNode,
      annotations,
      handlePointQueryPointerMove,
    ]
  );

  useEffect(() => {
    if (isLivePointPreviewModeActive) return;
    hoveredLivePreviewPointIdRef.current = null;
  }, [isLivePointPreviewModeActive]);
  const polylineSegmentLineMode = useMemo(() => {
    if (!activePlanarPolygonGroupId) {
      return defaultPolylineSegmentLineMode;
    }
    const activeGroup = planarPolygonGroups.find(
      (group) => group.id === activePlanarPolygonGroupId
    );
    return activeGroup?.segmentLineMode ?? defaultPolylineSegmentLineMode;
  }, [
    activePlanarPolygonGroupId,
    defaultPolylineSegmentLineMode,
    planarPolygonGroups,
  ]);
  const setPolylineSegmentLineMode = useCallback<
    Dispatch<SetStateAction<LinearSegmentLineMode>>
  >(
    (nextModeOrUpdater) => {
      const nextMode =
        typeof nextModeOrUpdater === "function"
          ? nextModeOrUpdater(polylineSegmentLineMode)
          : nextModeOrUpdater;

      if (!nextMode || nextMode === polylineSegmentLineMode) {
        return;
      }

      setDefaultPolylineSegmentLineMode(nextMode);

      if (!activePlanarPolygonGroupId) {
        return;
      }

      setPlanarPolygonGroups((prev) =>
        prev.map((group) =>
          group.id === activePlanarPolygonGroupId
            ? {
                ...group,
                segmentLineMode: nextMode,
              }
            : group
        )
      );
    },
    [activePlanarPolygonGroupId, polylineSegmentLineMode]
  );
  const focusedPolyline = useMemo(() => {
    if (!focusedPlanarPolygonGroupId) return null;
    return (
      polylines.find(
        (polyline) => polyline.id === focusedPlanarPolygonGroupId
      ) ?? null
    );
  }, [focusedPlanarPolygonGroupId, polylines]);
  const focusedPolylineStartPointId =
    focusedPolyline?.distanceMeasurementStartPointId ??
    focusedPolyline?.vertexPointIds[0] ??
    null;

  const focusedPolylineDistanceToStartByPointId = useMemo(() => {
    if (!focusedPolyline) return {};
    const byId: Record<string, number> = {};
    focusedPolyline.vertexPointIds.forEach((pointId, index) => {
      byId[pointId] =
        focusedPolyline.segmentLengthsCumulativeMeters[index] ?? 0;
    });
    return byId;
  }, [focusedPolyline]);

  const cumulativeDistanceByRelationId = useMemo(() => {
    const byRelationId: Record<string, number> = {};
    polylines.forEach((polyline) => {
      polyline.edgeRelationIds.forEach((relationId, segmentIndex) => {
        byRelationId[relationId] =
          polyline.segmentLengthsCumulativeMeters[segmentIndex + 1] ??
          polyline.segmentLengthsCumulativeMeters[segmentIndex] ??
          0;
      });
    });
    return byRelationId;
  }, [polylines]);

  const effectiveReferenceElevation = useMemo(() => {
    if (!focusedPolylineStartPointId) {
      return referenceElevation;
    }
    if (focusedPolyline) {
      const focusedStartPointIndex = focusedPolyline.vertexPointIds.findIndex(
        (pointId) => pointId === focusedPolylineStartPointId
      );
      if (focusedStartPointIndex >= 0) {
        return focusedPolyline.vertexHeightsMeters[focusedStartPointIndex] ?? 0;
      }
    }
    return referenceElevation;
  }, [focusedPolyline, focusedPolylineStartPointId, referenceElevation]);

  const distanceToReferenceByPointId = useMemo(() => {
    if (!referencePoint) return {};

    const distances: Record<string, number> = {};
    annotations.forEach((measurement) => {
      if (!isPointAnnotationEntry(measurement)) return;
      distances[measurement.id] = Cartesian3.distance(
        measurement.geometryECEF,
        referencePoint
      );
    });
    return distances;
  }, [annotations, referencePoint]);

  const effectiveDistanceToReferenceByPointId = useMemo(() => {
    if (!focusedPolyline) return distanceToReferenceByPointId;
    return {
      ...distanceToReferenceByPointId,
      ...focusedPolylineDistanceToStartByPointId,
    };
  }, [
    distanceToReferenceByPointId,
    focusedPolyline,
    focusedPolylineDistanceToStartByPointId,
  ]);

  const polygonOnlyPointIdSet = useMemo(() => {
    const displayReadyPolygonGroupIds = new Set(
      planarPolygonGroups
        .filter(
          (group) =>
            group.closed ||
            (group.planeLocked && group.vertexPointIds.length >= 4)
        )
        .map((group) => group.id)
    );

    const polygonVertexIds = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      if (!displayReadyPolygonGroupIds.has(group.id)) return;
      group.vertexPointIds.forEach((id) => polygonVertexIds.add(id));
    });

    const nonPolygonRelationPointIds = new Set<string>();
    distanceRelations.forEach((relation) => {
      if (
        relation.polygonGroupId &&
        displayReadyPolygonGroupIds.has(relation.polygonGroupId)
      ) {
        return;
      }
      nonPolygonRelationPointIds.add(relation.pointAId);
      nonPolygonRelationPointIds.add(relation.pointBId);
    });

    const ids = new Set<string>();
    polygonVertexIds.forEach((id) => {
      if (!nonPolygonRelationPointIds.has(id)) {
        ids.add(id);
      }
    });

    // Keep polygon-only labels hidden by default, but always show the actively
    // selected point label so node selection provides direct point feedback.
    if (selectedMeasurementId) {
      ids.delete(selectedMeasurementId);
    }

    return ids;
  }, [planarPolygonGroups, distanceRelations, selectedMeasurementId]);

  // For unfocused polylines, collect the first node IDs so all non-last nodes can be
  // suppressed (last node renders the collapsed pill marker).
  const unfocusedPolylineMarkerOnlyPointIds = useMemo(() => {
    const ids = new Set<string>();
    polylines.forEach((polyline) => {
      if (polyline.id === focusedPlanarPolygonGroupId) return;
      const first = polyline.vertexPointIds[0];
      const last = polyline.vertexPointIds[polyline.vertexPointIds.length - 1];
      if (first && first !== last) ids.add(first);
    });
    return ids;
  }, [polylines, focusedPlanarPolygonGroupId]);

  const pointMeasurements = useMemo(
    () => annotations.filter(isPointAnnotationEntry),
    [annotations]
  );
  const planarVertexPointIdSetForBadges = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      group.vertexPointIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups]);
  const pointMeasureOrderById = useMemo(
    () =>
      pointMeasurements
        .filter(
          (measurement) =>
            !measurement.auxiliaryLabelAnchor &&
            !measurement.distanceAdhocNode &&
            !planarVertexPointIdSetForBadges.has(measurement.id)
        )
        .reduce<Record<string, number>>((orderById, measurement, index) => {
          orderById[measurement.id] = index + 1;
          return orderById;
        }, {}),
    [planarVertexPointIdSetForBadges, pointMeasurements]
  );
  const resolvePlanarGroupBadgeKind = useCallback(
    (group: PlanarPolygonGroup): PlanarGroupBadgeKind => group.measurementKind,
    []
  );
  const pointMarkerBadgeByPointId = useAnnotationPointMarkerBadges({
    pointMeasurements,
    planarPolygonGroups,
    distanceRelations,
    pointMeasureOrderById,
    resolvePlanarGroupBadgeKind,
    isPointAutoCorner: (point) => Boolean(point.isFacadeAutoCorner),
  }) as Readonly<Record<string, PointMarkerBadge>>;

  const unfocusedPolylineInteriorIds = useMemo(() => {
    const ids = new Set<string>();
    polylines.forEach((polyline) => {
      if (polyline.id === focusedPlanarPolygonGroupId) return;
      polyline.vertexPointIds.forEach((pointId, index) => {
        if (index === 0 || index === polyline.vertexPointIds.length - 1) return;
        ids.add(pointId);
      });
    });
    return ids;
  }, [polylines, focusedPlanarPolygonGroupId]);

  const unfocusedPolylineNonLastIds = useMemo(() => {
    const ids = new Set<string>(unfocusedPolylineMarkerOnlyPointIds);
    unfocusedPolylineInteriorIds.forEach((pointId) => {
      ids.add(pointId);
    });
    return ids;
  }, [unfocusedPolylineMarkerOnlyPointIds, unfocusedPolylineInteriorIds]);

  const {
    standaloneDistanceHighestPointIds,
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
  } = useMemo(() => {
    const selectedPointIdSet = new Set<string>(selectedMeasurementIds);
    if (selectedMeasurementId) {
      selectedPointIdSet.add(selectedMeasurementId);
    }

    const {
      highestPointIds,
      unfocusedNonHighestPointIds,
      focusedNonHighestPointIds,
    } = buildStandaloneDistancePointSets({
      pointMeasurements,
      distanceRelations,
      selectedPointIds: selectedPointIdSet,
    });

    return {
      standaloneDistanceHighestPointIds: highestPointIds,
      unfocusedStandaloneDistanceNonHighestPointIds:
        unfocusedNonHighestPointIds,
      focusedStandaloneDistanceNonHighestPointIds: focusedNonHighestPointIds,
    };
  }, [
    distanceRelations,
    pointMeasurements,
    selectedMeasurementId,
    selectedMeasurementIds,
  ]);

  const desiredLabelAnchorByPointId = useMemo<
    Readonly<Record<string, AnnotationLabelAnchor | undefined>>
  >(
    () =>
      buildDesiredPointLabelAnchorById({
        pointMeasurements,
        polylines,
        focusedPlanarPolygonGroupId,
        pointMarkerBadgeByPointId,
        standaloneDistanceHighestPointIds,
        unfocusedStandaloneDistanceNonHighestPointIds,
        focusedStandaloneDistanceNonHighestPointIds,
        formatDistanceLabel: formatNumber,
      }),
    [
      pointMeasurements,
      polylines,
      focusedPlanarPolygonGroupId,
      pointMarkerBadgeByPointId,
      standaloneDistanceHighestPointIds,
      unfocusedStandaloneDistanceNonHighestPointIds,
      focusedStandaloneDistanceNonHighestPointIds,
    ]
  );

  useEffect(() => {
    setAnnotations((prev) => {
      const { nextMeasurements, hasChanges } = applyDesiredPointLabelAnchors({
        annotations: prev,
        desiredLabelAnchorByPointId,
        isPointMeasurement: isPointAnnotationEntry,
      });
      return hasChanges ? nextMeasurements : prev;
    });
  }, [desiredLabelAnchorByPointId]);

  const collapsedPillPointIds = useMemo(
    () => collectCollapsedPillPointIds(pointMeasurements),
    [pointMeasurements]
  );

  const selectedClosedAreaGroupIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedPlanarPolygonGroupId && !activePlanarPolygonGroupId) {
      return ids;
    }
    planarPolygonGroups.forEach((group) => {
      if (!group.closed) return;
      if (
        group.id === selectedPlanarPolygonGroupId ||
        group.id === activePlanarPolygonGroupId
      ) {
        ids.add(group.id);
      }
    });
    return ids;
  }, [
    activePlanarPolygonGroupId,
    planarPolygonGroups,
    selectedPlanarPolygonGroupId,
  ]);

  const closedAreaVertexPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      if (!group.closed) return;
      group.vertexPointIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups]);

  const selectedClosedAreaVertexPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (selectedClosedAreaGroupIdSet.size === 0) {
      return ids;
    }
    planarPolygonGroups.forEach((group) => {
      if (!group.closed || !selectedClosedAreaGroupIdSet.has(group.id)) return;
      group.vertexPointIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups, selectedClosedAreaGroupIdSet]);

  const unselectedClosedAreaVertexPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    closedAreaVertexPointIdSet.forEach((pointId) => {
      if (!selectedClosedAreaVertexPointIdSet.has(pointId)) {
        ids.add(pointId);
      }
    });
    return ids;
  }, [closedAreaVertexPointIdSet, selectedClosedAreaVertexPointIdSet]);

  const labelAnchorPointIdsWithForcedVisibility = useMemo(
    () =>
      collectLabelAnchorPointIdsWithForcedVisibility(
        pointMeasurements,
        unselectedClosedAreaVertexPointIdSet
      ),
    [pointMeasurements, unselectedClosedAreaVertexPointIdSet]
  );

  const openFacadeSingleVertexPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      if (group.closed) return;
      if ((group.surfaceType ?? "roof") !== "facade") return;
      if (group.vertexPointIds.length !== 1) return;
      const onlyPointId = group.vertexPointIds[0];
      if (onlyPointId) {
        ids.add(onlyPointId);
      }
    });
    return ids;
  }, [planarPolygonGroups]);

  const showPoints = !hideMeasurementsOfType.has(ANNOTATION_TYPE_DISTANCE);
  const showDistanceAndPolygonVisuals = true;

  const pointMeasurementIds = useMemo(() => {
    const ids = new Set<string>();
    annotations.forEach((measurement) => {
      if (!isPointAnnotationEntry(measurement)) return;
      ids.add(measurement.id);
    });
    return ids;
  }, [annotations, planarPolygonGroups.length]);

  const showPointLabels =
    showPoints &&
    showLabels &&
    !hideLabelsOfType.has(ANNOTATION_TYPE_DISTANCE);
  const pointIdsWithoutLabelAnchor = useMemo(
    () => collectPointIdsWithoutSelfLabelAnchor(pointMeasurements),
    [pointMeasurements]
  );

  const lockedMeasurementIdSet = useMemo(() => {
    const ids = new Set<string>();
    annotations.forEach((measurement) => {
      if (measurement.locked) {
        ids.add(measurement.id);
      }
    });
    return ids;
  }, [annotations]);

  const lastCustomLabelOnCreate = useMemo(() => {
    for (let index = annotations.length - 1; index >= 0; index -= 1) {
      const measurement = annotations[index];
      if (!measurement || !isPointAnnotationEntry(measurement)) continue;
      if (!measurement.auxiliaryLabelAnchor) continue;
      const customName = getCustomPointAnnotationName(measurement.name);
      if (customName) return customName;
    }
    return undefined;
  }, [annotations]);

  const { selectMeasurementIds, selectMeasurementById } =
    useAnnotationSelectionMutations({
      selectableMeasurementIds: pointMeasurementIds,
      selectedMeasurementIdRef,
      setSelectedMeasurementId,
      setSelectedMeasurementIds,
      onPrimarySelectionChange: (nextPrimaryId, previousPrimaryId) => {
        if (
          nextPrimaryId &&
          previousPrimaryId &&
          nextPrimaryId !== previousPrimaryId
        ) {
          setPreviousSelectedMeasurementId(previousPrimaryId);
        }
      },
      onSelectionIdsChange: (_nextIds, nextPrimaryId) => {
        if (nextPrimaryId !== null) {
          setSelectedPlanarPolygonGroupId((prevSelectedGroupId) =>
            prevSelectedGroupId === null ? prevSelectedGroupId : null
          );
        }
      },
    });

  // Creation flows can select an id before it appears in the current selectable-id
  // snapshot. This bypass keeps InfoBox/selection in sync with the just-created point.
  const selectMeasurementByIdImmediate = useCallback(
    (id: string | null) => {
      const previousPrimaryId = selectedMeasurementIdRef.current;
      selectedMeasurementIdRef.current = id;
      setSelectedMeasurementId((prev) => (prev === id ? prev : id));
      setSelectedMeasurementIds((prev) => {
        if (id === null) {
          return prev.length === 0 ? prev : [];
        }
        return prev.length === 1 && prev[0] === id ? prev : [id];
      });
      if (id !== null) {
        setSelectedPlanarPolygonGroupId((prev) =>
          prev === null ? prev : null
        );
      }
      if (previousPrimaryId && id && previousPrimaryId !== id) {
        setPreviousSelectedMeasurementId(previousPrimaryId);
      }
    },
    [
      selectedMeasurementIdRef,
      setSelectedMeasurementId,
      setSelectedMeasurementIds,
      setSelectedPlanarPolygonGroupId,
      setPreviousSelectedMeasurementId,
    ]
  );

  const selectPlanarPolygonGroupById = useCallback((id: string | null) => {
    setSelectedPlanarPolygonGroupId((prev) => (prev === id ? prev : id));
    if (id !== null) {
      selectedMeasurementIdRef.current = null;
      setSelectedMeasurementId(null);
      setSelectedMeasurementIds([]);
      setPreviousSelectedMeasurementId(null);
      setDoubleClickChainSourcePointId(null);
      setActivePlanarPolygonGroupId(null);
      setMoveGizmoPointId(null);
      setMoveGizmoAxisDirection(null);
      setMoveGizmoAxisTitle(null);
      setMoveGizmoAxisCandidates(null);
      setIsMoveGizmoDragging(false);
    }
  }, []);

  const selectedDistancePair = useMemo(() => {
    if (!selectedMeasurementId || !previousSelectedMeasurementId) {
      return null;
    }
    if (selectedMeasurementId === previousSelectedMeasurementId) {
      return null;
    }
    if (
      !pointMeasurementIds.has(selectedMeasurementId) ||
      !pointMeasurementIds.has(previousSelectedMeasurementId)
    ) {
      return null;
    }
    return {
      activePointId: selectedMeasurementId,
      previousPointId: previousSelectedMeasurementId,
    };
  }, [
    pointMeasurementIds,
    previousSelectedMeasurementId,
    selectedMeasurementId,
  ]);

  // Internal drawing-session signal for an active open polyline/polygon chain.
  const isActiveDrawMode = useMemo(() => {
    if (!doubleClickChainSourcePointId) return false;
    if (!pointMeasurementIds.has(doubleClickChainSourcePointId)) return false;
    if (!activePlanarPolygonGroupId) return false;
    return planarPolygonGroups.some(
      (group) => group.id === activePlanarPolygonGroupId && !group.closed
    );
  }, [
    activePlanarPolygonGroupId,
    doubleClickChainSourcePointId,
    planarPolygonGroups,
    pointMeasurementIds,
  ]);

  const selectedDistanceRelation = useMemo(() => {
    if (!selectedDistancePair) return null;
    return (
      distanceRelations.find((relation) =>
        isSameDistanceRelationPair(
          relation,
          selectedDistancePair.activePointId,
          selectedDistancePair.previousPointId
        )
      ) ?? null
    );
  }, [distanceRelations, selectedDistancePair]);

  const showSelectedReferenceLine =
    selectedDistanceRelation?.showDirectLine ?? false;
  const selectedVerticalLineVisible =
    selectedDistanceRelation?.showVerticalLine ??
    selectedDistanceRelation?.showComponentLines ??
    false;
  const selectedHorizontalLineVisible =
    selectedDistanceRelation?.showHorizontalLine ??
    selectedDistanceRelation?.showComponentLines ??
    false;
  const showSelectedReferenceLineComponents =
    selectedVerticalLineVisible || selectedHorizontalLineVisible;

  const referencePointMeasurementId = useMemo(() => {
    if (!referencePoint) return null;
    const pointMeasurement = annotations.find(
      (measurement) =>
        isPointAnnotationEntry(measurement) &&
        Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
          REFERENCE_POINT_SYNC_EPSILON_METERS
    );
    return pointMeasurement && isPointAnnotationEntry(pointMeasurement)
      ? pointMeasurement.id
      : null;
  }, [annotations, referencePoint]);

  const resolveDistanceRelationSourcePointId = useCallback(
    (targetPointId: string) => {
      if (distanceModeStickyToFirstPoint && referencePointMeasurementId) {
        return referencePointMeasurementId === targetPointId
          ? null
          : referencePointMeasurementId;
      }
      const hasChainSource = Boolean(
        doubleClickChainSourcePointId &&
          pointMeasurementIds.has(doubleClickChainSourcePointId)
      );
      if (!hasChainSource) return null;
      return doubleClickChainSourcePointId === targetPointId
        ? null
        : doubleClickChainSourcePointId;
    },
    [
      distanceModeStickyToFirstPoint,
      doubleClickChainSourcePointId,
      pointMeasurementIds,
      referencePointMeasurementId,
    ]
  );

  const setDistanceCreationLineVisibilityByKind = useCallback(
    (kind: "direct" | "vertical" | "horizontal", visible: boolean) => {
      setDistanceCreationLineVisibility((prev) =>
        prev[kind] === visible
          ? prev
          : {
              ...prev,
              [kind]: visible,
            }
      );
    },
    []
  );

  const activePreviewAnchorPointId = useMemo(() => {
    if (!activePreviewSupportsDistanceLine) return null;
    return resolveDistanceRelationSourcePointId("__live-preview-target__");
  }, [activePreviewSupportsDistanceLine, resolveDistanceRelationSourcePointId]);

  const hasDistancePreviewAnchor = useMemo(() => {
    if (annotationMode !== ANNOTATION_TYPE_DISTANCE) {
      return false;
    }

    if (distanceModeStickyToFirstPoint && referencePointMeasurementId) {
      return true;
    }

    return Boolean(
      doubleClickChainSourcePointId &&
        pointMeasurementIds.has(doubleClickChainSourcePointId)
    );
  }, [
    distanceModeStickyToFirstPoint,
    doubleClickChainSourcePointId,
    annotationMode,
    pointMeasurementIds,
    referencePointMeasurementId,
  ]);

  const activeMeasurementId = useMemo(() => {
    if (moveGizmoPointId && pointMeasurementIds.has(moveGizmoPointId)) {
      return moveGizmoPointId;
    }

    if (activePreviewAnchorPointId) {
      return activePreviewAnchorPointId;
    }

    if (
      doubleClickChainSourcePointId &&
      pointMeasurementIds.has(doubleClickChainSourcePointId)
    ) {
      return doubleClickChainSourcePointId;
    }

    if (
      selectedMeasurementId &&
      pointMeasurementIds.has(selectedMeasurementId)
    ) {
      return selectedMeasurementId;
    }

    return null;
  }, [
    activePreviewAnchorPointId,
    doubleClickChainSourcePointId,
    moveGizmoPointId,
    pointMeasurementIds,
    selectedMeasurementId,
  ]);

  const livePreviewDistanceLine = useMemo(() => {
    if (!livePreviewPointECEF || !activePreviewAnchorPointId) {
      return null;
    }

    const sourcePoint = getPointById(annotations, activePreviewAnchorPointId);
    if (!sourcePoint || !isPointAnnotationEntry(sourcePoint)) {
      return null;
    }

    const showDirectLine = activePreviewForceDirectDistanceLine
      ? true
      : activePreviewUsesPolylineDistanceRules
      ? polylineSegmentLineMode === LINEAR_SEGMENT_LINE_MODE_DIRECT
      : distanceCreationLineVisibility.direct;
    const showComponentLines = activePreviewForceDirectDistanceLine
      ? false
      : activePreviewUsesPolylineDistanceRules
      ? polylineSegmentLineMode === LINEAR_SEGMENT_LINE_MODE_COMPONENTS
      : distanceCreationLineVisibility.vertical ||
        distanceCreationLineVisibility.horizontal;
    const showVerticalLine = activePreviewUsesPolylineDistanceRules
      ? showComponentLines
      : distanceCreationLineVisibility.vertical;
    const showHorizontalLine = activePreviewUsesPolylineDistanceRules
      ? showComponentLines
      : distanceCreationLineVisibility.horizontal;

    if (!showDirectLine && !showVerticalLine && !showHorizontalLine) {
      return null;
    }

    return {
      anchorPointECEF: Cartesian3.clone(sourcePoint.geometryECEF),
      targetPointECEF: Cartesian3.clone(livePreviewPointECEF),
      showDirectLine,
      showVerticalLine,
      showHorizontalLine,
      previewTotalDistanceMeters: previewIsPolylineCreateMode
        ? (focusedPolylineDistanceToStartByPointId[
            activePreviewAnchorPointId
          ] ?? 0) +
          Cartesian3.distance(sourcePoint.geometryECEF, livePreviewPointECEF)
        : undefined,
    };
  }, [
    distanceCreationLineVisibility.direct,
    distanceCreationLineVisibility.horizontal,
    distanceCreationLineVisibility.vertical,
    livePreviewPointECEF,
    activePreviewAnchorPointId,
    activePreviewForceDirectDistanceLine,
    activePreviewUsesPolylineDistanceRules,
    previewIsPolylineCreateMode,
    focusedPolylineDistanceToStartByPointId,
    annotations,
    polylineSegmentLineMode,
  ]);

  const handlePointQueryBeforePointCreate = useCallback(
    (_positionECEF: Cartesian3 | null, screenPosition: Cartesian2) => {
      // Check if click hit a polygon fill primitive
      if (scene && !scene.isDestroyed()) {
        const picked = scene.pick(screenPosition);
        const pickedPolygonGroupId = picked?.id?.polygonGroupId;
        if (pickedPolygonGroupId) {
          selectPlanarPolygonGroupById(pickedPolygonGroupId);
          return false;
        }
      }

      if (isActiveDrawMode) {
        return true;
      }

      if (selectedPlanarPolygonGroupId) {
        selectPlanarPolygonGroupById(null);
        if (annotationMode === ANNOTATION_TYPE_POLYLINE) {
          return true;
        }
        return false;
      }

      return true;
    },
    [
      annotationMode,
      scene,
      isActiveDrawMode,
      selectPlanarPolygonGroupById,
      selectedPlanarPolygonGroupId,
    ]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !selectionModeActive) {
      return;
    }

    const clickHandler = new ScreenSpaceEventHandler(scene.canvas);
    clickHandler.setInputAction((event) => {
      const screenPosition = event.position;
      if (!screenPosition) return;

      const picked = scene.pick(screenPosition);
      if (!picked) {
        selectMeasurementById(null);
        selectPlanarPolygonGroupById(null);
        return;
      }
      const pickedPolygonGroupId = picked?.id?.polygonGroupId;
      if (typeof pickedPolygonGroupId !== "string") return;
      if (!pickedPolygonGroupId.trim()) return;

      selectMeasurementById(null);
      selectPlanarPolygonGroupById(pickedPolygonGroupId);
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      clickHandler.destroy();
    };
  }, [
    scene,
    selectionModeActive,
    selectMeasurementById,
    selectPlanarPolygonGroupById,
  ]);

  const upsertDirectDistanceRelation = useCallback(
    (sourcePointId: string, targetPointId: string) => {
      if (!sourcePointId || !targetPointId || sourcePointId === targetPointId) {
        return;
      }

      setDistanceRelations((prev) => {
        const relationIndex = prev.findIndex((relation) =>
          isSameDistanceRelationPair(relation, sourcePointId, targetPointId)
        );
        const relation =
          relationIndex >= 0
            ? withDistanceRelationEdgeId(prev[relationIndex])
            : ({
                id: getDistanceRelationId(sourcePointId, targetPointId),
                edgeId: getMeasurementEdgeId(sourcePointId, targetPointId),
                pointAId: sourcePointId,
                pointBId: targetPointId,
                anchorPointId: sourcePointId,
                showDirectLine: distanceCreationLineVisibility.direct,
                showVerticalLine: distanceCreationLineVisibility.vertical,
                showHorizontalLine: distanceCreationLineVisibility.horizontal,
                showComponentLines:
                  distanceCreationLineVisibility.vertical ||
                  distanceCreationLineVisibility.horizontal,
                labelVisibilityByKind:
                  DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              } satisfies PointDistanceRelation);

        const nextRelation: PointDistanceRelation = {
          ...relation,
          edgeId: getMeasurementEdgeId(sourcePointId, targetPointId),
          anchorPointId: sourcePointId,
          showDirectLine:
            relation.showDirectLine ?? distanceCreationLineVisibility.direct,
          showVerticalLine:
            relation.showVerticalLine ??
            relation.showComponentLines ??
            distanceCreationLineVisibility.vertical,
          showHorizontalLine:
            relation.showHorizontalLine ??
            relation.showComponentLines ??
            distanceCreationLineVisibility.horizontal,
          showComponentLines:
            relation.showComponentLines ??
            relation.showVerticalLine ??
            relation.showHorizontalLine ??
            (distanceCreationLineVisibility.vertical ||
              distanceCreationLineVisibility.horizontal),
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
            ...(relation.labelVisibilityByKind ?? {}),
          },
          directLabelMode:
            relation.directLabelMode ?? DEFAULT_DIRECT_LINE_LABEL_MODE,
        };

        if (relationIndex < 0) return [...prev, nextRelation];
        return prev.map((entry, index) =>
          index === relationIndex ? nextRelation : entry
        );
      });
    },
    [distanceCreationLineVisibility]
  );

  const syncPolygonEdgeDistanceRelations = useCallback(
    (
      prevRelations: PointDistanceRelation[],
      groups: PlanarPolygonGroup[]
    ): PointDistanceRelation[] => {
      const desiredById = new Map<
        string,
        {
          groupId: string;
          pointAId: string;
          pointBId: string;
          showDirectLine: boolean;
          showComponentLines: boolean;
        }
      >();

      groups.forEach((group) => {
        if (group.vertexPointIds.length < 2) return;
        const segmentLineMode =
          group.segmentLineMode ??
          (group.closed
            ? LINEAR_SEGMENT_LINE_MODE_DIRECT
            : defaultPolylineSegmentLineMode);
        const showDirectLine =
          segmentLineMode === LINEAR_SEGMENT_LINE_MODE_DIRECT;
        const showComponentLines =
          segmentLineMode === LINEAR_SEGMENT_LINE_MODE_COMPONENTS;
        const orderedVertices = group.vertexPointIds;
        for (let index = 0; index < orderedVertices.length - 1; index += 1) {
          const pointAId = orderedVertices[index];
          const pointBId = orderedVertices[index + 1];
          if (!pointAId || !pointBId) continue;
          const relationId = getDistanceRelationId(pointAId, pointBId);
          desiredById.set(relationId, {
            groupId: group.id,
            pointAId,
            pointBId,
            showDirectLine,
            showComponentLines,
          });
        }
        if (group.closed && orderedVertices.length >= 3) {
          const first = orderedVertices[0];
          const last = orderedVertices[orderedVertices.length - 1];
          if (first && last) {
            const relationId = getDistanceRelationId(last, first);
            desiredById.set(relationId, {
              groupId: group.id,
              pointAId: last,
              pointBId: first,
              showDirectLine,
              showComponentLines,
            });
          }
        }
      });

      const next: PointDistanceRelation[] = [];
      const handledIds = new Set<string>();

      prevRelations.forEach((relation) => {
        const desired = desiredById.get(relation.id);
        if (!desired) {
          if (!relation.polygonGroupId) {
            next.push(relation);
          }
          return;
        }

        handledIds.add(relation.id);
        next.push({
          ...withDistanceRelationEdgeId(relation),
          edgeId: getMeasurementEdgeId(desired.pointAId, desired.pointBId),
          pointAId: desired.pointAId,
          pointBId: desired.pointBId,
          anchorPointId: desired.pointAId,
          polygonGroupId: desired.groupId,
          showDirectLine: desired.showDirectLine,
          showVerticalLine: desired.showComponentLines,
          showHorizontalLine: desired.showComponentLines,
          showComponentLines: desired.showComponentLines,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
            ...(relation.labelVisibilityByKind ?? {}),
          },
          directLabelMode:
            relation.directLabelMode ?? DEFAULT_DIRECT_LINE_LABEL_MODE,
        });
      });

      desiredById.forEach((desired, relationId) => {
        if (handledIds.has(relationId)) return;
        next.push({
          id: relationId,
          edgeId: getMeasurementEdgeId(desired.pointAId, desired.pointBId),
          pointAId: desired.pointAId,
          pointBId: desired.pointBId,
          anchorPointId: desired.pointAId,
          polygonGroupId: desired.groupId,
          showDirectLine: desired.showDirectLine,
          showVerticalLine: desired.showComponentLines,
          showHorizontalLine: desired.showComponentLines,
          showComponentLines: desired.showComponentLines,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
          },
          directLabelMode: DEFAULT_DIRECT_LINE_LABEL_MODE,
        });
      });

      return next;
    },
    [defaultPolylineSegmentLineMode]
  );

  const handlePointMeasurePointCreated = useCallback(
    (newPointId: string) => {
      setDoubleClickChainSourcePointId(null);
      setActivePlanarPolygonGroupId(null);
      setSelectedPlanarPolygonGroupId(null);
      if (pointLabelOnCreate) {
        setLabelInputPromptPointId(newPointId);
      }
      selectMeasurementByIdImmediate(newPointId);
    },
    [pointLabelOnCreate, selectMeasurementByIdImmediate]
  );

  const confirmPointLabelInputById = useCallback((id: string) => {
    if (!id) return;
    setLabelInputPromptPointId((previousPromptPointId) =>
      previousPromptPointId === id ? null : previousPromptPointId
    );
  }, []);

  const handleDistancePointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      const sourcePointId = resolveDistanceRelationSourcePointId(newPointId);
      if (sourcePointId) {
        upsertDirectDistanceRelation(sourcePointId, newPointId);
        // Distance-mode nodes stay node-only via `distanceAdhocNode`.
        // No per-relation point ownership metadata is written.
      }

      setActivePlanarPolygonGroupId(null);
      setSelectedPlanarPolygonGroupId(null);
      if (distanceModeStickyToFirstPoint) {
        if (!referencePointMeasurementId) {
          setReferencePoint(newPointPositionECEF);
        }
        setDoubleClickChainSourcePointId(
          referencePointMeasurementId ?? newPointId
        );
      } else {
        setDoubleClickChainSourcePointId(sourcePointId ? null : newPointId);
      }
      selectMeasurementByIdImmediate(newPointId);
    },
    [
      distanceModeStickyToFirstPoint,
      referencePointMeasurementId,
      resolveDistanceRelationSourcePointId,
      selectMeasurementByIdImmediate,
      setReferencePoint,
      upsertDirectDistanceRelation,
    ]
  );

  const handlePolylinePointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      const sourcePointId = resolveDistanceRelationSourcePointId(newPointId);

      let projectedPointPosition: Cartesian3 | null = null;
      const activeGroupSnapshot =
        (activePlanarPolygonGroupId
          ? planarPolygonGroups.find(
              (group) => group.id === activePlanarPolygonGroupId
            )
          : null) ?? null;
      const creatingNewGroup =
        !activeGroupSnapshot || Boolean(activeGroupSnapshot.closed);
      const nextActiveGroupId = creatingNewGroup
        ? `planar-polygon-${Date.now()}-${newPointId}`
        : activeGroupSnapshot.id;
      const pointByIdSnapshot = getPointPositionMap(annotations, {
        [newPointId]: newPointPositionECEF,
      });
      const seedPlanarGroupConfig = resolvePlanarGroupSeedConfig({
        planarToolCreationMode,
        polygonSurfaceTypePreset,
        defaultPolylineSegmentLineMode,
      });
      const seedMeasurementKindForCreation =
        seedPlanarGroupConfig.measurementKind;
      const seedSurfaceTypeForCreation = seedPlanarGroupConfig.surfaceType;
      const facadeAutoCloseFromNewPoint = (() => {
        if (
          planarToolCreationMode !==
          PLANAR_TOOL_CREATION_MODE_POLYGON
        )
          return null;

        const candidateVertexPointIds = creatingNewGroup
          ? sourcePointId &&
            sourcePointId !== newPointId &&
            pointByIdSnapshot.has(sourcePointId)
            ? [sourcePointId, newPointId]
            : [newPointId]
          : [...(activeGroupSnapshot?.vertexPointIds ?? []), newPointId];

        const candidateSurfaceType = creatingNewGroup
          ? seedSurfaceTypeForCreation
          : activeGroupSnapshot?.surfaceType ?? "roof";

        if (candidateSurfaceType !== "facade") return null;
        if (candidateVertexPointIds.length !== 2) return null;

        return buildFacadeAutoCloseRectangle(
          pointByIdSnapshot,
          candidateVertexPointIds[0] ?? null,
          candidateVertexPointIds[1] ?? null
        );
      })();
      const createdFacadeAutoCorners = facadeAutoCloseFromNewPoint?.autoCorners;
      const autoClosedAsFacadeRectangle = Boolean(facadeAutoCloseFromNewPoint);

      if (sourcePointId && !autoClosedAsFacadeRectangle) {
        upsertDirectDistanceRelation(sourcePointId, newPointId);
      }

      setPlanarPolygonGroups((prev) => {
        const activeGroup =
          (activePlanarPolygonGroupId
            ? prev.find((group) => group.id === activePlanarPolygonGroupId)
            : null) ?? null;

        const pointById = getPointPositionMap(annotations, {
          [newPointId]: newPointPositionECEF,
        });

        if (!activeGroup || activeGroup.closed) {
          const seedVertexPointIds =
            sourcePointId &&
            sourcePointId !== newPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, newPointId]
              : [newPointId];
          const seedSurfaceType = seedPlanarGroupConfig.surfaceType;
          const seedMeasurementKind = seedPlanarGroupConfig.measurementKind;
          const seedSegmentLineMode = seedPlanarGroupConfig.segmentLineMode;

          if (
            planarToolCreationMode ===
              PLANAR_TOOL_CREATION_MODE_POLYGON &&
            seedSurfaceType === "facade" &&
            seedVertexPointIds.length === 2 &&
            facadeAutoCloseFromNewPoint
          ) {
            facadeAutoCloseFromNewPoint.autoCorners.forEach(
              ({ id, position }) => {
                pointById.set(id, position);
              }
            );
            const closedVertexPointIds = [
              ...facadeAutoCloseFromNewPoint.closedVertexPointIds,
            ];
            const closedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
              closedVertexPointIds,
              true,
              getDistanceRelationId
            );
            return [
              ...prev,
              computePolygonGroupDerivedDataWithCamera(
                {
                  id: nextActiveGroupId,
                  measurementKind: seedMeasurementKindForCreation,
                  segmentLineMode: seedSegmentLineMode,
                  verticalOffsetMeters: polylineVerticalOffsetMeters,
                  vertexPointIds: closedVertexPointIds,
                  edgeRelationIds: closedEdgeRelationIds,
                  distanceMeasurementStartPointId:
                    closedVertexPointIds[0] ?? undefined,
                  closed: true,
                  planeLocked: true,
                  areaSquareMeters: 0,
                  verticalityDeg: 0,
                  surfaceType: seedSurfaceType,
                },
                pointById
              ),
            ];
          }

          const seedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            seedVertexPointIds,
            false,
            getDistanceRelationId
          );
          return [
            ...prev,
            {
              id: nextActiveGroupId,
              measurementKind: seedMeasurementKind,
              segmentLineMode: seedSegmentLineMode,
              verticalOffsetMeters: polylineVerticalOffsetMeters,
              vertexPointIds: seedVertexPointIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId:
                seedVertexPointIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
              surfaceType: seedSurfaceType,
            },
          ];
        }

        let nextVertexPointIds = [...activeGroup.vertexPointIds, newPointId];
        let shouldCloseGroup = activeGroup.closed;
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;
        let nextPointPosition = newPointPositionECEF;
        const shouldKeepSurfaceSampledVertices =
          planarToolCreationMode ===
            PLANAR_TOOL_CREATION_MODE_POLYGON &&
          (activeGroup.surfaceType ?? "roof") === "footprint";
        const isRoofSurface =
          planarToolCreationMode ===
            PLANAR_TOOL_CREATION_MODE_POLYGON &&
          (activeGroup.surfaceType ?? "roof") === "roof";

        if (
          isRoofSurface &&
          !nextPlaneLocked &&
          activeGroup.vertexPointIds.length === 1
        ) {
          const firstVertexPointId = activeGroup.vertexPointIds[0] ?? null;
          const firstVertexPointPosition = firstVertexPointId
            ? pointById.get(firstVertexPointId) ?? null
            : null;
          if (firstVertexPointPosition) {
            nextPointPosition = projectPointToHorizontalPlaneAtAnchor(
              nextPointPosition,
              firstVertexPointPosition
            );
            projectedPointPosition = nextPointPosition;
            pointById.set(newPointId, nextPointPosition);
          }
        }

        if (!shouldKeepSurfaceSampledVertices && nextPlaneLocked && nextPlane) {
          nextPointPosition = projectPointOntoPlane(
            nextPointPosition,
            nextPlane
          );
          projectedPointPosition = nextPointPosition;
          pointById.set(newPointId, nextPointPosition);
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          isRoofSurface &&
          !nextPlaneLocked &&
          nextVertexPointIds.length >= 3
        ) {
          const first = pointById.get(nextVertexPointIds[0] ?? "");
          const second = pointById.get(nextVertexPointIds[1] ?? "");
          if (first && second) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              nextPointPosition
            );
            if (candidatePlane) {
              nextPlane = orientPlaneTowardSceneCamera(candidatePlane);
              nextPlaneLocked = true;
              nextPointPosition = projectPointOntoPlane(
                nextPointPosition,
                nextPlane
              );
              projectedPointPosition = nextPointPosition;
              pointById.set(newPointId, nextPointPosition);
            }
          }
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          !isRoofSurface &&
          nextVertexPointIds.length >= 4
        ) {
          const first = pointById.get(nextVertexPointIds[0] ?? "");
          const second = pointById.get(nextVertexPointIds[1] ?? "");
          const third = pointById.get(nextVertexPointIds[2] ?? "");
          if (first && second && third) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              third
            );
            if (candidatePlane) {
              const orientedCandidatePlane =
                orientPlaneTowardSceneCamera(candidatePlane);
              const planeDistance = distancePointToPlane(
                nextPointPosition,
                orientedCandidatePlane
              );
              const firstFourPoints = nextVertexPointIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                orientedCandidatePlane
              );

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                nextPlane = orientedCandidatePlane;
                nextPlaneLocked = true;
                nextPointPosition = projectPointOntoPlane(
                  nextPointPosition,
                  orientedCandidatePlane
                );
                projectedPointPosition = nextPointPosition;
                pointById.set(newPointId, nextPointPosition);
              }
            }
          }
        }

        if (
          planarToolCreationMode ===
            PLANAR_TOOL_CREATION_MODE_POLYGON &&
          (activeGroup.surfaceType ?? "roof") === "facade" &&
          nextVertexPointIds.length === 2 &&
          facadeAutoCloseFromNewPoint
        ) {
          facadeAutoCloseFromNewPoint.autoCorners.forEach(
            ({ id, position }) => {
              pointById.set(id, position);
            }
          );
          nextVertexPointIds = [
            ...facadeAutoCloseFromNewPoint.closedVertexPointIds,
          ];
          shouldCloseGroup = true;
          nextPlaneLocked = true;
        }

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextVertexPointIds,
          shouldCloseGroup,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            measurementKind: activeGroup.measurementKind,
            vertexPointIds: nextVertexPointIds,
            edgeRelationIds: nextEdgeRelationIds,
            closed: shouldCloseGroup,
            planeLocked: shouldKeepSurfaceSampledVertices
              ? false
              : nextPlaneLocked,
            plane: shouldKeepSurfaceSampledVertices ? undefined : nextPlane,
          },
          pointById
        );
        return prev.map((group) =>
          group.id === activeGroup.id ? updatedGroup : group
        );
      });

      setActivePlanarPolygonGroupId(nextActiveGroupId);

      if (projectedPointPosition) {
        const geometryWGS84 = getDegreesFromCartesian(projectedPointPosition);
        setAnnotations((prev) =>
          prev.map((measurement) => {
            if (
              !isPointAnnotationEntry(measurement) ||
              measurement.id !== newPointId
            ) {
              return measurement;
            }
            return {
              ...measurement,
              geometryECEF: projectedPointPosition as Cartesian3,
              geometryWGS84: {
                longitude: geometryWGS84.longitude,
                latitude: geometryWGS84.latitude,
                altitude: getEllipsoidalAltitudeOrZero(geometryWGS84.altitude),
              },
            };
          })
        );
      }

      if (createdFacadeAutoCorners && createdFacadeAutoCorners.length > 0) {
        setAnnotations((prev) => {
          const pointMeasurements = prev.filter(isPointAnnotationEntry);
          const maxPointIndex = pointMeasurements.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries: AnnotationEntry[] =
            createdFacadeAutoCorners.map(({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: ANNOTATION_TYPE_DISTANCE,
                id,
                index: maxPointIndex + index + 1,
                isFacadeAutoCorner: true,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  altitude: getEllipsoidalAltitudeOrZero(cornerWGS84.altitude),
                },
                timestamp: Date.now() + index,
              };
            });
          return [...prev, ...autoCornerEntries];
        });
      }

      if (autoClosedAsFacadeRectangle) {
        setDoubleClickChainSourcePointId(null);
        setActivePlanarPolygonGroupId(null);
        setSelectedPlanarPolygonGroupId(nextActiveGroupId);
        selectedMeasurementIdRef.current = null;
        setSelectedMeasurementId(null);
        setPreviousSelectedMeasurementId(null);
      } else {
        setDoubleClickChainSourcePointId(newPointId);
        if (sourcePointId) {
          setSelectedPlanarPolygonGroupId(nextActiveGroupId);
          selectedMeasurementIdRef.current = null;
          setSelectedMeasurementId(null);
          setPreviousSelectedMeasurementId(null);
        } else {
          selectMeasurementById(newPointId);
        }
      }
    },
    [
      activePlanarPolygonGroupId,
      annotations,
      planarPolygonGroups,
      resolveDistanceRelationSourcePointId,
      selectMeasurementById,
      upsertDirectDistanceRelation,
      setAnnotations,
      defaultPolylineSegmentLineMode,
      polylineVerticalOffsetMeters,
      planarToolCreationMode,
      polygonSurfaceTypePreset,
      orientPlaneTowardSceneCamera,
      computePolygonGroupDerivedDataWithCamera,
    ]
  );

  const pointCreatedHandlerByMode = useMemo<
    Partial<
      Record<AnnotationMode, (id: string, positionECEF: Cartesian3) => void>
    >
  >(
    () => ({
      [ANNOTATION_TYPE_POINT]: (id) => handlePointMeasurePointCreated(id),
      [ANNOTATION_TYPE_DISTANCE]: (id, positionECEF) =>
        handleDistancePointCreated(id, positionECEF),
      [ANNOTATION_TYPE_POLYLINE]: (id, positionECEF) =>
        handlePolylinePointCreated(id, positionECEF),
    }),
    [
      handlePointMeasurePointCreated,
      handleDistancePointCreated,
      handlePolylinePointCreated,
    ]
  );

  const handlePointQueryPointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      pointCreatedHandlerByMode[annotationMode]?.(
        newPointId,
        newPointPositionECEF
      );
    },
    [annotationMode, pointCreatedHandlerByMode]
  );

  const closeActivePlanarPolygonGroup = useCallback(
    (surfaceTypeOverride?: PolygonSurfacePreset) => {
      let closedGroupId: string | null = null;

      setPlanarPolygonGroups((prev) => {
        if (!activePlanarPolygonGroupId) return prev;
        const activeGroup = prev.find(
          (group) => group.id === activePlanarPolygonGroupId
        );
        if (
          !activeGroup ||
          activeGroup.closed ||
          activeGroup.vertexPointIds.length < 3
        ) {
          return prev;
        }

        const pointById = getPointPositionMap(annotations);
        const closedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            closed: true,
            surfaceType:
              surfaceTypeOverride ?? activeGroup.surfaceType ?? "roof",
            edgeRelationIds: buildEdgeRelationIdsForPolygon(
              activeGroup.vertexPointIds,
              true,
              getDistanceRelationId
            ),
          },
          pointById
        );
        closedGroupId = activeGroup.id;
        return prev.map((group) =>
          group.id === activeGroup.id ? closedGroup : group
        );
      });

      setActivePlanarPolygonGroupId(null);
      setDoubleClickChainSourcePointId(null);

      if (closedGroupId) {
        setSelectedPlanarPolygonGroupId(closedGroupId);
        selectedMeasurementIdRef.current = null;
        setSelectedMeasurementId(null);
        setPreviousSelectedMeasurementId(null);
        setMoveGizmoPointId(null);
        setMoveGizmoAxisDirection(null);
        setMoveGizmoAxisTitle(null);
        setMoveGizmoAxisCandidates(null);
        setIsMoveGizmoDragging(false);
      }
    },
    [
      activePlanarPolygonGroupId,
      annotations,
      computePolygonGroupDerivedDataWithCamera,
    ]
  );

  const confirmPolylineRingPromotion = useCallback(
    (surfaceType: PolygonSurfacePreset) => {
      if (!pendingPolylinePromotionRingClosurePointId) return;
      setPendingPolylinePromotionRingClosurePointId(null);
      closeActivePlanarPolygonGroup(surfaceType);
    },
    [
      pendingPolylinePromotionRingClosurePointId,
      closeActivePlanarPolygonGroup,
      setPendingPolylinePromotionRingClosurePointId,
    ]
  );

  const cancelPolylineRingPromotion = useCallback(() => {
    if (!pendingPolylinePromotionRingClosurePointId) return;
    const ringClosurePointId = pendingPolylinePromotionRingClosurePointId;
    setPendingPolylinePromotionRingClosurePointId(null);
    closeActivePlanarPolylineGroupAsRing(ringClosurePointId);
  }, [
    pendingPolylinePromotionRingClosurePointId,
    setPendingPolylinePromotionRingClosurePointId,
  ]);

  const closeActivePlanarPolylineGroupAsRing = useCallback(
    (ringClosurePointId: string) => {
      if (!activePlanarPolygonGroupId) return;
      const finishedGroupId = activePlanarPolygonGroupId;

      setPlanarPolygonGroups((prev) => {
        const pointById = getPointPositionMap(annotations);
        return prev.map((group) => {
          if (group.id !== activePlanarPolygonGroupId || group.closed) {
            return group;
          }
          if (group.vertexPointIds.length < 3) {
            return group;
          }

          const lastPointId =
            group.vertexPointIds[group.vertexPointIds.length - 1] ?? null;
          const nextVertexPointIds =
            lastPointId === ringClosurePointId
              ? [...group.vertexPointIds]
              : [...group.vertexPointIds, ringClosurePointId];
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextVertexPointIds,
            false,
            getDistanceRelationId
          );

          return computePolygonGroupDerivedDataWithCamera(
            {
              ...group,
              closed: false,
              edgeRelationIds: nextEdgeRelationIds,
              vertexPointIds: nextVertexPointIds,
            },
            pointById
          );
        });
      });

      setActivePlanarPolygonGroupId(null);
      setDoubleClickChainSourcePointId(null);
      setSelectedPlanarPolygonGroupId(finishedGroupId);
      selectedMeasurementIdRef.current = null;
      setSelectedMeasurementId(null);
      setSelectedMeasurementIds([]);
      setPreviousSelectedMeasurementId(null);
      setMoveGizmoPointId(null);
      setMoveGizmoAxisDirection(null);
      setMoveGizmoAxisTitle(null);
      setMoveGizmoAxisCandidates(null);
      setIsMoveGizmoDragging(false);
    },
    [
      activePlanarPolygonGroupId,
      annotations,
      computePolygonGroupDerivedDataWithCamera,
    ]
  );

  const finishActivePlanarPolylineGroup = useCallback(() => {
    if (!activePlanarPolygonGroupId) return;
    const finishedGroupId = activePlanarPolygonGroupId;
    setActivePlanarPolygonGroupId(null);
    setDoubleClickChainSourcePointId(null);
    setSelectedPlanarPolygonGroupId(finishedGroupId);
    selectedMeasurementIdRef.current = null;
    setSelectedMeasurementId(null);
    setSelectedMeasurementIds([]);
    setPreviousSelectedMeasurementId(null);
    setMoveGizmoPointId(null);
    setMoveGizmoAxisDirection(null);
    setMoveGizmoAxisTitle(null);
    setMoveGizmoAxisCandidates(null);
    setIsMoveGizmoDragging(false);
  }, [activePlanarPolygonGroupId]);

  const handlePointQueryDoubleClick = useCallback(() => {
    if (
      annotationMode === ANNOTATION_TYPE_POLYLINE &&
      activePlanarPolygonGroupId
    ) {
      const activeOpenGroup =
        planarPolygonGroups.find(
          (group) => group.id === activePlanarPolygonGroupId && !group.closed
        ) ?? null;
      const firstVertexId = activeOpenGroup?.vertexPointIds[0] ?? null;
      const canCloseRing = Boolean(
        firstVertexId &&
          activeOpenGroup &&
          activeOpenGroup.vertexPointIds.length >= 3
      );

      if (canCloseRing && firstVertexId) {
        if (
          planarToolCreationMode ===
          PLANAR_TOOL_CREATION_MODE_POLYGON
        ) {
          closeActivePlanarPolygonGroup();
        } else {
          finishActivePlanarPolylineGroup();
        }
        return;
      }
    }

    // Finish current open line chain when no ring closure can be performed.
    finishActivePlanarPolylineGroup();
  }, [
    annotationMode,
    activePlanarPolygonGroupId,
    planarPolygonGroups,
    planarToolCreationMode,
    closeActivePlanarPolygonGroup,
    finishActivePlanarPolylineGroup,
  ]);

  const appendExistingPointToActivePlanarPolygonGroup = useCallback(
    (existingPointId: string, sourcePointId?: string | null) => {
      const existingPoint = getPointById(annotations, existingPointId);
      if (!existingPoint || !isPointAnnotationEntry(existingPoint)) return;
      const existingPointPosition = existingPoint.geometryECEF;
      const activeGroupSnapshot =
        (activePlanarPolygonGroupId
          ? planarPolygonGroups.find(
              (group) => group.id === activePlanarPolygonGroupId
            )
          : null) ?? null;
      const creatingNewGroup =
        !activeGroupSnapshot || Boolean(activeGroupSnapshot.closed);
      const nextActiveGroupId = creatingNewGroup
        ? `planar-polygon-${Date.now()}-${existingPointId}`
        : activeGroupSnapshot.id;
      const pointByIdSnapshot = getPointPositionMap(annotations);
      const seedPlanarGroupConfig = resolvePlanarGroupSeedConfig({
        planarToolCreationMode,
        polygonSurfaceTypePreset,
        defaultPolylineSegmentLineMode,
      });
      const seedMeasurementKindForCreation =
        seedPlanarGroupConfig.measurementKind;
      const seedSurfaceTypeForCreation = seedPlanarGroupConfig.surfaceType;
      const facadeAutoCloseFromExistingPoint = (() => {
        if (
          planarToolCreationMode !==
          PLANAR_TOOL_CREATION_MODE_POLYGON
        )
          return null;

        const candidateVertexPointIds = creatingNewGroup
          ? sourcePointId &&
            sourcePointId !== existingPointId &&
            pointByIdSnapshot.has(sourcePointId)
            ? [sourcePointId, existingPointId]
            : [existingPointId]
          : [...(activeGroupSnapshot?.vertexPointIds ?? []), existingPointId];

        const candidateSurfaceType = creatingNewGroup
          ? seedSurfaceTypeForCreation
          : activeGroupSnapshot?.surfaceType ?? "roof";

        if (candidateSurfaceType !== "facade") return null;
        if (candidateVertexPointIds.length !== 2) return null;

        return buildFacadeAutoCloseRectangle(
          pointByIdSnapshot,
          candidateVertexPointIds[0] ?? null,
          candidateVertexPointIds[1] ?? null
        );
      })();
      const createdFacadeAutoCorners =
        facadeAutoCloseFromExistingPoint?.autoCorners;
      const autoClosedAsFacadeRectangle = Boolean(
        facadeAutoCloseFromExistingPoint
      );

      setPlanarPolygonGroups((prev) => {
        const activeGroup =
          (activePlanarPolygonGroupId
            ? prev.find((group) => group.id === activePlanarPolygonGroupId)
            : null) ?? null;
        const pointById = getPointPositionMap(annotations);

        if (!activeGroup || activeGroup.closed) {
          const seedVertexPointIds =
            sourcePointId &&
            sourcePointId !== existingPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, existingPointId]
              : [existingPointId];
          const seedSurfaceType = seedPlanarGroupConfig.surfaceType;
          const seedMeasurementKind = seedPlanarGroupConfig.measurementKind;
          const seedSegmentLineMode = seedPlanarGroupConfig.segmentLineMode;

          if (
            planarToolCreationMode ===
              PLANAR_TOOL_CREATION_MODE_POLYGON &&
            seedSurfaceType === "facade" &&
            seedVertexPointIds.length === 2 &&
            facadeAutoCloseFromExistingPoint
          ) {
            facadeAutoCloseFromExistingPoint.autoCorners.forEach(
              ({ id, position }) => {
                pointById.set(id, position);
              }
            );
            const closedVertexPointIds = [
              ...facadeAutoCloseFromExistingPoint.closedVertexPointIds,
            ];
            const closedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
              closedVertexPointIds,
              true,
              getDistanceRelationId
            );
            return [
              ...prev,
              computePolygonGroupDerivedDataWithCamera(
                {
                  id: nextActiveGroupId,
                  measurementKind: seedMeasurementKindForCreation,
                  segmentLineMode: seedSegmentLineMode,
                  verticalOffsetMeters: polylineVerticalOffsetMeters,
                  vertexPointIds: closedVertexPointIds,
                  edgeRelationIds: closedEdgeRelationIds,
                  distanceMeasurementStartPointId:
                    closedVertexPointIds[0] ?? undefined,
                  closed: true,
                  planeLocked: true,
                  areaSquareMeters: 0,
                  verticalityDeg: 0,
                  surfaceType: seedSurfaceType,
                },
                pointById
              ),
            ];
          }

          const seedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            seedVertexPointIds,
            false,
            getDistanceRelationId
          );
          return [
            ...prev,
            {
              id: nextActiveGroupId,
              measurementKind: seedMeasurementKind,
              segmentLineMode: seedSegmentLineMode,
              verticalOffsetMeters: polylineVerticalOffsetMeters,
              vertexPointIds: seedVertexPointIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId:
                seedVertexPointIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
              surfaceType: seedSurfaceType,
            },
          ];
        }

        const lastVertexId =
          activeGroup.vertexPointIds[activeGroup.vertexPointIds.length - 1] ??
          null;
        if (lastVertexId === existingPointId) {
          return prev;
        }

        let nextVertexPointIds = [
          ...activeGroup.vertexPointIds,
          existingPointId,
        ];
        let shouldCloseGroup = activeGroup.closed;
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;
        const shouldKeepSurfaceSampledVertices =
          planarToolCreationMode ===
            PLANAR_TOOL_CREATION_MODE_POLYGON &&
          (activeGroup.surfaceType ?? "roof") === "footprint";
        const isRoofSurface =
          planarToolCreationMode ===
            PLANAR_TOOL_CREATION_MODE_POLYGON &&
          (activeGroup.surfaceType ?? "roof") === "roof";

        if (
          !shouldKeepSurfaceSampledVertices &&
          isRoofSurface &&
          !nextPlaneLocked &&
          nextVertexPointIds.length >= 3
        ) {
          const first = pointById.get(nextVertexPointIds[0] ?? "");
          const second = pointById.get(nextVertexPointIds[1] ?? "");
          if (first && second) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              existingPointPosition
            );
            if (candidatePlane) {
              nextPlane = orientPlaneTowardSceneCamera(candidatePlane);
              nextPlaneLocked = true;
            }
          }
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          !isRoofSurface &&
          !nextPlaneLocked &&
          nextVertexPointIds.length >= 4
        ) {
          const first = pointById.get(nextVertexPointIds[0] ?? "");
          const second = pointById.get(nextVertexPointIds[1] ?? "");
          const third = pointById.get(nextVertexPointIds[2] ?? "");
          if (first && second && third) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              third
            );
            if (candidatePlane) {
              const orientedCandidatePlane =
                orientPlaneTowardSceneCamera(candidatePlane);
              const planeDistance = distancePointToPlane(
                existingPointPosition,
                orientedCandidatePlane
              );
              const firstFourPoints = nextVertexPointIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                orientedCandidatePlane
              );

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                nextPlane = orientedCandidatePlane;
                nextPlaneLocked = true;
              }
            }
          }
        }

        if (
          planarToolCreationMode ===
            PLANAR_TOOL_CREATION_MODE_POLYGON &&
          (activeGroup.surfaceType ?? "roof") === "facade" &&
          nextVertexPointIds.length === 2 &&
          facadeAutoCloseFromExistingPoint
        ) {
          facadeAutoCloseFromExistingPoint.autoCorners.forEach(
            ({ id, position }) => {
              pointById.set(id, position);
            }
          );
          nextVertexPointIds = [
            ...facadeAutoCloseFromExistingPoint.closedVertexPointIds,
          ];
          shouldCloseGroup = true;
          nextPlaneLocked = true;
        }

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextVertexPointIds,
          shouldCloseGroup,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            measurementKind: activeGroup.measurementKind,
            vertexPointIds: nextVertexPointIds,
            edgeRelationIds: nextEdgeRelationIds,
            closed: shouldCloseGroup,
            planeLocked: shouldKeepSurfaceSampledVertices
              ? false
              : nextPlaneLocked,
            plane: shouldKeepSurfaceSampledVertices ? undefined : nextPlane,
          },
          pointById
        );
        return prev.map((group) =>
          group.id === activeGroup.id ? updatedGroup : group
        );
      });

      if (createdFacadeAutoCorners && createdFacadeAutoCorners.length > 0) {
        setAnnotations((prev) => {
          const pointMeasurements = prev.filter(isPointAnnotationEntry);
          const maxPointIndex = pointMeasurements.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries: AnnotationEntry[] =
            createdFacadeAutoCorners.map(({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: ANNOTATION_TYPE_DISTANCE,
                id,
                index: maxPointIndex + index + 1,
                isFacadeAutoCorner: true,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  altitude: getEllipsoidalAltitudeOrZero(cornerWGS84.altitude),
                },
                timestamp: Date.now() + index,
              };
            });
          return [...prev, ...autoCornerEntries];
        });
      }

      if (autoClosedAsFacadeRectangle) {
        setDoubleClickChainSourcePointId(null);
        setActivePlanarPolygonGroupId(null);
        setSelectedPlanarPolygonGroupId(nextActiveGroupId);
        selectedMeasurementIdRef.current = null;
        setSelectedMeasurementId(null);
        setSelectedMeasurementIds([]);
        setPreviousSelectedMeasurementId(null);
        return true;
      }

      setActivePlanarPolygonGroupId(nextActiveGroupId);
      return false;
    },
    [
      activePlanarPolygonGroupId,
      annotations,
      planarPolygonGroups,
      defaultPolylineSegmentLineMode,
      polylineVerticalOffsetMeters,
      planarToolCreationMode,
      polygonSurfaceTypePreset,
      orientPlaneTowardSceneCamera,
      computePolygonGroupDerivedDataWithCamera,
    ]
  );

  const setShowSelectedReferenceLine = useCallback<
    Dispatch<SetStateAction<boolean>>
  >(
    (value) => {
      if (!selectedDistancePair) return;

      const { activePointId, previousPointId } = selectedDistancePair;
      setDistanceRelations((prev) => {
        const relationIndex = prev.findIndex((relation) =>
          isSameDistanceRelationPair(relation, activePointId, previousPointId)
        );
        const relation =
          relationIndex >= 0
            ? withDistanceRelationEdgeId(prev[relationIndex])
            : ({
                id: getDistanceRelationId(activePointId, previousPointId),
                edgeId: getMeasurementEdgeId(activePointId, previousPointId),
                pointAId: activePointId,
                pointBId: previousPointId,
                anchorPointId: activePointId,
                showDirectLine: false,
                showVerticalLine: false,
                showHorizontalLine: false,
                showComponentLines: false,
                labelVisibilityByKind:
                  DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              } satisfies PointDistanceRelation);
        const currentValue = relation.showDirectLine ?? false;
        const nextValue =
          typeof value === "function" ? value(currentValue) : value;

        if (nextValue === currentValue && relationIndex >= 0) {
          return prev;
        }

        const nextRelation: PointDistanceRelation = {
          ...relation,
          edgeId: getMeasurementEdgeId(activePointId, previousPointId),
          anchorPointId: activePointId,
          showDirectLine: nextValue,
          showVerticalLine:
            relation.showVerticalLine ?? relation.showComponentLines ?? false,
          showHorizontalLine:
            relation.showHorizontalLine ?? relation.showComponentLines ?? false,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
            ...(relation.labelVisibilityByKind ?? {}),
          },
        };

        if (!hasAnyVisibleDistanceRelationLine(nextRelation)) {
          if (relationIndex < 0) return prev;
          return prev.filter((_, index) => index !== relationIndex);
        }

        if (relationIndex < 0) return [...prev, nextRelation];
        return prev.map((entry, index) =>
          index === relationIndex ? nextRelation : entry
        );
      });
    },
    [selectedDistancePair]
  );

  const setShowSelectedReferenceLineComponents = useCallback<
    Dispatch<SetStateAction<boolean>>
  >(
    (value) => {
      if (!selectedDistancePair) return;

      const { activePointId, previousPointId } = selectedDistancePair;
      setDistanceRelations((prev) => {
        const relationIndex = prev.findIndex((relation) =>
          isSameDistanceRelationPair(relation, activePointId, previousPointId)
        );
        const relation =
          relationIndex >= 0
            ? withDistanceRelationEdgeId(prev[relationIndex])
            : ({
                id: getDistanceRelationId(activePointId, previousPointId),
                edgeId: getMeasurementEdgeId(activePointId, previousPointId),
                pointAId: activePointId,
                pointBId: previousPointId,
                anchorPointId: activePointId,
                showDirectLine: false,
                showVerticalLine: false,
                showHorizontalLine: false,
                showComponentLines: false,
                labelVisibilityByKind:
                  DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              } satisfies PointDistanceRelation);
        const currentValue =
          (relation.showVerticalLine ?? relation.showComponentLines ?? false) ||
          (relation.showHorizontalLine ?? relation.showComponentLines ?? false);
        const nextValue =
          typeof value === "function" ? value(currentValue) : value;

        if (nextValue === currentValue && relationIndex >= 0) {
          return prev;
        }

        const nextRelation: PointDistanceRelation = {
          ...relation,
          edgeId: getMeasurementEdgeId(activePointId, previousPointId),
          anchorPointId: activePointId,
          showVerticalLine: nextValue,
          showHorizontalLine: nextValue,
          showComponentLines: nextValue,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
            ...(relation.labelVisibilityByKind ?? {}),
          },
        };

        if (!hasAnyVisibleDistanceRelationLine(nextRelation)) {
          if (relationIndex < 0) return prev;
          return prev.filter((_, index) => index !== relationIndex);
        }

        if (relationIndex < 0) return [...prev, nextRelation];
        return prev.map((entry, index) =>
          index === relationIndex ? nextRelation : entry
        );
      });
    },
    [selectedDistancePair]
  );

  const toggleDistanceRelationLineLabelVisibility = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId) return;
      setDistanceRelations((prev) =>
        prev.map((relation) => {
          if (relation.id !== relationId) return relation;
          const currentValue =
            relation.labelVisibilityByKind?.[kind] ??
            DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY[kind];
          return {
            ...relation,
            labelVisibilityByKind: {
              ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              ...(relation.labelVisibilityByKind ?? {}),
              [kind]: !currentValue,
            },
          };
        })
      );
    },
    []
  );

  const handleDistanceRelationLineLabelToggle = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId) return;

      const ownerGroupIdsFromPolygons = planarPolygonGroups
        .filter((group) => group.edgeRelationIds.includes(relationId))
        .map((group) => group.id);
      const ownerGroupIdsFromPolylines = polylines
        .filter((polyline) => polyline.edgeRelationIds.includes(relationId))
        .map((polyline) => polyline.id);
      const ownerGroupIds = Array.from(
        new Set([...ownerGroupIdsFromPolygons, ...ownerGroupIdsFromPolylines])
      );
      const selectedGroupOwnsRelation =
        !!selectedPlanarPolygonGroupId &&
        ownerGroupIds.includes(selectedPlanarPolygonGroupId);

      if (ownerGroupIds.length > 0 && !selectedGroupOwnsRelation) {
        const preferredOwnerGroupId =
          (activePlanarPolygonGroupId &&
          ownerGroupIds.includes(activePlanarPolygonGroupId)
            ? activePlanarPolygonGroupId
            : ownerGroupIds[0]) ?? null;
        selectPlanarPolygonGroupById(preferredOwnerGroupId);
        return;
      }

      // For "direct" kind on open polylines, cycle mode on ALL edges in the connected polyline
      if (kind === "direct" && selectedPlanarPolygonGroupId) {
        const connectedOpenGroupIds = getConnectedOpenPolylineGroupIds(
          planarPolygonGroups,
          selectedPlanarPolygonGroupId
        );
        if (connectedOpenGroupIds.size > 0) {
          const allRelationIds = new Set<string>();
          planarPolygonGroups.forEach((group) => {
            if (!connectedOpenGroupIds.has(group.id)) return;
            group.edgeRelationIds.forEach((rid) => allRelationIds.add(rid));
          });

          if (allRelationIds.size > 0) {
            setDistanceRelations((prev) => {
              const currentMode: DirectLineLabelMode =
                prev.find((r) => r.id === relationId)?.directLabelMode ??
                DEFAULT_DIRECT_LINE_LABEL_MODE;
              const nextMode = getNextDirectLineLabelMode(currentMode);
              return prev.map((relation) => {
                if (!allRelationIds.has(relation.id)) return relation;
                return {
                  ...relation,
                  directLabelMode: nextMode,
                  labelVisibilityByKind: {
                    ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
                    ...(relation.labelVisibilityByKind ?? {}),
                    direct: nextMode !== "none",
                  },
                };
              });
            });
            return;
          }
        }
      }

      toggleDistanceRelationLineLabelVisibility(relationId, kind);
    },
    [
      activePlanarPolygonGroupId,
      planarPolygonGroups,
      polylines,
      selectedPlanarPolygonGroupId,
      selectPlanarPolygonGroupById,
      setDistanceRelations,
      toggleDistanceRelationLineLabelVisibility,
    ]
  );

  const handleDistanceRelationLineClick = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId || kind !== "direct") return;

      const ownerGroupIdsFromPolygons = planarPolygonGroups
        .filter((group) => group.edgeRelationIds.includes(relationId))
        .map((group) => group.id);
      const ownerGroupIdsFromPolylines = polylines
        .filter((polyline) => polyline.edgeRelationIds.includes(relationId))
        .map((polyline) => polyline.id);
      const ownerGroupIds = Array.from(
        new Set([...ownerGroupIdsFromPolygons, ...ownerGroupIdsFromPolylines])
      );
      const selectedGroupOwnsRelation =
        !!selectedPlanarPolygonGroupId &&
        ownerGroupIds.includes(selectedPlanarPolygonGroupId);

      if (ownerGroupIds.length > 0) {
        if (selectedGroupOwnsRelation) {
          return;
        }
        const preferredOwnerGroupId =
          (activePlanarPolygonGroupId &&
          ownerGroupIds.includes(activePlanarPolygonGroupId)
            ? activePlanarPolygonGroupId
            : ownerGroupIds[0]) ?? null;
        selectPlanarPolygonGroupById(preferredOwnerGroupId);
        return;
      }
    },
    [
      activePlanarPolygonGroupId,
      planarPolygonGroups,
      polylines,
      selectedPlanarPolygonGroupId,
      selectPlanarPolygonGroupById,
    ]
  );

  const { updateLabelAppearanceById: updatePointLabelAppearanceById } =
    useAnnotationEntryMutations<AnnotationEntry, AnnotationLabelAppearance>({
      setAnnotations,
      isLabelAppearanceTarget: isPointAnnotationEntry,
      getLabelAppearance: (measurement) =>
        isPointAnnotationEntry(measurement)
          ? measurement.labelAppearance
          : undefined,
      applyLabelAppearance: (measurement, appearance) => {
        if (!isPointAnnotationEntry(measurement)) {
          return measurement;
        }
        return applyLabelAppearance(measurement, appearance);
      },
      normalizeLabelAppearance: normalizeLabelAppearance,
    });

  const updatePlanarPolygonNameById = useCallback(
    (id: string, name: string) => {
      const nextName = name.trim();
      setPlanarPolygonGroups((prev) => {
        let hasChanged = false;
        const next = prev.map((group) => {
          if (group.id !== id) return group;
          if ((group.name ?? "") === nextName) return group;
          hasChanged = true;
          return {
            ...group,
            name: nextName.length > 0 ? nextName : undefined,
          };
        });
        return hasChanged ? next : prev;
      });
    },
    []
  );

  const setPointLabelMetricModeById = useCallback(
    (id: string, mode: PointLabelMetricMode) => {
      setAnnotations((prev) => {
        let hasChanged = false;
        const next = prev.map((measurement) => {
          if (!isPointAnnotationEntry(measurement) || measurement.id !== id) {
            return measurement;
          }
          const normalizedMode =
            mode === DEFAULT_POINT_LABEL_METRIC_MODE ? undefined : mode;
          if (measurement.pointLabelMode === normalizedMode) {
            return measurement;
          }
          hasChanged = true;
          return { ...measurement, pointLabelMode: normalizedMode };
        });
        return hasChanged ? next : prev;
      });
    },
    [setAnnotations]
  );

  const cyclePointLabelMetricModeByMeasurementId = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        let hasChanged = false;

        const next = prev.map((measurement) => {
          if (!isPointAnnotationEntry(measurement) || measurement.id !== id) {
            return measurement;
          }

          const currentMode =
            measurement.pointLabelMode ?? DEFAULT_POINT_LABEL_METRIC_MODE;
          const nextMode = getNextPointLabelMetricMode(currentMode);
          const normalizedNextMode =
            nextMode === DEFAULT_POINT_LABEL_METRIC_MODE ? undefined : nextMode;

          if (measurement.pointLabelMode === normalizedNextMode) {
            return measurement;
          }

          hasChanged = true;
          return { ...measurement, pointLabelMode: normalizedNextMode };
        });

        return hasChanged ? next : prev;
      });
    },
    [setAnnotations]
  );

  const handlePointLabelDoubleClick = useCallback(
    (id: string) => {
      if (!pointMeasurementIds.has(id)) {
        return;
      }

      const clickedPoint = annotations.find(
        (measurement) =>
          isPointAnnotationEntry(measurement) && measurement.id === id
      );
      if (clickedPoint && isPointAnnotationEntry(clickedPoint)) {
        setReferencePoint(clickedPoint.geometryECEF);
      }

      // Double click finishes the current line chain.
      setDoubleClickChainSourcePointId(null);
      selectMeasurementById(id);
    },
    [
      annotations,
      pointMeasurementIds,
      selectMeasurementById,
      setReferencePoint,
    ]
  );

  const {
    updatePointMeasurementPositionById,
    setPointAnnotationElevationById,
    setPointAnnotationCoordinatesById,
    setMoveGizmoPointElevationFromMeasurementById,
  } = useAnnotationPointEditingController({
    annotations,
    referencePoint,
    moveGizmoPointId,
    setAnnotations,
    setReferencePoint,
    referencePointSyncEpsilonMeters: REFERENCE_POINT_SYNC_EPSILON_METERS,
  });

  const handleMoveGizmoPointPositionChange = useCallback(
    (pointId: string, nextPosition: Cartesian3) => {
      const movedPointMeasurement = annotations.find(
        (measurement) =>
          isPointAnnotationEntry(measurement) && measurement.id === pointId
      );
      if (
        !movedPointMeasurement ||
        !isPointAnnotationEntry(movedPointMeasurement)
      ) {
        return;
      }
      if (lockedMeasurementIdSet.has(pointId)) {
        return;
      }

      const selectedPointIds = getSelectedPointIds(
        selectedMeasurementIds,
        pointMeasurementIds
      ).filter((id) => !lockedMeasurementIdSet.has(id));
      const moveSelectionAsGroup = shouldMoveSelectionAsGroup(
        pointId,
        moveGizmoPointId,
        selectedPointIds
      );

      const movedPointAnchor = movedPointMeasurement.verticalOffsetAnchorECEF
        ? new Cartesian3(
            movedPointMeasurement.verticalOffsetAnchorECEF.x,
            movedPointMeasurement.verticalOffsetAnchorECEF.y,
            movedPointMeasurement.verticalOffsetAnchorECEF.z
          )
        : null;
      const currentMoveOrigin =
        movedPointAnchor ?? movedPointMeasurement.geometryECEF;

      const delta = computeMoveDelta(nextPosition, currentMoveOrigin);
      const targetVerticalPolygonGroup =
        planarPolygonGroups.find(
          (group) =>
            group.closed &&
            (group.surfaceType ?? "roof") === "facade" &&
            group.vertexPointIds.includes(pointId)
        ) ?? null;
      const moveNorthAxisCandidate =
        moveGizmoAxisCandidates?.find(
          (candidate) => candidate.id === VERTICAL_POLYGON_AXIS_ID_ENU_NORTH
        ) ??
        moveGizmoAxisCandidates?.find(
          (candidate) => candidate.id === "horizontal-north"
        ) ??
        null;
      const moveEastAxisCandidate =
        moveGizmoAxisCandidates?.find(
          (candidate) => candidate.id === VERTICAL_POLYGON_AXIS_ID_ENU_EAST
        ) ??
        moveGizmoAxisCandidates?.find(
          (candidate) => candidate.id === "horizontal-east"
        ) ??
        null;
      const normalizedActiveAxisDirection = moveGizmoAxisDirection
        ? normalizeDirection(moveGizmoAxisDirection)
        : null;
      const normalizedNorthAxisDirection = moveNorthAxisCandidate
        ? normalizeDirection(moveNorthAxisCandidate.direction)
        : null;
      const normalizedEastAxisDirection = moveEastAxisCandidate
        ? normalizeDirection(moveEastAxisCandidate.direction)
        : null;
      const isVerticalPolygonNorthAxisActive = Boolean(
        targetVerticalPolygonGroup &&
          normalizedActiveAxisDirection &&
          normalizedNorthAxisDirection &&
          Math.abs(
            Cartesian3.dot(
              normalizedActiveAxisDirection,
              normalizedNorthAxisDirection
            )
          ) >= VERTICAL_POLYGON_AXIS_ALIGNMENT_DOT_EPSILON
      );

      const verticalPolygonCoupledPointIdSet = new Set<string>();
      if (
        targetVerticalPolygonGroup &&
        isVerticalPolygonNorthAxisActive &&
        normalizedNorthAxisDirection &&
        normalizedEastAxisDirection
      ) {
        const pointById = getPointPositionMap(annotations);
        targetVerticalPolygonGroup.vertexPointIds.forEach(
          (candidatePointId) => {
            if (!candidatePointId || candidatePointId === pointId) {
              return;
            }
            if (lockedMeasurementIdSet.has(candidatePointId)) {
              return;
            }
            const candidatePosition = pointById.get(candidatePointId);
            if (!candidatePosition) {
              return;
            }
            const candidateDelta = Cartesian3.subtract(
              candidatePosition,
              movedPointMeasurement.geometryECEF,
              new Cartesian3()
            );
            const deltaE = Cartesian3.dot(
              candidateDelta,
              normalizedEastAxisDirection
            );
            const deltaN = Cartesian3.dot(
              candidateDelta,
              normalizedNorthAxisDirection
            );
            if (
              Math.abs(deltaE) <= VERTICAL_POLYGON_EN_MATCH_EPSILON_METERS &&
              Math.abs(deltaN) <= VERTICAL_POLYGON_EN_MATCH_EPSILON_METERS
            ) {
              verticalPolygonCoupledPointIdSet.add(candidatePointId);
            }
          }
        );
      }

      if (movedPointAnchor && moveGizmoVerticalOffsetEditMode) {
        const deltaFromAnchor = Cartesian3.subtract(
          nextPosition,
          movedPointAnchor,
          new Cartesian3()
        );
        const nextOffsetMeters = Cartesian3.dot(
          deltaFromAnchor,
          getLocalUpDirectionAtAnchor(movedPointAnchor)
        );

        if (moveGizmoVerticalOffsetEditMode === ANNOTATION_TYPE_POLYLINE) {
          const targetPlanarGroupId =
            moveGizmoVerticalOffsetPlanarGroupId ??
            planarPolygonGroups.find(
              (group) => !group.closed && group.vertexPointIds.includes(pointId)
            )?.id ??
            null;

          if (targetPlanarGroupId) {
            const targetGroup = planarPolygonGroups.find(
              (group) => group.id === targetPlanarGroupId
            );
            if (targetGroup) {
              const targetVertexIdSet = new Set(targetGroup.vertexPointIds);
              setPlanarPolygonGroups((prev) =>
                prev.map((group) =>
                  group.id === targetPlanarGroupId
                    ? {
                        ...group,
                        verticalOffsetMeters: nextOffsetMeters,
                      }
                    : group
                )
              );
              setAnnotations((prev) =>
                prev.map((measurement) => {
                  if (
                    !isPointAnnotationEntry(measurement) ||
                    !targetVertexIdSet.has(measurement.id) ||
                    !measurement.verticalOffsetAnchorECEF
                  ) {
                    return measurement;
                  }

                  const anchorECEF = new Cartesian3(
                    measurement.verticalOffsetAnchorECEF.x,
                    measurement.verticalOffsetAnchorECEF.y,
                    measurement.verticalOffsetAnchorECEF.z
                  );
                  const nextGeometry = getPositionWithVerticalOffsetFromAnchor(
                    anchorECEF,
                    nextOffsetMeters
                  );
                  const nextWGS84 = getDegreesFromCartesian(nextGeometry);

                  return {
                    ...measurement,
                    geometryECEF: nextGeometry,
                    geometryWGS84: {
                      longitude: nextWGS84.longitude,
                      latitude: nextWGS84.latitude,
                      altitude: getEllipsoidalAltitudeOrZero(nextWGS84.altitude),
                    },
                  };
                })
              );
              return;
            }
          }
        }

        const nextGeometry = getPositionWithVerticalOffsetFromAnchor(
          movedPointAnchor,
          nextOffsetMeters
        );
        const nextWGS84 = getDegreesFromCartesian(nextGeometry);
        setAnnotations((prev) =>
          prev.map((measurement) => {
            if (
              !isPointAnnotationEntry(measurement) ||
              measurement.id !== pointId
            ) {
              return measurement;
            }

            return {
              ...measurement,
              geometryECEF: nextGeometry,
              geometryWGS84: {
                longitude: nextWGS84.longitude,
                latitude: nextWGS84.latitude,
                altitude: getEllipsoidalAltitudeOrZero(nextWGS84.altitude),
              },
            };
          })
        );

        if (
          referencePoint &&
          Cartesian3.distance(
            movedPointMeasurement.geometryECEF,
            referencePoint
          ) <= REFERENCE_POINT_SYNC_EPSILON_METERS
        ) {
          setReferencePoint(nextGeometry);
        }
        return;
      }

      if (!moveSelectionAsGroup) {
        updatePointMeasurementPositionById(pointId, nextPosition, {
          treatNextPositionAsOffsetAnchor: true,
        });
        return;
      }

      if (!delta) {
        return;
      }

      updatePointMeasurementPositionById(pointId, nextPosition, {
        treatNextPositionAsOffsetAnchor: true,
      });

      const selectedPointIdSet = new Set(
        selectedPointIds.filter((selectedId) => selectedId !== pointId)
      );
      verticalPolygonCoupledPointIdSet.forEach((candidatePointId) => {
        if (candidatePointId !== pointId) {
          selectedPointIdSet.add(candidatePointId);
        }
      });
      if (selectedPointIdSet.size === 0) {
        return;
      }
      setAnnotations((prev) =>
        applyDeltaToSelectedPoints(prev, selectedPointIdSet, delta)
      );

      if (
        hasReferencePointInSelection(
          annotations,
          selectedPointIdSet,
          referencePoint,
          REFERENCE_POINT_SYNC_EPSILON_METERS
        ) &&
        referencePoint
      ) {
        const movedReferencePoint = Cartesian3.add(
          referencePoint,
          delta,
          new Cartesian3()
        );
        setReferencePoint(movedReferencePoint);
      }
    },
    [
      lockedMeasurementIdSet,
      annotations,
      moveGizmoAxisCandidates,
      moveGizmoAxisTitle,
      moveGizmoOptions.labelDistanceScale,
      moveGizmoOptions.markerSizeScale,
      moveGizmoPointId,
      moveGizmoPreferredAxisId,
      occlusionChecksEnabled,
      setReferencePoint,
      updatePointMeasurementPositionById,
    ]
  );

  const startMoveGizmoForMeasurementId = useCallback(
    (id: string, options?: MoveGizmoStartOptions) => {
      const measurement = annotations.find(
        (entry) => isPointAnnotationEntry(entry) && entry.id === id
      );
      if (!measurement || !isPointAnnotationEntry(measurement)) return;
      if (measurement.locked) {
        setLockedEditMeasurementId(id);
        return;
      }

      const axisDirection = options?.axisDirection ?? null;
      const axisCandidates = options?.axisCandidates?.map((candidate) => ({
        ...candidate,
        direction: Cartesian3.clone(candidate.direction),
      }));
      setLockedEditMeasurementId(null);
      setSelectedMeasurementId((prev) => (prev === id ? prev : id));
      setMoveGizmoPointId(id);
      setMoveGizmoAxisDirection(axisDirection);
      setMoveGizmoAxisTitle(options?.axisTitle ?? null);
      setMoveGizmoAxisCandidates(axisCandidates ?? null);
      setMoveGizmoPreferredAxisId(options?.preferredAxisId ?? null);
      setMoveGizmoVerticalOffsetEditMode(
        options?.verticalOffsetEditMode ?? null
      );
      setMoveGizmoVerticalOffsetPlanarGroupId(
        options?.verticalOffsetPlanarGroupId ?? null
      );
      setIsMoveGizmoDragging(false);
    },
    [annotations]
  );

  const stopMoveGizmo = useCallback(() => {
    setMoveGizmoPointId(null);
    setMoveGizmoAxisDirection(null);
    setMoveGizmoAxisTitle(null);
    setMoveGizmoAxisCandidates(null);
    setMoveGizmoPreferredAxisId(null);
    setMoveGizmoVerticalOffsetEditMode(null);
    setMoveGizmoVerticalOffsetPlanarGroupId(null);
    setIsMoveGizmoDragging(false);
  }, []);

  const handlePointVerticalOffsetStemLongPress = useCallback(
    (pointId: string) => {
      const pointMeasurement = annotations.find(
        (measurement) =>
          isPointAnnotationEntry(measurement) && measurement.id === pointId
      );
      if (!pointMeasurement || !isPointAnnotationEntry(pointMeasurement)) {
        return;
      }

      const anchorECEF = pointMeasurement.verticalOffsetAnchorECEF
        ? new Cartesian3(
            pointMeasurement.verticalOffsetAnchorECEF.x,
            pointMeasurement.verticalOffsetAnchorECEF.y,
            pointMeasurement.verticalOffsetAnchorECEF.z
          )
        : pointMeasurement.geometryECEF;
      const upDirection = getLocalUpDirectionAtAnchor(anchorECEF);
      const targetPolylineGroup =
        planarPolygonGroups.find(
          (group) => !group.closed && group.vertexPointIds.includes(pointId)
        ) ?? null;

      if (targetPolylineGroup) {
        setSelectedPlanarPolygonGroupId(targetPolylineGroup.id);
      }

      selectMeasurementById(pointId);
      startMoveGizmoForMeasurementId(pointId, {
        axisDirection: upDirection,
        axisTitle: "Vertikalversatz",
        verticalOffsetEditMode: targetPolylineGroup
          ? ANNOTATION_TYPE_POLYLINE
          : ANNOTATION_TYPE_POINT,
        verticalOffsetPlanarGroupId: targetPolylineGroup?.id ?? null,
      });
    },
    [
      annotations,
      planarPolygonGroups,
      selectMeasurementById,
      startMoveGizmoForMeasurementId,
    ]
  );

  const handlePointLabelLongPress = useCallback(
    (id: string) => {
      const targetVerticalPolygonGroup =
        (selectedPlanarPolygonGroupId
          ? planarPolygonGroups.find(
              (group) =>
                group.id === selectedPlanarPolygonGroupId &&
                (group.surfaceType ?? "roof") === "facade" &&
                group.vertexPointIds.includes(id)
            )
          : null) ??
        planarPolygonGroups.find(
          (group) =>
            group.closed &&
            (group.surfaceType ?? "roof") === "facade" &&
            group.vertexPointIds.includes(id)
        ) ??
        null;

      if (targetVerticalPolygonGroup) {
        const pointById = getPointPositionMap(annotations);
        const pointPosition = pointById.get(id);
        if (pointPosition) {
          const persistedVerticalPolygonFrame =
            resolveLocalFrameVectors(
              targetVerticalPolygonGroup.planarPolygonLocalFrame
            );
          if (persistedVerticalPolygonFrame) {
            const enuMatrix = Transforms.eastNorthUpToFixedFrame(pointPosition);
            const enuEastAxis4 = Matrix4.getColumn(
              enuMatrix,
              0,
              new Cartesian4()
            );
            const enuEastDirection = normalizeDirection(
              new Cartesian3(enuEastAxis4.x, enuEastAxis4.y, enuEastAxis4.z)
            );
            const eastRotationDegVsEnuEast =
              enuEastDirection &&
              getSignedAngleDegAroundAxis(
                enuEastDirection,
                persistedVerticalPolygonFrame.east,
                persistedVerticalPolygonFrame.north
              );
            const axisRotationSuffix = getVerticalPolygonAxisRotationSuffix(
              eastRotationDegVsEnuEast
            );
            const upAxisTitle = `Punkt entlang der ENU-U-Achse${axisRotationSuffix} verschieben`;
            const verticalPolygonAxisCandidates = [
              {
                id: VERTICAL_POLYGON_AXIS_ID_ENU_UP,
                direction: persistedVerticalPolygonFrame.up,
                color: "rgba(59, 130, 246, 0.98)",
                title: upAxisTitle,
              },
              {
                id: VERTICAL_POLYGON_AXIS_ID_ENU_EAST,
                direction: persistedVerticalPolygonFrame.east,
                color: "rgba(239, 68, 68, 0.98)",
                title: `Punkt entlang der ENU-E-Achse${axisRotationSuffix} verschieben`,
              },
              {
                id: VERTICAL_POLYGON_AXIS_ID_ENU_NORTH,
                direction: persistedVerticalPolygonFrame.north,
                color: "rgba(34, 197, 94, 0.98)",
                title:
                  "Punkt entlang der ENU-N-Achse (Flächennormale) verschieben",
              },
            ] as const;

            selectMeasurementById(id);
            startMoveGizmoForMeasurementId(id, {
              axisDirection: persistedVerticalPolygonFrame.up,
              axisTitle: upAxisTitle,
              preferredAxisId: VERTICAL_POLYGON_AXIS_ID_ENU_UP,
              axisCandidates: verticalPolygonAxisCandidates.map(
                (axisCandidate) => ({
                  ...axisCandidate,
                  direction: Cartesian3.clone(axisCandidate.direction),
                })
              ),
            });
            return;
          }

          const pointIndex =
            targetVerticalPolygonGroup.vertexPointIds.findIndex(
              (vertexId) => vertexId === id
            );
          const oppositePointId =
            pointIndex >= 0 &&
            targetVerticalPolygonGroup.vertexPointIds.length === 4
              ? targetVerticalPolygonGroup.vertexPointIds[
                  (pointIndex + 2) % 4
                ] ?? null
              : null;
          const oppositePointPosition = oppositePointId
            ? pointById.get(oppositePointId) ?? null
            : null;

          const planeNormalFromGroup = targetVerticalPolygonGroup.plane
            ? normalizeDirection(
                cartesian3FromJson(
                  targetVerticalPolygonGroup.plane.normalECEF
                )
              )
            : null;
          let planeNormal = planeNormalFromGroup;
          if (!planeNormal) {
            const vertices = targetVerticalPolygonGroup.vertexPointIds
              .map((vertexId) => pointById.get(vertexId))
              .filter((vertex): vertex is Cartesian3 => Boolean(vertex));
            if (vertices.length >= 3) {
              const derivedPlane = createPlaneFromThreePoints(
                vertices[0],
                vertices[1],
                vertices[2]
              );
              if (derivedPlane) {
                const orientedDerivedPlane =
                  orientPlaneTowardSceneCamera(derivedPlane);
                planeNormal = normalizeDirection(
                  cartesian3FromJson(orientedDerivedPlane.normalECEF)
                );
              }
            }
          }

          if (planeNormal) {
            const upDirection = getLocalUpDirectionAtAnchor(pointPosition);
            const enuMatrix = Transforms.eastNorthUpToFixedFrame(pointPosition);
            const eastAxis4 = Matrix4.getColumn(enuMatrix, 0, new Cartesian4());
            const fallbackEastDirection = normalizeDirection(
              new Cartesian3(eastAxis4.x, eastAxis4.y, eastAxis4.z)
            );

            let eastDirection: Cartesian3 | null = null;
            if (oppositePointPosition) {
              const oppositeDelta = Cartesian3.subtract(
                oppositePointPosition,
                pointPosition,
                new Cartesian3()
              );
              const horizontalHint = Cartesian3.subtract(
                oppositeDelta,
                Cartesian3.multiplyByScalar(
                  upDirection,
                  Cartesian3.dot(oppositeDelta, upDirection),
                  new Cartesian3()
                ),
                new Cartesian3()
              );
              const hintOnPlane = Cartesian3.subtract(
                horizontalHint,
                Cartesian3.multiplyByScalar(
                  planeNormal,
                  Cartesian3.dot(horizontalHint, planeNormal),
                  new Cartesian3()
                ),
                new Cartesian3()
              );
              eastDirection = normalizeDirection(hintOnPlane);
            }

            if (!eastDirection) {
              const inPlaneHorizontal = Cartesian3.cross(
                planeNormal,
                upDirection,
                new Cartesian3()
              );
              eastDirection = normalizeDirection(inPlaneHorizontal);
            }

            if (!eastDirection && fallbackEastDirection) {
              const fallbackOnPlane = Cartesian3.subtract(
                fallbackEastDirection,
                Cartesian3.multiplyByScalar(
                  planeNormal,
                  Cartesian3.dot(fallbackEastDirection, planeNormal),
                  new Cartesian3()
                ),
                new Cartesian3()
              );
              eastDirection = normalizeDirection(fallbackOnPlane);
            }

            if (eastDirection) {
              let northDirection = normalizeDirection(
                Cartesian3.cross(upDirection, eastDirection, new Cartesian3())
              );
              if (!northDirection) {
                northDirection = planeNormal;
              }

              if (Cartesian3.dot(northDirection, planeNormal) < 0) {
                northDirection = Cartesian3.multiplyByScalar(
                  northDirection,
                  -1,
                  new Cartesian3()
                );
                eastDirection = Cartesian3.multiplyByScalar(
                  eastDirection,
                  -1,
                  new Cartesian3()
                );
              }

              const eastRotationDegVsEnuEast =
                fallbackEastDirection &&
                getSignedAngleDegAroundAxis(
                  fallbackEastDirection,
                  eastDirection,
                  northDirection
                );
              const axisRotationSuffix = getVerticalPolygonAxisRotationSuffix(
                eastRotationDegVsEnuEast
              );
              const upAxisTitle = `Punkt entlang der ENU-U-Achse${axisRotationSuffix} verschieben`;

              const verticalPolygonAxisCandidates = [
                {
                  id: VERTICAL_POLYGON_AXIS_ID_ENU_UP,
                  direction: upDirection,
                  color: "rgba(59, 130, 246, 0.98)",
                  title: upAxisTitle,
                },
                {
                  id: VERTICAL_POLYGON_AXIS_ID_ENU_EAST,
                  direction: eastDirection,
                  color: "rgba(239, 68, 68, 0.98)",
                  title: `Punkt entlang der ENU-E-Achse${axisRotationSuffix} verschieben`,
                },
                {
                  id: VERTICAL_POLYGON_AXIS_ID_ENU_NORTH,
                  direction: northDirection,
                  color: "rgba(34, 197, 94, 0.98)",
                  title:
                    "Punkt entlang der ENU-N-Achse (Flächennormale) verschieben",
                },
              ] as const;

              selectMeasurementById(id);
              startMoveGizmoForMeasurementId(id, {
                axisDirection: upDirection,
                axisTitle: upAxisTitle,
                preferredAxisId: VERTICAL_POLYGON_AXIS_ID_ENU_UP,
                axisCandidates: verticalPolygonAxisCandidates.map(
                  (axisCandidate) => ({
                    ...axisCandidate,
                    direction: Cartesian3.clone(axisCandidate.direction),
                  })
                ),
              });
              return;
            }
          }
        }
      }

      const targetRoofPolygonGroup =
        (selectedPlanarPolygonGroupId
          ? planarPolygonGroups.find(
              (group) =>
                group.id === selectedPlanarPolygonGroupId &&
                (group.surfaceType ?? "roof") === "roof" &&
                group.planeLocked &&
                group.vertexPointIds.includes(id)
            )
          : null) ??
        planarPolygonGroups.find(
          (group) =>
            (group.surfaceType ?? "roof") === "roof" &&
            group.planeLocked &&
            group.vertexPointIds.includes(id)
        ) ??
        null;

      if (targetRoofPolygonGroup) {
        const pointById = getPointPositionMap(annotations);
        const pointPosition = pointById.get(id);
        if (pointPosition) {
          const planeNormalFromGroup = targetRoofPolygonGroup.plane
            ? normalizeDirection(
                cartesian3FromJson(
                  targetRoofPolygonGroup.plane.normalECEF
                )
              )
            : null;
          let planeNormal = planeNormalFromGroup;
          if (!planeNormal) {
            const vertices = targetRoofPolygonGroup.vertexPointIds
              .map((vertexId) => pointById.get(vertexId))
              .filter((vertex): vertex is Cartesian3 => Boolean(vertex));
            if (vertices.length >= 3) {
              const derivedPlane = createPlaneFromThreePoints(
                vertices[0],
                vertices[1],
                vertices[2]
              );
              if (derivedPlane) {
                const orientedDerivedPlane =
                  orientPlaneTowardSceneCamera(derivedPlane);
                planeNormal = normalizeDirection(
                  cartesian3FromJson(orientedDerivedPlane.normalECEF)
                );
              }
            }
          }

          if (planeNormal) {
            const upDirection = getLocalUpDirectionAtAnchor(pointPosition);
            const orientedPlaneNormal =
              Cartesian3.dot(planeNormal, upDirection) < 0
                ? Cartesian3.multiplyByScalar(planeNormal, -1, new Cartesian3())
                : Cartesian3.clone(planeNormal);
            const enuMatrix = Transforms.eastNorthUpToFixedFrame(pointPosition);
            const enuEastAxis4 = Matrix4.getColumn(
              enuMatrix,
              0,
              new Cartesian4()
            );
            const enuNorthAxis4 = Matrix4.getColumn(
              enuMatrix,
              1,
              new Cartesian4()
            );
            const enuEastDirection = normalizeDirection(
              new Cartesian3(enuEastAxis4.x, enuEastAxis4.y, enuEastAxis4.z)
            );
            const enuNorthDirection = normalizeDirection(
              new Cartesian3(enuNorthAxis4.x, enuNorthAxis4.y, enuNorthAxis4.z)
            );

            const projectDirectionOntoRoofPlane = (
              direction: Cartesian3 | null
            ) => {
              if (!direction) return null;
              return normalizeDirection(
                Cartesian3.subtract(
                  direction,
                  Cartesian3.multiplyByScalar(
                    orientedPlaneNormal,
                    Cartesian3.dot(direction, orientedPlaneNormal),
                    new Cartesian3()
                  ),
                  new Cartesian3()
                )
              );
            };

            const inPlanePrimaryDirection =
              projectDirectionOntoRoofPlane(enuNorthDirection) ??
              projectDirectionOntoRoofPlane(upDirection);

            const inPlaneSecondaryDirection = inPlanePrimaryDirection
              ? normalizeDirection(
                  Cartesian3.cross(
                    inPlanePrimaryDirection,
                    orientedPlaneNormal,
                    new Cartesian3()
                  )
                ) ?? projectDirectionOntoRoofPlane(enuEastDirection)
              : null;

            if (inPlanePrimaryDirection && inPlaneSecondaryDirection) {
              const roofNormalAxisTitle =
                "Punkt entlang der Dachflächennormale verschieben";
              const roofAxisCandidates = [
                {
                  id: ROOF_POLYGON_AXIS_ID_NORMAL,
                  direction: orientedPlaneNormal,
                  color: "rgba(59, 130, 246, 0.98)",
                  title: roofNormalAxisTitle,
                },
                {
                  id: ROOF_POLYGON_AXIS_ID_IN_PLANE_PRIMARY,
                  direction: inPlanePrimaryDirection,
                  color: "rgba(34, 197, 94, 0.98)",
                  title:
                    "Punkt entlang der ENU-N-Projektion in der Dachebene verschieben",
                },
                {
                  id: ROOF_POLYGON_AXIS_ID_IN_PLANE_SECONDARY,
                  direction: inPlaneSecondaryDirection,
                  color: "rgba(239, 68, 68, 0.98)",
                  title:
                    "Punkt orthogonal zur ENU-N-Projektion in der Dachebene verschieben",
                },
              ] as const;

              selectMeasurementById(id);
              startMoveGizmoForMeasurementId(id, {
                axisDirection: orientedPlaneNormal,
                axisTitle: roofNormalAxisTitle,
                preferredAxisId: ROOF_POLYGON_AXIS_ID_NORMAL,
                axisCandidates: roofAxisCandidates.map((axisCandidate) => ({
                  ...axisCandidate,
                  direction: Cartesian3.clone(axisCandidate.direction),
                })),
              });
              return;
            }
          }
        }
      }

      selectMeasurementById(id);
      startMoveGizmoForMeasurementId(id);
    },
    [
      annotations,
      planarPolygonGroups,
      selectedPlanarPolygonGroupId,
      selectMeasurementById,
      startMoveGizmoForMeasurementId,
      orientPlaneTowardSceneCamera,
    ]
  );

  const handleMoveGizmoExit = useCallback(() => {
    stopMoveGizmo();
  }, [stopMoveGizmo]);

  const handleMoveGizmoAxisChange = useCallback(
    (axisDirection: Cartesian3, axisTitle?: string | null) => {
      setMoveGizmoAxisDirection(Cartesian3.clone(axisDirection));
      setMoveGizmoAxisTitle(axisTitle ?? null);
    },
    []
  );

  const handlePointLabelClick = useCallback(
    (id: string) => {
      if (moveGizmoPointId) {
        setMoveGizmoPointElevationFromMeasurementById(id);
        return;
      }

      if (selectionModeActive) {
        selectMeasurementIds([id], effectiveSelectModeAdditive);
        return;
      }

      const clickedMeasurement = annotations.find(
        (measurement) => measurement.id === id
      );
      const isAuxiliaryLabelAnchor = Boolean(
        clickedMeasurement?.auxiliaryLabelAnchor
      );

      if (annotationMode === ANNOTATION_TYPE_POINT) {
        selectMeasurementById(id);
        return;
      }

      if (annotationMode === ANNOTATION_TYPE_DISTANCE) {
        if (!pointMeasurementIds.has(id)) return;

        if (isAuxiliaryLabelAnchor) {
          selectMeasurementById(id);
          return;
        }

        if (!isActiveDrawMode) {
          const sourcePointId = resolveDistanceRelationSourcePointId(id);
          if (sourcePointId) {
            upsertDirectDistanceRelation(sourcePointId, id);
            setDoubleClickChainSourcePointId(
              distanceModeStickyToFirstPoint ? sourcePointId : null
            );
            selectMeasurementById(id);
            return;
          }
          setDoubleClickChainSourcePointId(id);
          selectMeasurementById(id);
          return;
        }

        const activeOpenGroup =
          activePlanarPolygonGroupId !== null
            ? planarPolygonGroups.find(
                (group) =>
                  group.id === activePlanarPolygonGroupId && !group.closed
              ) ?? null
            : null;
        const firstVertexId = activeOpenGroup?.vertexPointIds[0] ?? null;
        const shouldCloseRingOnFirstVertexClick = Boolean(
          firstVertexId &&
            firstVertexId === id &&
            activeOpenGroup &&
            activeOpenGroup.vertexPointIds.length >= 3
        );
        if (shouldCloseRingOnFirstVertexClick) {
          closeActivePlanarPolygonGroup();
          return;
        }

        const sourcePointId = resolveDistanceRelationSourcePointId(id);
        const didAutoCloseFacadeRectangle =
          appendExistingPointToActivePlanarPolygonGroup(id, sourcePointId);
        if (didAutoCloseFacadeRectangle) {
          return;
        }

        if (sourcePointId) {
          upsertDirectDistanceRelation(sourcePointId, id);
        }

        setDoubleClickChainSourcePointId(id);
        selectMeasurementById(id);
        return;
      }

      if (annotationMode === ANNOTATION_TYPE_POLYLINE) {
        if (!pointMeasurementIds.has(id)) return;

        if (isAuxiliaryLabelAnchor) {
          selectMeasurementById(id);
          return;
        }

        if (!isActiveDrawMode) {
          appendExistingPointToActivePlanarPolygonGroup(id, null);
          setDoubleClickChainSourcePointId(id);
          selectMeasurementById(id);
          return;
        }

        const activeOpenGroup =
          activePlanarPolygonGroupId !== null
            ? planarPolygonGroups.find(
                (group) =>
                  group.id === activePlanarPolygonGroupId && !group.closed
              ) ?? null
            : null;
        const firstVertexId = activeOpenGroup?.vertexPointIds[0] ?? null;
        const shouldHandleRingClosure = Boolean(
          firstVertexId &&
            firstVertexId === id &&
            activeOpenGroup &&
            activeOpenGroup.vertexPointIds.length >= 3
        );
        if (shouldHandleRingClosure && firstVertexId) {
          if (
            planarToolCreationMode ===
            PLANAR_TOOL_CREATION_MODE_POLYGON
          ) {
            closeActivePlanarPolygonGroup();
          } else {
            finishActivePlanarPolylineGroup();
          }
          return;
        }

        const sourcePointId = resolveDistanceRelationSourcePointId(id);
        const didAutoCloseFacadeRectangle =
          appendExistingPointToActivePlanarPolygonGroup(id, sourcePointId);
        if (didAutoCloseFacadeRectangle) {
          return;
        }

        if (sourcePointId) {
          upsertDirectDistanceRelation(sourcePointId, id);
        }

        setDoubleClickChainSourcePointId(id);
        selectMeasurementById(id);
        return;
      }

      runPointLabelClickInteraction({
        pointId: id,
        selectedMeasurementId,
        selectMeasurementById,
        cyclePointLabelMetricModeByMeasurementId,
      });
    },
    [
      moveGizmoPointId,
      selectMeasurementIds,
      effectiveSelectModeAdditive,
      annotations,
      annotationMode,
      selectionModeActive,
      activePlanarPolygonGroupId,
      isActiveDrawMode,
      planarPolygonGroups,
      pointMeasurementIds,
      resolveDistanceRelationSourcePointId,
      closeActivePlanarPolygonGroup,
      finishActivePlanarPolylineGroup,
      setMoveGizmoPointElevationFromMeasurementById,
      selectedMeasurementId,
      selectMeasurementIds,
      effectiveSelectModeAdditive,
      selectMeasurementById,
      cyclePointLabelMetricModeByMeasurementId,
      upsertDirectDistanceRelation,
      appendExistingPointToActivePlanarPolygonGroup,
      distanceModeStickyToFirstPoint,
      planarToolCreationMode,
    ]
  );

  useEffect(() => {
    if (annotationMode === ANNOTATION_TYPE_POLYLINE) return;
    setPendingPolylinePromotionRingClosurePointId(null);
  }, [annotationMode]);

  // point query hooks
  const {
    isPointMeasureLabelModeActive,
    isPointMeasureLabelInputPending,
    isPointMeasureCreateModeActive,
    pointQueryToolActive,
    activePointCreateConfig,
  } = usePointCreateConfigState({
    annotationMode,
    pointLabelOnCreate,
    labelInputPromptPointId,
    setLabelInputPromptPointId,
    annotations,
    temporaryMode,
    pointVerticalOffsetMeters,
    lastCustomLabelOnCreate,
    previewIsPolylineCreateMode,
    polylineVerticalOffsetMeters,
  });

  const handlePointQueryPointerMoveWithHoveredNodeAnchor = useCallback(
    (
      positionECEF: Cartesian3 | null,
      screenPosition?: Cartesian2,
      surfaceNormalECEF?: Cartesian3 | null
    ) => {
      const hoveredPointId = hoveredLivePreviewPointIdRef.current;
      if (hoveredPointId) {
        const hoveredPoint = getPointById(annotations, hoveredPointId);
        if (hoveredPoint && isPointAnnotationEntry(hoveredPoint)) {
          const localUp = getLocalUpDirectionAtAnchor(
            hoveredPoint.geometryECEF
          );
          handlePointQueryPointerMove(
            hoveredPoint.geometryECEF,
            screenPosition,
            localUp
          );
          return;
        }
        hoveredLivePreviewPointIdRef.current = null;
      }

      handlePointQueryPointerMove(
        positionECEF,
        screenPosition,
        surfaceNormalECEF
      );
    },
    [annotations, handlePointQueryPointerMove]
  );

  usePointQueryCreationController({
    scene,
    annotationMode,
    pointQueryToolActive,
    pointQueryEnabled,
    selectionModeActive,
    moveGizmoPointId,
    isMoveGizmoDragging,
    activePointCreateConfig,
    setAnnotations,
    handlePointQueryPointCreated,
    handlePointQueryDoubleClick,
    handlePointQueryBeforePointCreate,
    handlePointQueryPointerMoveWithHoveredNodeAnchor,
  });

  const handleDistanceRelationCornerClick = useCallback(
    (relationId: string) => {
      if (!relationId) return;
      setDistanceRelations((prev) =>
        prev.map((relation) => {
          if (relation.id !== relationId) return relation;
          const nextAnchorPointId =
            relation.anchorPointId === relation.pointAId
              ? relation.pointBId
              : relation.pointAId;
          return {
            ...relation,
            anchorPointId: nextAnchorPointId,
          };
        })
      );
    },
    []
  );

  const handleDistanceRelationMidpointClick = useCallback(
    (relationId: string) => {
      if (!relationId) return;
      const targetGroup = planarPolygonGroups.find((group) =>
        group.edgeRelationIds.includes(relationId)
      );
      if (!targetGroup) return;

      const vertexIds = targetGroup.vertexPointIds;
      if (vertexIds.length < 2) return;

      let edgeStartId: string | null = null;
      let edgeEndId: string | null = null;
      let insertIndex = -1;

      for (let index = 0; index < vertexIds.length - 1; index += 1) {
        const startId = vertexIds[index];
        const endId = vertexIds[index + 1];
        if (!startId || !endId) continue;
        const edgeId = getDistanceRelationId(startId, endId);
        if (edgeId === relationId) {
          edgeStartId = startId;
          edgeEndId = endId;
          insertIndex = index + 1;
          break;
        }
      }

      if (!edgeStartId || !edgeEndId) {
        if (targetGroup.closed && vertexIds.length >= 3) {
          const startId = vertexIds[vertexIds.length - 1];
          const endId = vertexIds[0];
          if (startId && endId) {
            const edgeId = getDistanceRelationId(startId, endId);
            if (edgeId === relationId) {
              edgeStartId = startId;
              edgeEndId = endId;
              insertIndex = vertexIds.length;
            }
          }
        }
      }

      if (!edgeStartId || !edgeEndId || insertIndex < 0) return;

      const pointById = getPointPositionMap(annotations);
      const startPoint = pointById.get(edgeStartId);
      const endPoint = pointById.get(edgeEndId);
      if (!startPoint || !endPoint) return;

      let midpointPosition = Cartesian3.midpoint(
        startPoint,
        endPoint,
        new Cartesian3()
      );
      const targetGroupVerticalPolygonFrame =
        (targetGroup.surfaceType ?? "roof") === "facade"
          ? resolveLocalFrameVectors(
              targetGroup.planarPolygonLocalFrame
            )
          : null;
      if (targetGroupVerticalPolygonFrame) {
        const startLocal = getPositionInLocalFrame(
          startPoint,
          targetGroupVerticalPolygonFrame
        );
        const endLocal = getPositionInLocalFrame(
          endPoint,
          targetGroupVerticalPolygonFrame
        );
        midpointPosition = getPositionFromLocalFrame(
          targetGroupVerticalPolygonFrame,
          (startLocal.eastMeters + endLocal.eastMeters) / 2,
          (startLocal.northMeters + endLocal.northMeters) / 2,
          (startLocal.upMeters + endLocal.upMeters) / 2
        );
      }
      if (
        (targetGroup.surfaceType ?? "roof") !== "footprint" &&
        targetGroup.planeLocked &&
        targetGroup.plane
      ) {
        midpointPosition = projectPointOntoPlane(
          midpointPosition,
          targetGroup.plane
        );
      }

      const nextPointId = `point-${Date.now()}-split`;
      const midpointWGS84 = getDegreesFromCartesian(midpointPosition);
      setAnnotations((prev) => {
        const insertionBaseIndex =
          prev.find(
            (measurement) =>
              isPointAnnotationEntry(measurement) &&
              measurement.id === edgeStartId
          )?.index ?? prev.filter(isPointAnnotationEntry).length;
        const insertionIndex = insertionBaseIndex + 1;

        const nextMeasurements = prev.map((measurement) => {
          if (
            isPointAnnotationEntry(measurement) &&
            measurement.index >= insertionIndex
          ) {
            return {
              ...measurement,
              index: measurement.index + 1,
            };
          }
          return measurement;
        });

        return [
          ...nextMeasurements,
          {
            type: ANNOTATION_TYPE_DISTANCE,
            id: nextPointId,
            index: insertionIndex,
            geometryECEF: midpointPosition,
            geometryWGS84: {
              longitude: midpointWGS84.longitude,
              latitude: midpointWGS84.latitude,
              altitude: getEllipsoidalAltitudeOrZero(midpointWGS84.altitude),
            },
            timestamp: new Date().getTime(),
          },
        ];
      });

      const updatedPointById = getPointPositionMap(annotations, {
        [nextPointId]: midpointPosition,
      });
      setPlanarPolygonGroups((prev) =>
        prev.map((group) => {
          if (group.id !== targetGroup.id) return group;
          const nextVertexPointIds = [
            ...group.vertexPointIds.slice(0, insertIndex),
            nextPointId,
            ...group.vertexPointIds.slice(insertIndex),
          ];
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextVertexPointIds,
            group.closed,
            getDistanceRelationId
          );
          return computePolygonGroupDerivedDataWithCamera(
            {
              ...group,
              vertexPointIds: nextVertexPointIds,
              edgeRelationIds: nextEdgeRelationIds,
            },
            updatedPointById
          );
        })
      );

      setActivePlanarPolygonGroupId(targetGroup.id);
      setDoubleClickChainSourcePointId(nextPointId);
      selectMeasurementById(nextPointId);
    },
    [
      annotations,
      planarPolygonGroups,
      selectMeasurementById,
      computePolygonGroupDerivedDataWithCamera,
    ]
  );

  useEffect(() => {
    setDistanceRelations((prev) =>
      syncPolygonEdgeDistanceRelations(prev, planarPolygonGroups)
    );
  }, [planarPolygonGroups, syncPolygonEdgeDistanceRelations]);

  const hiddenMeasurementIdSet = useMemo(
    () =>
      new Set(
        annotations
          .filter(
            (measurement) =>
              measurement.hidden && !measurement.auxiliaryLabelAnchor
          )
          .map((measurement) => measurement.id)
      ),
    [annotations]
  );

  const auxiliaryLabelAnchorIdSet = useMemo(
    () =>
      new Set(
        annotations
          .filter((measurement) => measurement.auxiliaryLabelAnchor)
          .map((measurement) => measurement.id)
      ),
    [annotations]
  );

  const closedFacadeRectangleVertexIdSet = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      if (!group.closed) return;
      if ((group.surfaceType ?? "roof") !== "facade") return;
      if (group.vertexPointIds.length !== 4) return;
      group.vertexPointIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups]);

  const markerlessPointIds = useMemo(() => {
    const ids = new Set(auxiliaryLabelAnchorIdSet);
    closedFacadeRectangleVertexIdSet.forEach((pointId) => {
      ids.delete(pointId);
    });
    return ids;
  }, [auxiliaryLabelAnchorIdSet, closedFacadeRectangleVertexIdSet]);

  const hiddenPlanarPolygonGroupIdSet = useMemo(
    () =>
      new Set(
        planarPolygonGroups
          .filter((group) => group.hidden)
          .map((group) => group.id)
      ),
    [planarPolygonGroups]
  );

  const visibleMeasurementsForRendering = useMemo(
    () =>
      annotations.filter(
        (measurement) => !measurement.hidden || measurement.auxiliaryLabelAnchor
      ),
    [annotations]
  );

  const visiblePlanarPolygonGroupsForRendering = useMemo(
    () => planarPolygonGroups.filter((group) => !group.hidden),
    [planarPolygonGroups]
  );

  const visibleDistanceRelationsForRendering = useMemo(
    () =>
      distanceRelations.filter((relation) => {
        if (
          relation.polygonGroupId &&
          hiddenPlanarPolygonGroupIdSet.has(relation.polygonGroupId)
        ) {
          return false;
        }
        return (
          !hiddenMeasurementIdSet.has(relation.pointAId) &&
          !hiddenMeasurementIdSet.has(relation.pointBId)
        );
      }),
    [distanceRelations, hiddenMeasurementIdSet, hiddenPlanarPolygonGroupIdSet]
  );

  const selectedStandaloneDistanceRelationIdSet = useMemo(() => {
    const selectedPointIdSet = new Set<string>(selectedMeasurementIds);
    if (selectedMeasurementId) {
      selectedPointIdSet.add(selectedMeasurementId);
    }
    if (selectedPointIdSet.size === 0) {
      return new Set<string>();
    }

    const standaloneRelations = visibleDistanceRelationsForRendering.filter(
      (relation) => !relation.polygonGroupId
    );
    if (standaloneRelations.length === 0) {
      return new Set<string>();
    }

    const neighborPointIdsByPointId = new Map<string, Set<string>>();
    const relationIdsByPointId = new Map<string, Set<string>>();

    standaloneRelations.forEach((relation) => {
      const { pointAId, pointBId, id } = relation;
      if (!neighborPointIdsByPointId.has(pointAId)) {
        neighborPointIdsByPointId.set(pointAId, new Set());
      }
      if (!neighborPointIdsByPointId.has(pointBId)) {
        neighborPointIdsByPointId.set(pointBId, new Set());
      }
      neighborPointIdsByPointId.get(pointAId)?.add(pointBId);
      neighborPointIdsByPointId.get(pointBId)?.add(pointAId);

      if (!relationIdsByPointId.has(pointAId)) {
        relationIdsByPointId.set(pointAId, new Set());
      }
      if (!relationIdsByPointId.has(pointBId)) {
        relationIdsByPointId.set(pointBId, new Set());
      }
      relationIdsByPointId.get(pointAId)?.add(id);
      relationIdsByPointId.get(pointBId)?.add(id);
    });

    const queue: string[] = [];
    selectedPointIdSet.forEach((pointId) => {
      if (neighborPointIdsByPointId.has(pointId)) {
        queue.push(pointId);
      }
    });
    if (queue.length === 0) {
      return new Set<string>();
    }

    const visitedPointIds = new Set<string>();
    const selectedRelationIds = new Set<string>();

    while (queue.length > 0) {
      const pointId = queue.shift();
      if (!pointId || visitedPointIds.has(pointId)) continue;
      visitedPointIds.add(pointId);

      relationIdsByPointId.get(pointId)?.forEach((relationId) => {
        selectedRelationIds.add(relationId);
      });
      neighborPointIdsByPointId.get(pointId)?.forEach((neighborPointId) => {
        if (!visitedPointIds.has(neighborPointId)) {
          queue.push(neighborPointId);
        }
      });
    }

    return selectedRelationIds;
  }, [
    selectedMeasurementId,
    selectedMeasurementIds,
    visibleDistanceRelationsForRendering,
  ]);

  const effectiveDistanceRelationsForRendering = useMemo<
    PointDistanceRelation[]
  >(() => {
    const planarPolygonGroupById = new Map(
      planarPolygonGroups.map((group) => [group.id, group] as const)
    );

    return visibleDistanceRelationsForRendering.map((relation) => {
      const owningGroup = relation.polygonGroupId
        ? planarPolygonGroupById.get(relation.polygonGroupId) ?? null
        : null;
      const isStandaloneDistanceRelation = !relation.polygonGroupId;
      const isSelectedStandaloneDistanceRelation =
        isStandaloneDistanceRelation &&
        selectedStandaloneDistanceRelationIdSet.has(relation.id);
      const isDistanceMeasureRelation = !owningGroup || !owningGroup.closed;
      if (!isDistanceMeasureRelation) {
        return relation;
      }

      if (isSelectedStandaloneDistanceRelation) {
        return {
          ...relation,
          directLabelMode: "segment",
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
            ...(relation.labelVisibilityByKind ?? {}),
            direct: true,
            vertical: true,
            horizontal: true,
          },
        };
      }

      return {
        ...relation,
        directLabelMode: "none",
        labelVisibilityByKind: {
          ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
          ...(relation.labelVisibilityByKind ?? {}),
          direct: false,
          vertical: false,
          horizontal: false,
        },
      };
    });
  }, [
    visibleDistanceRelationsForRendering,
    planarPolygonGroups,
    selectedStandaloneDistanceRelationIdSet,
  ]);

  const hiddenPointLabelIds = useMemo(() => {
    const ids = new Set<string>([
      ...polygonOnlyPointIdSet,
      ...hiddenMeasurementIdSet,
      ...pointIdsWithoutLabelAnchor,
      ...unselectedClosedAreaVertexPointIdSet,
      ...unfocusedStandaloneDistanceNonHighestPointIds,
      ...focusedStandaloneDistanceNonHighestPointIds,
    ]);
    openFacadeSingleVertexPointIdSet.forEach((pointId) => {
      ids.add(pointId);
    });
    annotations.forEach((measurement) => {
      if (
        isPointAnnotationEntry(measurement) &&
        measurement.isFacadeAutoCorner &&
        !unselectedClosedAreaVertexPointIdSet.has(measurement.id)
      ) {
        ids.delete(measurement.id);
      }
    });
    labelAnchorPointIdsWithForcedVisibility.forEach((pointId) => {
      ids.delete(pointId);
    });
    return ids;
  }, [
    annotations,
    polygonOnlyPointIdSet,
    hiddenMeasurementIdSet,
    pointIdsWithoutLabelAnchor,
    unselectedClosedAreaVertexPointIdSet,
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
    openFacadeSingleVertexPointIdSet,
    labelAnchorPointIdsWithForcedVisibility,
  ]);

  const fullyHiddenPointIds = useMemo(() => {
    const ids = new Set([
      ...unfocusedPolylineNonLastIds,
      ...unfocusedStandaloneDistanceNonHighestPointIds,
      ...hiddenMeasurementIdSet,
    ]);
    annotations.forEach((measurement) => {
      if (
        isPointAnnotationEntry(measurement) &&
        measurement.isFacadeAutoCorner
      ) {
        ids.delete(measurement.id);
      }
    });
    closedFacadeRectangleVertexIdSet.forEach((pointId) => {
      ids.delete(pointId);
    });
    return ids;
  }, [
    annotations,
    unfocusedPolylineNonLastIds,
    unfocusedStandaloneDistanceNonHighestPointIds,
    hiddenMeasurementIdSet,
    closedFacadeRectangleVertexIdSet,
  ]);
  const effectiveFullyHiddenPointIds = useMemo(() => {
    if (!isLivePointPreviewModeActive) {
      return fullyHiddenPointIds;
    }

    return new Set(hiddenMeasurementIdSet);
  }, [
    fullyHiddenPointIds,
    hiddenMeasurementIdSet,
    isLivePointPreviewModeActive,
  ]);
  const markerOnlyOverlayNodeInteractions =
    (isLivePointPreviewModeActive && !isPointMeasureLabelModeActive) ||
    isPointMeasureLabelInputPending;
  const suppressLivePreviewLabelOverlay = isPointMeasureLabelModeActive;

  useAnnotationVisualizerAdapter({
    scene,
    annotations: visibleMeasurementsForRendering,
    showPoints,
    showPointLabels,
    pointRadius,
    referenceElevation: effectiveReferenceElevation,
    selectedMeasurementId,
    selectedMeasurementIds,
    hiddenPointLabelIds,
    fullyHiddenPointIds: effectiveFullyHiddenPointIds,
    markerlessPointIds,
    collapsedPillPointIds,
    moveGizmoPointId,
    selectionModeActive,
    selectModeRectangle,
    effectiveSelectModeAdditive,
    selectMeasurementIds,
    handlePointLabelClick,
    handlePointLabelDoubleClick,
    handlePointLabelLongPress,
    handlePointLabelHoverChange,
    handlePointVerticalOffsetStemLongPress,
    pointLongPressDurationMs: POINT_LABEL_LONG_PRESS_DURATION_MS,
    occlusionChecksEnabled,
    labelLayoutConfig: options?.labels,
    effectiveDistanceToReferenceByPointId,
    pointMarkerBadgeByPointId,
    labelInputPromptPointId,
    markerOnlyOverlayNodeInteractions,
    suppressLivePreviewLabelOverlay,
    livePreviewPointECEF: isLivePointPreviewModeActive
      ? livePreviewPointECEF
      : null,
    livePreviewSurfaceNormalECEF: isLivePointPreviewModeActive
      ? livePreviewSurfaceNormalECEF
      : null,
    livePreviewVerticalOffsetAnchorECEF:
      isLivePointPreviewModeActive && annotationMode === ANNOTATION_TYPE_POINT
        ? livePreviewVerticalOffsetAnchorECEF
        : null,
    livePreviewDistanceLine,
    showDistanceAndPolygonVisuals,
    distanceRelations: effectiveDistanceRelationsForRendering,
    planarPolygonGroups: visiblePlanarPolygonGroupsForRendering,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    cumulativeDistanceByRelationId,
    handleDistanceRelationLineLabelToggle,
    handleDistanceRelationLineClick,
    handleDistanceRelationMidpointClick,
    handleDistanceRelationCornerClick,
    referencePoint,
    moveGizmoAxisDirection,
    moveGizmoPreferredAxisId,
    moveGizmoMarkerSizeScale: moveGizmoOptions.markerSizeScale ?? 1,
    moveGizmoLabelDistanceScale: moveGizmoOptions.labelDistanceScale ?? 1,
    moveGizmoSnapPlaneDragToGround:
      moveGizmoOptions.snapPlaneDragToGround ?? false,
    moveGizmoShowRotationHandle: moveGizmoOptions.showRotationHandle ?? true,
    isMoveGizmoDragging,
    handleMoveGizmoPointPositionChange,
    setIsMoveGizmoDragging,
    handleMoveGizmoAxisChange,
    handleMoveGizmoExit,
  });

  const clearAllMeasurements = useCallback(() => {
    setAnnotations([]);
    setDistanceRelations([]);
    setPlanarPolygonGroups([]);
    setSelectedPlanarPolygonGroupId(null);
    setActivePlanarPolygonGroupId(null);
    setSelectedMeasurementId(null);
    setSelectedMeasurementIds([]);
    setPreviousSelectedMeasurementId(null);
    setDoubleClickChainSourcePointId(null);
    setMoveGizmoPointId(null);
    setMoveGizmoAxisDirection(null);
    setMoveGizmoAxisTitle(null);
    setMoveGizmoAxisCandidates(null);
    setIsMoveGizmoDragging(false);
    // resetVisibility
    if (hideMeasurementsOfType.size > 0) {
      setHideMeasurementsOfType(new Set());
    }
  }, [hideMeasurementsOfType.size]);

  const clearMeasurementsByType = useCallback((type: AnnotationMode) => {
    setAnnotations((prev) =>
      prev.filter((measurement) => measurement.type !== type)
    );
    if (type === ANNOTATION_TYPE_DISTANCE) {
      setDistanceRelations([]);
      setPlanarPolygonGroups([]);
      setSelectedPlanarPolygonGroupId(null);
      setActivePlanarPolygonGroupId(null);
      setDoubleClickChainSourcePointId(null);
    }
    setSelectedMeasurementId(null);
    setSelectedMeasurementIds([]);
    setPreviousSelectedMeasurementId(null);
    setMoveGizmoPointId(null);
    setMoveGizmoAxisDirection(null);
    setMoveGizmoAxisTitle(null);
    setMoveGizmoAxisCandidates(null);
    setIsMoveGizmoDragging(false);
    // resetVisibility
    setHideMeasurementsOfType(deleteFromHideMeasurementsOfType(type));
  }, []);

  const clearAnnotationsByIds = useCallback(
    (ids: string[]) => {
      const pointById = new Map(
        annotations
          .filter(isPointAnnotationEntry)
          .map((measurement) => [measurement.id, measurement] as const)
      );

      const requestedIdSet = new Set(ids);
      const protectedPolygonVertexPointIdSet = new Set<string>();
      planarPolygonGroups.forEach((group) => {
        if (!group.closed || group.vertexPointIds.length > 3) {
          return;
        }
        const vertexPointIds = group.vertexPointIds.filter(
          (vertexId): vertexId is string => Boolean(vertexId)
        );
        if (vertexPointIds.length === 0) {
          return;
        }
        const includesAnyVertex = vertexPointIds.some((vertexId) =>
          requestedIdSet.has(vertexId)
        );
        if (!includesAnyVertex) {
          return;
        }
        const includesAllVertices = vertexPointIds.every((vertexId) =>
          requestedIdSet.has(vertexId)
        );
        if (includesAllVertices) {
          return;
        }
        vertexPointIds.forEach((vertexId) => {
          protectedPolygonVertexPointIdSet.add(vertexId);
        });
      });

      const idsToDelete = new Set(
        ids.filter((id) => !protectedPolygonVertexPointIdSet.has(id))
      );
      if (idsToDelete.size === 0) {
        return;
      }
      let remainingRelations = [...distanceRelations];

      // Expand deletion set: if deleting a point removes a relation, and the
      // opposite endpoint was created exclusively for that removed relation,
      // remove that endpoint too (unless still referenced by another relation).
      let expanded = true;
      while (expanded) {
        expanded = false;

        const nextRemainingRelations: PointDistanceRelation[] = [];
        const removedRelations: PointDistanceRelation[] = [];
        remainingRelations.forEach((relation) => {
          if (
            idsToDelete.has(relation.pointAId) ||
            idsToDelete.has(relation.pointBId)
          ) {
            removedRelations.push(relation);
            return;
          }
          nextRemainingRelations.push(relation);
        });
        remainingRelations = nextRemainingRelations;

        removedRelations.forEach((relation) => {
          [relation.pointAId, relation.pointBId].forEach((pointId) => {
            if (idsToDelete.has(pointId)) return;
            const point = pointById.get(pointId);
            if (!point) return;
            const ownsByAdhocFlag = Boolean(point.distanceAdhocNode);
            if (!ownsByAdhocFlag) return;

            const stillReferencedByRemainingRelation = remainingRelations.some(
              (candidate) =>
                candidate.pointAId === pointId || candidate.pointBId === pointId
            );
            if (stillReferencedByRemainingRelation) return;

            idsToDelete.add(pointId);
            expanded = true;
          });
        });
      }

      setAnnotations((prev) => prev.filter((m) => !idsToDelete.has(m.id)));
      setDistanceRelations(remainingRelations);
      setSelectedMeasurementId((prev) =>
        prev && idsToDelete.has(prev) ? null : prev
      );
      setSelectedMeasurementIds((prev) =>
        prev.filter((selectedId) => !idsToDelete.has(selectedId))
      );
      setPreviousSelectedMeasurementId((prev) =>
        prev && idsToDelete.has(prev) ? null : prev
      );
      setDoubleClickChainSourcePointId((prev) =>
        prev && idsToDelete.has(prev) ? null : prev
      );
      setMoveGizmoPointId((prev) =>
        prev && idsToDelete.has(prev) ? null : prev
      );
      setMoveGizmoAxisDirection((prev) =>
        moveGizmoPointId && idsToDelete.has(moveGizmoPointId) ? null : prev
      );
      setMoveGizmoAxisTitle((prev) =>
        moveGizmoPointId && idsToDelete.has(moveGizmoPointId) ? null : prev
      );
      setMoveGizmoAxisCandidates((prev) =>
        moveGizmoPointId && idsToDelete.has(moveGizmoPointId) ? null : prev
      );
      setIsMoveGizmoDragging(false);

      const remainingPointById = getPointPositionMap(annotations);
      idsToDelete.forEach((id) => remainingPointById.delete(id));
      setPlanarPolygonGroups((prev) =>
        prev.flatMap((group) => {
          const nextVertexPointIds = group.vertexPointIds.filter(
            (vertexId) => !idsToDelete.has(vertexId)
          );
          if (nextVertexPointIds.length < 3) {
            return [];
          }
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextVertexPointIds,
            group.closed,
            getDistanceRelationId
          );
          return [
            computePolygonGroupDerivedDataWithCamera(
              {
                ...group,
                vertexPointIds: nextVertexPointIds,
                edgeRelationIds: nextEdgeRelationIds,
              },
              remainingPointById
            ),
          ];
        })
      );
      setSelectedPlanarPolygonGroupId((prev) => {
        if (!prev) return prev;
        const hasSelectedPolygonAfterRemoval = planarPolygonGroups.some(
          (group) =>
            group.id === prev &&
            !group.vertexPointIds.some((vertexId) => idsToDelete.has(vertexId))
        );
        return hasSelectedPolygonAfterRemoval ? prev : null;
      });
      setActivePlanarPolygonGroupId((prev) => {
        if (!prev) return prev;
        const activeGroup = planarPolygonGroups.find(
          (group) => group.id === prev
        );
        if (!activeGroup) return null;
        return activeGroup.vertexPointIds.some((id) => idsToDelete.has(id))
          ? null
          : prev;
      });
    },
    [
      distanceRelations,
      annotations,
      moveGizmoPointId,
      planarPolygonGroups,
      computePolygonGroupDerivedDataWithCamera,
    ]
  );

  const deleteSelectedPointAnnotations = useCallback(() => {
    const selectedIds = selectedMeasurementIds.filter(
      (id) => pointMeasurementIds.has(id) && !lockedMeasurementIdSet.has(id)
    );
    if (selectedIds.length > 0) {
      clearAnnotationsByIds(selectedIds);
      return;
    }
    if (
      selectedMeasurementId &&
      pointMeasurementIds.has(selectedMeasurementId) &&
      !lockedMeasurementIdSet.has(selectedMeasurementId)
    ) {
      clearAnnotationsByIds([selectedMeasurementId]);
    }
  }, [
    clearAnnotationsByIds,
    lockedMeasurementIdSet,
    pointMeasurementIds,
    selectedMeasurementId,
    selectedMeasurementIds,
  ]);

  const flyToMeasurementById = useCallback(
    (id: string) => {
      if (!id) return;
      const measurement = annotations.find((entry) => entry.id === id);
      if (!measurement) return;
      flyToMeasurementPointGroup(
        scene,
        getMeasurementEntryFlyToPoints(measurement)
      );
    },
    [annotations, scene]
  );

  const flyToAllMeasurements = useCallback(() => {
    if (annotations.length === 0) return;
    const points = annotations.flatMap(getMeasurementEntryFlyToPoints);
    flyToMeasurementPointGroup(scene, points);
  }, [annotations, scene]);

  useEffect(() => {
    if (selectedMeasurementIds.length === 0) return;
    const idsInState = new Set(
      annotations.map((measurement) => measurement.id)
    );
    setSelectedMeasurementIds((prev) => {
      const next = prev.filter((id) => idsInState.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [annotations, selectedMeasurementIds.length]);

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isKeyboardTargetEditable(event.target)) return;
      const selectedIds = selectedMeasurementIds.filter(
        (id) => pointMeasurementIds.has(id) && !lockedMeasurementIdSet.has(id)
      );
      if (selectedIds.length > 1) {
        return;
      }
      const hasDeletablePrimarySelection =
        Boolean(selectedMeasurementId) &&
        pointMeasurementIds.has(selectedMeasurementId) &&
        !lockedMeasurementIdSet.has(selectedMeasurementId);
      if (selectedIds.length === 0 && !hasDeletablePrimarySelection) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      deleteSelectedPointAnnotations();
    };

    window.addEventListener("keydown", handleDeleteKey, true);
    return () => {
      window.removeEventListener("keydown", handleDeleteKey, true);
    };
  }, [
    deleteSelectedPointAnnotations,
    lockedMeasurementIdSet,
    pointMeasurementIds,
    selectedMeasurementId,
    selectedMeasurementIds,
  ]);

  useEffect(() => {
    const handlePointModeKeyboardShortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isKeyboardTargetEditable(event.target)) return;
      if (
        annotationMode !== ANNOTATION_TYPE_DISTANCE &&
        annotationMode !== ANNOTATION_TYPE_POLYLINE &&
        annotationMode !== ANNOTATION_TYPE_POINT
      ) {
        return;
      }

      const hasSelection =
        selectedMeasurementIds.length > 0 || Boolean(selectedMeasurementId);

      if (
        event.key === "Enter" &&
        isPointMeasureCreateModeActive &&
        temporaryMode
      ) {
        const latestTemporaryPointMeasurement = [...annotations]
          .reverse()
          .find(
            (measurement) =>
              isPointAnnotationEntry(measurement) && measurement.temporary
          );
        if (!latestTemporaryPointMeasurement) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setAnnotations((prev) =>
          prev.map((measurement) =>
            measurement.temporary
              ? { ...measurement, temporary: false }
              : measurement
          )
        );
        selectMeasurementById(latestTemporaryPointMeasurement.id);
        return;
      }

      if (event.key !== "Backspace") return;
      if (hasSelection) return;

      const pointMeasurements = annotations.filter(isPointAnnotationEntry);
      const latestPointMeasurement =
        pointMeasurements[pointMeasurements.length - 1];
      if (!latestPointMeasurement) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      clearAnnotationsByIds([latestPointMeasurement.id]);
      selectMeasurementById(
        pointMeasurements[pointMeasurements.length - 2]?.id ?? null
      );
    };

    window.addEventListener("keydown", handlePointModeKeyboardShortcuts, true);
    return () => {
      window.removeEventListener(
        "keydown",
        handlePointModeKeyboardShortcuts,
        true
      );
    };
  }, [
    clearAnnotationsByIds,
    annotationMode,
    annotations,
    selectedMeasurementId,
    selectedMeasurementIds.length,
    selectMeasurementById,
    setAnnotations,
    isPointMeasureCreateModeActive,
    temporaryMode,
  ]);

  useEffect(() => {
    if (options?.mode !== undefined) {
      setAnnotationMode(options.mode);
      if (options.mode === SELECT_TOOL_TYPE) {
        setSelectedMeasurementId(null);
        setPreviousSelectedMeasurementId(null);
        setDoubleClickChainSourcePointId(null);
        setSelectedPlanarPolygonGroupId(null);
        setActivePlanarPolygonGroupId(null);
        setMoveGizmoPointId(null);
        setMoveGizmoAxisDirection(null);
        setMoveGizmoAxisTitle(null);
        setMoveGizmoAxisCandidates(null);
        setIsMoveGizmoDragging(false);
      }
    }
  }, [options?.mode, setAnnotationMode]);

  useEffect(() => {
    if (isInteractionActive) {
      setAnnotationMode((prev) =>
        prev === SELECT_TOOL_TYPE ? ANNOTATION_TYPE_POINT : prev
      );
    } else {
      setAnnotationMode(SELECT_TOOL_TYPE);
      setSelectedMeasurementId(null);
      setPreviousSelectedMeasurementId(null);
      setDoubleClickChainSourcePointId(null);
      setSelectedPlanarPolygonGroupId(null);
      setActivePlanarPolygonGroupId(null);
      setMoveGizmoPointId(null);
      setMoveGizmoAxisDirection(null);
      setMoveGizmoAxisTitle(null);
      setMoveGizmoAxisCandidates(null);
      setIsMoveGizmoDragging(false);
    }
  }, [isInteractionActive, setAnnotationMode]);

  useEffect(() => {
    const previousMode = previousMeasurementModeRef.current;
    if (previousMode === annotationMode) return;
    previousMeasurementModeRef.current = annotationMode;

    if (
      previousMode === ANNOTATION_TYPE_DISTANCE &&
      annotationMode !== ANNOTATION_TYPE_DISTANCE &&
      doubleClickChainSourcePointId
    ) {
      const pendingSourceMeasurement = annotations.find(
        (measurement) => measurement.id === doubleClickChainSourcePointId
      );
      if (
        pendingSourceMeasurement &&
        isPointAnnotationEntry(pendingSourceMeasurement) &&
        pendingSourceMeasurement.distanceAdhocNode
      ) {
        const sourcePointId = pendingSourceMeasurement.id;
        const hasDistanceRelation = distanceRelations.some(
          (relation) =>
            relation.pointAId === sourcePointId ||
            relation.pointBId === sourcePointId
        );
        const belongsToPlanarGroup = planarPolygonGroups.some((group) =>
          group.vertexPointIds.includes(sourcePointId)
        );

        if (!hasDistanceRelation && !belongsToPlanarGroup) {
          setAnnotations((prev) =>
            prev.filter((measurement) => measurement.id !== sourcePointId)
          );
        }
      }
    }

    selectedMeasurementIdRef.current = null;
    setSelectedMeasurementId(null);
    setSelectedMeasurementIds([]);
    setPreviousSelectedMeasurementId(null);
    setSelectedPlanarPolygonGroupId(null);
    setDoubleClickChainSourcePointId(null);
    setActivePlanarPolygonGroupId(null);
    setPendingPolylinePromotionRingClosurePointId(null);
  }, [
    annotationMode,
    doubleClickChainSourcePointId,
    annotations,
    distanceRelations,
    planarPolygonGroups,
  ]);

  useEffect(() => {
    if (annotationMode === ANNOTATION_TYPE_POLYLINE) return;

    const invalidOpenFacadeGroups = planarPolygonGroups.filter((group) => {
      return (
        !group.closed &&
        (group.surfaceType ?? "roof") === "facade" &&
        group.vertexPointIds.length === 1
      );
    });
    if (invalidOpenFacadeGroups.length === 0) return;

    const invalidGroupIdSet = new Set(
      invalidOpenFacadeGroups.map((group) => group.id)
    );
    const removablePointIdSet = new Set<string>();
    invalidOpenFacadeGroups.forEach((group) => {
      const onlyPointId = group.vertexPointIds[0];
      if (onlyPointId) {
        removablePointIdSet.add(onlyPointId);
      }
    });

    const remainingGroups = planarPolygonGroups.filter(
      (group) => !invalidGroupIdSet.has(group.id)
    );
    const protectedPointIdSet = new Set<string>();
    remainingGroups.forEach((group) => {
      group.vertexPointIds.forEach((pointId) => {
        if (pointId) {
          protectedPointIdSet.add(pointId);
        }
      });
    });
    distanceRelations.forEach((relation) => {
      protectedPointIdSet.add(relation.pointAId);
      protectedPointIdSet.add(relation.pointBId);
      protectedPointIdSet.add(relation.anchorPointId);
    });

    setPlanarPolygonGroups(remainingGroups);

    if (
      selectedPlanarPolygonGroupId &&
      invalidGroupIdSet.has(selectedPlanarPolygonGroupId)
    ) {
      setSelectedPlanarPolygonGroupId(null);
    }

    if (removablePointIdSet.size === 0) return;
    setAnnotations((prev) =>
      prev.filter((measurement) => {
        if (!isPointAnnotationEntry(measurement)) {
          return true;
        }
        if (!removablePointIdSet.has(measurement.id)) {
          return true;
        }
        return protectedPointIdSet.has(measurement.id);
      })
    );
  }, [
    annotationMode,
    planarPolygonGroups,
    distanceRelations,
    selectedPlanarPolygonGroupId,
  ]);

  useEffect(() => {
    if (!doubleClickChainSourcePointId) return;
    const hasChainSourceMeasurement = annotations.some(
      (measurement) => measurement.id === doubleClickChainSourcePointId
    );
    if (!hasChainSourceMeasurement) {
      setDoubleClickChainSourcePointId(null);
    }
  }, [doubleClickChainSourcePointId, annotations]);

  useEffect(() => {
    if (!selectedMeasurementId) return;
    const hasSelectedMeasurement = annotations.some(
      (measurement) => measurement.id === selectedMeasurementId
    );
    if (!hasSelectedMeasurement) {
      setSelectedMeasurementId(null);
    }
  }, [annotations, selectedMeasurementId]);

  useEffect(() => {
    if (!previousSelectedMeasurementId) return;
    const hasPreviousSelection = annotations.some(
      (measurement) => measurement.id === previousSelectedMeasurementId
    );
    if (!hasPreviousSelection) {
      setPreviousSelectedMeasurementId(null);
    }
  }, [annotations, previousSelectedMeasurementId]);

  useEffect(() => {
    const pointMeasurementIds = new Set(
      annotations
        .filter(isPointAnnotationEntry)
        .map((measurement) => measurement.id)
    );
    setDistanceRelations((prev) => {
      const next = prev
        .filter(
          (relation) =>
            pointMeasurementIds.has(relation.pointAId) &&
            pointMeasurementIds.has(relation.pointBId)
        )
        .map((relation) => {
          const fallbackAnchorPointId = relation.pointAId;
          const anchorPointId = pointMeasurementIds.has(relation.anchorPointId)
            ? relation.anchorPointId
            : fallbackAnchorPointId;
          return {
            ...relation,
            anchorPointId,
          };
        });
      if (next.length !== prev.length) return next;
      for (let index = 0; index < next.length; index += 1) {
        if (next[index]?.anchorPointId !== prev[index]?.anchorPointId) {
          return next;
        }
      }
      return prev;
    });
  }, [annotations]);

  useEffect(() => {
    const pointMeasurementIds = new Set(
      annotations
        .filter(isPointAnnotationEntry)
        .map((measurement) => measurement.id)
    );
    const pointById = getPointPositionMap(annotations);
    setPlanarPolygonGroups((prev) =>
      prev.flatMap((group) => {
        const nextVertexPointIds = group.vertexPointIds.filter((vertexId) =>
          pointMeasurementIds.has(vertexId)
        );
        if (nextVertexPointIds.length === 0) return [];
        const nextClosed = group.closed && nextVertexPointIds.length >= 3;
        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextVertexPointIds,
          nextClosed,
          getDistanceRelationId
        );
        return [
          computePolygonGroupDerivedDataWithCamera(
            {
              ...group,
              vertexPointIds: nextVertexPointIds,
              edgeRelationIds: nextEdgeRelationIds,
              closed: nextClosed,
            },
            pointById
          ),
        ];
      })
    );
  }, [annotations, computePolygonGroupDerivedDataWithCamera]);

  useEffect(() => {
    if (!referencePoint) return;

    const pointMeasurements = annotations.filter(isPointAnnotationEntry);
    if (pointMeasurements.length === 0) {
      setReferencePoint(null);
      return;
    }

    const hasReferenceMeasurement = pointMeasurements.some(
      (measurement) =>
        Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
        REFERENCE_POINT_SYNC_EPSILON_METERS
    );

    if (hasReferenceMeasurement) {
      return;
    }

    // Reference point was deleted: fallback to the latest remaining point.
    const nextReferencePoint =
      pointMeasurements[pointMeasurements.length - 1]?.geometryECEF ?? null;
    setReferencePoint(nextReferencePoint);
  }, [annotations, referencePoint, setReferencePoint]);

  useEffect(() => {
    if (selectedMeasurementId || selectedPlanarPolygonGroupId) return;

    const relationWithVisibleLine = distanceRelations.find(
      hasAnyVisibleDistanceRelationLine
    );
    if (relationWithVisibleLine) {
      selectMeasurementById(relationWithVisibleLine.anchorPointId);
    }
  }, [
    distanceRelations,
    selectedMeasurementId,
    selectedPlanarPolygonGroupId,
    selectMeasurementById,
  ]);

  useEffect(() => {
    if (!moveGizmoPointId) return;
    const hasMoveGizmoPoint = annotations.some(
      (measurement) => measurement.id === moveGizmoPointId
    );
    if (!hasMoveGizmoPoint) {
      setMoveGizmoPointId(null);
      setMoveGizmoAxisDirection(null);
      setMoveGizmoAxisTitle(null);
      setMoveGizmoAxisCandidates(null);
      setIsMoveGizmoDragging(false);
    }
  }, [annotations, moveGizmoPointId]);

  useEffect(() => {
    if (!activePlanarPolygonGroupId) return;
    const hasActiveGroup = planarPolygonGroups.some(
      (group) => group.id === activePlanarPolygonGroupId
    );
    if (!hasActiveGroup) {
      setActivePlanarPolygonGroupId(null);
    }
  }, [activePlanarPolygonGroupId, planarPolygonGroups]);

  useEffect(() => {
    if (!selectedPlanarPolygonGroupId) return;
    const hasSelectedPolygonGroup = planarPolygonGroups.some(
      (group) => group.id === selectedPlanarPolygonGroupId
    );
    if (!hasSelectedPolygonGroup) {
      setSelectedPlanarPolygonGroupId(null);
    }
  }, [planarPolygonGroups, selectedPlanarPolygonGroupId]);

  useEffect(() => {
    if (referencePoint !== null) return;
    // if more than one point measurement is present, set the reference point to the first one
    if (
      annotations.length > 0 &&
      isPointAnnotationEntry(annotations[0]) &&
      annotations.length > 1
    ) {
      setReferencePoint(annotations[0].geometryECEF);
    }
  }, [annotations, setReferencePoint, referencePoint]);

  const planarVertexPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      group.vertexPointIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups]);

  const distanceEndpointPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    distanceRelations.forEach((relation) => {
      ids.add(relation.pointAId);
      ids.add(relation.pointBId);
    });
    return ids;
  }, [distanceRelations]);

  const distanceAnchorPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    distanceRelations.forEach((relation) => {
      ids.add(relation.anchorPointId || relation.pointAId);
    });
    return ids;
  }, [distanceRelations]);

  const annotationsByType = useCallback(
    (type: AnnotationListType<AnnotationMode>): AnnotationEntry[] => {
      if (type === "pointLabel") {
        return annotations.filter(
          (measurement) =>
            isPointAnnotationEntry(measurement) &&
            Boolean(measurement.auxiliaryLabelAnchor)
        );
      }

      if (type === "pointMeasure") {
        return annotations.filter(
          (measurement) =>
            isPointAnnotationEntry(measurement) &&
            !measurement.auxiliaryLabelAnchor &&
            !measurement.distanceAdhocNode &&
            !planarVertexPointIdSet.has(measurement.id)
        );
      }

      if (type === "distanceMeasure") {
        return annotations.filter((measurement) => {
          if (!isPointAnnotationEntry(measurement)) return false;
          if (measurement.auxiliaryLabelAnchor) return false;
          if (planarVertexPointIdSet.has(measurement.id)) return false;

          const ownsDistanceByRelationFlag = Boolean(
            measurement.distanceRelationId
          );
          const ownsDistanceByAnchor = distanceAnchorPointIdSet.has(
            measurement.id
          );
          const isStandaloneDistanceNode =
            Boolean(measurement.distanceAdhocNode) &&
            !distanceEndpointPointIdSet.has(measurement.id);

          return (
            ownsDistanceByRelationFlag ||
            ownsDistanceByAnchor ||
            isStandaloneDistanceNode
          );
        });
      }

      return annotations.filter((measurement) => measurement.type === type);
    },
    [
      distanceAnchorPointIdSet,
      distanceEndpointPointIdSet,
      annotations,
      planarVertexPointIdSet,
    ]
  );

  const navigationAnnotationTypes = useMemo<
    AnnotationListType<AnnotationMode>[]
  >(() => ["pointMeasure", "distanceMeasure"], []);

  const {
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
  } = useAnnotationCollectionSelectors<AnnotationMode, AnnotationEntry>({
    annotationsByType,
    navigationTypes: navigationAnnotationTypes,
  });

  const addAnnotation = useCallback(
    (payload: AnnotationCreatePayload<AnnotationEntry>): string => {
      const generatedId =
        payload.id?.trim() ||
        `${payload.type}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`;
      const nextMeasurement: AnnotationEntry = {
        ...payload,
        id: generatedId,
        timestamp: payload.timestamp ?? Date.now(),
      };
      setAnnotations((prev) => [...prev, nextMeasurement]);
      return generatedId;
    },
    [setAnnotations]
  );

  const updateAnnotationById = useCallback(
    (id: string, patch: Partial<AnnotationEntry>) => {
      if (!id) return;
      setAnnotations((prev) => {
        let hasChanged = false;
        const next = prev.map((measurement) => {
          if (measurement.id !== id) return measurement;
          hasChanged = true;
          return {
            ...measurement,
            ...patch,
            id: measurement.id,
          };
        });
        return hasChanged ? next : prev;
      });
    },
    [setAnnotations]
  );

  const deleteAnnotationById = useCallback(
    (id: string) => {
      if (!id) return;
      clearAnnotationsByIds([id]);
    },
    [clearAnnotationsByIds]
  );

  const deleteAnnotationsByIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      clearAnnotationsByIds(ids);
    },
    [clearAnnotationsByIds]
  );

  const liveAnnotationCandidate = useMemo<AnnotationEntry | null>(() => {
    const isPointLivePreviewMode =
      annotationMode === ANNOTATION_TYPE_POINT && !pointLabelOnCreate;
    const isDistanceLivePreviewMode =
      annotationMode === ANNOTATION_TYPE_DISTANCE;

    if (!isPointLivePreviewMode && !isDistanceLivePreviewMode) {
      return null;
    }
    if (!livePreviewPointECEF) {
      return null;
    }

    const previewPoint = getDegreesFromCartesian(livePreviewPointECEF);
    if (
      !Number.isFinite(previewPoint.latitude) ||
      !Number.isFinite(previewPoint.longitude)
    ) {
      return null;
    }

    const previewMeasurementType = isDistanceLivePreviewMode
      ? ANNOTATION_TYPE_DISTANCE
      : ANNOTATION_TYPE_POINT;

    return {
      id: "__live-preview-measurement__",
      type: previewMeasurementType,
      timestamp: -1,
      isLivePreview: true,
      distanceAdhocNode: isDistanceLivePreviewMode ? true : undefined,
      geometryECEF: Cartesian3.clone(livePreviewPointECEF),
      geometryWGS84: {
        latitude: previewPoint.latitude,
        longitude: previewPoint.longitude,
        altitude: getEllipsoidalAltitudeOrZero(previewPoint.altitude),
      },
    };
  }, [livePreviewPointECEF, annotationMode, pointLabelOnCreate]);

  const annotationsContextValue = useMemo<
    AnnotationsContextType<AnnotationMode, AnnotationEntry>
  >(
    () => ({
      annotationMode,
      setAnnotationMode,
      annotations,
      liveAnnotationCandidate,
      annotationsByType,
      getAnnotationsForNavigation,
      getAnnotationIndexByType,
      getAnnotationOrderByType,
      getNextAnnotationOrderByType,
      addAnnotation,
      updateAnnotationById,
      deleteAnnotationById,
      deleteAnnotationsByIds,
      setAnnotations,
      updateAnnotationNameById,
      updatePointLabelAppearanceById,
      toggleAnnotationLockById,
      clearAnnotationsByIds,
      deleteSelectedPointAnnotations,
      setPointAnnotationElevationById,
      setPointAnnotationCoordinatesById,
      temporaryMode,
      setTemporaryMode,
      pointVerticalOffsetMeters,
      setPointVerticalOffsetMeters,
      pointLabelOnCreate,
      setPointLabelOnCreate,
      labelInputPromptPointId,
      confirmPointLabelInputById,
      showLabels,
      setShowLabels,
    }),
    [
      annotationMode,
      setAnnotationMode,
      annotations,
      liveAnnotationCandidate,
      annotationsByType,
      getAnnotationsForNavigation,
      getAnnotationIndexByType,
      getAnnotationOrderByType,
      getNextAnnotationOrderByType,
      addAnnotation,
      updateAnnotationById,
      deleteAnnotationById,
      deleteAnnotationsByIds,
      setAnnotations,
      updateAnnotationNameById,
      updatePointLabelAppearanceById,
      toggleAnnotationLockById,
      clearAnnotationsByIds,
      deleteSelectedPointAnnotations,
      setPointAnnotationElevationById,
      setPointAnnotationCoordinatesById,
      temporaryMode,
      setTemporaryMode,
      pointVerticalOffsetMeters,
      setPointVerticalOffsetMeters,
      pointLabelOnCreate,
      setPointLabelOnCreate,
      labelInputPromptPointId,
      confirmPointLabelInputById,
      showLabels,
      setShowLabels,
    ]
  );

  const selectionContextValue = useMemo<AnnotationSelectionContextType>(
    () => ({
      selectedMeasurementId,
      selectedMeasurementIds,
      selectMeasurementById,
      selectMeasurementIds,
      selectionModeActive,
      setSelectionModeActive,
      selectModeAdditive,
      setSelectModeAdditive,
      selectModeRectangle,
      setSelectModeRectangle,
      effectiveSelectModeAdditive,
    }),
    [
      selectedMeasurementId,
      selectedMeasurementIds,
      selectMeasurementById,
      selectMeasurementIds,
      selectionModeActive,
      setSelectionModeActive,
      selectModeAdditive,
      setSelectModeAdditive,
      selectModeRectangle,
      setSelectModeRectangle,
      effectiveSelectModeAdditive,
    ]
  );

  const polylineGroups = useMemo(
    () =>
      planarPolygonGroups.filter(
        (group) =>
          getPlanarGroupMeasurementKind(group) === ANNOTATION_TYPE_POLYLINE
      ),
    [planarPolygonGroups]
  );
  const areaPolygonGroups = useMemo(
    () =>
      planarPolygonGroups.filter((group) => {
        if (
          getPlanarGroupMeasurementKind(group) !== ANNOTATION_TYPE_AREA_GROUND
        ) {
          return false;
        }
        const surfaceType = group.surfaceType ?? "roof";
        return surfaceType === "footprint" || surfaceType === "terrain";
      }),
    [planarPolygonGroups]
  );
  const planarSurfacePolygonGroups = useMemo(
    () =>
      planarPolygonGroups.filter((group) => {
        if (
          getPlanarGroupMeasurementKind(group) !== ANNOTATION_TYPE_AREA_GROUND
        ) {
          return false;
        }
        return (group.surfaceType ?? "roof") === "roof";
      }),
    [planarPolygonGroups]
  );
  const verticalPolygonGroups = useMemo(
    () =>
      planarPolygonGroups.filter((group) => {
        if (
          getPlanarGroupMeasurementKind(group) !== ANNOTATION_TYPE_AREA_GROUND
        ) {
          return false;
        }
        return (group.surfaceType ?? "roof") === "facade";
      }),
    [planarPolygonGroups]
  );

  const modeOptionsContextValue = useMemo<AnnotationModeOptionsContextType>(
    () => ({
      planarPolygonGroups,
      polylineGroups,
      areaPolygonGroups,
      planarSurfacePolygonGroups,
      verticalPolygonGroups,
      distanceModeStickyToFirstPoint,
      setDistanceModeStickyToFirstPoint,
      distanceCreationLineVisibility,
      setDistanceCreationLineVisibilityByKind,
      polylineVerticalOffsetMeters,
      setPolylineVerticalOffsetMeters,
      polylineSegmentLineMode,
      setPolylineSegmentLineMode,
      planarToolCreationMode,
      setPlanarToolCreationMode,
      polygonSurfaceTypePreset,
      setPolygonSurfaceTypePreset,
    }),
    [
      planarPolygonGroups,
      polylineGroups,
      areaPolygonGroups,
      planarSurfacePolygonGroups,
      verticalPolygonGroups,
      distanceModeStickyToFirstPoint,
      setDistanceModeStickyToFirstPoint,
      distanceCreationLineVisibility,
      setDistanceCreationLineVisibilityByKind,
      polylineVerticalOffsetMeters,
      setPolylineVerticalOffsetMeters,
      polylineSegmentLineMode,
      setPolylineSegmentLineMode,
      planarToolCreationMode,
      setPlanarToolCreationMode,
      polygonSurfaceTypePreset,
      setPolygonSurfaceTypePreset,
    ]
  );

  const visibilityContextValue = useMemo<
    AnnotationVisibilityContextType<AnnotationMode>
  >(
    () => ({
      hideMeasurementsOfType,
      setHideMeasurementsOfType,
      hideLabelsOfType,
      setHideLabelsOfType,
    }),
    [
      hideMeasurementsOfType,
      setHideMeasurementsOfType,
      hideLabelsOfType,
      setHideLabelsOfType,
    ]
  );

  const editContextValue = useMemo<AnnotationEditContextType>(
    () => ({
      lockedEditMeasurementId,
      clearLockedEditMeasurementId,
    }),
    [clearLockedEditMeasurementId, lockedEditMeasurementId]
  );

  const contextValue = useMemo(
    () => ({
      annotationMode,
      setAnnotationMode,
      annotations,
      setAnnotations,
      selectedMeasurementId,
      activeMeasurementId,
      selectedMeasurementIds,
      selectMeasurementIds,
      selectionModeActive,
      setSelectionModeActive,
      selectModeAdditive,
      setSelectModeAdditive,
      selectModeRectangle,
      setSelectModeRectangle,
      selectMeasurementById,
      updateAnnotationNameById,
      updatePointLabelAppearanceById,
      toggleAnnotationLockById,
      selectedPlanarPolygonGroupId,
      activePlanarPolygonGroupId,
      selectPlanarPolygonGroupById,
      updatePlanarPolygonNameById,
      moveGizmoPointId,
      isMoveGizmoDragging,
      startMoveGizmoForMeasurementId,
      handleMoveGizmoPointPositionChange,
      stopMoveGizmo,
      setPointAnnotationElevationById,
      setPointAnnotationCoordinatesById,
      clearAllMeasurements,
      clearAnnotationsByIds,
      deleteSelectedPointAnnotations,
      clearMeasurementsByType,
      flyToMeasurementById,
      flyToAllMeasurements,
      showLabels,
      setShowLabels,
      temporaryMode,
      setTemporaryMode,
      pointRadius,
      setPointRadius,
      pointVerticalOffsetMeters,
      setPointVerticalOffsetMeters,
      polylineVerticalOffsetMeters,
      setPolylineVerticalOffsetMeters,
      polylineVerticalOffsetVisualOnly,
      setPolylineVerticalOffsetVisualOnly,
      polylineSegmentLineMode,
      setPolylineSegmentLineMode,
      planarToolCreationMode,
      setPlanarToolCreationMode,
      polygonSurfaceTypePreset,
      setPolygonSurfaceTypePreset,
      distanceModeStickyToFirstPoint,
      setDistanceModeStickyToFirstPoint,
      distanceCreationLineVisibility,
      setDistanceCreationLineVisibilityByKind,
      heightOffset,
      setHeightOffset,
      referencePoint,
      livePreviewPointECEF,
      hasDistancePreviewAnchor,
      setReferencePoint,
      referenceElevation,
      geometryNodeTable,
      distanceRelations,
      setDistanceRelations,
      planarPolygonGroups,
      polylineGroups,
      areaPolygonGroups,
      planarSurfacePolygonGroups,
      verticalPolygonGroups,
      setPlanarPolygonGroups,
      polylines,
      setPolylines,
      showSelectedReferenceLine,
      setShowSelectedReferenceLine,
      showSelectedReferenceLineComponents,
      setShowSelectedReferenceLineComponents,
      occlusionChecksEnabled,
      setOcclusionChecksEnabled,
      setPointLabelMetricModeById,
      pointLabelOnCreate,
      setPointLabelOnCreate,
      labelInputPromptPointId,
      confirmPointLabelInputById,
      pointMarkerBadgeByPointId,
      pendingPolylinePromotionRingClosurePointId,
      confirmPolylineRingPromotion,
      cancelPolylineRingPromotion,
    }),
    [
      annotationMode,
      setAnnotationMode,
      annotations,
      setAnnotations,
      selectedMeasurementId,
      activeMeasurementId,
      selectedMeasurementIds,
      selectMeasurementIds,
      selectionModeActive,
      setSelectionModeActive,
      selectModeAdditive,
      setSelectModeAdditive,
      selectModeRectangle,
      setSelectModeRectangle,
      selectMeasurementById,
      updateAnnotationNameById,
      updatePointLabelAppearanceById,
      toggleAnnotationLockById,
      selectedPlanarPolygonGroupId,
      activePlanarPolygonGroupId,
      selectPlanarPolygonGroupById,
      updatePlanarPolygonNameById,
      moveGizmoPointId,
      isMoveGizmoDragging,
      startMoveGizmoForMeasurementId,
      stopMoveGizmo,
      setPointAnnotationElevationById,
      setPointAnnotationCoordinatesById,
      clearAllMeasurements,
      clearAnnotationsByIds,
      deleteSelectedPointAnnotations,
      clearMeasurementsByType,
      flyToMeasurementById,
      flyToAllMeasurements,
      showLabels,
      setShowLabels,
      occlusionChecksEnabled,
      setOcclusionChecksEnabled,
      temporaryMode,
      setTemporaryMode,
      pointRadius,
      setPointRadius,
      pointVerticalOffsetMeters,
      setPointVerticalOffsetMeters,
      polylineVerticalOffsetMeters,
      setPolylineVerticalOffsetMeters,
      polylineVerticalOffsetVisualOnly,
      setPolylineVerticalOffsetVisualOnly,
      polylineSegmentLineMode,
      setPolylineSegmentLineMode,
      planarToolCreationMode,
      setPlanarToolCreationMode,
      polygonSurfaceTypePreset,
      setPolygonSurfaceTypePreset,
      distanceModeStickyToFirstPoint,
      setDistanceModeStickyToFirstPoint,
      distanceCreationLineVisibility,
      setDistanceCreationLineVisibilityByKind,
      heightOffset,
      setHeightOffset,
      referencePoint,
      livePreviewPointECEF,
      hasDistancePreviewAnchor,
      setReferencePoint,
      referenceElevation,
      geometryNodeTable,
      distanceRelations,
      setDistanceRelations,
      planarPolygonGroups,
      polylineGroups,
      areaPolygonGroups,
      planarSurfacePolygonGroups,
      verticalPolygonGroups,
      setPlanarPolygonGroups,
      polylines,
      setPolylines,
      showSelectedReferenceLine,
      setShowSelectedReferenceLine,
      showSelectedReferenceLineComponents,
      setShowSelectedReferenceLineComponents,
      pointLabelOnCreate,
      labelInputPromptPointId,
      confirmPointLabelInputById,
      pointMarkerBadgeByPointId,
      pendingPolylinePromotionRingClosurePointId,
      confirmPolylineRingPromotion,
      cancelPolylineRingPromotion,
    ]
  );

  return (
    <AnnotationContextsProvider
      annotationsValue={annotationsContextValue}
      selectionValue={selectionContextValue}
      modeOptionsValue={modeOptionsContextValue}
      visibilityValue={visibilityContextValue}
      editValue={editContextValue}
    >
      <AnnotationsAdapterContext.Provider value={contextValue}>
        {children}
      </AnnotationsAdapterContext.Provider>
    </AnnotationContextsProvider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAnnotationsAdapter = (): AnnotationsAdapterContextType => {
  const context = useContext(AnnotationsAdapterContext);
  if (context === undefined) {
    throw new Error(
      "useAnnotationsAdapter must be used within a AnnotationsAdapterProvider"
    );
  }
  return context;
};
