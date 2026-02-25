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
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  getDegreesFromCartesian,
} from "@carma/cesium";
import { useLabelOverlay } from "@carma-providers/label-overlay";

import { normalizeOptions } from "@carma-commons/utils";
import {
  MEASUREMENT_MODE,
  useMapMeasurementsContext,
} from "@carma-commons/measurements";

import { useCesiumContext } from "@carma-mapping/engines/cesium";

import {
  useCesiumPointQuery,
  useCesiumPointVisualizer,
  useCesiumOverlaySync,
  type CesiumLabelLayoutConfigOverrides,
  type PointMarkerBadge,
} from "../hooks";
import { useMeasurementPersistence } from "../hooks/useMeasurementPersistence";

import {
  DEFAULT_POINT_LABEL_METRIC_MODE,
  DEFAULT_POLYLINE_POINT_LABEL_MODE,
  type DirectLineLabelMode,
  isPointMeasurementEntry,
  type MeasurementGeometryEdge,
  type MeasurementGeometryPoint,
  type MeasurementPersistenceEnvelopeV2,
  type PlanarMeasurementKind,
  type PlanarPolygonGroupVertex,
  type PolylineCollection,
  type PolylineSegmentLineMode,
  type PolylinePointLabelMode,
  type PlanarPolygonGroup,
  type PlanarPolygonPlane,
  type PointDistanceRelation,
  type MeasurementLabelAnchor,
  type PointLabelMetricMode,
  type ReferenceLineLabelKind,
  type MeasurementCollection,
  type SurfaceType,
  MeasurementMode,
} from "../types/MeasurementTypes";
import { formatNumber } from "../utils/formatting";
import { getEuclideanDistance } from "../utils/geo";
import {
  loadNormalizedMeasurements,
  loadDistanceRelations,
  saveNormalizedMeasurements,
  loadPlanarPolygonGroups,
  saveDistanceRelations,
  savePlanarPolygonGroups,
} from "../utils/measurementPersistence";
import {
  getNextPointLabelMetricMode,
  runPointLabelClickInteraction,
} from "../utils/pointLabelInteractions";
import { getCustomPointMeasurementName } from "../utils/measurementNaming";
import {
  buildEdgeRelationIdsForPolygon,
  computePolygonGroupDerivedData,
  computePolylinePlanarAngleSumDeg,
  createPlaneFromThreePoints,
  distancePointToPlane,
  fromSerializableCartesian3,
  projectPointOntoPlane,
} from "../utils/planarPolygon";
import {
  applyDeltaToSelectedPoints,
  computeMoveDelta,
  getSelectedPointIds,
  hasReferencePointInSelection,
  shouldMoveSelectionAsGroup,
} from "../utils/selectionGroupMove";

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
  verticalOffsetEditMode?: "point" | "polyline" | null;
  verticalOffsetPlanarGroupId?: string | null;
};

const getLocalUpDirectionAtAnchor = (anchorECEF: Cartesian3): Cartesian3 =>
  Cartesian3.normalize(anchorECEF, new Cartesian3());

const projectPointToHorizontalPlaneAtAnchor = (
  pointECEF: Cartesian3,
  anchorECEF: Cartesian3
): Cartesian3 => {
  const localUp = getLocalUpDirectionAtAnchor(anchorECEF);
  const delta = Cartesian3.subtract(pointECEF, anchorECEF, new Cartesian3());
  const distanceAlongUp = Cartesian3.dot(delta, localUp);
  return Cartesian3.subtract(
    pointECEF,
    Cartesian3.multiplyByScalar(localUp, distanceAlongUp, new Cartesian3()),
    new Cartesian3()
  );
};

const toAlphabeticSequence = (zeroBasedIndex: number): string => {
  if (!Number.isFinite(zeroBasedIndex) || zeroBasedIndex < 0) return "A";
  let n = Math.floor(zeroBasedIndex);
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

const DIRECTION_EPSILON = 1e-12;
const VERTICAL_POLYGON_AXIS_ALIGNMENT_DOT_EPSILON = 0.999;
const VERTICAL_POLYGON_EN_MATCH_EPSILON_METERS = 0.05;
const VERTICAL_POLYGON_AXIS_ID_ENU_UP = "enu-up";
const VERTICAL_POLYGON_AXIS_ID_ENU_EAST = "enu-east";
const VERTICAL_POLYGON_AXIS_ID_ENU_NORTH = "enu-north";
const ROOF_POLYGON_AXIS_ID_NORMAL = "roof-normal";
const ROOF_POLYGON_AXIS_ID_IN_PLANE_PRIMARY = "roof-in-plane-primary";
const ROOF_POLYGON_AXIS_ID_IN_PLANE_SECONDARY = "roof-in-plane-secondary";

const normalizeDirection = (direction: Cartesian3): Cartesian3 | null => {
  if (Cartesian3.magnitudeSquared(direction) <= DIRECTION_EPSILON) {
    return null;
  }
  return Cartesian3.normalize(direction, new Cartesian3());
};

const getSignedAngleDegAroundAxis = (
  fromDirection: Cartesian3,
  toDirection: Cartesian3,
  axisDirection: Cartesian3
): number | null => {
  const normalizedAxis = normalizeDirection(axisDirection);
  if (!normalizedAxis) return null;

  const fromProjected = normalizeDirection(
    Cartesian3.subtract(
      fromDirection,
      Cartesian3.multiplyByScalar(
        normalizedAxis,
        Cartesian3.dot(fromDirection, normalizedAxis),
        new Cartesian3()
      ),
      new Cartesian3()
    )
  );
  const toProjected = normalizeDirection(
    Cartesian3.subtract(
      toDirection,
      Cartesian3.multiplyByScalar(
        normalizedAxis,
        Cartesian3.dot(toDirection, normalizedAxis),
        new Cartesian3()
      ),
      new Cartesian3()
    )
  );
  if (!fromProjected || !toProjected) {
    return null;
  }

  const sinComponent = Cartesian3.dot(
    Cartesian3.cross(fromProjected, toProjected, new Cartesian3()),
    normalizedAxis
  );
  const cosComponent = Math.max(
    -1,
    Math.min(1, Cartesian3.dot(fromProjected, toProjected))
  );
  return (Math.atan2(sinComponent, cosComponent) * 180) / Math.PI;
};

const getVerticalPolygonAxisRotationSuffix = (
  eastRotationDegVsEnuEast: number | null
): string => {
  if (eastRotationDegVsEnuEast === null) {
    return "";
  }
  const roundedRotationDeg = Math.round(eastRotationDegVsEnuEast * 10) / 10;
  const safeRoundedRotationDeg = Object.is(roundedRotationDeg, -0)
    ? 0
    : roundedRotationDeg;
  const signedRotation =
    safeRoundedRotationDeg > 0
      ? `+${safeRoundedRotationDeg}`
      : `${safeRoundedRotationDeg}`;
  return ` (rot. ${signedRotation}° ggü. ENU-E)`;
};

type VerticalPolygonLocalFrameVectors = {
  origin: Cartesian3;
  east: Cartesian3;
  north: Cartesian3;
  up: Cartesian3;
};

const resolveVerticalPolygonLocalFrameVectors = (
  group: PlanarPolygonGroup
): VerticalPolygonLocalFrameVectors | null => {
  const frame = group.planarPolygonLocalFrame;
  if (!frame) return null;

  const east = normalizeDirection(
    new Cartesian3(frame.eastECEF.x, frame.eastECEF.y, frame.eastECEF.z)
  );
  const north = normalizeDirection(
    new Cartesian3(frame.northECEF.x, frame.northECEF.y, frame.northECEF.z)
  );
  const up = normalizeDirection(
    new Cartesian3(frame.upECEF.x, frame.upECEF.y, frame.upECEF.z)
  );
  if (!east || !north || !up) {
    return null;
  }

  return {
    origin: new Cartesian3(
      frame.originECEF.x,
      frame.originECEF.y,
      frame.originECEF.z
    ),
    east,
    north,
    up,
  };
};

const getPositionInVerticalPolygonLocalFrame = (
  position: Cartesian3,
  frame: VerticalPolygonLocalFrameVectors
) => {
  const delta = Cartesian3.subtract(position, frame.origin, new Cartesian3());
  return {
    eastMeters: Cartesian3.dot(delta, frame.east),
    northMeters: Cartesian3.dot(delta, frame.north),
    upMeters: Cartesian3.dot(delta, frame.up),
  };
};

const getPositionFromVerticalPolygonLocalFrame = (
  frame: VerticalPolygonLocalFrameVectors,
  eastMeters: number,
  northMeters: number,
  upMeters: number
) =>
  Cartesian3.add(
    frame.origin,
    Cartesian3.add(
      Cartesian3.multiplyByScalar(frame.east, eastMeters, new Cartesian3()),
      Cartesian3.add(
        Cartesian3.multiplyByScalar(frame.north, northMeters, new Cartesian3()),
        Cartesian3.multiplyByScalar(frame.up, upMeters, new Cartesian3()),
        new Cartesian3()
      ),
      new Cartesian3()
    ),
    new Cartesian3()
  );

const getPositionWithVerticalOffsetFromAnchor = (
  anchorECEF: Cartesian3,
  verticalOffsetMeters: number
): Cartesian3 =>
  Cartesian3.add(
    anchorECEF,
    Cartesian3.multiplyByScalar(
      getLocalUpDirectionAtAnchor(anchorECEF),
      verticalOffsetMeters,
      new Cartesian3()
    ),
    new Cartesian3()
  );

const buildFacadeRectangleCornerFromDiagonal = (
  firstCorner: Cartesian3,
  oppositeCorner: Cartesian3
) => {
  const up = Cartesian3.normalize(firstCorner, new Cartesian3());
  const diagonal = Cartesian3.subtract(
    oppositeCorner,
    firstCorner,
    new Cartesian3()
  );
  const verticalMeters = Cartesian3.dot(diagonal, up);
  const verticalComponent = Cartesian3.multiplyByScalar(
    up,
    verticalMeters,
    new Cartesian3()
  );
  const horizontalComponent = Cartesian3.subtract(
    diagonal,
    verticalComponent,
    new Cartesian3()
  );
  const horizontalMeters = Cartesian3.magnitude(horizontalComponent);
  const verticalAbsoluteMeters = Math.abs(verticalMeters);

  if (
    horizontalMeters < FACADE_RECTANGLE_COMPONENT_EPSILON_METERS ||
    verticalAbsoluteMeters < FACADE_RECTANGLE_COMPONENT_EPSILON_METERS
  ) {
    return null;
  }

  const adjacentHorizontalCorner = Cartesian3.add(
    firstCorner,
    horizontalComponent,
    new Cartesian3()
  );
  const adjacentVerticalCorner = Cartesian3.add(
    firstCorner,
    verticalComponent,
    new Cartesian3()
  );

  const planeUpAnchor = Cartesian3.add(firstCorner, up, new Cartesian3());
  const verticalPlane = createPlaneFromThreePoints(
    firstCorner,
    planeUpAnchor,
    adjacentHorizontalCorner
  );

  const enforcedAdjacentHorizontalCorner = verticalPlane
    ? projectPointOntoPlane(adjacentHorizontalCorner, verticalPlane)
    : adjacentHorizontalCorner;
  const enforcedAdjacentVerticalCorner = verticalPlane
    ? projectPointOntoPlane(adjacentVerticalCorner, verticalPlane)
    : adjacentVerticalCorner;

  return {
    adjacentHorizontalCorner: enforcedAdjacentHorizontalCorner,
    adjacentVerticalCorner: enforcedAdjacentVerticalCorner,
  };
};

const getFacadeRectanglePreviewAreaSquareMeters = (
  firstCorner: Cartesian3,
  oppositeCorner: Cartesian3
) => {
  const facadeCorners = buildFacadeRectangleCornerFromDiagonal(
    firstCorner,
    oppositeCorner
  );
  if (!facadeCorners) return 0;

  const horizontalMeters = Cartesian3.distance(
    firstCorner,
    facadeCorners.adjacentHorizontalCorner
  );
  const verticalMeters = Cartesian3.distance(
    firstCorner,
    facadeCorners.adjacentVerticalCorner
  );
  return horizontalMeters * verticalMeters;
};

type FacadeAutoCorner = {
  id: string;
  position: Cartesian3;
};

type FacadeAutoCloseRectangle = {
  autoCorners: FacadeAutoCorner[];
  closedVertexPointIds: string[];
};

const buildFacadeAutoCloseRectangle = (
  pointById: Map<string, Cartesian3>,
  firstPointId: string | null,
  secondPointId: string | null
): FacadeAutoCloseRectangle | null => {
  if (!firstPointId || !secondPointId) return null;
  const firstPoint = pointById.get(firstPointId);
  const secondPoint = pointById.get(secondPointId);
  if (!firstPoint || !secondPoint) return null;

  const facadeCorners = buildFacadeRectangleCornerFromDiagonal(
    firstPoint,
    secondPoint
  );
  if (!facadeCorners) return null;

  const uniqueSeed = `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const cornerHorizontalId = `point-facade-${uniqueSeed}-h`;
  const cornerVerticalId = `point-facade-${uniqueSeed}-v`;

  return {
    autoCorners: [
      {
        id: cornerHorizontalId,
        position: facadeCorners.adjacentHorizontalCorner,
      },
      {
        id: cornerVerticalId,
        position: facadeCorners.adjacentVerticalCorner,
      },
    ],
    closedVertexPointIds: [
      firstPointId,
      cornerHorizontalId,
      secondPointId,
      cornerVerticalId,
    ],
  };
};

export interface CesiumMeasurementsContextType {
  measurementMode: MeasurementMode;
  setMeasurementMode: Dispatch<SetStateAction<MeasurementMode>>;
  measurements: MeasurementCollection;
  setMeasurements: Dispatch<SetStateAction<MeasurementCollection>>;
  selectedMeasurementId: string | null;
  selectedMeasurementIds: string[];
  selectMeasurementIds: (ids: string[], additive?: boolean) => void;
  selectionModeActive: boolean;
  setSelectionModeActive: Dispatch<SetStateAction<boolean>>;
  selectModeAdditive: boolean;
  setSelectModeAdditive: Dispatch<SetStateAction<boolean>>;
  selectModeRectangle: boolean;
  setSelectModeRectangle: Dispatch<SetStateAction<boolean>>;
  selectMeasurementById: (id: string | null) => void;
  updateMeasurementNameById: (id: string, name: string) => void;
  toggleMeasurementLockById: (id: string) => void;
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  selectPlanarPolygonGroupById: (id: string | null) => void;
  updatePlanarPolygonNameById: (id: string, name: string) => void;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  lockedEditMeasurementId: string | null;
  clearLockedEditMeasurementId: () => void;
  startMoveGizmoForMeasurementId: (
    id: string,
    options?: MoveGizmoStartOptions
  ) => void;
  stopMoveGizmo: () => void;
  setPointMeasurementElevationById: (
    id: string,
    elevationMeters: number
  ) => void;
  setPointMeasurementCoordinatesById: (
    id: string,
    latitude: number,
    longitude: number,
    elevationMeters?: number
  ) => void;
  // utility functions
  clearAllMeasurements: () => void;
  clearMeasurementsByIds: (ids: string[]) => void;
  deleteSelectedPointMeasurements: () => void;
  clearMeasurementsByType: (type: MeasurementMode) => void;
  // visibility options
  showLabels: boolean;
  setShowLabels: Dispatch<SetStateAction<boolean>>;
  hideMeasurementsOfType: Set<MeasurementMode>;
  setHideMeasurementsOfType: Dispatch<SetStateAction<Set<MeasurementMode>>>;
  hideLabelsOfType: Set<MeasurementMode>;
  setHideLabelsOfType: Dispatch<SetStateAction<Set<MeasurementMode>>>;
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
  polylineSegmentLineMode: PolylineSegmentLineMode;
  setPolylineSegmentLineMode: Dispatch<SetStateAction<PolylineSegmentLineMode>>;
  planarMeasurementCreationMode: "polyline" | "polygon";
  setPlanarMeasurementCreationMode: Dispatch<
    SetStateAction<"polyline" | "polygon">
  >;
  polygonSurfaceTypePreset: SurfaceType;
  setPolygonSurfaceTypePreset: Dispatch<SetStateAction<SurfaceType>>;
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
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>;
  referenceElevation: number; // derived from referencePoint
  geometryNodeTable: Record<string, MeasurementGeometryPoint>;
  distanceRelations: PointDistanceRelation[];
  setDistanceRelations: Dispatch<SetStateAction<PointDistanceRelation[]>>;
  planarPolygonGroups: PlanarPolygonGroup[];
  setPlanarPolygonGroups: Dispatch<SetStateAction<PlanarPolygonGroup[]>>;
  polylines: PolylineCollection[];
  setPolylines: Dispatch<SetStateAction<PolylineCollection[]>>;
  showSelectedReferenceLine: boolean;
  setShowSelectedReferenceLine: Dispatch<SetStateAction<boolean>>;
  showSelectedReferenceLineComponents: boolean;
  setShowSelectedReferenceLineComponents: Dispatch<SetStateAction<boolean>>;
  occlusionChecksEnabled: boolean;
  setOcclusionChecksEnabled: Dispatch<SetStateAction<boolean>>;
  setPointLabelMetricModeById: (id: string, mode: PointLabelMetricMode) => void;
  pointLabelOnCreate: boolean;
  setPointLabelOnCreate: Dispatch<SetStateAction<boolean>>;
  pointMarkerBadgeByPointId: Readonly<Record<string, PointMarkerBadge>>;
  pendingPolylinePromotionRingClosurePointId: string | null;
  confirmPolylineRingPromotion: (surfaceType: SurfaceType) => void;
  cancelPolylineRingPromotion: () => void;
}

const CesiumMeasurementsContext = createContext<
  CesiumMeasurementsContextType | undefined
>(undefined);

export type MeasurementProviderOptions = {
  temporary?: boolean;
  pointQueries?: {
    enabled?: boolean;
    radius?: number;
    verticalOffsetMeters?: number;
  };
  traverse?: {
    heightOffset?: number;
  };
  cartographicCRS?: "string";
  mode?: MeasurementMode;
  persistenceKey?: string;
  persistenceEnabled?: boolean;
  labels?: CesiumLabelLayoutConfigOverrides;
  moveGizmo?: {
    markerSizeScale?: number;
    labelDistanceScale?: number;
    snapPlaneDragToGround?: boolean;
    showRotationHandle?: boolean;
  };
};

const defaultOptions: MeasurementProviderOptions = {
  temporary: false,
  mode: MeasurementMode.PointMeasure,
  persistenceEnabled: true,
};

const defaultPointQueryOptions: MeasurementProviderOptions["pointQueries"] = {
  enabled: true,
  radius: 1,
  verticalOffsetMeters: 0,
};

const defaultTraverseOptions: MeasurementProviderOptions["traverse"] = {
  heightOffset: 1.5,
};
const defaultMoveGizmoOptions: NonNullable<
  MeasurementProviderOptions["moveGizmo"]
> = {
  markerSizeScale: 1,
  labelDistanceScale: 1,
  snapPlaneDragToGround: false,
  showRotationHandle: true,
};
const POINT_LABEL_LONG_PRESS_DURATION_MS = 300;
const REFERENCE_POINT_SYNC_EPSILON_METERS = 0.001;
const DISTANCE_RELATION_RESTORE_DELAY_MS = 250;
const PLANAR_POLYGON_RESTORE_DELAY_MS = 250;
const PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS = 0.2;
const PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG = 150;
const FACADE_RECTANGLE_COMPONENT_EPSILON_METERS = 0.05;
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

const getNextPolylinePointLabelMode = (
  currentMode: PolylinePointLabelMode
): PolylinePointLabelMode => {
  if (currentMode === "cumulativeDistance") return "elevationSinceStart";
  if (currentMode === "elevationSinceStart") return "elevationSinceLastNode";
  return "cumulativeDistance";
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

const getPointById = (measurements: MeasurementCollection, id: string) =>
  measurements.find(
    (measurement) =>
      isPointMeasurementEntry(measurement) && measurement.id === id
  );

const normalizeLabelAnchorCompactContent = (
  compactContent?: string
): string | undefined => {
  if (!compactContent) return undefined;
  const normalized = compactContent.trim();
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeMeasurementLabelAnchor = (
  labelAnchor?: MeasurementLabelAnchor
): MeasurementLabelAnchor | undefined => {
  if (!labelAnchor) return undefined;
  const anchorPointId = labelAnchor.anchorPointId?.trim();
  if (!anchorPointId) return undefined;
  return {
    anchorPointId,
    collapseToCompact: Boolean(labelAnchor.collapseToCompact),
    compactContent: normalizeLabelAnchorCompactContent(
      labelAnchor.compactContent
    ),
  };
};

const areMeasurementLabelAnchorsEqual = (
  left?: MeasurementLabelAnchor,
  right?: MeasurementLabelAnchor
): boolean => {
  const normalizedLeft = normalizeMeasurementLabelAnchor(left);
  const normalizedRight = normalizeMeasurementLabelAnchor(right);
  if (!normalizedLeft && !normalizedRight) return true;
  if (!normalizedLeft || !normalizedRight) return false;
  return (
    normalizedLeft.anchorPointId === normalizedRight.anchorPointId &&
    normalizedLeft.collapseToCompact === normalizedRight.collapseToCompact &&
    normalizedLeft.compactContent === normalizedRight.compactContent
  );
};

const getPointPositionMap = (
  measurements: MeasurementCollection,
  overrides?: Record<string, Cartesian3>
) => {
  const map = new Map<string, Cartesian3>();
  measurements.forEach((measurement) => {
    if (!isPointMeasurementEntry(measurement)) return;
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
  measurements: MeasurementCollection,
  useOffsetAnchors: boolean
) => {
  const map = new Map<string, Cartesian3>();
  measurements.forEach((measurement) => {
    if (!isPointMeasurementEntry(measurement)) return;
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

const buildGeometryPointTable = (
  measurements: MeasurementCollection
): MeasurementGeometryPoint[] =>
  measurements.filter(isPointMeasurementEntry).map((measurement) => ({
    id: measurement.id,
    longitude: measurement.geometryWGS84.longitude,
    latitude: measurement.geometryWGS84.latitude,
    height: measurement.geometryWGS84.height,
    geometryECEF: {
      x: measurement.geometryECEF.x,
      y: measurement.geometryECEF.y,
      z: measurement.geometryECEF.z,
    },
    hidden: measurement.hidden,
    locked: measurement.locked,
    pointLabelMode: measurement.pointLabelMode,
    auxiliaryLabelAnchor: measurement.auxiliaryLabelAnchor,
    verticalOffsetAnchorECEF: measurement.verticalOffsetAnchorECEF,
    labelAnchor: normalizeMeasurementLabelAnchor(measurement.labelAnchor),
  }));

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
): MeasurementGeometryEdge[] => {
  const byEdgeId = new Map<string, MeasurementGeometryEdge>();

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
  group: Pick<PlanarPolygonGroup, "measurementKind" | "closed">
): PlanarMeasurementKind =>
  group.measurementKind ?? (group.closed ? "area" : "polyline");

const buildDerivedPolylineCollection = (
  group: PlanarPolygonGroup,
  pointById: Map<string, Cartesian3>,
  verticalOffsetMeters: number = 0
): PolylineCollection | null => {
  if (
    group.closed ||
    getPlanarGroupMeasurementKind(group) !== "polyline" ||
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

interface CesiumMeasurementsProviderProps {
  children: React.ReactNode;
  options?: MeasurementProviderOptions;
}

const deleteFromHideMeasurementsOfType =
  (type: MeasurementMode) => (prev: Set<MeasurementMode>) => {
    // prevent rerenders on non-changes
    if (!prev.has(type)) return prev;
    const newSet = new Set(prev);
    newSet.delete(type);
    return newSet;
  };

const isKeyboardTargetEditable = (target: EventTarget | null): boolean => {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(target.closest("[contenteditable='true']"));
};

export const CesiumMeasurementsProvider: React.FC<
  CesiumMeasurementsProviderProps
> = ({ children, options }) => {
  const { getScene } = useCesiumContext();
  const scene = getScene();
  const mapMeasurements = useMapMeasurementsContext();
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

  const traverseOptions = normalizeOptions(
    options?.traverse,
    defaultTraverseOptions
  );
  const moveGizmoOptions = normalizeOptions(
    options?.moveGizmo,
    defaultMoveGizmoOptions
  );

  const normalizedOptions = normalizeOptions(options, defaultOptions);
  const {
    mode: initialMeasurementMode,
    temporary: initialTemporary,
    persistenceKey,
    persistenceEnabled,
  } = normalizedOptions;

  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(
    initialMeasurementMode ?? MeasurementMode.PointMeasure
  );
  const previousMeasurementModeRef = useRef<MeasurementMode>(measurementMode);
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
    useState<PolylineSegmentLineMode>("components");
  const [planarMeasurementCreationMode, setPlanarMeasurementCreationMode] =
    useState<"polyline" | "polygon">("polyline");
  const [polygonSurfaceTypePreset, setPolygonSurfaceTypePreset] =
    useState<SurfaceType>("facade");
  const [distanceModeStickyToFirstPoint, setDistanceModeStickyToFirstPoint] =
    useState(false);
  const [distanceCreationLineVisibility, setDistanceCreationLineVisibility] =
    useState({
      direct: true,
      vertical: true,
      horizontal: true,
    });
  const [
    facadeRectanglePreviewOppositeByGroupId,
    setFacadeRectanglePreviewOppositeByGroupId,
  ] = useState<Record<string, Cartesian3>>({});
  const [livePreviewPointECEF, setLivePreviewPointECEF] =
    useState<Cartesian3 | null>(null);
  const [livePreviewSurfaceNormalECEF, setLivePreviewSurfaceNormalECEF] =
    useState<Cartesian3 | null>(null);
  const [heightOffset, setHeightOffset] = useState(
    traverseOptions.heightOffset ?? 1.5
  );
  const [temporaryMode, setTemporaryMode] = useState<boolean>(
    initialTemporary ?? false
  );
  const [pointLabelOnCreate, setPointLabelOnCreate] = useState(false);
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<
    string | null
  >(null);
  const [selectedMeasurementIds, setSelectedMeasurementIds] = useState<
    string[]
  >([]);
  const [selectionModeActive, setSelectionModeActive] =
    useState<boolean>(false);
  const [selectModeAdditive, setSelectModeAdditive] = useState<boolean>(false);
  const [selectModeShiftHeld, setSelectModeShiftHeld] =
    useState<boolean>(false);
  const [selectModeRectangle, setSelectModeRectangle] =
    useState<boolean>(false);
  const effectiveSelectModeAdditive =
    selectModeAdditive || (selectionModeActive && selectModeShiftHeld);

  useEffect(() => {
    if (!selectionModeActive) {
      setSelectModeShiftHeld(false);
      return;
    }

    const handleShiftKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      setSelectModeShiftHeld((previous) => (previous ? previous : true));
    };

    const handleShiftKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      setSelectModeShiftHeld((previous) => (previous ? false : previous));
    };

    const handleWindowBlur = () => {
      setSelectModeShiftHeld(false);
    };

    window.addEventListener("keydown", handleShiftKeyDown, true);
    window.addEventListener("keyup", handleShiftKeyUp, true);
    window.addEventListener("blur", handleWindowBlur, true);

    return () => {
      window.removeEventListener("keydown", handleShiftKeyDown, true);
      window.removeEventListener("keyup", handleShiftKeyUp, true);
      window.removeEventListener("blur", handleWindowBlur, true);
    };
  }, [selectionModeActive]);

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
    useState<"point" | "polyline" | null>(null);
  const [
    moveGizmoVerticalOffsetPlanarGroupId,
    setMoveGizmoVerticalOffsetPlanarGroupId,
  ] = useState<string | null>(null);
  const [isMoveGizmoDragging, setIsMoveGizmoDragging] =
    useState<boolean>(false);
  const [lockedEditMeasurementId, setLockedEditMeasurementId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (moveGizmoPointId) return;
    setMoveGizmoPreferredAxisId(null);
    setMoveGizmoVerticalOffsetEditMode(null);
    setMoveGizmoVerticalOffsetPlanarGroupId(null);
  }, [moveGizmoPointId]);

  const isSceneReady = Boolean(scene && !scene.isDestroyed());

  useMeasurementPersistence(measurements, setMeasurements, {
    storageKey: persistenceKey,
    enabled: persistenceEnabled,
    ready: isSceneReady,
  });

  const [referencePoint, setReferencePoint] = useState<Cartesian3 | null>(null);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [occlusionChecksEnabled, setOcclusionChecksEnabled] =
    useState<boolean>(true);
  const [hideMeasurementsOfType, setHideMeasurementsOfType] = useState<
    Set<MeasurementMode>
  >(new Set());
  const [hideLabelsOfType, setHideLabelsOfType] = useState<
    Set<MeasurementMode>
  >(new Set());
  const [distanceRelations, setDistanceRelations] = useState<
    PointDistanceRelation[]
  >([]);
  const [planarPolygonGroups, setPlanarPolygonGroups] = useState<
    PlanarPolygonGroup[]
  >([]);
  const [polylines, setPolylines] = useState<PolylineCollection[]>([]);
  const [activePlanarPolygonGroupId, setActivePlanarPolygonGroupId] = useState<
    string | null
  >(null);
  const [selectedPlanarPolygonGroupId, setSelectedPlanarPolygonGroupId] =
    useState<string | null>(null);
  const [polylinePointLabelMode, setPolylinePointLabelMode] =
    useState<PolylinePointLabelMode>(DEFAULT_POLYLINE_POINT_LABEL_MODE);
  const [previousSelectedMeasurementId, setPreviousSelectedMeasurementId] =
    useState<string | null>(null);
  const [doubleClickChainSourcePointId, setDoubleClickChainSourcePointId] =
    useState<string | null>(null);
  const [
    pendingPolylinePromotionRingClosurePointId,
    setPendingPolylinePromotionRingClosurePointId,
  ] = useState<string | null>(null);

  const geometryPointsTable = useMemo(
    () => buildGeometryPointTable(measurements),
    [measurements]
  );
  const geometryNodeTable = useMemo(
    () =>
      geometryPointsTable.reduce<Record<string, MeasurementGeometryPoint>>(
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

  const hasRestoredNormalizedStateRef = useRef(false);
  const lastSavedNormalizedStateRef = useRef<string | null>(null);
  const hasRestoredDistanceRelationsRef = useRef(false);
  const lastSavedDistanceRelationsRef = useRef<string | null>(null);
  const hasRestoredPlanarPolygonsRef = useRef(false);
  const lastSavedPlanarPolygonsRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !persistenceEnabled ||
      !isSceneReady ||
      hasRestoredNormalizedStateRef.current
    ) {
      return;
    }

    const savedNormalized = loadNormalizedMeasurements(persistenceKey);
    if (savedNormalized) {
      setTimeout(() => {
        setMeasurements(savedNormalized.tables.measurements);
        setDistanceRelations(
          savedNormalized.tables.distanceRelations.map(
            withDistanceRelationEdgeId
          )
        );
        setPlanarPolygonGroups(savedNormalized.tables.planarPolygonGroups);
      }, DISTANCE_RELATION_RESTORE_DELAY_MS);
      hasRestoredDistanceRelationsRef.current = true;
      hasRestoredPlanarPolygonsRef.current = true;
    }

    hasRestoredNormalizedStateRef.current = true;
  }, [isSceneReady, persistenceEnabled, persistenceKey]);

  useEffect(() => {
    if (
      !persistenceEnabled ||
      !isSceneReady ||
      hasRestoredDistanceRelationsRef.current
    ) {
      return;
    }

    const savedRelations = loadDistanceRelations(persistenceKey);
    setTimeout(() => {
      if (savedRelations && savedRelations.length > 0) {
        setDistanceRelations(savedRelations.map(withDistanceRelationEdgeId));
      }
    }, DISTANCE_RELATION_RESTORE_DELAY_MS);

    hasRestoredDistanceRelationsRef.current = true;
  }, [isSceneReady, persistenceEnabled, persistenceKey]);

  useEffect(() => {
    if (!persistenceEnabled || !hasRestoredDistanceRelationsRef.current) {
      return;
    }

    const serialized = JSON.stringify(distanceRelations);
    if (serialized === lastSavedDistanceRelationsRef.current) {
      return;
    }

    saveDistanceRelations(persistenceKey, distanceRelations);
    lastSavedDistanceRelationsRef.current = serialized;
  }, [distanceRelations, persistenceEnabled, persistenceKey]);

  useEffect(() => {
    if (
      !persistenceEnabled ||
      !isSceneReady ||
      hasRestoredPlanarPolygonsRef.current
    ) {
      return;
    }

    const savedGroups = loadPlanarPolygonGroups(persistenceKey);
    if (savedGroups && savedGroups.length > 0) {
      setTimeout(() => {
        setPlanarPolygonGroups(savedGroups);
      }, PLANAR_POLYGON_RESTORE_DELAY_MS);
    }

    hasRestoredPlanarPolygonsRef.current = true;
  }, [isSceneReady, persistenceEnabled, persistenceKey]);

  useEffect(() => {
    if (!persistenceEnabled || !hasRestoredPlanarPolygonsRef.current) {
      return;
    }

    const serialized = JSON.stringify(planarPolygonGroups);
    if (serialized === lastSavedPlanarPolygonsRef.current) {
      return;
    }

    savePlanarPolygonGroups(persistenceKey, planarPolygonGroups);
    lastSavedPlanarPolygonsRef.current = serialized;
  }, [planarPolygonGroups, persistenceEnabled, persistenceKey]);

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
            ? "direct"
            : defaultPolylineSegmentLineMode,
        };
      });
      return hasChanges ? nextGroups : prev;
    });
  }, [defaultPolylineSegmentLineMode]);

  useEffect(() => {
    if (!persistenceEnabled || !hasRestoredNormalizedStateRef.current) {
      return;
    }

    const normalizedEnvelope: MeasurementPersistenceEnvelopeV2 = {
      version: 2,
      geometry: {
        points: geometryPointsTable,
        edges: geometryEdgesTable,
      },
      tables: {
        measurements,
        distanceRelations: distanceRelations.map(withDistanceRelationEdgeId),
        planarPolygonGroups,
        planarPolygonGroupVertices: planarPolygonGroupVerticesTable,
      },
    };

    const serialized = JSON.stringify(normalizedEnvelope);
    if (serialized === lastSavedNormalizedStateRef.current) {
      return;
    }

    saveNormalizedMeasurements(persistenceKey, normalizedEnvelope);
    lastSavedNormalizedStateRef.current = serialized;
  }, [
    distanceRelations,
    geometryEdgesTable,
    geometryPointsTable,
    measurements,
    persistenceEnabled,
    persistenceKey,
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
      measurements,
      polylineVerticalOffsetVisualOnly
    );
    return planarPolygonGroups
      .map((group) =>
        buildDerivedPolylineCollection(
          group,
          pointById,
          group.verticalOffsetMeters ?? defaultPolylineVerticalOffsetMeters
        )
      )
      .filter((collection): collection is PolylineCollection =>
        Boolean(collection)
      );
  }, [
    defaultPolylineVerticalOffsetMeters,
    measurements,
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

      setMeasurements((prev) =>
        prev.map((measurement) => {
          if (
            !isPointMeasurementEntry(measurement) ||
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
              height: nextWGS84.altitude ?? 0,
            },
          };
        })
      );
    },
    [
      focusedPlanarPolygonGroupId,
      planarPolygonGroups,
      polylineVerticalOffsetMeters,
      setMeasurements,
    ]
  );

  const previewIsPolylineCreateMode =
    measurementMode === MeasurementMode.PolylineMeasure &&
    planarMeasurementCreationMode === "polyline";
  const previewActiveOpenPolygonGroup = useMemo(
    () =>
      activePlanarPolygonGroupId &&
      measurementMode === MeasurementMode.PolylineMeasure &&
      planarMeasurementCreationMode === "polygon"
        ? planarPolygonGroups.find(
            (group) => group.id === activePlanarPolygonGroupId && !group.closed
          ) ?? null
        : null,
    [
      activePlanarPolygonGroupId,
      measurementMode,
      planarMeasurementCreationMode,
      planarPolygonGroups,
    ]
  );
  const previewEffectivePolygonSurfaceType =
    previewActiveOpenPolygonGroup?.surfaceType ?? polygonSurfaceTypePreset;
  const previewIsFacadePolygonBeforeSecondNode =
    measurementMode === MeasurementMode.PolylineMeasure &&
    planarMeasurementCreationMode === "polygon" &&
    previewEffectivePolygonSurfaceType === "facade" &&
    (!previewActiveOpenPolygonGroup ||
      previewActiveOpenPolygonGroup.vertexPointIds.length <= 1);
  const previewIsGroundPlanPolygon =
    measurementMode === MeasurementMode.PolylineMeasure &&
    planarMeasurementCreationMode === "polygon" &&
    previewEffectivePolygonSurfaceType === "footprint";
  const previewIsRoofPolygon =
    measurementMode === MeasurementMode.PolylineMeasure &&
    planarMeasurementCreationMode === "polygon" &&
    previewEffectivePolygonSurfaceType === "roof";
  const activePreviewVerticalOffsetMeters =
    measurementMode === MeasurementMode.PointMeasure && !pointLabelOnCreate
      ? pointVerticalOffsetMeters
      : previewIsPolylineCreateMode
      ? polylineVerticalOffsetMeters
      : 0;
  const hasActivePreviewNode =
    measurementMode === MeasurementMode.PointMeasure ||
    measurementMode === MeasurementMode.PointQuery ||
    previewIsPolylineCreateMode ||
    previewIsGroundPlanPolygon ||
    previewIsRoofPolygon ||
    previewIsFacadePolygonBeforeSecondNode;
  const activePreviewSupportsDistanceLine =
    measurementMode === MeasurementMode.PointQuery ||
    previewIsPolylineCreateMode ||
    previewIsGroundPlanPolygon ||
    previewIsRoofPolygon;
  const activePreviewUsesPolylineDistanceRules =
    previewIsPolylineCreateMode ||
    previewIsGroundPlanPolygon ||
    previewIsRoofPolygon;
  const activePreviewForceDirectDistanceLine =
    previewIsGroundPlanPolygon || previewIsRoofPolygon;

  const handlePointQueryPointerMove = useCallback(
    (
      positionECEF: Cartesian3 | null,
      _screenPosition?: Cartesian2,
      surfaceNormalECEF?: Cartesian3 | null
    ) => {
      if (hasActivePreviewNode) {
        const previewPosition = positionECEF
          ? Math.abs(activePreviewVerticalOffsetMeters) > 1e-9
            ? getPositionWithVerticalOffsetFromAnchor(
                positionECEF,
                activePreviewVerticalOffsetMeters
              )
            : positionECEF
          : null;
        setLivePreviewPointECEF((prev) => {
          if (!previewPosition) {
            return prev ? null : prev;
          }
          if (
            prev &&
            Cartesian3.distanceSquared(prev, previewPosition) <= 1e-6
          ) {
            return prev;
          }
          return Cartesian3.clone(previewPosition);
        });
        setLivePreviewSurfaceNormalECEF((prev) => {
          if (!previewPosition || !surfaceNormalECEF) {
            return prev ? null : prev;
          }

          const normalized = Cartesian3.normalize(
            surfaceNormalECEF,
            new Cartesian3()
          );
          if (prev && 1 - Math.abs(Cartesian3.dot(prev, normalized)) <= 1e-5) {
            return prev;
          }

          return normalized;
        });
        scene?.requestRender();
      } else {
        setLivePreviewPointECEF((prev) => (prev ? null : prev));
        setLivePreviewSurfaceNormalECEF((prev) => (prev ? null : prev));
      }

      if (!previewIsFacadePolygonBeforeSecondNode) return;
      if (!activePlanarPolygonGroupId) return;
      const activeOpenGroup = previewActiveOpenPolygonGroup;
      if (!activeOpenGroup) return;
      if (activeOpenGroup.vertexPointIds.length !== 1) return;

      const firstVertexId = activeOpenGroup.vertexPointIds[0] ?? null;
      if (!firstVertexId) return;
      const firstPoint = getPointById(measurements, firstVertexId);
      if (!firstPoint || !isPointMeasurementEntry(firstPoint)) return;

      const previewAreaSquareMeters = positionECEF
        ? getFacadeRectanglePreviewAreaSquareMeters(
            firstPoint.geometryECEF,
            positionECEF
          )
        : 0;

      setFacadeRectanglePreviewOppositeByGroupId((prev) => {
        const currentPreview = prev[activePlanarPolygonGroupId];
        if (!positionECEF || previewAreaSquareMeters <= 0) {
          if (!currentPreview) return prev;
          const next = { ...prev };
          delete next[activePlanarPolygonGroupId];
          return next;
        }
        if (
          currentPreview &&
          Cartesian3.distanceSquared(currentPreview, positionECEF) <= 1e-6
        ) {
          return prev;
        }
        return {
          ...prev,
          [activePlanarPolygonGroupId]: Cartesian3.clone(positionECEF),
        };
      });

      setPlanarPolygonGroups((prev) =>
        prev.map((group) => {
          if (group.id !== activePlanarPolygonGroupId || group.closed) {
            return group;
          }
          if ((group.surfaceType ?? "roof") !== "facade") {
            return group;
          }
          if (group.vertexPointIds.length !== 1) {
            return group;
          }
          if (
            Math.abs((group.areaSquareMeters ?? 0) - previewAreaSquareMeters) <=
            1e-9
          ) {
            return group;
          }
          return {
            ...group,
            areaSquareMeters: previewAreaSquareMeters,
          };
        })
      );

      scene?.requestRender();
    },
    [
      activePlanarPolygonGroupId,
      measurements,
      hasActivePreviewNode,
      activePreviewVerticalOffsetMeters,
      previewActiveOpenPolygonGroup,
      previewIsFacadePolygonBeforeSecondNode,
      scene,
    ]
  );

  const handlePointLabelHoverChange = useCallback(
    (pointId: string, hovered: boolean) => {
      if (!pointQueryEnabled || moveGizmoPointId || isMoveGizmoDragging) return;
      if (!hasActivePreviewNode) return;

      if (hovered) {
        const hoveredPoint = getPointById(measurements, pointId);
        if (!hoveredPoint || !isPointMeasurementEntry(hoveredPoint)) return;
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
      measurements,
      handlePointQueryPointerMove,
    ]
  );

  const isLivePointPreviewModeActive =
    hasActivePreviewNode &&
    pointQueryEnabled &&
    !moveGizmoPointId &&
    !isMoveGizmoDragging;

  useEffect(() => {
    if (isLivePointPreviewModeActive) return;
    hoveredLivePreviewPointIdRef.current = null;
    setLivePreviewPointECEF((prev) => (prev ? null : prev));
    setLivePreviewSurfaceNormalECEF((prev) => (prev ? null : prev));
  }, [isLivePointPreviewModeActive]);

  useEffect(() => {
    if (
      measurementMode === MeasurementMode.PolylineMeasure &&
      planarMeasurementCreationMode === "polygon"
    ) {
      return;
    }
    setFacadeRectanglePreviewOppositeByGroupId((prev) =>
      Object.keys(prev).length === 0 ? prev : {}
    );
  }, [measurementMode, planarMeasurementCreationMode]);

  useEffect(() => {
    setFacadeRectanglePreviewOppositeByGroupId((prev) => {
      const validPreviewGroupIdSet = new Set(
        planarPolygonGroups
          .filter(
            (group) =>
              !group.closed &&
              (group.surfaceType ?? "roof") === "facade" &&
              group.vertexPointIds.length === 1
          )
          .map((group) => group.id)
      );

      let next: Record<string, Cartesian3> | null = null;
      Object.keys(prev).forEach((groupId) => {
        if (validPreviewGroupIdSet.has(groupId)) return;
        if (!next) {
          next = { ...prev };
        }
        delete next[groupId];
      });

      return next ?? prev;
    });
  }, [planarPolygonGroups]);
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
    Dispatch<SetStateAction<PolylineSegmentLineMode>>
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

  const focusedPolylinePointLabelIndexByPointId = useMemo(() => {
    if (!focusedPolyline) return {};
    const byId: Record<string, number> = {};
    focusedPolyline.vertexPointIds.forEach((pointId, index) => {
      byId[pointId] = index;
    });
    return byId;
  }, [focusedPolyline]);

  const focusedPolylineDistanceToStartByPointId = useMemo(() => {
    if (!focusedPolyline) return {};
    const byId: Record<string, number> = {};
    focusedPolyline.vertexPointIds.forEach((pointId, index) => {
      byId[pointId] =
        focusedPolyline.segmentLengthsCumulativeMeters[index] ?? 0;
    });
    return byId;
  }, [focusedPolyline]);

  const focusedPolylineElevationSinceStartByPointId = useMemo(() => {
    if (!focusedPolyline) return {};
    const startHeight = focusedPolyline.vertexHeightsMeters[0] ?? 0;
    const byId: Record<string, number> = {};
    focusedPolyline.vertexPointIds.forEach((pointId, index) => {
      const pointHeight =
        focusedPolyline.vertexHeightsMeters[index] ?? startHeight;
      byId[pointId] = pointHeight - startHeight;
    });
    return byId;
  }, [focusedPolyline]);

  const focusedPolylineElevationSinceLastNodeByPointId = useMemo(() => {
    if (!focusedPolyline) return {};
    const byId: Record<string, number> = {};
    focusedPolyline.vertexPointIds.forEach((pointId, index) => {
      const pointHeight = focusedPolyline.vertexHeightsMeters[index] ?? 0;
      if (index === 0) {
        byId[pointId] = 0;
      } else {
        const prevPointHeight =
          focusedPolyline.vertexHeightsMeters[index - 1] ?? 0;
        byId[pointId] = pointHeight - prevPointHeight;
      }
    });
    return byId;
  }, [focusedPolyline]);

  const focusedPolylinePointLabelTextByPointId = useMemo(() => {
    if (!focusedPolyline) return {};
    const byId: Record<string, string> = {};
    const formatElevDelta = (prefix: string, delta: number): string => {
      const arrow = Math.abs(delta) < 0.03 ? "" : delta > 0 ? " ↥" : " ↧";
      return `${prefix} ${formatNumber(delta)}m${arrow}`;
    };
    focusedPolyline.vertexPointIds.forEach((pointId) => {
      if (polylinePointLabelMode === "cumulativeDistance") {
        const distance = focusedPolylineDistanceToStartByPointId[pointId] ?? 0;
        byId[pointId] = `${formatNumber(distance)}m`;
      } else if (polylinePointLabelMode === "elevationSinceStart") {
        const delta = focusedPolylineElevationSinceStartByPointId[pointId] ?? 0;
        byId[pointId] = formatElevDelta("Δ", delta);
      } else {
        const delta =
          focusedPolylineElevationSinceLastNodeByPointId[pointId] ?? 0;
        byId[pointId] = formatElevDelta("±", delta);
      }
    });
    return byId;
  }, [
    focusedPolyline,
    polylinePointLabelMode,
    focusedPolylineDistanceToStartByPointId,
    focusedPolylineElevationSinceStartByPointId,
    focusedPolylineElevationSinceLastNodeByPointId,
  ]);

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
    measurements.forEach((measurement) => {
      if (!isPointMeasurementEntry(measurement)) return;
      distances[measurement.id] = getEuclideanDistance(
        measurement.geometryECEF,
        referencePoint
      );
    });
    return distances;
  }, [measurements, referencePoint]);

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

  const unfocusedPolylineTotalLengthLabelTextByPointId = useMemo(() => {
    const byId: Record<string, string> = {};
    polylines.forEach((polyline) => {
      if (polyline.id === focusedPlanarPolygonGroupId) return;
      const lastPointId =
        polyline.vertexPointIds[polyline.vertexPointIds.length - 1] ?? null;
      if (!lastPointId) return;
      byId[lastPointId] = `${formatNumber(polyline.totalLengthMeters)}m`;
    });
    return byId;
  }, [polylines, focusedPlanarPolygonGroupId]);

  const effectivePolylinePointLabelTextByPointId = useMemo(
    () => ({
      ...unfocusedPolylineTotalLengthLabelTextByPointId,
      ...focusedPolylinePointLabelTextByPointId,
    }),
    [
      unfocusedPolylineTotalLengthLabelTextByPointId,
      focusedPolylinePointLabelTextByPointId,
    ]
  );

  const pointMarkerBadgeByPointId = useMemo<
    Readonly<Record<string, PointMarkerBadge>>
  >(() => {
    const badgesByPointId: Record<string, PointMarkerBadge> = {};
    const assignedPointIds = new Set<string>();
    const pointMeasurements = measurements.filter(isPointMeasurementEntry);
    const pointById = new Map(
      pointMeasurements.map(
        (measurement) => [measurement.id, measurement] as const
      )
    );

    const assignBadge = (
      pointId: string,
      badge: PointMarkerBadge,
      overwrite: boolean = false
    ) => {
      if (!pointId) return;
      if (!overwrite && assignedPointIds.has(pointId)) return;
      badgesByPointId[pointId] = badge;
      assignedPointIds.add(pointId);
    };

    const getGroupSortTuple = (group: PlanarPolygonGroup) => {
      let minIndex = Number.POSITIVE_INFINITY;
      let minTimestamp = Number.POSITIVE_INFINITY;
      group.vertexPointIds.forEach((pointId) => {
        const point = pointById.get(pointId);
        if (!point) return;
        minIndex = Math.min(minIndex, point.index ?? Number.POSITIVE_INFINITY);
        minTimestamp = Math.min(minTimestamp, point.timestamp);
      });

      return {
        minIndex,
        minTimestamp,
      };
    };

    const sortedGroups = [...planarPolygonGroups].sort((left, right) => {
      const leftKey = getGroupSortTuple(left);
      const rightKey = getGroupSortTuple(right);
      const indexDelta = leftKey.minIndex - rightKey.minIndex;
      if (indexDelta !== 0) return indexDelta;
      const timeDelta = leftKey.minTimestamp - rightKey.minTimestamp;
      if (timeDelta !== 0) return timeDelta;
      return left.id.localeCompare(right.id);
    });

    let polylineCounter = 1;
    let areaCounter = 1;
    let roofCounter = 1;
    let facadeCounter = 1;

    sortedGroups.forEach((group) => {
      const surfaceType = group.surfaceType ?? "roof";
      const measurementKind = getPlanarGroupMeasurementKind(group);
      const isArea = measurementKind === "area";
      const isFacade = isArea && surfaceType === "facade";
      const isRoof = isArea && surfaceType === "roof";
      const badge = isFacade
        ? {
            text: `F${facadeCounter++}`,
            backgroundColor: "rgba(88, 152, 255, 0.95)",
            textColor: "#ffffff",
          }
        : isRoof
        ? {
            text: `D${roofCounter++}`,
            backgroundColor: "rgba(111, 188, 123, 0.95)",
            textColor: "#ffffff",
          }
        : isArea
        ? {
            text: `A${areaCounter++}`,
            backgroundColor: "rgba(111, 188, 123, 0.95)",
            textColor: "#ffffff",
          }
        : {
            text: `L${polylineCounter++}`,
            backgroundColor: "rgba(226, 178, 60, 0.95)",
            textColor: "#111111",
          };

      group.vertexPointIds.forEach((pointId) => {
        assignBadge(pointId, badge, true);
      });
    });

    const standaloneDistanceRelations = [...distanceRelations]
      .filter((relation) => !relation.polygonGroupId)
      .sort((left, right) => left.id.localeCompare(right.id));

    const distanceNeighborsByPointId = new Map<string, Set<string>>();
    standaloneDistanceRelations.forEach((relation) => {
      const pointAId = relation.pointAId;
      const pointBId = relation.pointBId;
      if (!pointAId || !pointBId) return;
      if (!distanceNeighborsByPointId.has(pointAId)) {
        distanceNeighborsByPointId.set(pointAId, new Set());
      }
      if (!distanceNeighborsByPointId.has(pointBId)) {
        distanceNeighborsByPointId.set(pointBId, new Set());
      }
      distanceNeighborsByPointId.get(pointAId)?.add(pointBId);
      distanceNeighborsByPointId.get(pointBId)?.add(pointAId);
    });

    const visitedDistancePointIds = new Set<string>();
    let distanceComponentIndex = 0;
    const sortedDistancePointIds = Array.from(
      distanceNeighborsByPointId.keys()
    ).sort((left, right) => left.localeCompare(right));

    sortedDistancePointIds.forEach((startPointId) => {
      if (visitedDistancePointIds.has(startPointId)) return;
      const queue = [startPointId];
      const componentPointIds: string[] = [];
      visitedDistancePointIds.add(startPointId);

      while (queue.length > 0) {
        const currentPointId = queue.shift();
        if (!currentPointId) continue;
        componentPointIds.push(currentPointId);
        const neighbors = distanceNeighborsByPointId.get(currentPointId);
        neighbors?.forEach((neighborPointId) => {
          if (visitedDistancePointIds.has(neighborPointId)) return;
          visitedDistancePointIds.add(neighborPointId);
          queue.push(neighborPointId);
        });
      }

      const badge: PointMarkerBadge = {
        text: toAlphabeticSequence(distanceComponentIndex),
        backgroundColor: "rgba(102, 126, 234, 0.95)",
        textColor: "#ffffff",
      };
      distanceComponentIndex += 1;
      componentPointIds.forEach((pointId) => assignBadge(pointId, badge));
    });

    const standalonePoints = [...pointMeasurements]
      .filter(
        (measurement) =>
          !assignedPointIds.has(measurement.id) &&
          !measurement.isFacadeAutoCorner
      )
      .sort((left, right) => {
        const indexDelta = (left.index ?? 0) - (right.index ?? 0);
        if (indexDelta !== 0) return indexDelta;
        const timeDelta = left.timestamp - right.timestamp;
        if (timeDelta !== 0) return timeDelta;
        return left.id.localeCompare(right.id);
      });

    standalonePoints.forEach((point, pointIndex) => {
      assignBadge(point.id, {
        text: `${pointIndex + 1}`,
        backgroundColor: "rgba(200, 200, 200, 0.92)",
        textColor: "#111111",
      });
    });

    return badgesByPointId;
  }, [distanceRelations, measurements, planarPolygonGroups]);

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
    const highestPointIds = new Set<string>();
    const unfocusedNonHighestPointIds = new Set<string>();
    const focusedNonHighestPointIds = new Set<string>();
    const selectedPointIdSet = new Set<string>(selectedMeasurementIds);
    if (selectedMeasurementId) {
      selectedPointIdSet.add(selectedMeasurementId);
    }

    const standaloneDistanceRelations = distanceRelations.filter(
      (relation) => !relation.polygonGroupId
    );
    if (standaloneDistanceRelations.length === 0) {
      return {
        standaloneDistanceHighestPointIds: highestPointIds,
        unfocusedStandaloneDistanceNonHighestPointIds:
          unfocusedNonHighestPointIds,
        focusedStandaloneDistanceNonHighestPointIds: focusedNonHighestPointIds,
      };
    }

    const pointById = new Map(
      measurements
        .filter(isPointMeasurementEntry)
        .map((measurement) => [measurement.id, measurement] as const)
    );

    const neighborsByPointId = new Map<string, Set<string>>();
    standaloneDistanceRelations.forEach((relation) => {
      const pointAId = relation.pointAId;
      const pointBId = relation.pointBId;
      if (!pointAId || !pointBId) return;
      if (!neighborsByPointId.has(pointAId)) {
        neighborsByPointId.set(pointAId, new Set());
      }
      if (!neighborsByPointId.has(pointBId)) {
        neighborsByPointId.set(pointBId, new Set());
      }
      neighborsByPointId.get(pointAId)?.add(pointBId);
      neighborsByPointId.get(pointBId)?.add(pointAId);
    });

    const getHighestPointId = (pointIds: string[]): string | null => {
      let highestId: string | null = null;
      let fallbackId: string | null = null;
      let highestHeight = -Infinity;
      for (const id of pointIds) {
        const point = pointById.get(id);
        if (!point) continue;
        if (!fallbackId) {
          fallbackId = id;
        }
        const height = point.geometryWGS84.height;
        if (Number.isFinite(height) && height > highestHeight) {
          highestHeight = height;
          highestId = id;
        }
      }
      return highestId ?? fallbackId;
    };

    const visitedPointIds = new Set<string>();
    const sortedStartPointIds = Array.from(neighborsByPointId.keys()).sort(
      (left, right) => left.localeCompare(right)
    );

    sortedStartPointIds.forEach((startPointId) => {
      if (visitedPointIds.has(startPointId)) return;

      const queue = [startPointId];
      const componentPointIds: string[] = [];
      visitedPointIds.add(startPointId);

      while (queue.length > 0) {
        const currentPointId = queue.shift();
        if (!currentPointId) continue;
        componentPointIds.push(currentPointId);
        neighborsByPointId.get(currentPointId)?.forEach((neighborPointId) => {
          if (visitedPointIds.has(neighborPointId)) return;
          visitedPointIds.add(neighborPointId);
          queue.push(neighborPointId);
        });
      }

      if (componentPointIds.length === 0) return;
      const isSelectedComponent = componentPointIds.some((pointId) =>
        selectedPointIdSet.has(pointId)
      );

      const highestPointId = getHighestPointId(componentPointIds);
      if (!highestPointId) return;

      highestPointIds.add(highestPointId);

      const nonHighestIds = isSelectedComponent
        ? focusedNonHighestPointIds
        : unfocusedNonHighestPointIds;
      componentPointIds.forEach((pointId) => {
        if (pointId !== highestPointId) {
          nonHighestIds.add(pointId);
        }
      });
    });

    return {
      standaloneDistanceHighestPointIds: highestPointIds,
      unfocusedStandaloneDistanceNonHighestPointIds:
        unfocusedNonHighestPointIds,
      focusedStandaloneDistanceNonHighestPointIds: focusedNonHighestPointIds,
    };
  }, [
    distanceRelations,
    measurements,
    selectedMeasurementId,
    selectedMeasurementIds,
  ]);

  const desiredLabelAnchorByPointId = useMemo<
    Readonly<Record<string, MeasurementLabelAnchor | undefined>>
  >(() => {
    const byPointId: Record<string, MeasurementLabelAnchor | undefined> = {};
    const pointMeasurements = measurements.filter(isPointMeasurementEntry);
    pointMeasurements.forEach((measurement) => {
      if (measurement.distanceAdhocNode) {
        byPointId[measurement.id] = undefined;
        return;
      }
      byPointId[measurement.id] = {
        anchorPointId: measurement.id,
        collapseToCompact: false,
      };
    });

    const standaloneDistancePointIds = new Set<string>();
    standaloneDistanceHighestPointIds.forEach((pointId) => {
      standaloneDistancePointIds.add(pointId);
    });
    unfocusedStandaloneDistanceNonHighestPointIds.forEach((pointId) => {
      standaloneDistancePointIds.add(pointId);
    });
    focusedStandaloneDistanceNonHighestPointIds.forEach((pointId) => {
      standaloneDistancePointIds.add(pointId);
    });

    standaloneDistancePointIds.forEach((pointId) => {
      byPointId[pointId] = undefined;
    });
    standaloneDistanceHighestPointIds.forEach((pointId) => {
      const compactContent = normalizeLabelAnchorCompactContent(
        pointMarkerBadgeByPointId[pointId]?.text
      );
      byPointId[pointId] = {
        anchorPointId: pointId,
        collapseToCompact: true,
        ...(compactContent ? { compactContent } : {}),
      };
    });

    polylines.forEach((polyline) => {
      if (polyline.id === focusedPlanarPolygonGroupId) return;
      polyline.vertexPointIds.forEach((pointId) => {
        if (!pointId) return;
        byPointId[pointId] = undefined;
      });
      const lastPointId =
        polyline.vertexPointIds[polyline.vertexPointIds.length - 1] ?? null;
      if (!lastPointId) return;
      byPointId[lastPointId] = {
        anchorPointId: lastPointId,
        compactContent: `${formatNumber(polyline.totalLengthMeters)}m`,
        collapseToCompact: true,
      };
    });

    return byPointId;
  }, [
    measurements,
    polylines,
    focusedPlanarPolygonGroupId,
    pointMarkerBadgeByPointId,
    standaloneDistanceHighestPointIds,
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
  ]);

  useEffect(() => {
    setMeasurements((prev) => {
      let hasChanges = false;
      const nextMeasurements = prev.map((measurement) => {
        if (!isPointMeasurementEntry(measurement)) {
          return measurement;
        }

        const desiredLabelAnchor = normalizeMeasurementLabelAnchor(
          desiredLabelAnchorByPointId[measurement.id]
        );
        if (
          areMeasurementLabelAnchorsEqual(
            measurement.labelAnchor,
            desiredLabelAnchor
          )
        ) {
          return measurement;
        }

        hasChanges = true;
        return {
          ...measurement,
          labelAnchor: desiredLabelAnchor,
        };
      });
      return hasChanges ? nextMeasurements : prev;
    });
  }, [desiredLabelAnchorByPointId]);

  const collapsedPillPointIds = useMemo(() => {
    const ids = new Set<string>();
    measurements.forEach((measurement) => {
      if (!isPointMeasurementEntry(measurement)) return;
      const labelAnchor = normalizeMeasurementLabelAnchor(
        measurement.labelAnchor
      );
      if (!labelAnchor) return;
      if (labelAnchor.anchorPointId !== measurement.id) return;
      if (!labelAnchor.collapseToCompact) return;
      ids.add(measurement.id);
    });
    return ids;
  }, [measurements]);

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

  const selectedNonRoofClosedAreaVertexPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    if (selectedClosedAreaGroupIdSet.size === 0) {
      return ids;
    }
    planarPolygonGroups.forEach((group) => {
      if (!group.closed || !selectedClosedAreaGroupIdSet.has(group.id)) return;
      if ((group.surfaceType ?? "roof") === "roof") return;
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

  const labelAnchorPointIdsWithForcedVisibility = useMemo(() => {
    const ids = new Set<string>();
    measurements.forEach((measurement) => {
      if (!isPointMeasurementEntry(measurement)) return;
      const labelAnchor = normalizeMeasurementLabelAnchor(
        measurement.labelAnchor
      );
      if (!labelAnchor) return;
      if (unselectedClosedAreaVertexPointIdSet.has(labelAnchor.anchorPointId)) {
        return;
      }
      ids.add(labelAnchor.anchorPointId);
    });
    return ids;
  }, [measurements, unselectedClosedAreaVertexPointIdSet]);

  const pointDragPlaneByPointId = useMemo<
    Readonly<Record<string, PlanarPolygonPlane>>
  >(() => {
    const planeByPointId: Record<string, PlanarPolygonPlane> = {};
    planarPolygonGroups.forEach((group) => {
      if (!group.planeLocked || !group.plane) return;
      group.vertexPointIds.forEach((vertexPointId) => {
        if (!planeByPointId[vertexPointId]) {
          planeByPointId[vertexPointId] = group.plane as PlanarPolygonPlane;
        }
      });
    });
    return planeByPointId;
  }, [planarPolygonGroups]);

  const facadeVertexPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      if ((group.surfaceType ?? "roof") !== "facade") return;
      group.vertexPointIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups]);

  const roofVertexPointIdSet = useMemo(() => {
    const ids = new Set<string>();
    planarPolygonGroups.forEach((group) => {
      if ((group.surfaceType ?? "roof") !== "roof") return;
      group.vertexPointIds.forEach((pointId) => {
        if (pointId) {
          ids.add(pointId);
        }
      });
    });
    return ids;
  }, [planarPolygonGroups]);

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

  const pointDragPlaneByPointIdForMarkerDrag = useMemo<
    Readonly<Record<string, PlanarPolygonPlane>>
  >(() => {
    const planeByPointId: Record<string, PlanarPolygonPlane> = {
      ...pointDragPlaneByPointId,
    };
    facadeVertexPointIdSet.forEach((pointId) => {
      delete planeByPointId[pointId];
    });
    roofVertexPointIdSet.forEach((pointId) => {
      delete planeByPointId[pointId];
    });
    return planeByPointId;
  }, [pointDragPlaneByPointId, facadeVertexPointIdSet, roofVertexPointIdSet]);

  const showPoints = !hideMeasurementsOfType.has(MeasurementMode.PointQuery);
  const showDistanceAndPolygonVisuals = true;

  const selectedMeasurementIdRef = useRef<string | null>(selectedMeasurementId);
  useEffect(() => {
    selectedMeasurementIdRef.current = selectedMeasurementId;
  }, [selectedMeasurementId]);

  const pointMeasurementIds = useMemo(() => {
    const ids = new Set<string>();
    measurements.forEach((measurement) => {
      if (!isPointMeasurementEntry(measurement)) return;
      ids.add(measurement.id);
    });
    return ids;
  }, [measurements, planarPolygonGroups.length]);

  const showPointLabels =
    showPoints &&
    showLabels &&
    !hideLabelsOfType.has(MeasurementMode.PointQuery);
  const pointIdsWithoutLabelAnchor = useMemo(() => {
    const hiddenIds = new Set<string>();
    measurements.forEach((measurement) => {
      if (!isPointMeasurementEntry(measurement)) return;
      const labelAnchor = normalizeMeasurementLabelAnchor(
        measurement.labelAnchor
      );
      if (!labelAnchor || labelAnchor.anchorPointId !== measurement.id) {
        hiddenIds.add(measurement.id);
      }
    });
    return hiddenIds;
  }, [measurements]);

  const lockedMeasurementIdSet = useMemo(() => {
    const ids = new Set<string>();
    measurements.forEach((measurement) => {
      if (measurement.locked) {
        ids.add(measurement.id);
      }
    });
    return ids;
  }, [measurements]);

  const lastCustomLabelOnCreate = useMemo(() => {
    for (let index = measurements.length - 1; index >= 0; index -= 1) {
      const measurement = measurements[index];
      if (!measurement || !isPointMeasurementEntry(measurement)) continue;
      if (!measurement.auxiliaryLabelAnchor) continue;
      const customName = getCustomPointMeasurementName(measurement.name);
      if (customName) return customName;
    }
    return undefined;
  }, [measurements]);

  const selectMeasurementIds = useCallback(
    (ids: string[], additive: boolean = false) => {
      const validPointIds = ids.filter((id) => pointMeasurementIds.has(id));
      const uniqueIncomingIds = Array.from(new Set(validPointIds));

      setSelectedMeasurementIds((prev) => {
        const next = additive
          ? Array.from(new Set([...prev, ...uniqueIncomingIds]))
          : uniqueIncomingIds;
        const nextPrimaryId = next[next.length - 1] ?? null;
        const currentSelectedMeasurementId = selectedMeasurementIdRef.current;

        if (
          nextPrimaryId &&
          currentSelectedMeasurementId &&
          nextPrimaryId !== currentSelectedMeasurementId
        ) {
          setPreviousSelectedMeasurementId(currentSelectedMeasurementId);
        }
        selectedMeasurementIdRef.current = nextPrimaryId;
        setSelectedMeasurementId((prevSelectedId) =>
          prevSelectedId === nextPrimaryId ? prevSelectedId : nextPrimaryId
        );
        if (nextPrimaryId !== null) {
          setSelectedPlanarPolygonGroupId((prevSelectedGroupId) =>
            prevSelectedGroupId === null ? prevSelectedGroupId : null
          );
        }
        return next;
      });
    },
    [pointMeasurementIds]
  );

  const selectMeasurementById = useCallback((id: string | null) => {
    const currentSelectedMeasurementId = selectedMeasurementIdRef.current;
    if (
      id &&
      id !== currentSelectedMeasurementId &&
      currentSelectedMeasurementId
    ) {
      setPreviousSelectedMeasurementId(currentSelectedMeasurementId);
    }
    selectedMeasurementIdRef.current = id;
    setSelectedMeasurementId((prev) => (prev === id ? prev : id));
    setSelectedMeasurementIds((prev) => {
      if (id === null) {
        return prev.length === 0 ? prev : [];
      }
      if (prev.length === 1 && prev[0] === id) {
        return prev;
      }
      return [id];
    });
    if (id !== null) {
      setSelectedPlanarPolygonGroupId((prev) => (prev === null ? prev : null));
    }
  }, []);

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
    const pointMeasurement = measurements.find(
      (measurement) =>
        isPointMeasurementEntry(measurement) &&
        getEuclideanDistance(measurement.geometryECEF, referencePoint) <=
          REFERENCE_POINT_SYNC_EPSILON_METERS
    );
    return pointMeasurement && isPointMeasurementEntry(pointMeasurement)
      ? pointMeasurement.id
      : null;
  }, [measurements, referencePoint]);

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

  const livePreviewDistanceLine = useMemo(() => {
    if (!livePreviewPointECEF || !activePreviewAnchorPointId) {
      return null;
    }

    const sourcePoint = getPointById(measurements, activePreviewAnchorPointId);
    if (!sourcePoint || !isPointMeasurementEntry(sourcePoint)) {
      return null;
    }

    const showDirectLine = activePreviewForceDirectDistanceLine
      ? true
      : activePreviewUsesPolylineDistanceRules
      ? polylineSegmentLineMode === "direct"
      : distanceCreationLineVisibility.direct;
    const showComponentLines = activePreviewForceDirectDistanceLine
      ? false
      : activePreviewUsesPolylineDistanceRules
      ? polylineSegmentLineMode === "components"
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
    measurements,
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
        if (measurementMode === MeasurementMode.PolylineMeasure) {
          return true;
        }
        return false;
      }

      return true;
    },
    [
      measurementMode,
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
          (group.closed ? "direct" : defaultPolylineSegmentLineMode);
        const showDirectLine = segmentLineMode === "direct";
        const showComponentLines = segmentLineMode === "components";
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
      selectMeasurementById(newPointId);
    },
    [selectMeasurementById]
  );

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
      selectMeasurementById(sourcePointId ?? newPointId);
    },
    [
      distanceModeStickyToFirstPoint,
      referencePointMeasurementId,
      resolveDistanceRelationSourcePointId,
      selectMeasurementById,
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
      const pointByIdSnapshot = getPointPositionMap(measurements, {
        [newPointId]: newPointPositionECEF,
      });
      const seedMeasurementKindForCreation: PlanarMeasurementKind =
        planarMeasurementCreationMode === "polygon" ? "area" : "polyline";
      const seedSurfaceTypeForCreation: SurfaceType =
        planarMeasurementCreationMode === "polygon"
          ? polygonSurfaceTypePreset
          : "roof";
      const facadeAutoCloseFromNewPoint = (() => {
        if (planarMeasurementCreationMode !== "polygon") return null;

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

        const pointById = getPointPositionMap(measurements, {
          [newPointId]: newPointPositionECEF,
        });

        if (!activeGroup || activeGroup.closed) {
          const seedVertexPointIds =
            sourcePointId &&
            sourcePointId !== newPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, newPointId]
              : [newPointId];
          const seedSurfaceType: SurfaceType =
            planarMeasurementCreationMode === "polygon"
              ? polygonSurfaceTypePreset
              : "roof";
          const seedMeasurementKind: PlanarMeasurementKind =
            planarMeasurementCreationMode === "polygon" ? "area" : "polyline";
          const seedSegmentLineMode: PolylineSegmentLineMode =
            planarMeasurementCreationMode === "polygon" &&
            (seedSurfaceType === "facade" ||
              seedSurfaceType === "footprint" ||
              seedSurfaceType === "roof")
              ? "direct"
              : defaultPolylineSegmentLineMode;

          if (
            planarMeasurementCreationMode === "polygon" &&
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
              computePolygonGroupDerivedData(
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
          console.debug("[PlanarPolygon] Start new chain", {
            groupId: nextActiveGroupId,
            pointId: newPointId,
            seedVertexPointIds,
          });
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
          planarMeasurementCreationMode === "polygon" &&
          (activeGroup.surfaceType ?? "roof") === "footprint";
        const isRoofSurface =
          planarMeasurementCreationMode === "polygon" &&
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
              nextPlane = candidatePlane;
              nextPlaneLocked = true;
              nextPointPosition = projectPointOntoPlane(
                nextPointPosition,
                candidatePlane
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
              const planeDistance = distancePointToPlane(
                nextPointPosition,
                candidatePlane
              );
              const firstFourPoints = nextVertexPointIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                candidatePlane
              );

              console.debug("[PlanarPolygon] Promotion check", {
                groupId: activeGroup.id,
                pointId: newPointId,
                vertexCount: nextVertexPointIds.length,
                planeDistance,
                planarAngleSum,
                distanceThreshold: PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS,
                angleThreshold: PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG,
              });

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                console.debug("[PlanarPolygon] Promoted to plane-locked", {
                  groupId: activeGroup.id,
                  pointId: newPointId,
                  planeDistance,
                  planarAngleSum,
                });
                nextPlane = candidatePlane;
                nextPlaneLocked = true;
                nextPointPosition = projectPointOntoPlane(
                  nextPointPosition,
                  candidatePlane
                );
                projectedPointPosition = nextPointPosition;
                pointById.set(newPointId, nextPointPosition);
              } else {
                console.debug("[PlanarPolygon] Promotion skipped", {
                  groupId: activeGroup.id,
                  pointId: newPointId,
                  planeDistance,
                  planarAngleSum,
                });
              }
            }
          }
        }

        if (
          planarMeasurementCreationMode === "polygon" &&
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
        const updatedGroup = computePolygonGroupDerivedData(
          {
            ...activeGroup,
            measurementKind:
              activeGroup.measurementKind ??
              (planarMeasurementCreationMode === "polygon"
                ? "area"
                : "polyline"),
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
        setMeasurements((prev) =>
          prev.map((measurement) => {
            if (
              !isPointMeasurementEntry(measurement) ||
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
                height: geometryWGS84.altitude ?? 0,
              },
            };
          })
        );
      }

      if (createdFacadeAutoCorners && createdFacadeAutoCorners.length > 0) {
        setMeasurements((prev) => {
          const pointMeasurements = prev.filter(isPointMeasurementEntry);
          const maxPointIndex = pointMeasurements.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries = createdFacadeAutoCorners.map(
            ({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: MeasurementMode.PointQuery,
                id,
                index: maxPointIndex + index + 1,
                isFacadeAutoCorner: true,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  height: cornerWGS84.altitude ?? 0,
                },
                timestamp: Date.now() + index,
              };
            }
          );
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
      measurements,
      planarPolygonGroups,
      resolveDistanceRelationSourcePointId,
      selectMeasurementById,
      upsertDirectDistanceRelation,
      setMeasurements,
      defaultPolylineSegmentLineMode,
      polylineVerticalOffsetMeters,
      planarMeasurementCreationMode,
      polygonSurfaceTypePreset,
    ]
  );

  const pointCreatedHandlerByMode = useMemo<
    Partial<
      Record<MeasurementMode, (id: string, positionECEF: Cartesian3) => void>
    >
  >(
    () => ({
      [MeasurementMode.PointMeasure]: (id) =>
        handlePointMeasurePointCreated(id),
      [MeasurementMode.PointQuery]: (id, positionECEF) =>
        handleDistancePointCreated(id, positionECEF),
      [MeasurementMode.PolylineMeasure]: (id, positionECEF) =>
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
      pointCreatedHandlerByMode[measurementMode]?.(
        newPointId,
        newPointPositionECEF
      );
    },
    [measurementMode, pointCreatedHandlerByMode]
  );

  const closeActivePlanarPolygonGroup = useCallback(
    (surfaceTypeOverride?: SurfaceType) => {
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

        const pointById = getPointPositionMap(measurements);
        const closedGroup = computePolygonGroupDerivedData(
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
        console.debug("[PlanarPolygon] Closed group", {
          groupId: activeGroup.id,
          vertexCount: activeGroup.vertexPointIds.length,
          planeLocked: activeGroup.planeLocked,
        });
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
    [activePlanarPolygonGroupId, measurements]
  );

  const confirmPolylineRingPromotion = useCallback(
    (surfaceType: SurfaceType) => {
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
        const pointById = getPointPositionMap(measurements);
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

          return computePolygonGroupDerivedData(
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
    [activePlanarPolygonGroupId, measurements]
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
      measurementMode === MeasurementMode.PolylineMeasure &&
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
        if (planarMeasurementCreationMode === "polygon") {
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
    measurementMode,
    activePlanarPolygonGroupId,
    planarPolygonGroups,
    planarMeasurementCreationMode,
    closeActivePlanarPolygonGroup,
    finishActivePlanarPolylineGroup,
  ]);

  const appendExistingPointToActivePlanarPolygonGroup = useCallback(
    (existingPointId: string, sourcePointId?: string | null) => {
      const existingPoint = getPointById(measurements, existingPointId);
      if (!existingPoint || !isPointMeasurementEntry(existingPoint)) return;
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
      const pointByIdSnapshot = getPointPositionMap(measurements);
      const seedMeasurementKindForCreation: PlanarMeasurementKind =
        planarMeasurementCreationMode === "polygon" ? "area" : "polyline";
      const seedSurfaceTypeForCreation: SurfaceType =
        planarMeasurementCreationMode === "polygon"
          ? polygonSurfaceTypePreset
          : "roof";
      const facadeAutoCloseFromExistingPoint = (() => {
        if (planarMeasurementCreationMode !== "polygon") return null;

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
        const pointById = getPointPositionMap(measurements);

        if (!activeGroup || activeGroup.closed) {
          const seedVertexPointIds =
            sourcePointId &&
            sourcePointId !== existingPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, existingPointId]
              : [existingPointId];
          const seedSurfaceType: SurfaceType =
            planarMeasurementCreationMode === "polygon"
              ? polygonSurfaceTypePreset
              : "roof";
          const seedMeasurementKind: PlanarMeasurementKind =
            planarMeasurementCreationMode === "polygon" ? "area" : "polyline";
          const seedSegmentLineMode: PolylineSegmentLineMode =
            planarMeasurementCreationMode === "polygon" &&
            (seedSurfaceType === "facade" ||
              seedSurfaceType === "footprint" ||
              seedSurfaceType === "roof")
              ? "direct"
              : defaultPolylineSegmentLineMode;

          if (
            planarMeasurementCreationMode === "polygon" &&
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
              computePolygonGroupDerivedData(
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
          console.debug("[PlanarPolygon] Start new chain from existing point", {
            groupId: nextActiveGroupId,
            pointId: existingPointId,
            seedVertexPointIds,
          });
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
          planarMeasurementCreationMode === "polygon" &&
          (activeGroup.surfaceType ?? "roof") === "footprint";
        const isRoofSurface =
          planarMeasurementCreationMode === "polygon" &&
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
              nextPlane = candidatePlane;
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
              const planeDistance = distancePointToPlane(
                existingPointPosition,
                candidatePlane
              );
              const firstFourPoints = nextVertexPointIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                candidatePlane
              );

              console.debug(
                "[PlanarPolygon] Promotion check (existing point click)",
                {
                  groupId: activeGroup.id,
                  pointId: existingPointId,
                  vertexCount: nextVertexPointIds.length,
                  planeDistance,
                  planarAngleSum,
                  distanceThreshold: PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS,
                  angleThreshold: PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG,
                }
              );

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                console.debug(
                  "[PlanarPolygon] Promoted to plane-locked (existing point click)",
                  {
                    groupId: activeGroup.id,
                    pointId: existingPointId,
                    planeDistance,
                    planarAngleSum,
                  }
                );
                nextPlane = candidatePlane;
                nextPlaneLocked = true;
              } else {
                console.debug(
                  "[PlanarPolygon] Promotion skipped (existing point click)",
                  {
                    groupId: activeGroup.id,
                    pointId: existingPointId,
                    planeDistance,
                    planarAngleSum,
                  }
                );
              }
            }
          }
        }

        if (
          planarMeasurementCreationMode === "polygon" &&
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
        const updatedGroup = computePolygonGroupDerivedData(
          {
            ...activeGroup,
            measurementKind:
              activeGroup.measurementKind ??
              (planarMeasurementCreationMode === "polygon"
                ? "area"
                : "polyline"),
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
        setMeasurements((prev) => {
          const pointMeasurements = prev.filter(isPointMeasurementEntry);
          const maxPointIndex = pointMeasurements.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries = createdFacadeAutoCorners.map(
            ({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: MeasurementMode.PointQuery,
                id,
                index: maxPointIndex + index + 1,
                isFacadeAutoCorner: true,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  height: cornerWGS84.altitude ?? 0,
                },
                timestamp: Date.now() + index,
              };
            }
          );
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
      measurements,
      planarPolygonGroups,
      defaultPolylineSegmentLineMode,
      polylineVerticalOffsetMeters,
      planarMeasurementCreationMode,
      polygonSurfaceTypePreset,
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

  const updateMeasurementNameById = useCallback(
    (id: string, name: string) => {
      const nextName = name.trim();

      setMeasurements((prev) => {
        const hasChanged = prev.some(
          (measurement) =>
            measurement.id === id && (measurement.name ?? "") !== nextName
        );

        if (!hasChanged) {
          return prev;
        }

        return prev.map((measurement) =>
          measurement.id === id
            ? { ...measurement, name: nextName }
            : measurement
        );
      });
    },
    [setMeasurements]
  );

  const toggleMeasurementLockById = useCallback((id: string) => {
    setMeasurements((prev) => {
      let hasChanged = false;
      const next = prev.map((measurement) => {
        if (measurement.id !== id) return measurement;
        hasChanged = true;
        return {
          ...measurement,
          locked: !measurement.locked,
        };
      });
      return hasChanged ? next : prev;
    });
  }, []);

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
      setMeasurements((prev) => {
        let hasChanged = false;
        const next = prev.map((measurement) => {
          if (!isPointMeasurementEntry(measurement) || measurement.id !== id) {
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
    [setMeasurements]
  );

  const cyclePointLabelMetricModeByMeasurementId = useCallback(
    (id: string) => {
      setMeasurements((prev) => {
        let hasChanged = false;

        const next = prev.map((measurement) => {
          if (!isPointMeasurementEntry(measurement) || measurement.id !== id) {
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
    [setMeasurements]
  );

  const handlePointLabelDoubleClick = useCallback(
    (id: string) => {
      if (!pointMeasurementIds.has(id)) {
        return;
      }

      const clickedPoint = measurements.find(
        (measurement) =>
          isPointMeasurementEntry(measurement) && measurement.id === id
      );
      if (clickedPoint && isPointMeasurementEntry(clickedPoint)) {
        setReferencePoint(clickedPoint.geometryECEF);
      }

      // Double click finishes the current line chain.
      setDoubleClickChainSourcePointId(null);
      selectMeasurementById(id);
    },
    [
      measurements,
      pointMeasurementIds,
      selectMeasurementById,
      setReferencePoint,
    ]
  );

  const updatePointMeasurementPositionById = useCallback(
    (
      id: string,
      nextPosition: Cartesian3,
      options?: { treatNextPositionAsOffsetAnchor?: boolean }
    ) => {
      const measurementToUpdate = measurements.find(
        (measurement) =>
          isPointMeasurementEntry(measurement) && measurement.id === id
      );
      const pointMeasurementToUpdate =
        measurementToUpdate && isPointMeasurementEntry(measurementToUpdate)
          ? measurementToUpdate
          : null;
      const shouldTreatAsAnchor =
        options?.treatNextPositionAsOffsetAnchor === true &&
        Boolean(pointMeasurementToUpdate?.verticalOffsetAnchorECEF);
      const currentAnchor =
        shouldTreatAsAnchor &&
        pointMeasurementToUpdate?.verticalOffsetAnchorECEF
          ? new Cartesian3(
              pointMeasurementToUpdate.verticalOffsetAnchorECEF.x,
              pointMeasurementToUpdate.verticalOffsetAnchorECEF.y,
              pointMeasurementToUpdate.verticalOffsetAnchorECEF.z
            )
          : null;
      const resolvedNextGeometry =
        shouldTreatAsAnchor && currentAnchor && pointMeasurementToUpdate
          ? Cartesian3.add(
              nextPosition,
              Cartesian3.subtract(
                pointMeasurementToUpdate.geometryECEF,
                currentAnchor,
                new Cartesian3()
              ),
              new Cartesian3()
            )
          : nextPosition;
      const shouldSyncReferencePoint = Boolean(
        referencePoint &&
          pointMeasurementToUpdate &&
          Cartesian3.distance(
            pointMeasurementToUpdate.geometryECEF,
            referencePoint
          ) <= REFERENCE_POINT_SYNC_EPSILON_METERS
      );
      const geometryWGS84 = getDegreesFromCartesian(resolvedNextGeometry);

      setMeasurements((prev) => {
        let hasChanged = false;

        const next = prev.map((measurement) => {
          if (!isPointMeasurementEntry(measurement) || measurement.id !== id) {
            return measurement;
          }

          hasChanged = true;
          return {
            ...measurement,
            geometryECEF: resolvedNextGeometry,
            geometryWGS84: {
              longitude: geometryWGS84.longitude,
              latitude: geometryWGS84.latitude,
              height: geometryWGS84.altitude ?? 0,
            },
            ...(shouldTreatAsAnchor
              ? {
                  verticalOffsetAnchorECEF: {
                    x: nextPosition.x,
                    y: nextPosition.y,
                    z: nextPosition.z,
                  },
                }
              : {}),
          };
        });

        return hasChanged ? next : prev;
      });

      if (shouldSyncReferencePoint) {
        setReferencePoint(resolvedNextGeometry);
      }
    },
    [measurements, referencePoint, setMeasurements, setReferencePoint]
  );

  const handleMoveGizmoPointPositionChange = useCallback(
    (pointId: string, nextPosition: Cartesian3) => {
      const movedPointMeasurement = measurements.find(
        (measurement) =>
          isPointMeasurementEntry(measurement) && measurement.id === pointId
      );
      if (
        !movedPointMeasurement ||
        !isPointMeasurementEntry(movedPointMeasurement)
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
        const pointById = getPointPositionMap(measurements);
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

        if (moveGizmoVerticalOffsetEditMode === "polyline") {
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
              setMeasurements((prev) =>
                prev.map((measurement) => {
                  if (
                    !isPointMeasurementEntry(measurement) ||
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
                      height: nextWGS84.altitude ?? 0,
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
        setMeasurements((prev) =>
          prev.map((measurement) => {
            if (
              !isPointMeasurementEntry(measurement) ||
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
                height: nextWGS84.altitude ?? 0,
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
      setMeasurements((prev) =>
        applyDeltaToSelectedPoints(prev, selectedPointIdSet, delta)
      );

      if (
        hasReferencePointInSelection(
          measurements,
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
      measurements,
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
      const measurement = measurements.find(
        (entry) => isPointMeasurementEntry(entry) && entry.id === id
      );
      if (!measurement || !isPointMeasurementEntry(measurement)) return;
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
    [measurements]
  );

  const clearLockedEditMeasurementId = useCallback(() => {
    setLockedEditMeasurementId(null);
  }, []);

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
      const pointMeasurement = measurements.find(
        (measurement) =>
          isPointMeasurementEntry(measurement) && measurement.id === pointId
      );
      if (!pointMeasurement || !isPointMeasurementEntry(pointMeasurement)) {
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
        verticalOffsetEditMode: targetPolylineGroup ? "polyline" : "point",
        verticalOffsetPlanarGroupId: targetPolylineGroup?.id ?? null,
      });
    },
    [
      measurements,
      planarPolygonGroups,
      selectMeasurementById,
      startMoveGizmoForMeasurementId,
    ]
  );

  const setPointMeasurementElevationById = useCallback(
    (id: string, elevationMeters: number) => {
      if (!Number.isFinite(elevationMeters)) return;

      const measurement = measurements.find(
        (entry) => isPointMeasurementEntry(entry) && entry.id === id
      );
      if (!measurement || !isPointMeasurementEntry(measurement)) return;

      const nextPosition = Cartesian3.fromDegrees(
        measurement.geometryWGS84.longitude,
        measurement.geometryWGS84.latitude,
        elevationMeters
      );
      updatePointMeasurementPositionById(id, nextPosition);
    },
    [measurements, updatePointMeasurementPositionById]
  );

  const setPointMeasurementCoordinatesById = useCallback(
    (
      id: string,
      latitude: number,
      longitude: number,
      elevationMeters?: number
    ) => {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

      const measurement = measurements.find(
        (entry) => isPointMeasurementEntry(entry) && entry.id === id
      );
      if (!measurement || !isPointMeasurementEntry(measurement)) return;

      const nextElevation =
        elevationMeters ?? measurement.geometryWGS84.height ?? 0;
      const nextPosition = Cartesian3.fromDegrees(
        longitude,
        latitude,
        nextElevation
      );
      updatePointMeasurementPositionById(id, nextPosition);
    },
    [measurements, updatePointMeasurementPositionById]
  );

  const setMoveGizmoPointElevationFromMeasurementById = useCallback(
    (sourcePointId: string) => {
      if (!moveGizmoPointId || sourcePointId === moveGizmoPointId) return;

      const sourceMeasurement = measurements.find(
        (measurement) =>
          isPointMeasurementEntry(measurement) &&
          measurement.id === sourcePointId
      );
      const moveMeasurement = measurements.find(
        (measurement) =>
          isPointMeasurementEntry(measurement) &&
          measurement.id === moveGizmoPointId
      );

      if (
        !sourceMeasurement ||
        !moveMeasurement ||
        !isPointMeasurementEntry(sourceMeasurement) ||
        !isPointMeasurementEntry(moveMeasurement)
      ) {
        return;
      }

      const nextPosition = Cartesian3.fromDegrees(
        moveMeasurement.geometryWGS84.longitude,
        moveMeasurement.geometryWGS84.latitude,
        sourceMeasurement.geometryWGS84.height
      );
      updatePointMeasurementPositionById(moveGizmoPointId, nextPosition);
    },
    [moveGizmoPointId, measurements, updatePointMeasurementPositionById]
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
        const pointById = getPointPositionMap(measurements);
        const pointPosition = pointById.get(id);
        if (pointPosition) {
          const persistedVerticalPolygonFrame =
            resolveVerticalPolygonLocalFrameVectors(targetVerticalPolygonGroup);
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
                fromSerializableCartesian3(
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
                planeNormal = normalizeDirection(
                  fromSerializableCartesian3(derivedPlane.normalECEF)
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
        const pointById = getPointPositionMap(measurements);
        const pointPosition = pointById.get(id);
        if (pointPosition) {
          const planeNormalFromGroup = targetRoofPolygonGroup.plane
            ? normalizeDirection(
                fromSerializableCartesian3(
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
                planeNormal = normalizeDirection(
                  fromSerializableCartesian3(derivedPlane.normalECEF)
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
      measurements,
      planarPolygonGroups,
      selectedPlanarPolygonGroupId,
      selectMeasurementById,
      startMoveGizmoForMeasurementId,
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

  const handlePointPlaneDragStart = useCallback(
    (pointId: string) => {
      const focusedGroup = focusedPlanarPolygonGroupId
        ? planarPolygonGroups.find((g) => g.id === focusedPlanarPolygonGroupId)
        : null;
      const isOnFocusedGroup =
        focusedGroup && focusedGroup.vertexPointIds.includes(pointId);
      if (!isOnFocusedGroup) {
        selectMeasurementById(pointId);
      }
      if (moveGizmoPointId) {
        stopMoveGizmo();
      }
    },
    [
      focusedPlanarPolygonGroupId,
      planarPolygonGroups,
      moveGizmoPointId,
      selectMeasurementById,
      stopMoveGizmo,
    ]
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

      const clickedMeasurement = measurements.find(
        (measurement) => measurement.id === id
      );
      const isAuxiliaryLabelAnchor = Boolean(
        clickedMeasurement?.auxiliaryLabelAnchor
      );

      if (measurementMode === MeasurementMode.PointMeasure) {
        selectMeasurementById(id);
        return;
      }

      if (measurementMode === MeasurementMode.PointQuery) {
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

      if (measurementMode === MeasurementMode.PolylineMeasure) {
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
          if (planarMeasurementCreationMode === "polygon") {
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
      measurements,
      measurementMode,
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
      planarMeasurementCreationMode,
    ]
  );

  useEffect(() => {
    if (measurementMode === MeasurementMode.PolylineMeasure) return;
    setPendingPolylinePromotionRingClosurePointId(null);
  }, [measurementMode]);

  // point query hooks
  const isPointMeasureLabelModeActive =
    pointLabelOnCreate && measurementMode === MeasurementMode.PointMeasure;
  const isPointMeasureCreateModeActive =
    !pointLabelOnCreate && measurementMode === MeasurementMode.PointMeasure;
  const pointQueryToolActive =
    measurementMode === MeasurementMode.PointQuery ||
    measurementMode === MeasurementMode.PolylineMeasure ||
    measurementMode === MeasurementMode.PointMeasure;
  const activePointCreateConfig = useMemo(() => {
    if (measurementMode === MeasurementMode.PointMeasure) {
      return {
        temporaryMode: isPointMeasureCreateModeActive ? temporaryMode : false,
        verticalOffsetMeters: isPointMeasureCreateModeActive
          ? pointVerticalOffsetMeters
          : 0,
        nameOnCreate: isPointMeasureLabelModeActive
          ? lastCustomLabelOnCreate
          : undefined,
        labelOnCreate: isPointMeasureLabelModeActive
          ? ("none" as const)
          : ("elevation" as const),
        hiddenOnCreate: isPointMeasureLabelModeActive,
        auxiliaryOnCreate: isPointMeasureLabelModeActive,
        labelAnchorOnCreate: (pointId: string): MeasurementLabelAnchor => ({
          anchorPointId: pointId,
          collapseToCompact: false,
        }),
        useTemporaryForCreatedPoints: isPointMeasureCreateModeActive,
        markCreatedPointsAsDistanceAdhoc: false,
      };
    }

    if (measurementMode === MeasurementMode.PointQuery) {
      return {
        temporaryMode: false,
        verticalOffsetMeters: 0,
        nameOnCreate: undefined,
        labelOnCreate: undefined,
        hiddenOnCreate: false,
        auxiliaryOnCreate: false,
        labelAnchorOnCreate: undefined,
        useTemporaryForCreatedPoints: true,
        markCreatedPointsAsDistanceAdhoc: true,
      };
    }

    if (measurementMode === MeasurementMode.PolylineMeasure) {
      return {
        temporaryMode: false,
        verticalOffsetMeters: previewIsPolylineCreateMode
          ? polylineVerticalOffsetMeters
          : 0,
        nameOnCreate: undefined,
        labelOnCreate: undefined,
        hiddenOnCreate: false,
        auxiliaryOnCreate: false,
        labelAnchorOnCreate: (pointId: string): MeasurementLabelAnchor => ({
          anchorPointId: pointId,
          collapseToCompact: false,
        }),
        useTemporaryForCreatedPoints: true,
        markCreatedPointsAsDistanceAdhoc: false,
      };
    }

    return null;
  }, [
    measurementMode,
    isPointMeasureCreateModeActive,
    isPointMeasureLabelModeActive,
    temporaryMode,
    pointVerticalOffsetMeters,
    lastCustomLabelOnCreate,
    previewIsPolylineCreateMode,
    polylineVerticalOffsetMeters,
    selectionModeActive,
  ]);

  useCesiumPointQuery(
    scene,
    pointQueryToolActive &&
      pointQueryEnabled &&
      !selectionModeActive &&
      !moveGizmoPointId &&
      !isMoveGizmoDragging &&
      Boolean(activePointCreateConfig),
    setMeasurements,
    activePointCreateConfig?.temporaryMode ?? false,
    handlePointQueryPointCreated,
    handlePointQueryDoubleClick,
    handlePointQueryBeforePointCreate,
    activePointCreateConfig?.verticalOffsetMeters ?? 0,
    activePointCreateConfig?.nameOnCreate,
    activePointCreateConfig?.labelOnCreate,
    activePointCreateConfig?.hiddenOnCreate ?? false,
    activePointCreateConfig?.auxiliaryOnCreate ?? false,
    activePointCreateConfig?.labelAnchorOnCreate,
    activePointCreateConfig?.useTemporaryForCreatedPoints ?? true,
    activePointCreateConfig?.markCreatedPointsAsDistanceAdhoc ?? false,
    handlePointQueryPointerMove
  );

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

      const pointById = getPointPositionMap(measurements);
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
          ? resolveVerticalPolygonLocalFrameVectors(targetGroup)
          : null;
      if (targetGroupVerticalPolygonFrame) {
        const startLocal = getPositionInVerticalPolygonLocalFrame(
          startPoint,
          targetGroupVerticalPolygonFrame
        );
        const endLocal = getPositionInVerticalPolygonLocalFrame(
          endPoint,
          targetGroupVerticalPolygonFrame
        );
        midpointPosition = getPositionFromVerticalPolygonLocalFrame(
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
      setMeasurements((prev) => {
        const insertionBaseIndex =
          prev.find(
            (measurement) =>
              isPointMeasurementEntry(measurement) &&
              measurement.id === edgeStartId
          )?.index ?? prev.filter(isPointMeasurementEntry).length;
        const insertionIndex = insertionBaseIndex + 1;

        const nextMeasurements = prev.map((measurement) => {
          if (
            isPointMeasurementEntry(measurement) &&
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
            type: MeasurementMode.PointQuery,
            id: nextPointId,
            index: insertionIndex,
            geometryECEF: midpointPosition,
            geometryWGS84: {
              longitude: midpointWGS84.longitude,
              latitude: midpointWGS84.latitude,
              height: midpointWGS84.altitude ?? 0,
            },
            timestamp: new Date().getTime(),
          },
        ];
      });

      const updatedPointById = getPointPositionMap(measurements, {
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
          return computePolygonGroupDerivedData(
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
    [measurements, planarPolygonGroups, selectMeasurementById]
  );

  useEffect(() => {
    setDistanceRelations((prev) =>
      syncPolygonEdgeDistanceRelations(prev, planarPolygonGroups)
    );
  }, [planarPolygonGroups, syncPolygonEdgeDistanceRelations]);

  const handlePlanarPolygonClick = useCallback(
    (polygonGroupId: string) => {
      const hasPolygonGroup = planarPolygonGroups.some(
        (group) => group.id === polygonGroupId
      );
      if (!hasPolygonGroup) return;

      if (selectionModeActive) {
        selectPlanarPolygonGroupById(polygonGroupId);
        return;
      }

      const isAlreadySelected = selectedPlanarPolygonGroupId === polygonGroupId;
      if (isAlreadySelected) {
        const connectedOpenGroupIds = getConnectedOpenPolylineGroupIds(
          planarPolygonGroups,
          polygonGroupId
        );
        if (connectedOpenGroupIds.size > 0) {
          const relationIds = new Set<string>();
          planarPolygonGroups.forEach((group) => {
            if (!connectedOpenGroupIds.has(group.id)) return;
            group.edgeRelationIds.forEach((relationId) => {
              relationIds.add(relationId);
            });
          });

          if (relationIds.size > 0) {
            setDistanceRelations((prev) => {
              const currentMode: DirectLineLabelMode =
                prev.find((relation) => relationIds.has(relation.id))
                  ?.directLabelMode ?? DEFAULT_DIRECT_LINE_LABEL_MODE;
              const nextMode = getNextDirectLineLabelMode(currentMode);
              return prev.map((relation) => {
                if (!relationIds.has(relation.id)) return relation;
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

      selectPlanarPolygonGroupById(polygonGroupId);
    },
    [
      planarPolygonGroups,
      selectionModeActive,
      selectedPlanarPolygonGroupId,
      setDistanceRelations,
      selectPlanarPolygonGroupById,
    ]
  );

  const hiddenMeasurementIdSet = useMemo(
    () =>
      new Set(
        measurements
          .filter(
            (measurement) =>
              measurement.hidden && !measurement.auxiliaryLabelAnchor
          )
          .map((measurement) => measurement.id)
      ),
    [measurements]
  );

  const auxiliaryLabelAnchorIdSet = useMemo(
    () =>
      new Set(
        measurements
          .filter((measurement) => measurement.auxiliaryLabelAnchor)
          .map((measurement) => measurement.id)
      ),
    [measurements]
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
      measurements.filter(
        (measurement) => !measurement.hidden || measurement.auxiliaryLabelAnchor
      ),
    [measurements]
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
    measurements.forEach((measurement) => {
      if (
        isPointMeasurementEntry(measurement) &&
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
    measurements,
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
    measurements.forEach((measurement) => {
      if (
        isPointMeasurementEntry(measurement) &&
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
    measurements,
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

  useCesiumPointVisualizer(scene, visibleMeasurementsForRendering, {
    showMarkers: showPoints,
    showCesiumMarkers: false,
    showLabels: showPointLabels,
    radius: pointRadius,
    referenceElevation: effectiveReferenceElevation,
    selectedPointId: selectedMeasurementId,
    selectedPointIds: selectedMeasurementIds,
    selectedPlanarPolygonGroupId: showDistanceAndPolygonVisuals
      ? selectedPlanarPolygonGroupId
      : null,
    activePlanarPolygonGroupId: showDistanceAndPolygonVisuals
      ? activePlanarPolygonGroupId
      : null,
    distanceRelations: showDistanceAndPolygonVisuals
      ? effectiveDistanceRelationsForRendering
      : [],
    planarPolygonGroups: showDistanceAndPolygonVisuals
      ? visiblePlanarPolygonGroupsForRendering
      : [],
    facadeRectanglePreviewOppositeByGroupId,
    onPlanarPolygonClick: handlePlanarPolygonClick,
    pointDragPlaneByPointId: pointDragPlaneByPointIdForMarkerDrag,
    onPointPlaneDragStart: handlePointPlaneDragStart,
    onPointPlaneDragPositionChange: updatePointMeasurementPositionById,
    hiddenPointLabelIds,
    fullyHiddenPointIds: effectiveFullyHiddenPointIds,
    markerlessPointIds,
    pillMarkerPointIds: collapsedPillPointIds,
    suppressCompactLabelPointIds: selectedNonRoofClosedAreaVertexPointIdSet,
    showSelectedDisc: Boolean(moveGizmoPointId),
    debug: false,
    onPointClick: handlePointLabelClick,
    onPointDoubleClick: handlePointLabelDoubleClick,
    onPointLongPress: handlePointLabelLongPress,
    onPointHoverChange: handlePointLabelHoverChange,
    onPointVerticalOffsetStemLongPress: handlePointVerticalOffsetStemLongPress,
    selectionModeEnabled: selectionModeActive,
    selectionRectangleModeEnabled: selectModeRectangle,
    selectionAdditiveMode: effectiveSelectModeAdditive,
    onPointRectangleSelect: selectMeasurementIds,
    onDistanceRelationCornerClick:
      selectionModeActive || isLivePointPreviewModeActive
        ? undefined
        : handleDistanceRelationCornerClick,
    onDistanceRelationMidpointClick:
      selectionModeActive || isLivePointPreviewModeActive
        ? undefined
        : handleDistanceRelationMidpointClick,
    pointLongPressDurationMs: POINT_LABEL_LONG_PRESS_DURATION_MS,
    occlusionChecksEnabled,
    labelLayoutConfig: options?.labels,
    distanceToReferenceByPointId: effectiveDistanceToReferenceByPointId,
    pointLabelIndexByPointId: focusedPolylinePointLabelIndexByPointId,
    pointMarkerBadgeByPointId,
    referenceLabelPointId: focusedPolylineStartPointId,
    polylinePointLabelTextByPointId: effectivePolylinePointLabelTextByPointId,
    labelInputPromptPointId:
      isPointMeasureLabelModeActive &&
      !selectionModeActive &&
      selectedMeasurementId &&
      pointMeasurementIds.has(selectedMeasurementId)
        ? selectedMeasurementId
        : null,
    markerOnlyOverlayNodeInteractions: isLivePointPreviewModeActive,
    onDistanceRelationLineLabelToggle:
      selectionModeActive || isLivePointPreviewModeActive
        ? undefined
        : handleDistanceRelationLineLabelToggle,
    onDistanceRelationLineClick: isLivePointPreviewModeActive
      ? undefined
      : handleDistanceRelationLineClick,
    distanceLineLabelMinDistancePx: 50,
    cumulativeDistanceByRelationId,
    moveGizmoAxisDirection,
    moveGizmoPreferredAxisId,
    moveGizmoPointId,
    moveGizmoMarkerSizeScale: moveGizmoOptions.markerSizeScale ?? 1,
    moveGizmoLabelDistanceScale: moveGizmoOptions.labelDistanceScale ?? 1,
    livePreviewPointECEF: isLivePointPreviewModeActive
      ? livePreviewPointECEF
      : null,
    livePreviewSurfaceNormalECEF: isLivePointPreviewModeActive
      ? livePreviewSurfaceNormalECEF
      : null,
    livePreviewDistanceLine: showDistanceAndPolygonVisuals
      ? livePreviewDistanceLine
      : null,
    livePreviewReferenceElevation: referenceElevation,
    livePreviewHasReferenceElevation: Boolean(referencePoint),
    moveGizmoSnapPlaneDragToGround:
      moveGizmoOptions.snapPlaneDragToGround ?? false,
    moveGizmoShowRotationHandle: moveGizmoOptions.showRotationHandle ?? true,
    moveGizmoIsDragging: isMoveGizmoDragging,
    onMoveGizmoPointPositionChange: handleMoveGizmoPointPositionChange,
    onMoveGizmoDragStateChange: setIsMoveGizmoDragging,
    onMoveGizmoAxisChange: handleMoveGizmoAxisChange,
    onMoveGizmoExit: handleMoveGizmoExit,
  });

  const clearAllMeasurements = useCallback(() => {
    setMeasurements([]);
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

  const clearMeasurementsByType = useCallback((type: MeasurementMode) => {
    setMeasurements((prev) =>
      prev.filter((measurement) => measurement.type !== type)
    );
    if (type === MeasurementMode.PointQuery) {
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

  const clearMeasurementsByIds = useCallback(
    (ids: string[]) => {
      const pointById = new Map(
        measurements
          .filter(isPointMeasurementEntry)
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

      setMeasurements((prev) => prev.filter((m) => !idsToDelete.has(m.id)));
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

      const remainingPointById = getPointPositionMap(measurements);
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
            computePolygonGroupDerivedData(
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
    [distanceRelations, measurements, moveGizmoPointId, planarPolygonGroups]
  );

  const deleteSelectedPointMeasurements = useCallback(() => {
    const selectedIds = selectedMeasurementIds.filter(
      (id) => pointMeasurementIds.has(id) && !lockedMeasurementIdSet.has(id)
    );
    if (selectedIds.length > 0) {
      clearMeasurementsByIds(selectedIds);
      return;
    }
    if (
      selectedMeasurementId &&
      pointMeasurementIds.has(selectedMeasurementId) &&
      !lockedMeasurementIdSet.has(selectedMeasurementId)
    ) {
      clearMeasurementsByIds([selectedMeasurementId]);
    }
  }, [
    clearMeasurementsByIds,
    lockedMeasurementIdSet,
    pointMeasurementIds,
    selectedMeasurementId,
    selectedMeasurementIds,
  ]);

  useEffect(() => {
    if (selectedMeasurementIds.length === 0) return;
    const idsInState = new Set(
      measurements.map((measurement) => measurement.id)
    );
    setSelectedMeasurementIds((prev) => {
      const next = prev.filter((id) => idsInState.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [measurements, selectedMeasurementIds.length]);

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
      deleteSelectedPointMeasurements();
    };

    window.addEventListener("keydown", handleDeleteKey, true);
    return () => {
      window.removeEventListener("keydown", handleDeleteKey, true);
    };
  }, [
    deleteSelectedPointMeasurements,
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
        measurementMode !== MeasurementMode.PointQuery &&
        measurementMode !== MeasurementMode.PolylineMeasure &&
        measurementMode !== MeasurementMode.PointMeasure
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
        const latestTemporaryPointMeasurement = [...measurements]
          .reverse()
          .find(
            (measurement) =>
              isPointMeasurementEntry(measurement) && measurement.temporary
          );
        if (!latestTemporaryPointMeasurement) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setMeasurements((prev) =>
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

      const pointMeasurements = measurements.filter(isPointMeasurementEntry);
      const latestPointMeasurement =
        pointMeasurements[pointMeasurements.length - 1];
      if (!latestPointMeasurement) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      clearMeasurementsByIds([latestPointMeasurement.id]);
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
    clearMeasurementsByIds,
    measurementMode,
    measurements,
    selectedMeasurementId,
    selectedMeasurementIds.length,
    selectMeasurementById,
    setMeasurements,
    isPointMeasureCreateModeActive,
    temporaryMode,
  ]);

  useEffect(() => {
    if (options?.mode !== undefined) {
      setMeasurementMode(options.mode);
      if (options.mode === MeasurementMode.NONE) {
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
  }, [options?.mode, setMeasurementMode]);

  useEffect(() => {
    if (mapMeasurements.mode === MEASUREMENT_MODE.MEASUREMENT) {
      setMeasurementMode((prev) =>
        prev === MeasurementMode.NONE ? MeasurementMode.PointMeasure : prev
      );
    } else {
      setMeasurementMode(MeasurementMode.NONE);
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
  }, [mapMeasurements.mode, setMeasurementMode]);

  useEffect(() => {
    if (previousMeasurementModeRef.current === measurementMode) return;
    previousMeasurementModeRef.current = measurementMode;
    selectedMeasurementIdRef.current = null;
    setSelectedMeasurementId(null);
    setSelectedMeasurementIds([]);
    setPreviousSelectedMeasurementId(null);
    setSelectedPlanarPolygonGroupId(null);
    setDoubleClickChainSourcePointId(null);
    setActivePlanarPolygonGroupId(null);
    setPendingPolylinePromotionRingClosurePointId(null);
  }, [measurementMode]);

  useEffect(() => {
    if (measurementMode === MeasurementMode.PolylineMeasure) return;

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
    setMeasurements((prev) =>
      prev.filter((measurement) => {
        if (!isPointMeasurementEntry(measurement)) {
          return true;
        }
        if (!removablePointIdSet.has(measurement.id)) {
          return true;
        }
        return protectedPointIdSet.has(measurement.id);
      })
    );
  }, [
    measurementMode,
    planarPolygonGroups,
    distanceRelations,
    selectedPlanarPolygonGroupId,
  ]);

  useEffect(() => {
    if (!doubleClickChainSourcePointId) return;
    const hasChainSourceMeasurement = measurements.some(
      (measurement) => measurement.id === doubleClickChainSourcePointId
    );
    if (!hasChainSourceMeasurement) {
      setDoubleClickChainSourcePointId(null);
    }
  }, [doubleClickChainSourcePointId, measurements]);

  useEffect(() => {
    if (!selectedMeasurementId) return;
    const hasSelectedMeasurement = measurements.some(
      (measurement) => measurement.id === selectedMeasurementId
    );
    if (!hasSelectedMeasurement) {
      setSelectedMeasurementId(null);
    }
  }, [measurements, selectedMeasurementId]);

  useEffect(() => {
    if (!previousSelectedMeasurementId) return;
    const hasPreviousSelection = measurements.some(
      (measurement) => measurement.id === previousSelectedMeasurementId
    );
    if (!hasPreviousSelection) {
      setPreviousSelectedMeasurementId(null);
    }
  }, [measurements, previousSelectedMeasurementId]);

  useEffect(() => {
    const pointMeasurementIds = new Set(
      measurements
        .filter(isPointMeasurementEntry)
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
  }, [measurements]);

  useEffect(() => {
    const pointMeasurementIds = new Set(
      measurements
        .filter(isPointMeasurementEntry)
        .map((measurement) => measurement.id)
    );
    const pointById = getPointPositionMap(measurements);
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
          computePolygonGroupDerivedData(
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
  }, [measurements]);

  useEffect(() => {
    if (!referencePoint) return;

    const pointMeasurements = measurements.filter(isPointMeasurementEntry);
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
  }, [measurements, referencePoint, setReferencePoint]);

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
    const hasMoveGizmoPoint = measurements.some(
      (measurement) => measurement.id === moveGizmoPointId
    );
    if (!hasMoveGizmoPoint) {
      setMoveGizmoPointId(null);
      setMoveGizmoAxisDirection(null);
      setMoveGizmoAxisTitle(null);
      setMoveGizmoAxisCandidates(null);
      setIsMoveGizmoDragging(false);
    }
  }, [measurements, moveGizmoPointId]);

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
      measurements.length > 0 &&
      isPointMeasurementEntry(measurements[0]) &&
      measurements.length > 1
    ) {
      setReferencePoint(measurements[0].geometryECEF);
    }
  }, [measurements, setReferencePoint, referencePoint]);

  const contextValue = useMemo(
    () => ({
      measurementMode,
      setMeasurementMode,
      measurements,
      setMeasurements,
      selectedMeasurementId,
      selectedMeasurementIds,
      selectMeasurementIds,
      selectionModeActive,
      setSelectionModeActive,
      selectModeAdditive,
      setSelectModeAdditive,
      selectModeRectangle,
      setSelectModeRectangle,
      selectMeasurementById,
      updateMeasurementNameById,
      toggleMeasurementLockById,
      selectedPlanarPolygonGroupId,
      activePlanarPolygonGroupId,
      selectPlanarPolygonGroupById,
      updatePlanarPolygonNameById,
      moveGizmoPointId,
      isMoveGizmoDragging,
      lockedEditMeasurementId,
      clearLockedEditMeasurementId,
      startMoveGizmoForMeasurementId,
      handleMoveGizmoPointPositionChange,
      stopMoveGizmo,
      setPointMeasurementElevationById,
      setPointMeasurementCoordinatesById,
      clearAllMeasurements,
      clearMeasurementsByIds,
      deleteSelectedPointMeasurements,
      clearMeasurementsByType,
      showLabels,
      setShowLabels,
      hideMeasurementsOfType,
      setHideMeasurementsOfType,
      hideLabelsOfType,
      setHideLabelsOfType,
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
      planarMeasurementCreationMode,
      setPlanarMeasurementCreationMode,
      polygonSurfaceTypePreset,
      setPolygonSurfaceTypePreset,
      distanceModeStickyToFirstPoint,
      setDistanceModeStickyToFirstPoint,
      distanceCreationLineVisibility,
      setDistanceCreationLineVisibilityByKind,
      heightOffset,
      setHeightOffset,
      referencePoint,
      setReferencePoint,
      referenceElevation,
      geometryNodeTable,
      distanceRelations,
      setDistanceRelations,
      planarPolygonGroups,
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
      pointMarkerBadgeByPointId,
      pendingPolylinePromotionRingClosurePointId,
      confirmPolylineRingPromotion,
      cancelPolylineRingPromotion,
    }),
    [
      measurementMode,
      setMeasurementMode,
      measurements,
      setMeasurements,
      selectedMeasurementId,
      selectedMeasurementIds,
      selectMeasurementIds,
      selectionModeActive,
      setSelectionModeActive,
      selectModeAdditive,
      setSelectModeAdditive,
      selectModeRectangle,
      setSelectModeRectangle,
      selectMeasurementById,
      updateMeasurementNameById,
      toggleMeasurementLockById,
      selectedPlanarPolygonGroupId,
      activePlanarPolygonGroupId,
      selectPlanarPolygonGroupById,
      updatePlanarPolygonNameById,
      moveGizmoPointId,
      isMoveGizmoDragging,
      lockedEditMeasurementId,
      clearLockedEditMeasurementId,
      startMoveGizmoForMeasurementId,
      stopMoveGizmo,
      setPointMeasurementElevationById,
      setPointMeasurementCoordinatesById,
      clearAllMeasurements,
      clearMeasurementsByIds,
      deleteSelectedPointMeasurements,
      clearMeasurementsByType,
      showLabels,
      setShowLabels,
      occlusionChecksEnabled,
      setOcclusionChecksEnabled,
      hideMeasurementsOfType,
      setHideMeasurementsOfType,
      hideLabelsOfType,
      setHideLabelsOfType,
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
      planarMeasurementCreationMode,
      setPlanarMeasurementCreationMode,
      polygonSurfaceTypePreset,
      setPolygonSurfaceTypePreset,
      distanceModeStickyToFirstPoint,
      setDistanceModeStickyToFirstPoint,
      distanceCreationLineVisibility,
      setDistanceCreationLineVisibilityByKind,
      heightOffset,
      setHeightOffset,
      referencePoint,
      setReferencePoint,
      referenceElevation,
      geometryNodeTable,
      distanceRelations,
      setDistanceRelations,
      planarPolygonGroups,
      setPlanarPolygonGroups,
      polylines,
      setPolylines,
      showSelectedReferenceLine,
      setShowSelectedReferenceLine,
      showSelectedReferenceLineComponents,
      setShowSelectedReferenceLineComponents,
      pointLabelOnCreate,
      pointMarkerBadgeByPointId,
      pendingPolylinePromotionRingClosurePointId,
      confirmPolylineRingPromotion,
      cancelPolylineRingPromotion,
      clearLockedEditMeasurementId,
    ]
  );

  return (
    <CesiumMeasurementsContext.Provider value={contextValue}>
      {children}
    </CesiumMeasurementsContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCesiumMeasurements = (): CesiumMeasurementsContextType => {
  const context = useContext(CesiumMeasurementsContext);
  if (context === undefined) {
    throw new Error(
      "useCesiumMeasurements must be used within a CesiumMeasurementsProvider"
    );
  }
  return context;
};
