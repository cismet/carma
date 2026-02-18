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
import { Cartesian3, getDegreesFromCartesian } from "@carma/cesium";
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
} from "../hooks";
import { useMeasurementPersistence } from "../hooks/useMeasurementPersistence";

import {
  DEFAULT_POINT_LABEL_METRIC_MODE,
  DEFAULT_POLYLINE_POINT_LABEL_MODE,
  type DirectLineLabelMode,
  isPointMeasurementEntry,
  type PolylineCollection,
  type PolylinePointLabelMode,
  type PlanarPolygonGroup,
  type PlanarPolygonPlane,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
  type MeasurementCollection,
  MeasurementMode,
} from "../types/MeasurementTypes";
import { formatNumber } from "../utils/formatting";
import { getEuclideanDistance } from "../utils/geo";
import {
  loadDistanceRelations,
  loadPlanarPolygonGroups,
  saveDistanceRelations,
  savePlanarPolygonGroups,
} from "../utils/measurementPersistence";
import {
  getNextPointLabelMetricMode,
  runPointLabelClickInteraction,
} from "../utils/pointLabelInteractions";
import {
  buildEdgeRelationIdsForPolygon,
  computePolygonGroupDerivedData,
  computePolylinePlanarAngleSumDeg,
  createPlaneFromThreePoints,
  distancePointToPlane,
  projectPointOntoPlane,
} from "../utils/planarPolygon";

type MoveGizmoStartOptions = {
  axisDirection?: Cartesian3 | null;
  axisTitle?: string | null;
  axisCandidates?: Array<{
    id: string;
    direction: Cartesian3;
    color?: string;
    title?: string | null;
  }> | null;
};

export interface CesiumMeasurementsContextType {
  measurementMode: MeasurementMode;
  setMeasurementMode: Dispatch<SetStateAction<MeasurementMode>>;
  measurements: MeasurementCollection;
  setMeasurements: Dispatch<SetStateAction<MeasurementCollection>>;
  selectedMeasurementId: string | null;
  selectMeasurementById: (id: string | null) => void;
  updateMeasurementNameById: (id: string, name: string) => void;
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
  heightOffset: number;
  setHeightOffset: Dispatch<SetStateAction<number>>;
  referencePoint: Cartesian3 | null;
  setReferencePoint: Dispatch<SetStateAction<Cartesian3 | null>>;
  referenceElevation: number; // derived from referencePoint
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
}

const CesiumMeasurementsContext = createContext<
  CesiumMeasurementsContextType | undefined
>(undefined);

export type MeasurementProviderOptions = {
  temporary?: boolean;
  pointQueries?: {
    enabled?: boolean;
    radius?: number;
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
  mode: MeasurementMode.PointQuery,
  persistenceEnabled: true,
};

const defaultPointQueryOptions: MeasurementProviderOptions["pointQueries"] = {
  enabled: true,
  radius: 1,
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

const getDistanceRelationId = (pointAId: string, pointBId: string) => {
  const [left, right] = [pointAId, pointBId].sort((a, b) => a.localeCompare(b));
  return `distance-relation:${left}:${right}`;
};

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

const buildDerivedPolylineCollection = (
  group: PlanarPolygonGroup,
  pointById: Map<string, Cartesian3>
): PolylineCollection | null => {
  if (group.closed || group.vertexPointIds.length < 2) {
    return null;
  }

  const segmentLengthsMeters: number[] = [];
  const segmentLengthsCumulativeMeters: number[] = [0];
  let totalLengthMeters = 0;
  const edgeRelationIds: string[] = [];

  for (let index = 0; index < group.vertexPointIds.length - 1; index += 1) {
    const startId = group.vertexPointIds[index];
    const endId = group.vertexPointIds[index + 1];
    if (!startId || !endId) continue;
    const start = pointById.get(startId);
    const end = pointById.get(endId);
    if (!start || !end) continue;
    const segmentLength = Cartesian3.distance(start, end);
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
    initialMeasurementMode ?? MeasurementMode.PointQuery
  );

  const [pointRadius, setPointRadius] = useState(pointQueryOptions.radius ?? 1);
  const [heightOffset, setHeightOffset] = useState(
    traverseOptions.heightOffset ?? 1.5
  );
  const [temporaryMode, setTemporaryMode] = useState<boolean>(
    initialTemporary ?? false
  );
  const [measurements, setMeasurements] = useState<MeasurementCollection>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<
    string | null
  >(null);
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
  const [isMoveGizmoDragging, setIsMoveGizmoDragging] =
    useState<boolean>(false);

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

  const hasRestoredDistanceRelationsRef = useRef(false);
  const lastSavedDistanceRelationsRef = useRef<string | null>(null);
  const hasRestoredPlanarPolygonsRef = useRef(false);
  const lastSavedPlanarPolygonsRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !persistenceEnabled ||
      !isSceneReady ||
      hasRestoredDistanceRelationsRef.current
    ) {
      return;
    }

    const savedRelations = loadDistanceRelations(persistenceKey);
    if (savedRelations && savedRelations.length > 0) {
      setTimeout(() => {
        setDistanceRelations(savedRelations);
      }, DISTANCE_RELATION_RESTORE_DELAY_MS);
    }

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

  const referenceElevation = useMemo(() => {
    if (!referencePoint || !scene) return 0;
    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(referencePoint);
    return cartographic?.height ?? 0;
  }, [referencePoint, scene]);

  const derivedPolylines = useMemo(() => {
    const pointById = getPointPositionMap(measurements);
    return planarPolygonGroups
      .map((group) => buildDerivedPolylineCollection(group, pointById))
      .filter((collection): collection is PolylineCollection =>
        Boolean(collection)
      );
  }, [measurements, planarPolygonGroups]);

  useEffect(() => {
    setPolylines(derivedPolylines);
  }, [derivedPolylines]);

  const focusedPlanarPolygonGroupId =
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId;
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
    const startPointId = focusedPolyline.vertexPointIds[0];
    const startPoint = startPointId
      ? measurements.find(
          (m) => isPointMeasurementEntry(m) && m.id === startPointId
        )
      : null;
    if (!startPoint || !isPointMeasurementEntry(startPoint)) return {};
    const startHeight = startPoint.geometryWGS84.height;
    const byId: Record<string, number> = {};
    focusedPolyline.vertexPointIds.forEach((pointId) => {
      const point = measurements.find(
        (m) => isPointMeasurementEntry(m) && m.id === pointId
      );
      if (point && isPointMeasurementEntry(point)) {
        byId[pointId] = point.geometryWGS84.height - startHeight;
      }
    });
    return byId;
  }, [focusedPolyline, measurements]);

  const focusedPolylineElevationSinceLastNodeByPointId = useMemo(() => {
    if (!focusedPolyline) return {};
    const byId: Record<string, number> = {};
    const vertexPoints = focusedPolyline.vertexPointIds.map((pointId) => {
      const point = measurements.find(
        (m) => isPointMeasurementEntry(m) && m.id === pointId
      );
      return point && isPointMeasurementEntry(point) ? point : null;
    });
    vertexPoints.forEach((point, index) => {
      if (!point) return;
      if (index === 0) {
        byId[point.id] = 0;
      } else {
        const prevPoint = vertexPoints[index - 1];
        byId[point.id] = prevPoint
          ? point.geometryWGS84.height - prevPoint.geometryWGS84.height
          : 0;
      }
    });
    return byId;
  }, [focusedPolyline, measurements]);

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
    const focusedStartPoint = measurements.find(
      (measurement) =>
        isPointMeasurementEntry(measurement) &&
        measurement.id === focusedPolylineStartPointId
    );
    if (!focusedStartPoint || !isPointMeasurementEntry(focusedStartPoint)) {
      return referenceElevation;
    }
    return focusedStartPoint.geometryWGS84.height;
  }, [focusedPolylineStartPointId, measurements, referenceElevation]);

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

  // For unfocused polylines: endpoints show marker-only, interior points are fully hidden
  const unfocusedPolylineEndpointIds = useMemo(() => {
    const ids = new Set<string>();
    polylines.forEach((polyline) => {
      if (polyline.id === focusedPlanarPolygonGroupId) return;
      const first = polyline.vertexPointIds[0];
      const last = polyline.vertexPointIds[polyline.vertexPointIds.length - 1];
      if (first) ids.add(first);
      if (last && last !== first) ids.add(last);
    });
    return ids;
  }, [polylines, focusedPlanarPolygonGroupId]);

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

  const showPoints =
    measurementMode !== MeasurementMode.NONE &&
    !hideMeasurementsOfType.has(MeasurementMode.PointQuery);
  const showDistanceAndPolygonVisuals =
    measurementMode !== MeasurementMode.NONE;
  const showPointLabels =
    showPoints &&
    showLabels &&
    !hideLabelsOfType.has(MeasurementMode.PointQuery);

  const selectedMeasurementIdRef = useRef<string | null>(selectedMeasurementId);
  useEffect(() => {
    selectedMeasurementIdRef.current = selectedMeasurementId;
  }, [selectedMeasurementId]);

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
    if (id !== null) {
      setSelectedPlanarPolygonGroupId((prev) => (prev === null ? prev : null));
    }
  }, []);

  const selectPlanarPolygonGroupById = useCallback((id: string | null) => {
    setSelectedPlanarPolygonGroupId((prev) => (prev === id ? prev : id));
    if (id !== null) {
      selectedMeasurementIdRef.current = null;
      setSelectedMeasurementId(null);
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

  const pointMeasurementIds = useMemo(() => {
    const ids = new Set<string>();
    measurements.forEach((measurement) => {
      if (!isPointMeasurementEntry(measurement)) return;
      ids.add(measurement.id);
    });
    return ids;
  }, [measurements, planarPolygonGroups.length]);

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

  const resolveDistanceRelationSourcePointId = useCallback(
    (targetPointId: string) => {
      const hasChainSource = Boolean(
        doubleClickChainSourcePointId &&
          pointMeasurementIds.has(doubleClickChainSourcePointId)
      );
      if (!hasChainSource) return null;
      return doubleClickChainSourcePointId === targetPointId
        ? null
        : doubleClickChainSourcePointId;
    },
    [doubleClickChainSourcePointId, pointMeasurementIds]
  );

  const handlePointQueryBeforePointCreate = useCallback(() => {
    if (isActiveDrawMode) {
      return true;
    }

    if (selectedPlanarPolygonGroupId) {
      selectPlanarPolygonGroupById(null);
      return false;
    }

    return true;
  }, [
    isActiveDrawMode,
    selectPlanarPolygonGroupById,
    selectedPlanarPolygonGroupId,
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
            ? prev[relationIndex]
            : ({
                id: getDistanceRelationId(sourcePointId, targetPointId),
                pointAId: sourcePointId,
                pointBId: targetPointId,
                anchorPointId: sourcePointId,
                showDirectLine: false,
                showVerticalLine: false,
                showHorizontalLine: false,
                showComponentLines: false,
                labelVisibilityByKind:
                  DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              } satisfies PointDistanceRelation);

        const nextRelation: PointDistanceRelation = {
          ...relation,
          anchorPointId: sourcePointId,
          showDirectLine: true,
          showVerticalLine:
            relation.showVerticalLine ?? relation.showComponentLines ?? false,
          showHorizontalLine:
            relation.showHorizontalLine ?? relation.showComponentLines ?? false,
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
    []
  );

  const syncPolygonEdgeDistanceRelations = useCallback(
    (
      prevRelations: PointDistanceRelation[],
      groups: PlanarPolygonGroup[]
    ): PointDistanceRelation[] => {
      const desiredById = new Map<
        string,
        { groupId: string; pointAId: string; pointBId: string }
      >();

      groups.forEach((group) => {
        if (group.vertexPointIds.length < 2) return;
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
          ...relation,
          pointAId: desired.pointAId,
          pointBId: desired.pointBId,
          anchorPointId: desired.pointAId,
          polygonGroupId: desired.groupId,
          showDirectLine: true,
          showVerticalLine: false,
          showHorizontalLine: false,
          showComponentLines: false,
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
          pointAId: desired.pointAId,
          pointBId: desired.pointBId,
          anchorPointId: desired.pointAId,
          polygonGroupId: desired.groupId,
          showDirectLine: true,
          showVerticalLine: false,
          showHorizontalLine: false,
          showComponentLines: false,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
          },
          directLabelMode: DEFAULT_DIRECT_LINE_LABEL_MODE,
        });
      });

      return next;
    },
    []
  );

  const handlePointQueryPointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      const sourcePointId = resolveDistanceRelationSourcePointId(newPointId);
      if (sourcePointId) {
        upsertDirectDistanceRelation(sourcePointId, newPointId);
      }

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
              vertexPointIds: seedVertexPointIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId:
                seedVertexPointIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
              surfaceType: "roof",
            },
          ];
        }

        const nextVertexPointIds = [...activeGroup.vertexPointIds, newPointId];
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;
        let nextPointPosition = newPointPositionECEF;

        if (nextPlaneLocked && nextPlane) {
          nextPointPosition = projectPointOntoPlane(
            nextPointPosition,
            nextPlane
          );
          projectedPointPosition = nextPointPosition;
          pointById.set(newPointId, nextPointPosition);
        } else if (nextVertexPointIds.length >= 4) {
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

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextVertexPointIds,
          activeGroup.closed,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedData(
          {
            ...activeGroup,
            vertexPointIds: nextVertexPointIds,
            edgeRelationIds: nextEdgeRelationIds,
            planeLocked: nextPlaneLocked,
            plane: nextPlane,
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

      setDoubleClickChainSourcePointId(newPointId);
      if (sourcePointId) {
        setSelectedPlanarPolygonGroupId(nextActiveGroupId);
        selectedMeasurementIdRef.current = null;
        setSelectedMeasurementId(null);
        setPreviousSelectedMeasurementId(null);
      } else {
        selectMeasurementById(newPointId);
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
    ]
  );

  const closeActivePlanarPolygonGroup = useCallback(() => {
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
  }, [activePlanarPolygonGroupId, measurements]);

  const finishActivePlanarPolylineGroup = useCallback(() => {
    if (!activePlanarPolygonGroupId) return;
    const finishedGroupId = activePlanarPolygonGroupId;
    setActivePlanarPolygonGroupId(null);
    setDoubleClickChainSourcePointId(null);
    setSelectedPlanarPolygonGroupId(finishedGroupId);
    selectedMeasurementIdRef.current = null;
    setSelectedMeasurementId(null);
    setPreviousSelectedMeasurementId(null);
    setMoveGizmoPointId(null);
    setMoveGizmoAxisDirection(null);
    setMoveGizmoAxisTitle(null);
    setMoveGizmoAxisCandidates(null);
    setIsMoveGizmoDragging(false);
  }, [activePlanarPolygonGroupId]);

  const handlePointQueryDoubleClick = useCallback(() => {
    // Finish current open line chain without forcing polygon closure.
    finishActivePlanarPolylineGroup();
  }, [finishActivePlanarPolylineGroup]);

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
              vertexPointIds: seedVertexPointIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId:
                seedVertexPointIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
              surfaceType: "roof",
            },
          ];
        }

        const lastVertexId =
          activeGroup.vertexPointIds[activeGroup.vertexPointIds.length - 1] ??
          null;
        if (lastVertexId === existingPointId) {
          return prev;
        }

        const nextVertexPointIds = [
          ...activeGroup.vertexPointIds,
          existingPointId,
        ];
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;

        if (!nextPlaneLocked && nextVertexPointIds.length >= 4) {
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

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextVertexPointIds,
          activeGroup.closed,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedData(
          {
            ...activeGroup,
            vertexPointIds: nextVertexPointIds,
            edgeRelationIds: nextEdgeRelationIds,
            planeLocked: nextPlaneLocked,
            plane: nextPlane,
          },
          pointById
        );
        return prev.map((group) =>
          group.id === activeGroup.id ? updatedGroup : group
        );
      });

      setActivePlanarPolygonGroupId(nextActiveGroupId);
    },
    [activePlanarPolygonGroupId, measurements, planarPolygonGroups]
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
            ? prev[relationIndex]
            : ({
                id: getDistanceRelationId(activePointId, previousPointId),
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
            ? prev[relationIndex]
            : ({
                id: getDistanceRelationId(activePointId, previousPointId),
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

      if (ownerGroupIds.length > 0 && !selectedGroupOwnsRelation) {
        const preferredOwnerGroupId =
          (activePlanarPolygonGroupId &&
          ownerGroupIds.includes(activePlanarPolygonGroupId)
            ? activePlanarPolygonGroupId
            : ownerGroupIds[0]) ?? null;
        selectPlanarPolygonGroupById(preferredOwnerGroupId);
        return;
      }

      // Toggle showComponentLines on all edges in connected polyline
      if (selectedPlanarPolygonGroupId) {
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
              const clickedRelation = prev.find((r) => r.id === relationId);
              const currentValue =
                (clickedRelation?.showVerticalLine ??
                  clickedRelation?.showComponentLines ??
                  false) ||
                (clickedRelation?.showHorizontalLine ??
                  clickedRelation?.showComponentLines ??
                  false);
              const nextValue = !currentValue;
              return prev.map((relation) => {
                if (!allRelationIds.has(relation.id)) return relation;
                return {
                  ...relation,
                  showVerticalLine: nextValue,
                  showHorizontalLine: nextValue,
                  showComponentLines: nextValue,
                  labelVisibilityByKind: {
                    ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
                    ...(relation.labelVisibilityByKind ?? {}),
                  },
                };
              });
            });
            return;
          }
        }
      }

      // Fallback: toggle component lines on the single relation
      setDistanceRelations((prev) => {
        return prev.map((relation) => {
          if (relation.id !== relationId) return relation;
          const currentValue =
            (relation.showVerticalLine ??
              relation.showComponentLines ??
              false) ||
            (relation.showHorizontalLine ??
              relation.showComponentLines ??
              false);
          const nextValue = !currentValue;
          return {
            ...relation,
            showVerticalLine: nextValue,
            showHorizontalLine: nextValue,
            showComponentLines: nextValue,
            labelVisibilityByKind: {
              ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              ...(relation.labelVisibilityByKind ?? {}),
            },
          };
        });
      });
    },
    [
      activePlanarPolygonGroupId,
      planarPolygonGroups,
      polylines,
      selectedPlanarPolygonGroupId,
      selectPlanarPolygonGroupById,
      setDistanceRelations,
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

      // Double click finishes the current line chain.
      setDoubleClickChainSourcePointId(null);
      selectMeasurementById(id);
    },
    [pointMeasurementIds, selectMeasurementById]
  );

  const updatePointMeasurementPositionById = useCallback(
    (id: string, nextPosition: Cartesian3) => {
      const measurementToUpdate = measurements.find(
        (measurement) =>
          isPointMeasurementEntry(measurement) && measurement.id === id
      );
      const shouldSyncReferencePoint = Boolean(
        referencePoint &&
          measurementToUpdate &&
          isPointMeasurementEntry(measurementToUpdate) &&
          Cartesian3.distance(
            measurementToUpdate.geometryECEF,
            referencePoint
          ) <= REFERENCE_POINT_SYNC_EPSILON_METERS
      );
      const geometryWGS84 = getDegreesFromCartesian(nextPosition);

      setMeasurements((prev) => {
        let hasChanged = false;

        const next = prev.map((measurement) => {
          if (!isPointMeasurementEntry(measurement) || measurement.id !== id) {
            return measurement;
          }

          hasChanged = true;
          return {
            ...measurement,
            geometryECEF: nextPosition,
            geometryWGS84: {
              longitude: geometryWGS84.longitude,
              latitude: geometryWGS84.latitude,
              height: geometryWGS84.altitude ?? 0,
            },
          };
        });

        return hasChanged ? next : prev;
      });

      if (shouldSyncReferencePoint) {
        setReferencePoint(nextPosition);
      }
    },
    [measurements, referencePoint, setMeasurements, setReferencePoint]
  );

  const startMoveGizmoForMeasurementId = useCallback(
    (id: string, options?: MoveGizmoStartOptions) => {
      const measurement = measurements.find(
        (entry) => isPointMeasurementEntry(entry) && entry.id === id
      );
      if (!measurement || !isPointMeasurementEntry(measurement)) return;

      const axisDirection = options?.axisDirection ?? null;
      const axisCandidates = options?.axisCandidates?.map((candidate) => ({
        ...candidate,
        direction: Cartesian3.clone(candidate.direction),
      }));
      setSelectedMeasurementId((prev) => (prev === id ? prev : id));
      setMoveGizmoPointId(id);
      setMoveGizmoAxisDirection(axisDirection);
      setMoveGizmoAxisTitle(options?.axisTitle ?? null);
      setMoveGizmoAxisCandidates(axisCandidates ?? null);
      setIsMoveGizmoDragging(false);
    },
    [measurements]
  );

  const stopMoveGizmo = useCallback(() => {
    setMoveGizmoPointId(null);
    setMoveGizmoAxisDirection(null);
    setMoveGizmoAxisTitle(null);
    setMoveGizmoAxisCandidates(null);
    setIsMoveGizmoDragging(false);
  }, []);

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
      // If the point is on the focused polygon/polyline, keep the group selected
      const focusedGroup = focusedPlanarPolygonGroupId
        ? planarPolygonGroups.find((g) => g.id === focusedPlanarPolygonGroupId)
        : null;
      const isOnFocusedGroup =
        focusedGroup && focusedGroup.vertexPointIds.includes(id);
      if (!isOnFocusedGroup) {
        selectMeasurementById(id);
      }
      startMoveGizmoForMeasurementId(id);
    },
    [
      focusedPlanarPolygonGroupId,
      planarPolygonGroups,
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

      if (measurementMode === MeasurementMode.PointQuery) {
        if (!pointMeasurementIds.has(id)) return;
        if (!isActiveDrawMode) {
          runPointLabelClickInteraction({
            pointId: id,
            selectedMeasurementId,
            selectMeasurementById,
            cyclePointLabelMetricModeByMeasurementId,
          });
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
        if (sourcePointId) {
          upsertDirectDistanceRelation(sourcePointId, id);
        }
        appendExistingPointToActivePlanarPolygonGroup(id, sourcePointId);

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
      measurementMode,
      activePlanarPolygonGroupId,
      isActiveDrawMode,
      planarPolygonGroups,
      pointMeasurementIds,
      resolveDistanceRelationSourcePointId,
      closeActivePlanarPolygonGroup,
      setMoveGizmoPointElevationFromMeasurementById,
      selectedMeasurementId,
      selectMeasurementById,
      cyclePointLabelMetricModeByMeasurementId,
      upsertDirectDistanceRelation,
      appendExistingPointToActivePlanarPolygonGroup,
    ]
  );

  // point query hooks
  useCesiumPointQuery(
    scene,
    measurementMode === MeasurementMode.PointQuery &&
      pointQueryEnabled &&
      !moveGizmoPointId &&
      !isMoveGizmoDragging,
    setMeasurements,
    temporaryMode,
    handlePointQueryPointCreated,
    handlePointQueryDoubleClick,
    handlePointQueryBeforePointCreate
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
      if (targetGroup.planeLocked && targetGroup.plane) {
        midpointPosition = projectPointOntoPlane(
          midpointPosition,
          targetGroup.plane
        );
      }

      const nextPointId = `point-${Date.now()}-split`;
      const midpointWGS84 = getDegreesFromCartesian(midpointPosition);
      setMeasurements((prev) => {
        const insertionIndex = prev.filter(isPointMeasurementEntry).length;
        return [
          ...prev,
          {
            type: MeasurementMode.PointQuery,
            id: nextPointId,
            index: insertionIndex,
            name: "Exzenterpunkt",
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
      selectedPlanarPolygonGroupId,
      setDistanceRelations,
      selectPlanarPolygonGroupById,
    ]
  );

  useCesiumPointVisualizer(scene, measurements, {
    showMarkers: showPoints,
    showCesiumMarkers: false,
    showLabels: showPointLabels,
    radius: pointRadius,
    referenceElevation: effectiveReferenceElevation,
    selectedPointId: selectedMeasurementId,
    selectedPlanarPolygonGroupId: showDistanceAndPolygonVisuals
      ? selectedPlanarPolygonGroupId
      : null,
    activePlanarPolygonGroupId: showDistanceAndPolygonVisuals
      ? activePlanarPolygonGroupId
      : null,
    distanceRelations: showDistanceAndPolygonVisuals ? distanceRelations : [],
    planarPolygonGroups: showDistanceAndPolygonVisuals
      ? planarPolygonGroups
      : [],
    onPlanarPolygonClick: handlePlanarPolygonClick,
    pointDragPlaneByPointId,
    onPointPlaneDragStart: handlePointPlaneDragStart,
    onPointPlaneDragPositionChange: updatePointMeasurementPositionById,
    hiddenPointLabelIds: new Set([
      ...polygonOnlyPointIdSet,
      ...unfocusedPolylineEndpointIds,
    ]),
    fullyHiddenPointIds: unfocusedPolylineInteriorIds,
    showSelectedDisc: Boolean(moveGizmoPointId),
    debug: false,
    onPointClick: handlePointLabelClick,
    onPointDoubleClick: handlePointLabelDoubleClick,
    onPointLongPress: handlePointLabelLongPress,
    onDistanceRelationCornerClick: handleDistanceRelationCornerClick,
    onDistanceRelationMidpointClick: handleDistanceRelationMidpointClick,
    pointLongPressDurationMs: POINT_LABEL_LONG_PRESS_DURATION_MS,
    occlusionChecksEnabled,
    labelLayoutConfig: options?.labels,
    distanceToReferenceByPointId: effectiveDistanceToReferenceByPointId,
    pointLabelIndexByPointId: focusedPolylinePointLabelIndexByPointId,
    referenceLabelPointId: focusedPolylineStartPointId,
    polylinePointLabelTextByPointId: focusedPolylinePointLabelTextByPointId,
    onDistanceRelationLineLabelToggle: handleDistanceRelationLineLabelToggle,
    onDistanceRelationLineClick: handleDistanceRelationLineClick,
    distanceLineLabelMinDistancePx: 50,
    cumulativeDistanceByRelationId,
    moveGizmoPointId,
    moveGizmoAxisDirection,
    moveGizmoAxisTitle,
    moveGizmoAxisCandidates,
    moveGizmoMarkerSizeScale: moveGizmoOptions.markerSizeScale ?? 1,
    moveGizmoLabelDistanceScale: moveGizmoOptions.labelDistanceScale ?? 1,
    moveGizmoSnapPlaneDragToGround:
      moveGizmoOptions.snapPlaneDragToGround ?? false,
    moveGizmoShowRotationHandle: moveGizmoOptions.showRotationHandle ?? true,
    moveGizmoIsDragging: isMoveGizmoDragging,
    onMoveGizmoPointPositionChange: updatePointMeasurementPositionById,
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
      setMeasurements((prev) => prev.filter((m) => !ids.includes(m.id)));
      setDistanceRelations((prev) =>
        prev.filter(
          (relation) =>
            !ids.includes(relation.pointAId) && !ids.includes(relation.pointBId)
        )
      );
      setSelectedMeasurementId((prev) =>
        prev && ids.includes(prev) ? null : prev
      );
      setPreviousSelectedMeasurementId((prev) =>
        prev && ids.includes(prev) ? null : prev
      );
      setDoubleClickChainSourcePointId((prev) =>
        prev && ids.includes(prev) ? null : prev
      );
      setMoveGizmoPointId((prev) => (prev && ids.includes(prev) ? null : prev));
      setMoveGizmoAxisDirection((prev) =>
        moveGizmoPointId && ids.includes(moveGizmoPointId) ? null : prev
      );
      setMoveGizmoAxisTitle((prev) =>
        moveGizmoPointId && ids.includes(moveGizmoPointId) ? null : prev
      );
      setMoveGizmoAxisCandidates((prev) =>
        moveGizmoPointId && ids.includes(moveGizmoPointId) ? null : prev
      );
      setIsMoveGizmoDragging(false);

      const remainingPointById = getPointPositionMap(measurements);
      ids.forEach((id) => remainingPointById.delete(id));
      setPlanarPolygonGroups((prev) =>
        prev.flatMap((group) => {
          const nextVertexPointIds = group.vertexPointIds.filter(
            (vertexId) => !ids.includes(vertexId)
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
            !group.vertexPointIds.some((vertexId) => ids.includes(vertexId))
        );
        return hasSelectedPolygonAfterRemoval ? prev : null;
      });
      setActivePlanarPolygonGroupId((prev) => {
        if (!prev) return prev;
        const activeGroup = planarPolygonGroups.find(
          (group) => group.id === prev
        );
        if (!activeGroup) return null;
        return activeGroup.vertexPointIds.some((id) => ids.includes(id))
          ? null
          : prev;
      });
    },
    [measurements, moveGizmoPointId, planarPolygonGroups]
  );

  useEffect(() => {
    const handleDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete") return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isKeyboardTargetEditable(event.target)) return;
      if (!selectedMeasurementId) return;

      const selectedMeasurement = measurements.find(
        (measurement) => measurement.id === selectedMeasurementId
      );
      if (
        !selectedMeasurement ||
        !isPointMeasurementEntry(selectedMeasurement)
      ) {
        return;
      }

      const remainingPointMeasurements = measurements.filter(
        (measurement) =>
          isPointMeasurementEntry(measurement) &&
          measurement.id !== selectedMeasurementId
      );
      const fallbackSelectionId =
        remainingPointMeasurements[remainingPointMeasurements.length - 1]?.id ??
        null;

      event.preventDefault();
      event.stopPropagation();
      clearMeasurementsByIds([selectedMeasurementId]);
      selectMeasurementById(fallbackSelectionId);
    };

    window.addEventListener("keydown", handleDeleteKey, true);
    return () => {
      window.removeEventListener("keydown", handleDeleteKey, true);
    };
  }, [
    clearMeasurementsByIds,
    measurements,
    selectMeasurementById,
    selectedMeasurementId,
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
        prev === MeasurementMode.NONE ? MeasurementMode.PointQuery : prev
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
      selectMeasurementById,
      updateMeasurementNameById,
      selectedPlanarPolygonGroupId,
      activePlanarPolygonGroupId,
      selectPlanarPolygonGroupById,
      updatePlanarPolygonNameById,
      moveGizmoPointId,
      isMoveGizmoDragging,
      startMoveGizmoForMeasurementId,
      stopMoveGizmo,
      setPointMeasurementElevationById,
      setPointMeasurementCoordinatesById,
      clearAllMeasurements,
      clearMeasurementsByIds,
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
      heightOffset,
      setHeightOffset,
      referencePoint,
      setReferencePoint,
      referenceElevation,
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
    }),
    [
      measurementMode,
      setMeasurementMode,
      measurements,
      setMeasurements,
      selectedMeasurementId,
      selectMeasurementById,
      updateMeasurementNameById,
      selectedPlanarPolygonGroupId,
      activePlanarPolygonGroupId,
      selectPlanarPolygonGroupById,
      updatePlanarPolygonNameById,
      moveGizmoPointId,
      isMoveGizmoDragging,
      startMoveGizmoForMeasurementId,
      stopMoveGizmo,
      setPointMeasurementElevationById,
      setPointMeasurementCoordinatesById,
      clearAllMeasurements,
      clearMeasurementsByIds,
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
      heightOffset,
      setHeightOffset,
      referencePoint,
      setReferencePoint,
      referenceElevation,
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
