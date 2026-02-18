import {
  useState,
  useEffect,
  useContext,
  useMemo,
  MouseEvent as ReactMouseEvent,
} from "react";
import {
  Cartesian3,
  Cartesian4,
  Ellipsoid,
  Matrix4,
  Transforms,
  getDegreesFromCartesian,
} from "@carma/cesium";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrashCan,
  faArrowsDownToLine,
  faCheck,
  faPlus,
  faEye,
  faEyeSlash,
  faAnglesLeft,
  faAnglesRight,
} from "@fortawesome/free-solid-svg-icons";
import MeasurementTitle from "./MeasurementTitle";
import { UIContext } from "react-cismap/contexts/UIContextProvider";
import Icon from "react-cismap/commons/Icon";
import "../styles/infoBox.css";
import { InputNumber, Select, Tooltip } from "antd";
import { ResponsiveInfoBox } from "@carma-appframeworks/portals";
import {
  useCesiumMeasurements,
  DEFAULT_POINT_MEASUREMENT_PLACEHOLDER,
  isPointMeasurementEntry,
  getEuclideanDistance,
  getENU,
  formatAreaAdaptive,
  formatNumber,
  isTraverseMeasurementEntry,
  getCustomPointMeasurementName,
} from "@carma-mapping/engines/cesium/measurements";
import { useCesiumContext } from "@carma-mapping/engines/cesium";
import { flyToPointGroup } from "../utils/cesiumFlyTo";
import {
  getConnectedPolygonGroups,
  getDistanceRelationId,
  getDistanceRelationLineVisibilityByKind,
  getElevationInputWidthPx,
  getPolygonGroupAreaSumsByType,
  getPolygonGroupSurfaceTypeLabel,
  getPolygonTiltAndNormalDirection,
  getRoofAverageSlopeDeg,
  getRoofSlopeLabels,
} from "./InfoBoxMeasurement3D.helpers";

const MIN_ELEVATION_STEP_METERS = 0.1;
const MIN_COORDINATE_STEP_DEGREES = 0.000001;
const STEP_DISTANCE_FACTOR = 0.001;
const METERS_PER_DEGREE_LAT = 111320;
const COORDINATE_INPUT_WIDTH_PX = 112;
const MOVE_GIZMO_VERTICAL_AXIS_COLOR = "rgba(59, 130, 246, 0.98)";
const MOVE_GIZMO_HORIZONTAL_PRIMARY_AXIS_COLOR = "rgba(239, 68, 68, 0.98)";
const MOVE_GIZMO_HORIZONTAL_SECONDARY_AXIS_COLOR = "rgba(34, 197, 94, 0.98)";
const MOVE_GIZMO_RELATION_AXIS_COLOR = "rgba(148, 163, 184, 0.98)";
const AXIS_DIRECTION_EPSILON = 1e-8;
const DEFAULT_SIGNIFICANT_DIGITS = 3;
type ElevationEditTarget = "absolute" | "relative";
type DistanceLineVisibilityKind =
  | "direct"
  | "vertical"
  | "horizontal"
  | "components";
type RelationMetricEditKind = "vertical" | "horizontal" | "direct";

type RelationMoveAxisCandidate = {
  id: string;
  direction: Cartesian3;
  color: string;
  title: string;
};
const DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY = {
  direct: true,
  vertical: true,
  horizontal: true,
} as const;

const formatSignificant = (
  value: number,
  significantDigits = DEFAULT_SIGNIFICANT_DIGITS
) => {
  if (!Number.isFinite(value)) return "0";
  const absolute = Math.abs(value);
  if (absolute === 0) return "0";
  const digitsBeforeDecimal = Math.floor(Math.log10(absolute)) + 1;
  const fractionDigits = Math.max(0, significantDigits - digitsBeforeDecimal);
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
};

type PolygonSurfaceTypeOption = "roof" | "facade" | "terrain" | "footprint";

const POLYGON_SURFACE_TYPE_OPTIONS: Array<{
  value: PolygonSurfaceTypeOption;
  label: string;
}> = [
  { value: "roof", label: "Dachfläche" },
  { value: "facade", label: "Fassadenfläche" },
  { value: "terrain", label: "Gelände" },
  { value: "footprint", label: "Grundriss" },
];

const computeHorizontalAreaAtLowestElevation = (
  verticesECEF: Cartesian3[]
): number => {
  if (verticesECEF.length < 3) return 0;

  const ellipsoid = Ellipsoid.WGS84;
  const cartographics = verticesECEF
    .map((vertex) => ellipsoid.cartesianToCartographic(vertex))
    .filter((cartographic): cartographic is NonNullable<typeof cartographic> =>
      Boolean(cartographic)
    );
  if (cartographics.length < 3) return 0;

  let lowestIndex = 0;
  for (let index = 1; index < cartographics.length; index += 1) {
    if (
      (cartographics[index]?.height ?? Number.POSITIVE_INFINITY) <
      (cartographics[lowestIndex]?.height ?? Number.POSITIVE_INFINITY)
    ) {
      lowestIndex = index;
    }
  }

  const lowest = cartographics[lowestIndex];
  if (!lowest) return 0;
  const lowestHeight = lowest.height;
  const anchor = Cartesian3.fromRadians(
    lowest.longitude,
    lowest.latitude,
    lowestHeight
  );
  const enuFrame = Transforms.eastNorthUpToFixedFrame(anchor, ellipsoid);
  const east4 = Matrix4.getColumn(enuFrame, 0, new Cartesian4());
  const north4 = Matrix4.getColumn(enuFrame, 1, new Cartesian4());
  const east = Cartesian3.normalize(
    new Cartesian3(east4.x, east4.y, east4.z),
    new Cartesian3()
  );
  const north = Cartesian3.normalize(
    new Cartesian3(north4.x, north4.y, north4.z),
    new Cartesian3()
  );

  const coords = cartographics.map((cartographic) => {
    const auxiliaryPoint = Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      lowestHeight
    );
    const delta = Cartesian3.subtract(auxiliaryPoint, anchor, new Cartesian3());
    return {
      x: Cartesian3.dot(delta, east),
      y: Cartesian3.dot(delta, north),
    };
  });

  let shoelace = 0;
  for (let index = 0; index < coords.length; index += 1) {
    const current = coords[index];
    const next = coords[(index + 1) % coords.length];
    if (!current || !next) continue;
    shoelace += current.x * next.y - current.y * next.x;
  }
  return Math.abs(shoelace) * 0.5;
};

const stopEventPropagation = (event: React.MouseEvent<HTMLElement>) => {
  event.stopPropagation();
};

const buildRelationMoveAxisCandidates = (
  currentPointEcef: Cartesian3,
  relatedPointEcef: Cartesian3
): RelationMoveAxisCandidate[] => {
  const relatedToCurrentVector = Cartesian3.subtract(
    currentPointEcef,
    relatedPointEcef,
    new Cartesian3()
  );

  const currentPointEnuTransform = Transforms.eastNorthUpToFixedFrame(
    currentPointEcef,
    Ellipsoid.WGS84
  );
  const currentEastAxis = Matrix4.getColumn(
    currentPointEnuTransform,
    0,
    new Cartesian4()
  );
  const currentEastVector = Cartesian3.normalize(
    new Cartesian3(currentEastAxis.x, currentEastAxis.y, currentEastAxis.z),
    new Cartesian3()
  );
  const currentNorthAxis = Matrix4.getColumn(
    currentPointEnuTransform,
    1,
    new Cartesian4()
  );
  const currentNorthVector = Cartesian3.normalize(
    new Cartesian3(currentNorthAxis.x, currentNorthAxis.y, currentNorthAxis.z),
    new Cartesian3()
  );
  const currentUpAxis = Matrix4.getColumn(
    currentPointEnuTransform,
    2,
    new Cartesian4()
  );
  const currentUpVector = Cartesian3.normalize(
    new Cartesian3(currentUpAxis.x, currentUpAxis.y, currentUpAxis.z),
    new Cartesian3()
  );

  const upProjection = Cartesian3.multiplyByScalar(
    currentUpVector,
    Cartesian3.dot(relatedToCurrentVector, currentUpVector),
    new Cartesian3()
  );
  const horizontalProjection = Cartesian3.subtract(
    relatedToCurrentVector,
    upProjection,
    new Cartesian3()
  );
  const horizontalAxisDirection =
    Cartesian3.magnitudeSquared(horizontalProjection) > AXIS_DIRECTION_EPSILON
      ? Cartesian3.normalize(horizontalProjection, new Cartesian3())
      : currentEastVector;

  const orthogonalHorizontalAxisRaw = Cartesian3.cross(
    currentUpVector,
    horizontalAxisDirection,
    new Cartesian3()
  );
  const orthogonalHorizontalAxisDirection =
    Cartesian3.magnitudeSquared(orthogonalHorizontalAxisRaw) >
    AXIS_DIRECTION_EPSILON
      ? Cartesian3.normalize(orthogonalHorizontalAxisRaw, new Cartesian3())
      : currentNorthVector;

  const directAxisDirection =
    Cartesian3.magnitudeSquared(relatedToCurrentVector) > AXIS_DIRECTION_EPSILON
      ? Cartesian3.normalize(relatedToCurrentVector, new Cartesian3())
      : horizontalAxisDirection;

  return [
    {
      id: "vertical",
      direction: currentUpVector,
      color: MOVE_GIZMO_VERTICAL_AXIS_COLOR,
      title: "Punkt entlang der U-Achse verschieben",
    },
    {
      id: "horizontal",
      direction: horizontalAxisDirection,
      color: MOVE_GIZMO_HORIZONTAL_PRIMARY_AXIS_COLOR,
      title: "Punkt entlang der horizontalen Komponente verschieben",
    },
    {
      id: "horizontal-orthogonal",
      direction: orthogonalHorizontalAxisDirection,
      color: MOVE_GIZMO_HORIZONTAL_SECONDARY_AXIS_COLOR,
      title: "Punkt entlang der orthogonalen Horizontalachse verschieben",
    },
    {
      id: "direct",
      direction: directAxisDirection,
      color: MOVE_GIZMO_RELATION_AXIS_COLOR,
      title: "Punkt entlang der direkten Distanz verschieben",
    },
  ];
};

export function InfoBoxMeasurement3D({ pixelWidth = 350 }) {
  const {
    measurements,
    clearMeasurementsByIds,
    setReferencePoint,
    referencePoint,
    selectedMeasurementId,
    selectMeasurementById,
    updateMeasurementNameById,
    distanceRelations,
    setDistanceRelations,
    planarPolygonGroups,
    setPlanarPolygonGroups,
    polylines,
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
  } = useCesiumMeasurements();
  const { getScene } = useCesiumContext();
  const { collapsedInfoBox } = useContext<typeof UIContext>(UIContext);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [prevLen, setPrevLen] = useState(measurements.length);
  const [editStepDistanceMeters, setEditStepDistanceMeters] = useState<
    number | null
  >(null);
  const [isCoordinateEditModeActive, setIsCoordinateEditModeActive] =
    useState(false);
  const [elevationEditTarget, setElevationEditTarget] =
    useState<ElevationEditTarget | null>(null);
  const [relationMetricEdit, setRelationMetricEdit] = useState<{
    relatedPointId: string;
    kind: RelationMetricEditKind;
  } | null>(null);
  const [editedLatitude, setEditedLatitude] = useState<number | null>(null);
  const [editedLongitude, setEditedLongitude] = useState<number | null>(null);

  // Measurements reversed to show newest first
  const visibleMeasurements = [...measurements].reverse();
  const currentMeasurement = visibleMeasurements[currentIndex];
  const pointMeasurements = useMemo(
    () => measurements.filter(isPointMeasurementEntry),
    [measurements]
  );
  const focusedPlanarPolygonGroupId =
    selectedPlanarPolygonGroupId ?? activePlanarPolygonGroupId;
  const selectedConnectedPlanarPolygonGroups = useMemo(
    () =>
      getConnectedPolygonGroups(
        planarPolygonGroups,
        focusedPlanarPolygonGroupId
      ),
    [focusedPlanarPolygonGroupId, planarPolygonGroups]
  );
  const selectedPlanarPolygonGroup = useMemo(() => {
    if (!focusedPlanarPolygonGroupId) return null;
    return (
      selectedConnectedPlanarPolygonGroups.find(
        (group) => group.id === focusedPlanarPolygonGroupId
      ) ?? null
    );
  }, [focusedPlanarPolygonGroupId, selectedConnectedPlanarPolygonGroups]);
  const selectedPolyline = useMemo(() => {
    if (!focusedPlanarPolygonGroupId) return null;
    return (
      polylines.find(
        (polyline) => polyline.id === focusedPlanarPolygonGroupId
      ) ?? null
    );
  }, [focusedPlanarPolygonGroupId, polylines]);
  const selectedPlanarPolygonOrder = useMemo(() => {
    if (selectedConnectedPlanarPolygonGroups.length === 0) return 0;
    const firstConnectedGroup = selectedConnectedPlanarPolygonGroups[0];
    if (!firstConnectedGroup) return 0;
    const index = planarPolygonGroups.findIndex(
      (group) => group.id === firstConnectedGroup.id
    );
    return index >= 0 ? index + 1 : 0;
  }, [planarPolygonGroups, selectedConnectedPlanarPolygonGroups]);
  const {
    totalAreaSquareMeters: selectedConnectedPlanarPolygonTotalAreaSquareMeters,
  } = useMemo(
    () => getPolygonGroupAreaSumsByType(selectedConnectedPlanarPolygonGroups),
    [selectedConnectedPlanarPolygonGroups]
  );
  const selectedConnectedPlanarPolygonSurfaceTypeLabel = useMemo(
    () => getPolygonGroupSurfaceTypeLabel(selectedConnectedPlanarPolygonGroups),
    [selectedConnectedPlanarPolygonGroups]
  );
  const selectedConnectedRoofAverageSlopeDeg = useMemo(
    () => getRoofAverageSlopeDeg(selectedConnectedPlanarPolygonGroups),
    [selectedConnectedPlanarPolygonGroups]
  );
  const selectedConnectedRoofSlopeLabels = useMemo(
    () =>
      getRoofSlopeLabels(
        selectedConnectedPlanarPolygonGroups,
        planarPolygonGroups
      ),
    [planarPolygonGroups, selectedConnectedPlanarPolygonGroups]
  );
  const isCurrentMeasurementFirstNodeOfFocusedGroup = useMemo(() => {
    if (!focusedPlanarPolygonGroupId) return false;
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return false;
    }
    const focusedGroup = planarPolygonGroups.find(
      (group) => group.id === focusedPlanarPolygonGroupId
    );
    if (!focusedGroup) return false;
    return (focusedGroup.vertexPointIds[0] ?? null) === currentMeasurement.id;
  }, [currentMeasurement, focusedPlanarPolygonGroupId, planarPolygonGroups]);
  const isCurrentMeasurementExplicitlySelectedPoint = Boolean(
    currentMeasurement &&
      isPointMeasurementEntry(currentMeasurement) &&
      selectedMeasurementId === currentMeasurement.id
  );
  const hasFocusedPlanarGroup = Boolean(focusedPlanarPolygonGroupId);
  const showPointInfoMode =
    Boolean(
      currentMeasurement && isPointMeasurementEntry(currentMeasurement)
    ) &&
    (!hasFocusedPlanarGroup ||
      (isCurrentMeasurementExplicitlySelectedPoint &&
        (!activePlanarPolygonGroupId ||
          isCurrentMeasurementFirstNodeOfFocusedGroup)));
  const isPolygonInfoMode =
    Boolean(selectedPlanarPolygonGroup) && !showPointInfoMode;
  const selectedPolylineSummary = useMemo(() => {
    if (!selectedPolyline) return null;

    const nodes = selectedPolyline.vertexPointIds
      .map((pointId) =>
        pointMeasurements.find((measurement) => measurement.id === pointId)
      )
      .filter((point): point is (typeof pointMeasurements)[number] =>
        Boolean(point)
      );

    const segmentCount = selectedPolyline.segmentLengthsMeters.length;
    const nodeCount = selectedPolyline.vertexPointIds.length;
    const totalLengthMeters = selectedPolyline.totalLengthMeters;

    const firstHeight = nodes[0]?.geometryWGS84.height ?? null;
    const lastHeight = nodes[nodes.length - 1]?.geometryWGS84.height ?? null;
    const startEndElevationDeltaMeters =
      firstHeight !== null && lastHeight !== null
        ? lastHeight - firstHeight
        : 0;

    let ascentMeters = 0;
    let descentMeters = 0;
    for (let index = 1; index < nodes.length; index += 1) {
      const previousHeight = nodes[index - 1]?.geometryWGS84.height ?? 0;
      const currentHeight = nodes[index]?.geometryWGS84.height ?? 0;
      const delta = currentHeight - previousHeight;
      if (delta > 0) {
        ascentMeters += delta;
      } else if (delta < 0) {
        descentMeters += Math.abs(delta);
      }
    }

    return {
      nodeCount,
      segmentCount,
      totalLengthMeters,
      meanSegmentLengthMeters:
        segmentCount > 0 ? totalLengthMeters / segmentCount : 0,
      totalAbsoluteElevationChangeMeters: ascentMeters + descentMeters,
      startEndElevationDeltaMeters,
      ascentMeters,
      descentMeters,
    };
  }, [pointMeasurements, selectedPolyline]);
  const selectedPolygonCircumferenceSummary = useMemo(() => {
    if (selectedConnectedPlanarPolygonGroups.length === 0) {
      return {
        planarMeters: 0,
        threeDMeters: 0,
      };
    }

    const pointById = new Map(
      pointMeasurements.map((point) => [point.id, point])
    );
    const handledEdgeIds = new Set<string>();
    let planarMeters = 0;
    let threeDMeters = 0;

    selectedConnectedPlanarPolygonGroups.forEach((group) => {
      group.edgeRelationIds.forEach((edgeRelationId) => {
        if (!edgeRelationId || handledEdgeIds.has(edgeRelationId)) return;
        handledEdgeIds.add(edgeRelationId);

        const [prefix, pointAId, pointBId] = edgeRelationId.split(":");
        if (prefix !== "distance-relation" || !pointAId || !pointBId) return;

        const pointA = pointById.get(pointAId);
        const pointB = pointById.get(pointBId);
        if (!pointA || !pointB) return;

        threeDMeters += getEuclideanDistance(
          pointA.geometryECEF,
          pointB.geometryECEF
        );
        const enu = getENU(pointA.geometryECEF, pointB.geometryECEF);
        planarMeters += Math.hypot(enu.east, enu.north);
      });
    });

    return {
      planarMeters,
      threeDMeters,
    };
  }, [pointMeasurements, selectedConnectedPlanarPolygonGroups]);
  const isElevationEditModeActive =
    Boolean(moveGizmoPointId) &&
    isPointMeasurementEntry(currentMeasurement) &&
    moveGizmoPointId === currentMeasurement.id;

  useEffect(() => {
    if (measurements.length !== prevLen) {
      setPrevLen(measurements.length);
      if (measurements.length === 0) {
        setCurrentIndex(0);
        return;
      }
      if (currentIndex >= visibleMeasurements.length) {
        setCurrentIndex(0);
      }
    }
  }, [measurements.length, prevLen, currentIndex, visibleMeasurements.length]);

  useEffect(() => {
    if (!selectedMeasurementId) return;
    const selectedIndex = visibleMeasurements.findIndex(
      (measurement) => measurement.id === selectedMeasurementId
    );
    if (selectedIndex >= 0 && selectedIndex !== currentIndex) {
      setCurrentIndex(selectedIndex);
    }
  }, [selectedMeasurementId, visibleMeasurements, currentIndex]);

  useEffect(() => {
    setIsCoordinateEditModeActive(false);
    setElevationEditTarget(null);
    setRelationMetricEdit(null);
    setEditStepDistanceMeters(null);
    setEditedLatitude(null);
    setEditedLongitude(null);
  }, [currentMeasurement?.id]);

  useEffect(() => {
    if (!isPolygonInfoMode) return;
    setIsCoordinateEditModeActive(false);
    setElevationEditTarget(null);
    setRelationMetricEdit(null);
    setEditStepDistanceMeters(null);
    setEditedLatitude(null);
    setEditedLongitude(null);
  }, [isPolygonInfoMode]);

  useEffect(() => {
    if (
      !currentMeasurement ||
      !isPointMeasurementEntry(currentMeasurement) ||
      (!isElevationEditModeActive && !isCoordinateEditModeActive)
    ) {
      return;
    }

    const scene = getScene();
    if (!scene || scene.isDestroyed()) return;

    const updateDistance = () => {
      const nextDistance = getEuclideanDistance(
        currentMeasurement.geometryECEF,
        scene.camera.position
      );
      if (!Number.isFinite(nextDistance)) return;

      setEditStepDistanceMeters((prev) => {
        if (prev === null || !Number.isFinite(prev)) {
          return nextDistance;
        }
        const threshold = Math.max(0.05, prev * 0.02);
        return Math.abs(nextDistance - prev) > threshold ? nextDistance : prev;
      });
    };

    updateDistance();
    const removeListener = scene.postRender.addEventListener(updateDistance);

    return () => {
      if (removeListener) {
        removeListener();
      }
    };
  }, [
    currentMeasurement,
    getScene,
    isCoordinateEditModeActive,
    isElevationEditModeActive,
  ]);

  useEffect(() => {
    if (measurements.length === 0 && referencePoint) {
      setReferencePoint(null);
    } else if (
      measurements.length === 1 &&
      measurements[0] &&
      isPointMeasurementEntry(measurements[0]) &&
      !referencePoint
    ) {
      setReferencePoint(measurements[0].geometryECEF);
    }
  }, [measurements, referencePoint, setReferencePoint]);

  const decreaseCurrentHandler = () => {
    const newIndex =
      currentIndex <= 0 ? visibleMeasurements.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    const nextMeasurement = visibleMeasurements[newIndex];
    selectMeasurementById(nextMeasurement ? nextMeasurement.id : null);
  };

  const increaseCurrentHandler = () => {
    const newIndex =
      currentIndex >= visibleMeasurements.length - 1 ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
    const nextMeasurement = visibleMeasurements[newIndex];
    selectMeasurementById(nextMeasurement ? nextMeasurement.id : null);
  };

  const deleteShapeHandler = (e) => {
    e.stopPropagation();
    if (currentMeasurement) {
      clearMeasurementsByIds([currentMeasurement.id]);
    }
  };

  const setAsReferenceHandler = (e) => {
    e.stopPropagation();
    if (currentMeasurement && isPointMeasurementEntry(currentMeasurement)) {
      setReferencePoint(currentMeasurement.geometryECEF);
    }
  };

  const getCameraDistanceToCurrentPoint = () => {
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return null;
    }
    const scene = getScene();
    if (!scene || scene.isDestroyed()) return null;

    return getEuclideanDistance(
      currentMeasurement.geometryECEF,
      scene.camera.position
    );
  };

  const startElevationEditMode = (
    target: ElevationEditTarget,
    e?: React.MouseEvent | MouseEvent
  ) => {
    e?.stopPropagation?.();
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    selectMeasurementById(currentMeasurement.id);
    setRelationMetricEdit(null);
    setElevationEditTarget(target);
    setEditStepDistanceMeters(getCameraDistanceToCurrentPoint());
    startMoveGizmoForMeasurementId(currentMeasurement.id);
  };

  const startAbsoluteElevationEditMode = (e?) => {
    startElevationEditMode("absolute", e);
  };

  const startRelativeElevationEditMode = (e?) => {
    startElevationEditMode("relative", e);
  };

  const stopElevationEditMode = (e?) => {
    e?.stopPropagation?.();
    setElevationEditTarget(null);
    setEditStepDistanceMeters(null);
    stopMoveGizmo();
  };

  const handleElevationInputChange = (value: number | null) => {
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    if (elevationEditTarget === "relative") {
      const referenceElevationForCurrentPoint = referencePoint
        ? currentMeasurement.geometryWGS84.height -
          getENU(currentMeasurement.geometryECEF, referencePoint).up
        : currentMeasurement.geometryWGS84.height;
      setPointMeasurementElevationById(
        currentMeasurement.id,
        referenceElevationForCurrentPoint + value
      );
      return;
    }
    setPointMeasurementElevationById(currentMeasurement.id, value);
  };

  const startCoordinateEditMode = (e?) => {
    e?.stopPropagation?.();
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    selectMeasurementById(currentMeasurement.id);
    setRelationMetricEdit(null);
    setEditStepDistanceMeters(getCameraDistanceToCurrentPoint());
    setEditedLatitude(currentMeasurement.geometryWGS84.latitude);
    setEditedLongitude(currentMeasurement.geometryWGS84.longitude);
    setIsCoordinateEditModeActive(true);
  };

  const completeCoordinateEditMode = (e?) => {
    e?.stopPropagation?.();
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    if (editedLatitude === null || editedLongitude === null) {
      return;
    }
    if (!Number.isFinite(editedLatitude) || !Number.isFinite(editedLongitude)) {
      return;
    }
    setPointMeasurementCoordinatesById(
      currentMeasurement.id,
      editedLatitude,
      editedLongitude,
      currentMeasurement.geometryWGS84.height
    );
    setEditStepDistanceMeters(null);
    setIsCoordinateEditModeActive(false);
  };

  const applyCoordinateDraft = (
    latitude: number | null,
    longitude: number | null
  ) => {
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    if (latitude === null || longitude === null) return;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    setPointMeasurementCoordinatesById(
      currentMeasurement.id,
      latitude,
      longitude,
      currentMeasurement.geometryWGS84.height
    );
  };

  useEffect(() => {
    if (
      !isCoordinateEditModeActive &&
      !isElevationEditModeActive &&
      !relationMetricEdit
    ) {
      return;
    }

    const handleWindowEnter = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Enter") return;
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();

      if (isCoordinateEditModeActive) {
        completeCoordinateEditMode(keyboardEvent);
        return;
      }

      if (isElevationEditModeActive) {
        stopElevationEditMode(keyboardEvent);
        return;
      }

      if (relationMetricEdit) {
        stopRelationMetricEditMode(keyboardEvent);
      }
    };

    window.addEventListener("keydown", handleWindowEnter, true);
    return () => {
      window.removeEventListener("keydown", handleWindowEnter, true);
    };
  }, [
    isCoordinateEditModeActive,
    isElevationEditModeActive,
    relationMetricEdit,
    completeCoordinateEditMode,
    stopElevationEditMode,
  ]);

  const handleElevationInputPressEnter = (e?) => {
    e?.stopPropagation?.();
    stopElevationEditMode(e);
  };

  const handleCoordinateInputPressEnter = (e?) => {
    e?.stopPropagation?.();
    completeCoordinateEditMode(e);
  };

  const startRelationMetricEditMode = (
    relatedPointId: string,
    kind: RelationMetricEditKind,
    e?: ReactMouseEvent | MouseEvent
  ) => {
    e?.stopPropagation?.();
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    const relatedPoint = pointMeasurements.find(
      (measurement) => measurement.id === relatedPointId
    );
    if (!relatedPoint) return;
    const axisCandidates = buildRelationMoveAxisCandidates(
      currentMeasurement.geometryECEF,
      relatedPoint.geometryECEF
    );
    const activeAxisCandidate =
      axisCandidates.find((candidate) => candidate.id === kind) ??
      axisCandidates[0];

    selectMeasurementById(currentMeasurement.id);
    setElevationEditTarget(null);
    setIsCoordinateEditModeActive(false);
    setEditStepDistanceMeters(getCameraDistanceToCurrentPoint());
    startMoveGizmoForMeasurementId(currentMeasurement.id, {
      axisDirection: activeAxisCandidate.direction,
      axisTitle: activeAxisCandidate.title,
      axisCandidates: axisCandidates.map((candidate) => ({
        ...candidate,
        direction: Cartesian3.clone(candidate.direction),
      })),
    });
    setRelationMetricEdit({ relatedPointId, kind });
  };

  useEffect(() => {
    if (isMoveGizmoDragging) return;
    if (!relationMetricEdit) return;
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }

    const relatedPoint = pointMeasurements.find(
      (measurement) => measurement.id === relationMetricEdit.relatedPointId
    );
    if (!relatedPoint) return;

    const axisCandidates = buildRelationMoveAxisCandidates(
      currentMeasurement.geometryECEF,
      relatedPoint.geometryECEF
    );
    const activeAxisCandidate =
      axisCandidates.find(
        (candidate) => candidate.id === relationMetricEdit.kind
      ) ?? axisCandidates[0];
    if (!activeAxisCandidate) return;

    startMoveGizmoForMeasurementId(currentMeasurement.id, {
      axisDirection: activeAxisCandidate.direction,
      axisTitle: activeAxisCandidate.title,
      axisCandidates: axisCandidates.map((candidate) => ({
        ...candidate,
        direction: Cartesian3.clone(candidate.direction),
      })),
    });
  }, [
    currentMeasurement,
    isMoveGizmoDragging,
    pointMeasurements,
    relationMetricEdit,
    startMoveGizmoForMeasurementId,
  ]);

  const stopRelationMetricEditMode = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    setRelationMetricEdit(null);
    setEditStepDistanceMeters(null);
    stopMoveGizmo();
  };

  const setCurrentPointByRelationMetric = (
    relatedPointId: string,
    kind: RelationMetricEditKind,
    value: number
  ) => {
    if (!Number.isFinite(value)) return;
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }

    const relatedPoint = pointMeasurements.find(
      (measurement) => measurement.id === relatedPointId
    );
    if (!relatedPoint) return;

    const currentEnu = getENU(
      currentMeasurement.geometryECEF,
      relatedPoint.geometryECEF
    );

    if (kind === "vertical") {
      const relationReferenceElevation =
        currentMeasurement.geometryWGS84.height - currentEnu.up;
      setPointMeasurementElevationById(
        currentMeasurement.id,
        relationReferenceElevation + value
      );
      return;
    }

    let nextEast = currentEnu.east;
    let nextNorth = currentEnu.north;
    let nextUp = currentEnu.up;

    if (kind === "horizontal") {
      const targetHorizontal = Math.max(0, value);
      const currentHorizontal = Math.hypot(currentEnu.east, currentEnu.north);
      const directionEast =
        currentHorizontal > 1e-9 ? currentEnu.east / currentHorizontal : 1;
      const directionNorth =
        currentHorizontal > 1e-9 ? currentEnu.north / currentHorizontal : 0;

      nextEast = directionEast * targetHorizontal;
      nextNorth = directionNorth * targetHorizontal;
    } else {
      const targetDistance = Math.max(0, value);
      const currentDistance = Math.hypot(
        currentEnu.east,
        currentEnu.north,
        currentEnu.up
      );
      const directionEast =
        currentDistance > 1e-9 ? currentEnu.east / currentDistance : 0;
      const directionNorth =
        currentDistance > 1e-9 ? currentEnu.north / currentDistance : 0;
      const directionUp =
        currentDistance > 1e-9 ? currentEnu.up / currentDistance : 1;

      nextEast = directionEast * targetDistance;
      nextNorth = directionNorth * targetDistance;
      nextUp = directionUp * targetDistance;
    }

    const enuTransform = Transforms.eastNorthUpToFixedFrame(
      relatedPoint.geometryECEF,
      Ellipsoid.WGS84
    );
    const nextPositionEcef = Matrix4.multiplyByPoint(
      enuTransform,
      new Cartesian3(nextEast, nextNorth, nextUp),
      new Cartesian3()
    );
    const nextWgs84 = getDegreesFromCartesian(nextPositionEcef);
    if (
      !Number.isFinite(nextWgs84.latitude) ||
      !Number.isFinite(nextWgs84.longitude)
    ) {
      return;
    }

    setPointMeasurementCoordinatesById(
      currentMeasurement.id,
      nextWgs84.latitude,
      nextWgs84.longitude,
      nextWgs84.altitude ?? currentMeasurement.geometryWGS84.height
    );
  };

  const handleRelationMetricValueChange = (
    relatedPointId: string,
    kind: RelationMetricEditKind,
    value: number | null
  ) => {
    if (value === null || !Number.isFinite(value)) return;
    setCurrentPointByRelationMetric(relatedPointId, kind, value);
  };

  const handleRelationMetricInputPressEnter = (e?) => {
    e?.stopPropagation?.();
    stopRelationMetricEditMode(e);
  };

  const inputStepConfig = useMemo(() => {
    const distanceMeters = Number.isFinite(editStepDistanceMeters)
      ? Math.max(editStepDistanceMeters as number, 0)
      : 0;
    const elevationStep = Math.max(
      MIN_ELEVATION_STEP_METERS,
      distanceMeters * STEP_DISTANCE_FACTOR
    );
    const latitudeStep = Math.max(
      MIN_COORDINATE_STEP_DEGREES,
      elevationStep / METERS_PER_DEGREE_LAT
    );

    const latitudeForMetersPerLonDegree =
      currentMeasurement && isPointMeasurementEntry(currentMeasurement)
        ? currentMeasurement.geometryWGS84.latitude
        : 0;
    const metersPerDegreeLongitude = Math.max(
      METERS_PER_DEGREE_LAT *
        Math.cos((Math.abs(latitudeForMetersPerLonDegree) * Math.PI) / 180),
      1
    );
    const longitudeStep = Math.max(
      MIN_COORDINATE_STEP_DEGREES,
      elevationStep / metersPerDegreeLongitude
    );

    return {
      elevationStep,
      latitudeStep,
      longitudeStep,
    };
  }, [editStepDistanceMeters, currentMeasurement]);

  const relationMetricInputSharedProps = {
    onClick: stopEventPropagation,
    step: inputStepConfig.elevationStep,
    precision: 2,
    controls: true,
    changeOnWheel: true,
    onPressEnter: handleRelationMetricInputPressEnter,
    decimalSeparator: ",",
    size: "small" as const,
    className: "measurement-elevation-input",
  };

  const elevationInputSharedProps = {
    onClick: stopEventPropagation,
    step: inputStepConfig.elevationStep,
    precision: 2,
    controls: true,
    changeOnWheel: true,
    onPressEnter: handleElevationInputPressEnter,
    decimalSeparator: ",",
    size: "small" as const,
    className: "measurement-elevation-input",
  };

  const flyToMeasurement = () => {
    const scene = getScene();
    if (!currentMeasurement) return;
    if (isPointMeasurementEntry(currentMeasurement)) {
      flyToPointGroup(scene, [currentMeasurement.geometryECEF]);
    } else if (isTraverseMeasurementEntry(currentMeasurement)) {
      flyToPointGroup(scene, currentMeasurement.geometryECEF);
    }
  };

  const flyToAllMeasurements = () => {
    const scene = getScene();
    if (measurements.length === 0) return;
    const points = measurements.flatMap((measurement) => {
      if (isPointMeasurementEntry(measurement)) {
        return [measurement.geometryECEF];
      }
      if (isTraverseMeasurementEntry(measurement)) {
        return measurement.geometryECEF;
      }
      return [];
    });
    flyToPointGroup(scene, points);
  };

  const infoBoxHeaderColor = "#3b82f6";

  const formatCoordinate = (val, isLat) => {
    const str = Math.abs(val).toLocaleString("de-DE", {
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    });
    const suffix = isLat ? (val >= 0 ? "N" : "S") : val >= 0 ? "O" : "W";
    return `${str}° ${suffix}`;
  };

  const isSingleMeasurement = measurements.length === 1;
  const isAbsoluteElevationEditActive =
    isElevationEditModeActive && elevationEditTarget === "absolute";
  const isRelativeElevationEditActive =
    isElevationEditModeActive && elevationEditTarget === "relative";
  const coordinateEditValues =
    currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? {
          latitude: editedLatitude ?? currentMeasurement.geometryWGS84.latitude,
          longitude:
            editedLongitude ?? currentMeasurement.geometryWGS84.longitude,
          latitudeHemisphere:
            (editedLatitude ?? currentMeasurement.geometryWGS84.latitude) >= 0
              ? "N"
              : "S",
          longitudeHemisphere:
            (editedLongitude ?? currentMeasurement.geometryWGS84.longitude) >= 0
              ? "O"
              : "W",
        }
      : null;
  let isReference = false;

  const handleMeasurementNameUpdate = (
    measurementId: string | number,
    name: string
  ) => {
    if (typeof measurementId !== "string") return;
    updateMeasurementNameById(measurementId, name);
  };

  const handlePolygonNameUpdate = (
    polygonGroupId: string | number,
    name: string
  ) => {
    if (typeof polygonGroupId !== "string") return;
    updatePlanarPolygonNameById(polygonGroupId, name);
  };

  const flyToSelectedPolygon = () => {
    if (!selectedPlanarPolygonGroup) return;
    const scene = getScene();
    const pointIds = new Set<string>();
    selectedConnectedPlanarPolygonGroups.forEach((group) => {
      group.vertexPointIds.forEach((pointId) => pointIds.add(pointId));
    });
    const polygonPoints = Array.from(pointIds).flatMap((pointId) => {
      const pointMeasurement = pointMeasurements.find(
        (measurement) => measurement.id === pointId
      );
      return pointMeasurement ? [pointMeasurement.geometryECEF] : [];
    });

    if (polygonPoints.length === 0) return;
    flyToPointGroup(scene, polygonPoints);
  };

  const deleteSelectedPolygon = (e?: ReactMouseEvent | MouseEvent) => {
    e?.stopPropagation?.();
    if (!selectedPlanarPolygonGroup) return;
    const deletedGroupId = selectedPlanarPolygonGroup.id;
    const deletedVertexPointIds = new Set(
      selectedPlanarPolygonGroup.vertexPointIds
    );

    const remainingPolygonGroups = planarPolygonGroups.filter(
      (group) => group.id !== deletedGroupId
    );
    const remainingPolygonVertexIds = new Set<string>();
    remainingPolygonGroups.forEach((group) => {
      group.vertexPointIds.forEach((pointId) => {
        remainingPolygonVertexIds.add(pointId);
      });
    });

    const remainingRelations = distanceRelations.filter(
      (relation) => relation.polygonGroupId !== deletedGroupId
    );
    const remainingRelationPointIds = new Set<string>();
    remainingRelations.forEach((relation) => {
      remainingRelationPointIds.add(relation.pointAId);
      remainingRelationPointIds.add(relation.pointBId);
    });

    const orphanPointIdsToDelete = Array.from(deletedVertexPointIds).filter(
      (pointId) =>
        !remainingPolygonVertexIds.has(pointId) &&
        !remainingRelationPointIds.has(pointId)
    );

    setPlanarPolygonGroups(remainingPolygonGroups);
    if (orphanPointIdsToDelete.length > 0) {
      clearMeasurementsByIds(orphanPointIdsToDelete);
    }
    selectPlanarPolygonGroupById(null);
  };

  const referencePointMeasurementId = useMemo(() => {
    if (!referencePoint) return null;
    const referenceMeasurement = pointMeasurements.find(
      (measurement) =>
        getEuclideanDistance(measurement.geometryECEF, referencePoint) <= 0.001
    );
    return referenceMeasurement?.id ?? null;
  }, [pointMeasurements, referencePoint]);

  const removeDistanceRelationById = (
    relationId: string,
    e?: ReactMouseEvent | MouseEvent
  ) => {
    e?.stopPropagation?.();
    setDistanceRelations((prev) =>
      prev.filter((relation) => relation.id !== relationId)
    );
  };

  const addDistanceRelationForCurrentPoint = (
    relatedPointId: string,
    e?: ReactMouseEvent | MouseEvent
  ) => {
    e?.stopPropagation?.();
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }

    const currentPointId = currentMeasurement.id;
    if (!relatedPointId || relatedPointId === currentPointId) return;

    setDistanceRelations((prev) => {
      const existingIndex = prev.findIndex(
        (relation) =>
          (relation.pointAId === currentPointId &&
            relation.pointBId === relatedPointId) ||
          (relation.pointAId === relatedPointId &&
            relation.pointBId === currentPointId)
      );

      if (existingIndex >= 0) return prev;

      return [
        ...prev,
        {
          id: getDistanceRelationId(currentPointId, relatedPointId),
          pointAId: currentPointId,
          pointBId: relatedPointId,
          anchorPointId: currentPointId,
          showDirectLine: true,
          showVerticalLine: false,
          showHorizontalLine: false,
          showComponentLines: false,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
          },
        },
      ];
    });
  };

  const toggleDistanceRelationLineVisibilityByKind = (
    relationId: string,
    kind: DistanceLineVisibilityKind,
    e?: ReactMouseEvent | MouseEvent
  ) => {
    e?.stopPropagation?.();
    if (!relationId) return;

    setDistanceRelations((prev) =>
      prev.map((relation) => {
        if (relation.id !== relationId) return relation;
        const currentVisibility =
          getDistanceRelationLineVisibilityByKind(relation);

        const nextVisibility =
          kind === "direct"
            ? {
                ...currentVisibility,
                direct: !currentVisibility.direct,
              }
            : kind === "components"
            ? {
                ...currentVisibility,
                vertical:
                  !currentVisibility.vertical || !currentVisibility.horizontal,
                horizontal:
                  !currentVisibility.vertical || !currentVisibility.horizontal,
              }
            : kind === "vertical"
            ? {
                ...currentVisibility,
                vertical: !currentVisibility.vertical,
              }
            : {
                ...currentVisibility,
                horizontal: !currentVisibility.horizontal,
              };

        return {
          ...relation,
          showDirectLine: nextVisibility.direct,
          showVerticalLine: nextVisibility.vertical,
          showHorizontalLine: nextVisibility.horizontal,
          showComponentLines:
            nextVisibility.vertical || nextVisibility.horizontal,
        };
      })
    );
  };

  if (currentMeasurement && isPointMeasurementEntry(currentMeasurement)) {
    if (isSingleMeasurement) {
      isReference = true;
    } else if (referencePoint) {
      const dist = getEuclideanDistance(
        currentMeasurement.geometryECEF,
        referencePoint
      );
      if (dist <= 0.001) {
        isReference = true;
      }
    }
  }

  const absoluteElevationInputWidthPx =
    currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? getElevationInputWidthPx(currentMeasurement.geometryWGS84.height)
      : getElevationInputWidthPx(null);
  const relativeElevationValue =
    currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? referencePoint
        ? getENU(currentMeasurement.geometryECEF, referencePoint).up
        : 0
      : 0;
  const relativeElevationInputWidthPx = getElevationInputWidthPx(
    relativeElevationValue
  );
  const pointRelationRows = useMemo(() => {
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return [];
    }

    const currentPointId = currentMeasurement.id;
    const rows = distanceRelations
      .map((relation) => {
        if (
          relation.pointAId !== currentPointId &&
          relation.pointBId !== currentPointId
        ) {
          return null;
        }

        const relatedPointId =
          relation.pointAId === currentPointId
            ? relation.pointBId
            : relation.pointAId;
        const relatedPoint = pointMeasurements.find(
          (measurement) => measurement.id === relatedPointId
        );
        if (!relatedPoint) return null;

        const relatedPointIndex = pointMeasurements.findIndex(
          (measurement) => measurement.id === relatedPointId
        );
        const relatedPointLabel =
          getCustomPointMeasurementName(relatedPoint.name) ??
          `${relatedPointIndex + 1}`;
        const enu = getENU(
          currentMeasurement.geometryECEF,
          relatedPoint.geometryECEF
        );
        const horizontalDistance = Math.hypot(enu.east, enu.north);

        return {
          relationId: relation.id,
          relatedPointId,
          label: relatedPointLabel,
          isReference: relatedPointId === referencePointMeasurementId,
          isImplicitReferenceRow: false,
          elevation: enu.up,
          distance: getEuclideanDistance(
            currentMeasurement.geometryECEF,
            relatedPoint.geometryECEF
          ),
          horizontalDistance,
          lineVisibility: getDistanceRelationLineVisibilityByKind(relation),
        };
      })
      .filter(
        (
          row
        ): row is {
          relationId: string;
          relatedPointId: string;
          label: string;
          isReference: boolean;
          isImplicitReferenceRow: boolean;
          elevation: number;
          distance: number;
          horizontalDistance: number;
          lineVisibility: {
            direct: boolean;
            vertical: boolean;
            horizontal: boolean;
          };
        } => Boolean(row)
      );

    if (
      rows.length > 0 &&
      referencePointMeasurementId &&
      referencePointMeasurementId !== currentPointId &&
      !rows.some((row) => row.relatedPointId === referencePointMeasurementId)
    ) {
      const referenceMeasurement = pointMeasurements.find(
        (measurement) => measurement.id === referencePointMeasurementId
      );
      if (referenceMeasurement) {
        const referenceMeasurementIndex = pointMeasurements.findIndex(
          (measurement) => measurement.id === referencePointMeasurementId
        );
        const referencePointLabel =
          getCustomPointMeasurementName(referenceMeasurement.name) ??
          `${referenceMeasurementIndex + 1}`;
        const enu = getENU(
          currentMeasurement.geometryECEF,
          referenceMeasurement.geometryECEF
        );
        rows.push({
          relationId: "",
          relatedPointId: referencePointMeasurementId,
          label: referencePointLabel,
          isReference: true,
          isImplicitReferenceRow: true,
          elevation: enu.up,
          distance: getEuclideanDistance(
            currentMeasurement.geometryECEF,
            referenceMeasurement.geometryECEF
          ),
          horizontalDistance: Math.hypot(enu.east, enu.north),
          lineVisibility: {
            direct: false,
            vertical: false,
            horizontal: false,
          },
        });
      }
    }

    return rows.sort((left, right) => {
      if (left.isImplicitReferenceRow !== right.isImplicitReferenceRow) {
        return left.isImplicitReferenceRow ? 1 : -1;
      }
      if (left.isReference !== right.isReference) {
        return left.isReference ? 1 : -1;
      }
      return left.label.localeCompare(right.label, "de");
    });
  }, [
    currentMeasurement,
    distanceRelations,
    pointMeasurements,
    referencePointMeasurementId,
  ]);

  const selectedPolygonVertexLabels = useMemo(() => {
    if (selectedConnectedPlanarPolygonGroups.length === 0) return [];
    const vertexPointIds = new Set<string>();
    selectedConnectedPlanarPolygonGroups.forEach((group) => {
      group.vertexPointIds.forEach((pointId) => vertexPointIds.add(pointId));
    });
    return Array.from(vertexPointIds).map((pointId) => {
      const point = pointMeasurements.find(
        (measurement) => measurement.id === pointId
      );
      if (!point) return pointId;
      const pointIndex = pointMeasurements.findIndex(
        (measurement) => measurement.id === pointId
      );
      return getCustomPointMeasurementName(point.name) ?? `${pointIndex + 1}`;
    });
  }, [pointMeasurements, selectedConnectedPlanarPolygonGroups]);

  const selectedPolygonSurfaceTypeLabel =
    selectedConnectedPlanarPolygonSurfaceTypeLabel;
  const selectedPolygonSurfaceTypeValue: PolygonSurfaceTypeOption = useMemo(
    () =>
      (selectedPlanarPolygonGroup?.surfaceType as PolygonSurfaceTypeOption) ??
      "roof",
    [selectedPlanarPolygonGroup?.surfaceType]
  );
  const selectedPolygonTiltInfo = useMemo(
    () => getPolygonTiltAndNormalDirection(selectedPlanarPolygonGroup?.plane),
    [selectedPlanarPolygonGroup?.plane]
  );
  const selectedPolygonHorizontalAreaSquareMeters = useMemo(() => {
    if (selectedConnectedPlanarPolygonGroups.length === 0) return 0;
    const pointById = new Map(
      pointMeasurements.map((point) => [point.id, point])
    );
    return selectedConnectedPlanarPolygonGroups.reduce((sum, group) => {
      const vertices = group.vertexPointIds
        .map((pointId) => pointById.get(pointId)?.geometryECEF)
        .filter((point): point is Cartesian3 => Boolean(point));
      return sum + computeHorizontalAreaAtLowestElevation(vertices);
    }, 0);
  }, [pointMeasurements, selectedConnectedPlanarPolygonGroups]);
  const showSurfaceAreaForType =
    selectedPolygonSurfaceTypeValue !== "footprint";
  const showHorizontalAreaForType =
    selectedPolygonSurfaceTypeValue === "terrain" ||
    selectedPolygonSurfaceTypeValue === "footprint" ||
    selectedPolygonSurfaceTypeValue === "roof";
  const selectedPolygonPrimaryAreaSquareMeters = showSurfaceAreaForType
    ? selectedConnectedPlanarPolygonTotalAreaSquareMeters
    : selectedPolygonHorizontalAreaSquareMeters;

  const updateSelectedPolygonSurfaceType = (
    nextType: PolygonSurfaceTypeOption
  ) => {
    if (!selectedPlanarPolygonGroup) return;
    setPlanarPolygonGroups((prev) =>
      prev.map((group) =>
        group.id === selectedPlanarPolygonGroup.id
          ? { ...group, surfaceType: nextType }
          : group
      )
    );
  };

  const isReferencePointWithoutEdges =
    Boolean(currentMeasurement) &&
    isPointMeasurementEntry(currentMeasurement) &&
    isReference &&
    pointRelationRows.length === 0;

  return (
    <div>
      <ResponsiveInfoBox
        pixelwidth={pixelWidth}
        panelClick={() => {}}
        isCollapsible={!!currentMeasurement || isPolygonInfoMode}
        header={
          <div
            className="w-full pl-1 pr-2 flex items-center justify-between"
            style={{ backgroundColor: infoBoxHeaderColor }}
          >
            <span>3D Messungen</span>
          </div>
        }
        alwaysVisibleDiv={
          isPolygonInfoMode ? (
            <div className="mt-1 mb-0 w-full px-2">
              <div className="flex justify-between items-start gap-2">
                <span
                  style={{ cursor: "default" }}
                  className="font-bold flex-1 min-w-0"
                >
                  <MeasurementTitle
                    key={selectedPlanarPolygonGroup.id}
                    order={selectedPlanarPolygonOrder}
                    title={selectedPlanarPolygonGroup.name ?? ""}
                    shapeId={selectedPlanarPolygonGroup.id}
                    setUpdateMeasurementStatus={() => {}}
                    updateTitleMeasurementById={handlePolygonNameUpdate}
                    isCollapsed={collapsedInfoBox}
                    placeholderText={`Polygonzug #${
                      selectedPlanarPolygonOrder || 1
                    }`}
                    clearPlaceholderOnFocus
                    showOrder={false}
                    collapsedContent={formatAreaAdaptive(
                      selectedPolygonPrimaryAreaSquareMeters
                    )}
                    editable={true}
                    capitalize={false}
                    multiline={true}
                  />
                </span>
                <div className="flex justify-end items-center shrink-0 mt-0 gap-2">
                  <Tooltip title="Zum Polygon fliegen">
                    <Icon
                      name="search-location"
                      onClick={(event) => {
                        event.stopPropagation();
                        flyToSelectedPolygon();
                      }}
                      className="cursor-pointer text-[16px] text-[#808080] hover:text-[#a0a0a0]"
                      data-test-id="flyto-polygon-btn"
                    />
                  </Tooltip>
                  <Tooltip title="Polygon löschen">
                    <FontAwesomeIcon
                      onClick={deleteSelectedPolygon}
                      className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                      icon={faTrashCan}
                      data-test-id="delete-polygon-btn"
                    />
                  </Tooltip>
                </div>
              </div>
              <div className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-2 whitespace-nowrap">
                {selectedPolylineSummary ? (
                  <span>
                    Polygonzug •{" "}
                    {formatNumber(selectedPolylineSummary.totalLengthMeters)} m
                    • Höhendifferenz:{" "}
                    {formatNumber(
                      Math.abs(
                        selectedPolylineSummary.startEndElevationDeltaMeters
                      )
                    )}{" "}
                    m
                  </span>
                ) : (
                  <span>
                    {selectedPolygonSurfaceTypeLabel} •{" "}
                    {formatAreaAdaptive(selectedPolygonPrimaryAreaSquareMeters)}
                  </span>
                )}
              </div>
            </div>
          ) : currentMeasurement ? (
            <div className="mt-1 mb-0 w-full px-2">
              <div className="flex justify-between items-start gap-2">
                <span
                  style={{ cursor: "default" }}
                  className={`font-bold flex-1 min-w-0 ${
                    isReference ? "italic" : ""
                  }`}
                >
                  <MeasurementTitle
                    key={currentMeasurement.id}
                    order={visibleMeasurements.length - currentIndex}
                    title={
                      getCustomPointMeasurementName(currentMeasurement.name) ||
                      ""
                    }
                    shapeId={currentMeasurement.id}
                    setUpdateMeasurementStatus={() => {}}
                    updateTitleMeasurementById={handleMeasurementNameUpdate}
                    isCollapsed={collapsedInfoBox}
                    placeholderText={`${DEFAULT_POINT_MEASUREMENT_PLACEHOLDER} #${
                      visibleMeasurements.length - currentIndex
                    }`}
                    clearPlaceholderOnFocus
                    showOrder={false}
                    collapsedContent={
                      isPointMeasurementEntry(currentMeasurement)
                        ? `NHN ${formatNumber(
                            currentMeasurement.geometryWGS84.height
                          )} m`
                        : ""
                    }
                    editable={true}
                    capitalize={false}
                    multiline={true}
                  />
                </span>
                <div className="flex justify-end items-center shrink-0 mt-0 gap-2">
                  <Tooltip title="Zur Messung fliegen">
                    <Icon
                      name="search-location"
                      onClick={(event) => {
                        event.stopPropagation();
                        flyToMeasurement();
                      }}
                      className="cursor-pointer text-[16px] text-[#808080] hover:text-[#a0a0a0]"
                      data-test-id="flyto-measurement-btn"
                    />
                  </Tooltip>
                  {!isReference && (
                    <Tooltip title="Als Referenzhöhe setzen">
                      <FontAwesomeIcon
                        onClick={setAsReferenceHandler}
                        className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                        icon={faArrowsDownToLine}
                        data-test-id="set-reference-btn"
                      />
                    </Tooltip>
                  )}
                  <Tooltip title="Löschen">
                    <FontAwesomeIcon
                      onClick={deleteShapeHandler}
                      className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                      icon={faTrashCan}
                      data-test-id="delete-measurement-btn"
                    />
                  </Tooltip>
                </div>
              </div>
              {isPointMeasurementEntry(currentMeasurement) &&
                (isCoordinateEditModeActive ? (
                  <div
                    className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="inline-flex items-center gap-1">
                      <InputNumber
                        value={coordinateEditValues?.latitude}
                        onChange={(value) => {
                          const nextLatitude =
                            typeof value === "number" ? value : null;
                          setEditedLatitude(nextLatitude);
                          applyCoordinateDraft(
                            nextLatitude,
                            coordinateEditValues?.longitude ?? null
                          );
                        }}
                        step={inputStepConfig.latitudeStep}
                        precision={6}
                        min={-90}
                        max={90}
                        controls
                        changeOnWheel
                        onPressEnter={handleCoordinateInputPressEnter}
                        style={{ width: COORDINATE_INPUT_WIDTH_PX }}
                        data-test-id="latitude-edit-input"
                      />
                      <span className="text-[9px] uppercase tracking-wide text-gray-500">
                        Lat °{coordinateEditValues?.latitudeHemisphere ?? "N"}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <InputNumber
                        value={coordinateEditValues?.longitude}
                        onChange={(value) => {
                          const nextLongitude =
                            typeof value === "number" ? value : null;
                          setEditedLongitude(nextLongitude);
                          applyCoordinateDraft(
                            coordinateEditValues?.latitude ?? null,
                            nextLongitude
                          );
                        }}
                        step={inputStepConfig.longitudeStep}
                        precision={6}
                        min={-180}
                        max={180}
                        controls
                        changeOnWheel
                        onPressEnter={handleCoordinateInputPressEnter}
                        style={{ width: COORDINATE_INPUT_WIDTH_PX }}
                        data-test-id="longitude-edit-input"
                      />
                      <span className="text-[9px] uppercase tracking-wide text-gray-500">
                        Lon °{coordinateEditValues?.longitudeHemisphere ?? "O"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={completeCoordinateEditMode}
                      className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                      data-test-id="coordinates-edit-complete-btn"
                      aria-label="Koordinatenbearbeitung abschließen"
                    >
                      <FontAwesomeIcon icon={faCheck} />
                    </button>
                  </div>
                ) : (
                  <div
                    className="w-full text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-2 whitespace-nowrap"
                    data-test-id="coordinates-display-btn"
                  >
                    <button
                      type="button"
                      onClick={startCoordinateEditMode}
                      className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left text-[10px] font-normal text-gray-500 whitespace-nowrap"
                    >
                      {formatCoordinate(
                        currentMeasurement.geometryWGS84.latitude,
                        true
                      )}{" "}
                      {formatCoordinate(
                        currentMeasurement.geometryWGS84.longitude,
                        false
                      )}
                    </button>
                    {isAbsoluteElevationEditActive ? (
                      <span
                        className="inline-flex items-center gap-1"
                        onClick={stopEventPropagation}
                      >
                        <InputNumber
                          value={currentMeasurement.geometryWGS84.height}
                          onChange={handleElevationInputChange}
                          {...elevationInputSharedProps}
                          style={{
                            width: absoluteElevationInputWidthPx,
                          }}
                          data-test-id="elevation-edit-input"
                        />
                        <button
                          type="button"
                          onClick={stopElevationEditMode}
                          className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                          data-test-id="elevation-edit-complete-btn"
                          aria-label="Höhenbearbeitung abschließen"
                        >
                          <FontAwesomeIcon icon={faCheck} />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={startAbsoluteElevationEditMode}
                        className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left text-[10px] font-normal text-gray-500 whitespace-nowrap"
                        data-test-id="elevation-display-btn"
                      >
                        {formatNumber(currentMeasurement.geometryWGS84.height)}{" "}
                        m ü. NHN
                        {isReference ? " ist Bezugshöhe" : ""}
                      </button>
                    )}
                  </div>
                ))}
            </div>
          ) : (
            <div
              className="mt-2 w-[90%] p-2"
              data-test-id="empty-measurement-info"
            >
              <p className="text-[#212529] font-normal text-xs leading-normal">
                Für Punktmessungen auf das Stadtmodell klicken. Die erste
                Messung definiert die Referenzhöhe.
              </p>
            </div>
          )
        }
        collapsibleDiv={
          isPolygonInfoMode ? (
            <div className="text-[12px] mb-0">
              <div className="mt-1 text-sm pl-2 pr-1">
                {selectedPolylineSummary ? (
                  <>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">Gesamtlänge:</span>
                      <span className="tabular-nums">
                        {formatNumber(
                          selectedPolylineSummary.totalLengthMeters
                        )}{" "}
                        m
                      </span>
                    </div>
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px]">
                      <span className="text-gray-500">Aufstieg:</span>
                      <span className="tabular-nums">
                        {formatNumber(selectedPolylineSummary.ascentMeters)} m
                      </span>
                      <span className="text-gray-500">Abstieg:</span>
                      <span className="tabular-nums">
                        {formatNumber(selectedPolylineSummary.descentMeters)} m
                      </span>
                      <span className="text-gray-500">Summe:</span>
                      <span className="tabular-nums">
                        {formatNumber(
                          selectedPolylineSummary.totalAbsoluteElevationChangeMeters
                        )}{" "}
                        m
                      </span>
                    </div>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">Δ Start/Ende:</span>
                      <span className="tabular-nums">
                        {formatNumber(
                          selectedPolylineSummary.startEndElevationDeltaMeters
                        )}{" "}
                        m
                      </span>
                    </div>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">
                        Ø Segmentlänge:
                      </span>
                      <span className="tabular-nums">
                        {formatNumber(
                          selectedPolylineSummary.meanSegmentLengthMeters
                        )}{" "}
                        m
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">Typ:</span>
                      <Select
                        size="small"
                        value={selectedPolygonSurfaceTypeValue}
                        options={POLYGON_SURFACE_TYPE_OPTIONS}
                        onChange={updateSelectedPolygonSurfaceType}
                        style={{ minWidth: 148 }}
                        onClick={stopEventPropagation}
                        onMouseDown={stopEventPropagation}
                      />
                    </div>
                    {showSurfaceAreaForType && (
                      <div className="mb-1">
                        <span className="text-gray-500 mr-1">Oberfläche:</span>
                        <span className="tabular-nums">
                          {formatAreaAdaptive(
                            selectedConnectedPlanarPolygonTotalAreaSquareMeters
                          )}
                        </span>
                      </div>
                    )}
                    {showHorizontalAreaForType && (
                      <div className="mb-1">
                        <span className="text-gray-500 mr-1">
                          Horizontalfläche:
                        </span>
                        <span className="tabular-nums">
                          {formatAreaAdaptive(
                            selectedPolygonHorizontalAreaSquareMeters
                          )}
                        </span>
                      </div>
                    )}
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">
                        Planarer Umfang:
                      </span>
                      <span className="tabular-nums">
                        {formatSignificant(
                          selectedPolygonCircumferenceSummary.planarMeters
                        )}{" "}
                        m
                      </span>
                    </div>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">3D-Umfang:</span>
                      <span className="tabular-nums">
                        {formatSignificant(
                          selectedPolygonCircumferenceSummary.threeDMeters
                        )}{" "}
                        m
                      </span>
                    </div>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">Teilflächen:</span>
                      <span>{selectedConnectedPlanarPolygonGroups.length}</span>
                    </div>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">Ø Dachneigung:</span>
                      <span className="tabular-nums">
                        {selectedConnectedRoofAverageSlopeDeg === null
                          ? "Keine Dächer"
                          : `${formatNumber(
                              selectedConnectedRoofAverageSlopeDeg
                            )}°`}
                      </span>
                    </div>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">
                        Dachneigung je Dach:
                      </span>
                      <span>
                        {selectedConnectedRoofSlopeLabels.length > 0
                          ? selectedConnectedRoofSlopeLabels.join(" • ")
                          : "Keine Dächer"}
                      </span>
                    </div>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">Kippwinkel:</span>
                      <span className="tabular-nums">
                        {formatNumber(selectedPolygonTiltInfo.tiltDeg)}° (
                        {selectedPolygonTiltInfo.slopePercentText})
                      </span>
                    </div>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">
                        Normalrichtung:
                      </span>
                      <span>{selectedPolygonTiltInfo.normalDirectionText}</span>
                    </div>
                    <div className="mb-1">
                      <span className="text-gray-500 mr-1">Knoten:</span>
                      <span>
                        {selectedPolygonVertexLabels.length > 0
                          ? selectedPolygonVertexLabels.join(" - ")
                          : "Keine"}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : currentMeasurement ? (
            <div>
              {!isReferencePointWithoutEdges ? (
                <div className="text-[12px] mb-0">
                  {isPointMeasurementEntry(currentMeasurement) && (
                    <>
                      <div className="mt-1 text-sm pl-2">
                        {pointRelationRows.length > 0 ? (
                          <div className="pr-1">
                            <div className="flex items-center gap-1 mb-1">
                              {isRelativeElevationEditActive ? (
                                <span
                                  className="inline-flex items-center gap-1"
                                  onClick={stopEventPropagation}
                                >
                                  <InputNumber
                                    value={relativeElevationValue}
                                    onChange={handleElevationInputChange}
                                    {...elevationInputSharedProps}
                                    style={{
                                      width: relativeElevationInputWidthPx,
                                    }}
                                    data-test-id="relative-elevation-edit-input"
                                  />
                                  <button
                                    type="button"
                                    onClick={stopElevationEditMode}
                                    className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                    data-test-id="relative-elevation-edit-complete-btn"
                                    aria-label="Relative Höhenbearbeitung abschließen"
                                  >
                                    <FontAwesomeIcon icon={faCheck} />
                                  </button>
                                  <span>m relative Höhe über Bezugspunkt</span>
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={startRelativeElevationEditMode}
                                    className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left"
                                    data-test-id="relative-elevation-display-btn"
                                  >
                                    {formatNumber(relativeElevationValue)} m
                                  </button>
                                  <span>relative Höhe über Bezugspunkt</span>
                                </>
                              )}
                            </div>
                            <table className="w-full text-[10px] leading-tight">
                              <thead>
                                <tr className="text-left text-gray-500">
                                  <th className="font-normal pr-2">Punkt</th>
                                  <th className="font-normal text-right pr-2">
                                    Vertikal
                                  </th>
                                  <th className="font-normal text-right pr-2">
                                    Horizontal
                                  </th>
                                  <th className="font-normal text-right pr-2">
                                    Distanz
                                  </th>
                                  <th className="font-normal text-right w-[14px]"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {pointRelationRows.map((row) => (
                                  <tr
                                    key={`${row.relatedPointId}-${row.relationId}`}
                                    className={
                                      row.isReference ? "italic" : undefined
                                    }
                                    style={
                                      row.isImplicitReferenceRow
                                        ? { opacity: 0.8 }
                                        : undefined
                                    }
                                  >
                                    <td
                                      className={`pr-2 ${
                                        row.isReference ? "italic" : ""
                                      }`}
                                    >
                                      {row.label}
                                    </td>
                                    <td className="text-right tabular-nums pr-2">
                                      {relationMetricEdit?.relatedPointId ===
                                        row.relatedPointId &&
                                      relationMetricEdit.kind === "vertical" ? (
                                        <span
                                          className="inline-flex items-center gap-1"
                                          onClick={stopEventPropagation}
                                        >
                                          {!row.isImplicitReferenceRow && (
                                            <button
                                              type="button"
                                              onClick={(event) =>
                                                toggleDistanceRelationLineVisibilityByKind(
                                                  row.relationId,
                                                  "components",
                                                  event
                                                )
                                              }
                                              className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                              aria-label="Komponentenlinien ein- oder ausblenden"
                                              disabled={!row.relationId}
                                            >
                                              <FontAwesomeIcon
                                                icon={
                                                  row.lineVisibility.vertical &&
                                                  row.lineVisibility.horizontal
                                                    ? faEye
                                                    : faEyeSlash
                                                }
                                                className="text-[9px]"
                                              />
                                            </button>
                                          )}
                                          <InputNumber
                                            value={row.elevation}
                                            onChange={(value) =>
                                              handleRelationMetricValueChange(
                                                row.relatedPointId,
                                                "vertical",
                                                value
                                              )
                                            }
                                            {...relationMetricInputSharedProps}
                                            style={{
                                              width: getElevationInputWidthPx(
                                                row.elevation
                                              ),
                                            }}
                                            data-test-id={`relation-vertical-edit-input-${row.relatedPointId}`}
                                          />
                                          <button
                                            type="button"
                                            onClick={stopRelationMetricEditMode}
                                            className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                            data-test-id={`relation-vertical-edit-complete-btn-${row.relatedPointId}`}
                                            aria-label="Vertikale Distanz bearbeiten abschließen"
                                          >
                                            <FontAwesomeIcon icon={faCheck} />
                                          </button>
                                        </span>
                                      ) : row.isImplicitReferenceRow ? (
                                        <button
                                          type="button"
                                          onClick={(event) =>
                                            startRelationMetricEditMode(
                                              row.relatedPointId,
                                              "vertical",
                                              event
                                            )
                                          }
                                          className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                                          data-test-id={`relation-vertical-display-btn-${row.relatedPointId}`}
                                        >
                                          {formatNumber(row.elevation)} m
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={(event) =>
                                              toggleDistanceRelationLineVisibilityByKind(
                                                row.relationId,
                                                "components",
                                                event
                                              )
                                            }
                                            className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                            aria-label="Komponentenlinien ein- oder ausblenden"
                                            disabled={!row.relationId}
                                          >
                                            <FontAwesomeIcon
                                              icon={
                                                row.lineVisibility.vertical &&
                                                row.lineVisibility.horizontal
                                                  ? faEye
                                                  : faEyeSlash
                                              }
                                              className="text-[9px]"
                                            />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(event) =>
                                              startRelationMetricEditMode(
                                                row.relatedPointId,
                                                "vertical",
                                                event
                                              )
                                            }
                                            className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                                            data-test-id={`relation-vertical-display-btn-${row.relatedPointId}`}
                                          >
                                            {formatNumber(row.elevation)} m
                                          </button>
                                        </span>
                                      )}
                                    </td>
                                    <td className="text-right tabular-nums pr-2">
                                      {relationMetricEdit?.relatedPointId ===
                                        row.relatedPointId &&
                                      relationMetricEdit.kind ===
                                        "horizontal" ? (
                                        <span
                                          className="inline-flex items-center gap-1"
                                          onClick={stopEventPropagation}
                                        >
                                          <InputNumber
                                            value={row.horizontalDistance}
                                            onChange={(value) =>
                                              handleRelationMetricValueChange(
                                                row.relatedPointId,
                                                "horizontal",
                                                value
                                              )
                                            }
                                            min={0}
                                            {...relationMetricInputSharedProps}
                                            style={{
                                              width: getElevationInputWidthPx(
                                                row.horizontalDistance
                                              ),
                                            }}
                                            data-test-id={`relation-horizontal-edit-input-${row.relatedPointId}`}
                                          />
                                          <button
                                            type="button"
                                            onClick={stopRelationMetricEditMode}
                                            className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                            data-test-id={`relation-horizontal-edit-complete-btn-${row.relatedPointId}`}
                                            aria-label="Horizontale Distanz bearbeiten abschließen"
                                          >
                                            <FontAwesomeIcon icon={faCheck} />
                                          </button>
                                        </span>
                                      ) : row.isImplicitReferenceRow ? (
                                        <button
                                          type="button"
                                          onClick={(event) =>
                                            startRelationMetricEditMode(
                                              row.relatedPointId,
                                              "horizontal",
                                              event
                                            )
                                          }
                                          className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                                          data-test-id={`relation-horizontal-display-btn-${row.relatedPointId}`}
                                        >
                                          {formatNumber(row.horizontalDistance)}{" "}
                                          m
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(event) =>
                                            startRelationMetricEditMode(
                                              row.relatedPointId,
                                              "horizontal",
                                              event
                                            )
                                          }
                                          className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                                          data-test-id={`relation-horizontal-display-btn-${row.relatedPointId}`}
                                        >
                                          {formatNumber(row.horizontalDistance)}{" "}
                                          m
                                        </button>
                                      )}
                                    </td>
                                    <td className="text-right tabular-nums pr-2">
                                      {relationMetricEdit?.relatedPointId ===
                                        row.relatedPointId &&
                                      relationMetricEdit.kind === "direct" ? (
                                        <span
                                          className="inline-flex items-center gap-1"
                                          onClick={stopEventPropagation}
                                        >
                                          {!row.isImplicitReferenceRow && (
                                            <button
                                              type="button"
                                              onClick={(event) =>
                                                toggleDistanceRelationLineVisibilityByKind(
                                                  row.relationId,
                                                  "direct",
                                                  event
                                                )
                                              }
                                              className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                              aria-label="Direkte Linie ein- oder ausblenden"
                                              disabled={!row.relationId}
                                            >
                                              <FontAwesomeIcon
                                                icon={
                                                  row.lineVisibility.direct
                                                    ? faEye
                                                    : faEyeSlash
                                                }
                                                className="text-[9px]"
                                              />
                                            </button>
                                          )}
                                          <InputNumber
                                            value={row.distance}
                                            onChange={(value) =>
                                              handleRelationMetricValueChange(
                                                row.relatedPointId,
                                                "direct",
                                                value
                                              )
                                            }
                                            min={0}
                                            {...relationMetricInputSharedProps}
                                            style={{
                                              width: getElevationInputWidthPx(
                                                row.distance
                                              ),
                                            }}
                                            data-test-id={`relation-direct-edit-input-${row.relatedPointId}`}
                                          />
                                          <button
                                            type="button"
                                            onClick={stopRelationMetricEditMode}
                                            className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                            data-test-id={`relation-direct-edit-complete-btn-${row.relatedPointId}`}
                                            aria-label="Direkte Distanz bearbeiten abschließen"
                                          >
                                            <FontAwesomeIcon icon={faCheck} />
                                          </button>
                                        </span>
                                      ) : row.isImplicitReferenceRow ? (
                                        <button
                                          type="button"
                                          onClick={(event) =>
                                            startRelationMetricEditMode(
                                              row.relatedPointId,
                                              "direct",
                                              event
                                            )
                                          }
                                          className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                                          data-test-id={`relation-direct-display-btn-${row.relatedPointId}`}
                                        >
                                          {formatNumber(row.distance)} m
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={(event) =>
                                              toggleDistanceRelationLineVisibilityByKind(
                                                row.relationId,
                                                "direct",
                                                event
                                              )
                                            }
                                            className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                            aria-label="Direkte Linie ein- oder ausblenden"
                                            disabled={!row.relationId}
                                          >
                                            <FontAwesomeIcon
                                              icon={
                                                row.lineVisibility.direct
                                                  ? faEye
                                                  : faEyeSlash
                                              }
                                              className="text-[9px]"
                                            />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(event) =>
                                              startRelationMetricEditMode(
                                                row.relatedPointId,
                                                "direct",
                                                event
                                              )
                                            }
                                            className="cursor-pointer bg-transparent border-0 p-0 m-0 text-right tabular-nums"
                                            data-test-id={`relation-direct-display-btn-${row.relatedPointId}`}
                                          >
                                            {formatNumber(row.distance)} m
                                          </button>
                                        </span>
                                      )}
                                    </td>
                                    <td className="text-right">
                                      {row.isImplicitReferenceRow ? (
                                        <button
                                          type="button"
                                          onClick={(event) =>
                                            addDistanceRelationForCurrentPoint(
                                              row.relatedPointId,
                                              event
                                            )
                                          }
                                          className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0]"
                                          aria-label="Referenzlinie als Kante hinzufügen"
                                        >
                                          <FontAwesomeIcon
                                            icon={faPlus}
                                            className="text-[9px]"
                                          />
                                        </button>
                                      ) : row.relationId ? (
                                        <button
                                          type="button"
                                          onClick={(event) =>
                                            removeDistanceRelationById(
                                              row.relationId,
                                              event
                                            )
                                          }
                                          className="cursor-pointer border-0 bg-transparent p-0 text-[#808080] hover:text-[#a0a0a0]"
                                          aria-label="Punktbeziehung löschen"
                                        >
                                          <FontAwesomeIcon
                                            icon={faTrashCan}
                                            className="text-[9px]"
                                          />
                                        </button>
                                      ) : null}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="pr-1 flex items-center gap-1">
                            {isRelativeElevationEditActive ? (
                              <span
                                className="inline-flex items-center gap-1"
                                onClick={stopEventPropagation}
                              >
                                <InputNumber
                                  value={relativeElevationValue}
                                  onChange={handleElevationInputChange}
                                  {...elevationInputSharedProps}
                                  style={{
                                    width: relativeElevationInputWidthPx,
                                  }}
                                  data-test-id="relative-elevation-edit-input"
                                />
                                <button
                                  type="button"
                                  onClick={stopElevationEditMode}
                                  className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                  data-test-id="relative-elevation-edit-complete-btn"
                                  aria-label="Relative Höhenbearbeitung abschließen"
                                >
                                  <FontAwesomeIcon icon={faCheck} />
                                </button>
                                <span>m relative Höhe über Bezugspunkt</span>
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={startRelativeElevationEditMode}
                                  className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left"
                                  data-test-id="relative-elevation-display-btn"
                                >
                                  {formatNumber(relativeElevationValue)} m
                                </button>
                                <span>relative Höhe über Bezugspunkt</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
              <div className="flex justify-center items-center w-[96%] mt-1 pt-1">
                <span
                  className="mx-4 text-[#0078a8] cursor-pointer"
                  onClick={flyToAllMeasurements}
                >
                  {visibleMeasurements.length} Messungen verfügbar
                </span>
              </div>
              <div className="flex justify-between items-center w-[96%] mt-0 mb-1">
                <a
                  className="renderAsLink text-[#0078a8] cursor-pointer"
                  onClick={decreaseCurrentHandler}
                  data-test-id="switch-measurement-left"
                  style={{ fontSize: "10.5px" }}
                  aria-label="Vorherige Messung"
                >
                  <FontAwesomeIcon icon={faAnglesLeft} />
                </a>
                <span className="mx-4">
                  {currentIndex + 1} von {visibleMeasurements.length}
                </span>
                <a
                  className="renderAsLink text-[#0078a8] cursor-pointer"
                  onClick={increaseCurrentHandler}
                  data-test-id="switch-measurement-right"
                  style={{ fontSize: "10.5px" }}
                  aria-label="Nächste Messung"
                >
                  <FontAwesomeIcon icon={faAnglesRight} />
                </a>
              </div>
            </div>
          ) : (
            <></>
          )
        }
        fixedRow={!!currentMeasurement}
      />
    </div>
  );
}
