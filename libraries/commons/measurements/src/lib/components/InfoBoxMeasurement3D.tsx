import {
  useState,
  useEffect,
  useRef,
  useContext,
  useMemo,
  useCallback,
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
  faAnglesLeft,
  faAnglesRight,
} from "@fortawesome/free-solid-svg-icons";
import MeasurementTitle from "./MeasurementTitle";
import { UIContext } from "react-cismap/contexts/UIContextProvider";
import Icon from "react-cismap/commons/Icon";
import "../styles/infoBox.css";
import { InputNumber, Modal, Select, Switch, Tooltip } from "antd";
import {
  CarmaResponsiveInfoBox,
  LockToggleButton,
  VisibilityToggleButton,
} from "@carma-commons/ui/components";
import {
  useCesiumMeasurements,
  isPointMeasurementEntry,
  MeasurementMode,
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
const INFOBOX_ACTION_TOGGLE_SIZE_PX = 16;
const INFOBOX_ACTION_TOGGLE_BUTTON_STYLE = {
  background: "transparent",
  border: "none",
  padding: 0,
  width: INFOBOX_ACTION_TOGGLE_SIZE_PX,
  height: INFOBOX_ACTION_TOGGLE_SIZE_PX,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
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
type ContextNavigationEntry = {
  id: string;
  selectMeasurementId: string;
};
const DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY = {
  direct: true,
  vertical: true,
  horizontal: true,
} as const;

const isKeyboardTargetEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  return target.isContentEditable;
};

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

const getAlphabeticDistanceIndexLabel = (zeroBasedIndex: number): string => {
  if (!Number.isFinite(zeroBasedIndex) || zeroBasedIndex < 0) return "A";
  let n = Math.floor(zeroBasedIndex);
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
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
    measurementMode,
    setMeasurementMode,
    measurements,
    setMeasurements,
    clearMeasurementsByIds,
    setReferencePoint,
    referencePoint,
    selectedMeasurementId,
    selectedMeasurementIds,
    selectionModeActive,
    selectMeasurementById,
    updateMeasurementNameById,
    toggleMeasurementLockById,
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
    lockedEditMeasurementId,
    clearLockedEditMeasurementId,
    startMoveGizmoForMeasurementId,
    stopMoveGizmo,
    setPointMeasurementElevationById,
    setPointMeasurementCoordinatesById,
    polylineVerticalOffsetMeters,
    setPolylineVerticalOffsetMeters,
    polylineSegmentLineMode,
    setPolylineSegmentLineMode,
    planarMeasurementCreationMode,
    polygonSurfaceTypePreset,
    pointLabelOnCreate,
    setPointLabelMetricModeById,
    pointMarkerBadgeByPointId,
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
  const [isVerticalOffsetEditModeActive, setIsVerticalOffsetEditModeActive] =
    useState(false);
  const [
    isPolylineVerticalOffsetEditModeActive,
    setIsPolylineVerticalOffsetEditModeActive,
  ] = useState(false);
  const [elevationEditTarget, setElevationEditTarget] =
    useState<ElevationEditTarget | null>(null);
  const [relationMetricEdit, setRelationMetricEdit] = useState<{
    relatedPointId: string;
    kind: RelationMetricEditKind;
  } | null>(null);
  const [editedLatitude, setEditedLatitude] = useState<number | null>(null);
  const [editedLongitude, setEditedLongitude] = useState<number | null>(null);
  const [labelFocusTrigger, setLabelFocusTrigger] = useState<
    number | undefined
  >(undefined);
  const [lastCustomPointLabel, setLastCustomPointLabel] = useState<string>("");
  const [isPolygonSurfaceTypePickerOpen, setIsPolygonSurfaceTypePickerOpen] =
    useState(false);
  const previousActiveMeasurementTypeRef = useRef<string>(
    `${measurementMode}:${planarMeasurementCreationMode}:${polygonSurfaceTypePreset}`
  );
  const prevSelectedMeasurementIdRef = useRef<string | null>(null);
  const measurementById = useMemo(
    () =>
      new Map(measurements.map((measurement) => [measurement.id, measurement])),
    [measurements]
  );
  const selectedPointIds = useMemo(
    () =>
      selectedMeasurementIds
        .map((id) => {
          const measurement = measurementById.get(id);
          return measurement && isPointMeasurementEntry(measurement)
            ? id
            : null;
        })
        .filter((id) => typeof id === "string"),
    [measurementById, selectedMeasurementIds]
  );

  useEffect(() => {
    if (!lockedEditMeasurementId) return;
    const targetMeasurement = measurementById.get(lockedEditMeasurementId);
    if (!targetMeasurement || !isPointMeasurementEntry(targetMeasurement)) {
      clearLockedEditMeasurementId();
      return;
    }
    if (!targetMeasurement.locked) {
      clearLockedEditMeasurementId();
      return;
    }

    Modal.confirm({
      centered: true,
      title: "Punkt ist gesperrt",
      content:
        "Dieser Punkt ist gesperrt und kann nicht bearbeitet werden. Jetzt entsperren?",
      okText: "Entsperren",
      cancelText: "Abbrechen",
      onOk: () => {
        toggleMeasurementLockById(lockedEditMeasurementId);
      },
      onCancel: () => {
        clearLockedEditMeasurementId();
      },
      afterClose: () => {
        clearLockedEditMeasurementId();
      },
    });
  }, [
    clearLockedEditMeasurementId,
    lockedEditMeasurementId,
    measurementById,
    toggleMeasurementLockById,
  ]);

  useEffect(() => {
    const nextActiveMeasurementTypeKey = `${measurementMode}:${planarMeasurementCreationMode}:${polygonSurfaceTypePreset}`;
    if (
      previousActiveMeasurementTypeRef.current === nextActiveMeasurementTypeKey
    )
      return;
    previousActiveMeasurementTypeRef.current = nextActiveMeasurementTypeKey;
    selectMeasurementById(null);
    selectPlanarPolygonGroupById(null);
    if (currentIndex !== -1) {
      setCurrentIndex(-1);
    }
  }, [
    currentIndex,
    measurementMode,
    planarMeasurementCreationMode,
    polygonSurfaceTypePreset,
    selectMeasurementById,
    selectPlanarPolygonGroupById,
  ]);

  useEffect(() => {
    if (selectedMeasurementId === prevSelectedMeasurementIdRef.current) return;
    prevSelectedMeasurementIdRef.current = selectedMeasurementId;
    if (!selectedMeasurementId) return;
    const selectedPoint = measurements.find(
      (m) => m.id === selectedMeasurementId && isPointMeasurementEntry(m)
    );
    if (selectedPoint) {
      const customLabel = getCustomPointMeasurementName(selectedPoint.name);
      if (customLabel) setLastCustomPointLabel(customLabel);
    }
    if (pointLabelOnCreate) {
      setLabelFocusTrigger((prev) => (prev ?? 0) + 1);
    }
  }, [selectedMeasurementId, pointLabelOnCreate]);

  // Measurements reversed to show newest first
  const visibleMeasurements = [...measurements].reverse();
  const currentMeasurement = visibleMeasurements[currentIndex];
  const pointMeasurements = useMemo(
    () => measurements.filter(isPointMeasurementEntry),
    [measurements]
  );
  const getBadgeTextForPointId = useCallback(
    (pointId: string | null | undefined): string | undefined => {
      if (!pointId) return undefined;
      return pointMarkerBadgeByPointId[pointId]?.text;
    },
    [pointMarkerBadgeByPointId]
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
  const suppressPointInfoWhileConstructingPolygon =
    measurementMode === MeasurementMode.PolylineMeasure &&
    planarMeasurementCreationMode === "polygon" &&
    Boolean(activePlanarPolygonGroupId);
  const showPointInfoMode =
    !suppressPointInfoWhileConstructingPolygon &&
    Boolean(
      currentMeasurement && isPointMeasurementEntry(currentMeasurement)
    ) &&
    (!hasFocusedPlanarGroup ||
      (isCurrentMeasurementExplicitlySelectedPoint &&
        (!activePlanarPolygonGroupId ||
          isCurrentMeasurementFirstNodeOfFocusedGroup)));
  const isPolygonInfoMode =
    Boolean(selectedPlanarPolygonGroup) && !showPointInfoMode;
  const isAnnotationMode = Boolean(
    currentMeasurement &&
      isPointMeasurementEntry(currentMeasurement) &&
      currentMeasurement.auxiliaryLabelAnchor
  );
  const isCurrentMeasurementHidden = Boolean(currentMeasurement?.hidden);
  const isCurrentMeasurementLocked = Boolean(currentMeasurement?.locked);
  const isSelectedPolygonHidden = useMemo(() => {
    if (!selectedPlanarPolygonGroup) return false;
    const sourceGroup = planarPolygonGroups.find(
      (group) => group.id === selectedPlanarPolygonGroup.id
    );
    return Boolean(sourceGroup?.hidden);
  }, [planarPolygonGroups, selectedPlanarPolygonGroup]);
  const selectedPlanarPolygonClosed = useMemo(() => {
    if (!focusedPlanarPolygonGroupId) return false;
    return Boolean(
      planarPolygonGroups.find(
        (group) => group.id === focusedPlanarPolygonGroupId
      )?.closed
    );
  }, [focusedPlanarPolygonGroupId, planarPolygonGroups]);
  const selectedPolylineSummary = useMemo(() => {
    if (!selectedPolyline) return null;
    if (selectedPlanarPolygonClosed) return null;
    if (planarMeasurementCreationMode === "polygon") return null;

    const segmentCount = selectedPolyline.segmentLengthsMeters.length;
    const nodeCount = selectedPolyline.vertexPointIds.length;
    const totalLengthMeters = selectedPolyline.totalLengthMeters;
    const totalHorizontalLengthMeters =
      selectedPolyline.segmentLengthsMeters.reduce(
        (sum, segmentLengthMeters, segmentIndex) => {
          const startHeight =
            selectedPolyline.vertexHeightsMeters[segmentIndex] ?? 0;
          const endHeight =
            selectedPolyline.vertexHeightsMeters[segmentIndex + 1] ??
            startHeight;
          const elevationDelta = endHeight - startHeight;
          const horizontalLengthMeters = Math.sqrt(
            Math.max(
              0,
              segmentLengthMeters * segmentLengthMeters -
                elevationDelta * elevationDelta
            )
          );
          return sum + horizontalLengthMeters;
        },
        0
      );

    const firstHeight = selectedPolyline.vertexHeightsMeters[0] ?? null;
    const lastHeight =
      selectedPolyline.vertexHeightsMeters[
        selectedPolyline.vertexHeightsMeters.length - 1
      ] ?? null;
    const startEndElevationDeltaMeters =
      firstHeight !== null && lastHeight !== null
        ? lastHeight - firstHeight
        : 0;

    let ascentMeters = 0;
    let descentMeters = 0;
    for (
      let index = 1;
      index < selectedPolyline.vertexHeightsMeters.length;
      index += 1
    ) {
      const previousHeight =
        selectedPolyline.vertexHeightsMeters[index - 1] ?? 0;
      const currentHeight = selectedPolyline.vertexHeightsMeters[index] ?? 0;
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
      totalHorizontalLengthMeters,
      meanSegmentLengthMeters:
        segmentCount > 0 ? totalLengthMeters / segmentCount : 0,
      meanHorizontalSegmentLengthMeters:
        segmentCount > 0 ? totalHorizontalLengthMeters / segmentCount : 0,
      totalAbsoluteElevationChangeMeters: ascentMeters + descentMeters,
      startEndElevationDeltaMeters,
      ascentMeters,
      descentMeters,
    };
  }, [
    planarMeasurementCreationMode,
    selectedPlanarPolygonClosed,
    selectedPolyline,
  ]);
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
  useEffect(() => {
    if (!isPolygonInfoMode || selectedPolylineSummary) {
      setIsPolygonSurfaceTypePickerOpen(false);
    }
  }, [isPolygonInfoMode, selectedPolylineSummary]);
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
    if (!selectedMeasurementId) {
      if (currentIndex !== -1) {
        setCurrentIndex(-1);
      }
      return;
    }
    const selectedIndex = visibleMeasurements.findIndex(
      (measurement) => measurement.id === selectedMeasurementId
    );
    if (selectedIndex >= 0 && selectedIndex !== currentIndex) {
      setCurrentIndex(selectedIndex);
    }
  }, [selectedMeasurementId, visibleMeasurements, currentIndex]);

  useEffect(() => {
    setIsCoordinateEditModeActive(false);
    setIsVerticalOffsetEditModeActive(false);
    setIsPolylineVerticalOffsetEditModeActive(false);
    setElevationEditTarget(null);
    setRelationMetricEdit(null);
    setEditStepDistanceMeters(null);
    setEditedLatitude(null);
    setEditedLongitude(null);
  }, [currentMeasurement?.id]);

  useEffect(() => {
    if (!isPolygonInfoMode) return;
    setIsCoordinateEditModeActive(false);
    setIsVerticalOffsetEditModeActive(false);
    setIsPolylineVerticalOffsetEditModeActive(false);
    setElevationEditTarget(null);
    setRelationMetricEdit(null);
    setEditStepDistanceMeters(null);
    setEditedLatitude(null);
    setEditedLongitude(null);
  }, [isPolygonInfoMode]);

  useEffect(() => {
    if (isPolygonInfoMode) return;
    setIsPolylineVerticalOffsetEditModeActive(false);
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
      isPointMeasurementEntry(measurements[0])
    ) {
      const firstPointMeasurement = measurements[0].geometryECEF;
      if (
        !referencePoint ||
        getEuclideanDistance(firstPointMeasurement, referencePoint) > 0.001
      ) {
        setReferencePoint(firstPointMeasurement);
      }
    }
  }, [measurements, referencePoint, setReferencePoint]);

  const contextNavigationEntries = useMemo(() => {
    const pointMeasurementsOnly = pointMeasurements;
    const filtered = pointMeasurementsOnly.filter((measurement) =>
      isAnnotationMode
        ? Boolean(measurement.auxiliaryLabelAnchor)
        : !measurement.auxiliaryLabelAnchor
    );
    const basePoints = filtered.length > 0 ? filtered : pointMeasurementsOnly;

    if (isAnnotationMode) {
      return basePoints.map<ContextNavigationEntry>((measurement) => ({
        id: `point-${measurement.id}`,
        selectMeasurementId: measurement.id,
      }));
    }

    const planarGroupByPointId = new Map<string, string>();
    const planarGroupStartPointByGroupId = new Map<string, string>();
    planarPolygonGroups.forEach((group) => {
      const startPointId =
        group.distanceMeasurementStartPointId ??
        group.vertexPointIds[0] ??
        null;
      if (startPointId) {
        planarGroupStartPointByGroupId.set(group.id, startPointId);
      }
      group.vertexPointIds.forEach((pointId) => {
        if (!pointId || planarGroupByPointId.has(pointId)) return;
        planarGroupByPointId.set(pointId, group.id);
      });
    });

    const distanceRelationByPointId = new Map<string, string>();
    const distanceRelationAnchorById = new Map<string, string>();
    distanceRelations
      .filter((relation) => !relation.polygonGroupId)
      .forEach((relation) => {
        distanceRelationAnchorById.set(
          relation.id,
          relation.anchorPointId ?? relation.pointAId
        );
        [relation.pointAId, relation.pointBId].forEach((pointId) => {
          if (!pointId || distanceRelationByPointId.has(pointId)) return;
          distanceRelationByPointId.set(pointId, relation.id);
        });
      });

    const seenEntryIds = new Set<string>();
    const entries: ContextNavigationEntry[] = [];

    basePoints.forEach((measurement) => {
      const planarGroupId = planarGroupByPointId.get(measurement.id);
      if (planarGroupId) {
        const entryId = `planar-group-${planarGroupId}`;
        if (seenEntryIds.has(entryId)) return;
        seenEntryIds.add(entryId);
        entries.push({
          id: entryId,
          selectMeasurementId:
            planarGroupStartPointByGroupId.get(planarGroupId) ?? measurement.id,
        });
        return;
      }

      const relationId = distanceRelationByPointId.get(measurement.id);
      if (relationId) {
        const entryId = `distance-relation-${relationId}`;
        if (seenEntryIds.has(entryId)) return;
        seenEntryIds.add(entryId);
        entries.push({
          id: entryId,
          selectMeasurementId:
            distanceRelationAnchorById.get(relationId) ?? measurement.id,
        });
        return;
      }

      const entryId = `point-${measurement.id}`;
      if (seenEntryIds.has(entryId)) return;
      seenEntryIds.add(entryId);
      entries.push({
        id: entryId,
        selectMeasurementId: measurement.id,
      });
    });

    return entries;
  }, [
    distanceRelations,
    isAnnotationMode,
    planarPolygonGroups,
    pointMeasurements,
  ]);
  const currentContextEntryId =
    isPolygonInfoMode && selectedPlanarPolygonGroup
      ? `planar-group-${selectedPlanarPolygonGroup.id}`
      : currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? !isAnnotationMode
        ? (() => {
            const planarGroup = planarPolygonGroups.find((group) =>
              group.vertexPointIds.includes(currentMeasurement.id)
            );
            if (planarGroup) {
              return `planar-group-${planarGroup.id}`;
            }

            const relation = distanceRelations.find(
              (entry) =>
                !entry.polygonGroupId &&
                (entry.pointAId === currentMeasurement.id ||
                  entry.pointBId === currentMeasurement.id)
            );
            return relation
              ? `distance-relation-${relation.id}`
              : `point-${currentMeasurement.id}`;
          })()
        : `point-${currentMeasurement.id}`
      : null;
  const currentContextMeasurementIndex = currentContextEntryId
    ? contextNavigationEntries.findIndex(
        (entry) => entry.id === currentContextEntryId
      )
    : -1;
  const showContextNavigation = contextNavigationEntries.length > 1;
  const pointAndAnnotationCount = contextNavigationEntries.length;

  const decreaseContextHandler = () => {
    if (contextNavigationEntries.length <= 1) return;
    const currentIndexInContext =
      currentContextMeasurementIndex >= 0 ? currentContextMeasurementIndex : 0;
    const newIndex =
      currentIndexInContext <= 0
        ? contextNavigationEntries.length - 1
        : currentIndexInContext - 1;
    const nextEntry = contextNavigationEntries[newIndex];
    if (!nextEntry) return;
    selectMeasurementById(nextEntry.selectMeasurementId);
  };

  const increaseContextHandler = () => {
    if (contextNavigationEntries.length <= 1) return;
    const currentIndexInContext =
      currentContextMeasurementIndex >= 0 ? currentContextMeasurementIndex : 0;
    const newIndex =
      currentIndexInContext >= contextNavigationEntries.length - 1
        ? 0
        : currentIndexInContext + 1;
    const nextEntry = contextNavigationEntries[newIndex];
    if (!nextEntry) return;
    selectMeasurementById(nextEntry.selectMeasurementId);
  };

  const deleteShapeHandler = (e) => {
    e.stopPropagation();
    if (
      measurementMode === MeasurementMode.PointQuery &&
      !isAnnotationMode &&
      pointRelationRows.length > 0
    ) {
      const relationId = pointRelationRows[0]?.relationId;
      if (relationId) {
        removeDistanceRelationById(relationId);
        return;
      }
    }
    if (currentMeasurement) {
      if (isPointMeasurementEntry(currentMeasurement)) {
        const owningPolygonGroup =
          (selectedPlanarPolygonGroup &&
          selectedPlanarPolygonGroup.vertexPointIds.includes(
            currentMeasurement.id
          )
            ? selectedPlanarPolygonGroup
            : null) ??
          planarPolygonGroups.find(
            (group) =>
              group.closed &&
              group.vertexPointIds.includes(currentMeasurement.id)
          ) ??
          null;

        if (
          owningPolygonGroup &&
          owningPolygonGroup.vertexPointIds.length <= 3
        ) {
          Modal.confirm({
            centered: true,
            title: "Polygon löschen?",
            content:
              "Ein einzelner Knoten kann bei Polygonen mit 3 oder weniger Punkten nicht gelöscht werden. Soll stattdessen das gesamte Polygon gelöscht werden?",
            okText: "Polygon löschen",
            cancelText: "Abbrechen",
            okButtonProps: { danger: true },
            onOk: () => {
              deletePolygonGroupById(owningPolygonGroup.id);
            },
          });
          return;
        }
      }

      clearMeasurementsByIds([currentMeasurement.id]);
    }
  };

  const toggleCurrentMeasurementHidden = (e?: ReactMouseEvent | MouseEvent) => {
    e?.stopPropagation?.();
    if (!currentMeasurement) return;
    setMeasurements((prev) =>
      prev.map((measurement) =>
        measurement.id === currentMeasurement.id
          ? { ...measurement, hidden: !measurement.hidden }
          : measurement
      )
    );
  };

  const toggleSelectedPolygonHidden = (e?: ReactMouseEvent | MouseEvent) => {
    e?.stopPropagation?.();
    if (!selectedPlanarPolygonGroup) return;
    setPlanarPolygonGroups((prev) =>
      prev.map((group) =>
        group.id === selectedPlanarPolygonGroup.id
          ? { ...group, hidden: !group.hidden }
          : group
      )
    );
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

  const startVerticalOffsetEditMode = (e?) => {
    e?.stopPropagation?.();
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    if (!currentMeasurement.verticalOffsetAnchorECEF) return;
    selectMeasurementById(currentMeasurement.id);
    setRelationMetricEdit(null);
    setElevationEditTarget(null);
    setIsVerticalOffsetEditModeActive(true);
    setEditStepDistanceMeters(getCameraDistanceToCurrentPoint());
  };

  const stopVerticalOffsetEditMode = (e?) => {
    e?.stopPropagation?.();
    setIsVerticalOffsetEditModeActive(false);
    setEditStepDistanceMeters(null);
  };

  const startPolylineVerticalOffsetEditMode = (e?) => {
    e?.stopPropagation?.();
    setRelationMetricEdit(null);
    setElevationEditTarget(null);
    setIsVerticalOffsetEditModeActive(false);
    setIsPolylineVerticalOffsetEditModeActive(true);
  };

  const stopPolylineVerticalOffsetEditMode = (e?) => {
    e?.stopPropagation?.();
    setIsPolylineVerticalOffsetEditModeActive(false);
  };

  const handlePolylineVerticalOffsetInputPressEnter = (e?) => {
    e?.stopPropagation?.();
    stopPolylineVerticalOffsetEditMode(e);
  };

  const handlePolylineVerticalOffsetInputChange = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    setPolylineVerticalOffsetMeters(value);
  };

  const handleVerticalOffsetInputChange = (value: number | null) => {
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    const anchor = currentMeasurement.verticalOffsetAnchorECEF;
    if (!anchor) return;

    const anchorPositionEcef = new Cartesian3(anchor.x, anchor.y, anchor.z);
    const localEnuFrame = Transforms.eastNorthUpToFixedFrame(
      anchorPositionEcef,
      Ellipsoid.WGS84
    );
    const upDirectionColumn = Matrix4.getColumn(
      localEnuFrame,
      2,
      new Cartesian4()
    );
    const upDirectionEcef = Cartesian3.normalize(
      new Cartesian3(
        upDirectionColumn.x,
        upDirectionColumn.y,
        upDirectionColumn.z
      ),
      new Cartesian3()
    );
    const offsetVectorEcef = Cartesian3.multiplyByScalar(
      upDirectionEcef,
      value,
      new Cartesian3()
    );
    const nextPositionEcef = Cartesian3.add(
      anchorPositionEcef,
      offsetVectorEcef,
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
      Number.isFinite(nextWgs84.altitude) ? nextWgs84.altitude : 0
    );
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

  const infoBoxHeaderColor = "rgba(59, 130, 246, 0.7)";

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
    if (name.trim()) setLastCustomPointLabel(name.trim());
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

  const deletePolygonGroupById = (polygonGroupId: string) => {
    const deletedGroup = planarPolygonGroups.find(
      (group) => group.id === polygonGroupId
    );
    if (!deletedGroup) return;

    const deletedGroupId = deletedGroup.id;
    const deletedVertexPointIds = new Set(deletedGroup.vertexPointIds);

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

  const deleteSelectedPolygon = (e?: ReactMouseEvent | MouseEvent) => {
    e?.stopPropagation?.();
    if (!selectedPlanarPolygonGroup) return;
    deletePolygonGroupById(selectedPlanarPolygonGroup.id);
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
    const relationToRemove = distanceRelations.find((relation) => {
      return relation.id === relationId;
    });
    if (!relationToRemove) {
      setDistanceRelations((prev) =>
        prev.filter((relation) => relation.id !== relationId)
      );
      return;
    }

    const remainingRelations = distanceRelations.filter(
      (relation) => relation.id !== relationId
    );

    const orphanAdhocPointIds = [
      relationToRemove.pointAId,
      relationToRemove.pointBId,
    ].filter((pointId) => {
      const point = measurements.find(
        (measurement) => measurement.id === pointId
      );
      if (!point || !isPointMeasurementEntry(point)) return false;
      if (!point.distanceAdhocNode) return false;
      return !remainingRelations.some(
        (relation) =>
          relation.pointAId === pointId || relation.pointBId === pointId
      );
    });

    if (orphanAdhocPointIds.length > 0) {
      clearMeasurementsByIds(orphanAdhocPointIds);
      return;
    }

    // Existing (non-adhoc) point measures are first-class nodes and must remain.
    setDistanceRelations(remainingRelations);
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
          edgeId: `edge:${[currentPointId, relatedPointId]
            .sort((left, right) => left.localeCompare(right))
            .join(":")}`,
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
  const absoluteElevationWithNhnSuffix =
    currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? `${formatNumber(currentMeasurement.geometryWGS84.height)} m NHN`
      : null;
  const isRelativeElevationLabelEnabled =
    currentMeasurement &&
    isPointMeasurementEntry(currentMeasurement) &&
    (currentMeasurement.pointLabelMode ?? "elevation") === "elevation";
  const verticalOffsetValue =
    currentMeasurement &&
    isPointMeasurementEntry(currentMeasurement) &&
    currentMeasurement.verticalOffsetAnchorECEF
      ? getENU(
          currentMeasurement.geometryECEF,
          new Cartesian3(
            currentMeasurement.verticalOffsetAnchorECEF.x,
            currentMeasurement.verticalOffsetAnchorECEF.y,
            currentMeasurement.verticalOffsetAnchorECEF.z
          )
        ).up
      : null;
  const verticalOffsetInputWidthPx =
    getElevationInputWidthPx(verticalOffsetValue);
  const polylineVerticalOffsetInputWidthPx = getElevationInputWidthPx(
    polylineVerticalOffsetMeters
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
  const distanceTitleContext = useMemo(() => {
    if (
      measurementMode !== MeasurementMode.PointQuery ||
      !currentMeasurement ||
      !isPointMeasurementEntry(currentMeasurement) ||
      isAnnotationMode
    ) {
      return null;
    }

    const currentPointIndex = pointMeasurements.findIndex(
      (measurement) => measurement.id === currentMeasurement.id
    );

    const primaryRelationRow = pointRelationRows[0];
    if (!primaryRelationRow) {
      const pointDistanceLabel =
        getBadgeTextForPointId(currentMeasurement.id) ||
        getAlphabeticDistanceIndexLabel(currentPointIndex);
      return {
        shapeId: currentMeasurement.id,
        title: getCustomPointMeasurementName(currentMeasurement.name) || "",
        placeholderText: `Distanz ${pointDistanceLabel}`,
      };
    }

    const relationId = getDistanceRelationId(
      currentMeasurement.id,
      primaryRelationRow.relatedPointId
    );
    const relation = distanceRelations.find((entry) => entry.id === relationId);
    const anchorPointId = relation?.anchorPointId ?? currentMeasurement.id;
    const anchorPointMeasurement = pointMeasurements.find(
      (measurement) => measurement.id === anchorPointId
    );
    const anchorPointIndex = pointMeasurements.findIndex(
      (measurement) => measurement.id === anchorPointId
    );
    const anchorDistanceLabel =
      getBadgeTextForPointId(anchorPointId) ||
      getAlphabeticDistanceIndexLabel(
        anchorPointIndex >= 0 ? anchorPointIndex : currentPointIndex
      );

    return {
      shapeId: anchorPointId,
      title: anchorPointMeasurement
        ? getCustomPointMeasurementName(anchorPointMeasurement.name) || ""
        : "",
      placeholderText: `Distanz ${anchorDistanceLabel}`,
    };
  }, [
    currentMeasurement,
    distanceRelations,
    isAnnotationMode,
    measurementMode,
    pointMeasurements,
    pointRelationRows,
    getBadgeTextForPointId,
  ]);

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
    selectedPolygonSurfaceTypeValue === "roof";
  const selectedPolygonPrimaryAreaSquareMeters = showSurfaceAreaForType
    ? selectedConnectedPlanarPolygonTotalAreaSquareMeters
    : selectedPolygonHorizontalAreaSquareMeters;
  const hasConnectedPlanarPolygonGroups =
    selectedConnectedPlanarPolygonGroups.length > 1;
  const selectedPolygonDefaultHeading = useMemo(() => {
    if (selectedPolylineSummary) {
      return `Polygonzug ${formatNumber(
        selectedPolylineSummary.totalLengthMeters
      )} m`;
    }
    if (selectedPolygonSurfaceTypeValue === "footprint") {
      return `Grundriss ${formatAreaAdaptive(
        selectedPolygonHorizontalAreaSquareMeters
      )}`;
    }
    if (selectedPolygonSurfaceTypeValue === "roof") {
      return `Dachfläche ${formatAreaAdaptive(
        selectedConnectedPlanarPolygonTotalAreaSquareMeters
      )}`;
    }
    if (selectedPolygonSurfaceTypeValue === "facade") {
      return `Fassade ${formatAreaAdaptive(
        selectedConnectedPlanarPolygonTotalAreaSquareMeters
      )}`;
    }
    if (selectedPolygonSurfaceTypeValue === "terrain") {
      return `Gelände ${formatAreaAdaptive(
        selectedConnectedPlanarPolygonTotalAreaSquareMeters
      )}`;
    }
    return `Fläche ${formatAreaAdaptive(
      selectedPolygonPrimaryAreaSquareMeters
    )}`;
  }, [
    selectedConnectedPlanarPolygonTotalAreaSquareMeters,
    selectedPolygonHorizontalAreaSquareMeters,
    selectedPolygonPrimaryAreaSquareMeters,
    selectedPolygonSurfaceTypeValue,
    selectedPolylineSummary,
  ]);
  const selectedPolygonBadgeText = useMemo(() => {
    const firstVertexPointId =
      selectedPlanarPolygonGroup?.vertexPointIds[0] ?? null;
    return getBadgeTextForPointId(firstVertexPointId);
  }, [getBadgeTextForPointId, selectedPlanarPolygonGroup?.vertexPointIds]);
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
  const activeMeasurementTypeTitle = useMemo(() => {
    if (isPolygonInfoMode) {
      if (selectedPolylineSummary) {
        return "Polygonzug";
      }
      if (selectedPolygonSurfaceTypeValue === "footprint") {
        return "Grundriss";
      }
      if (selectedPolygonSurfaceTypeValue === "facade") {
        return "Fassadenfläche";
      }
      if (selectedPolygonSurfaceTypeValue === "terrain") {
        return "Gelände";
      }
      if (selectedPolygonSurfaceTypeValue === "roof") {
        return "Dachfläche";
      }
      return selectedPolygonSurfaceTypeLabel;
    }

    if (currentMeasurement && isTraverseMeasurementEntry(currentMeasurement)) {
      return "3D Polygonzugmessung";
    }

    if (
      showPointInfoMode &&
      measurementMode === MeasurementMode.PointQuery &&
      !isAnnotationMode
    ) {
      return "Distanzmessung";
    }

    if (showPointInfoMode && isAnnotationMode) {
      return "Anmerkung";
    }

    if (showPointInfoMode) {
      return "Punktmessung";
    }

    if (measurementMode === MeasurementMode.PointQuery) {
      return "Distanzmessung";
    }

    if (measurementMode === MeasurementMode.PointMeasure) {
      return pointLabelOnCreate ? "Anmerkung" : "Punktmessung";
    }

    if (measurementMode === MeasurementMode.PolylineMeasure) {
      if (planarMeasurementCreationMode === "polyline") {
        return "Polygonzug";
      }
      const activeSurfaceType = polygonSurfaceTypePreset;
      if (activeSurfaceType === "footprint") return "Grundriss";
      if (activeSurfaceType === "facade") return "Fassadenfläche";
      if (activeSurfaceType === "terrain") return "Gelände";
      return "Dachfläche";
    }

    return "3D Messungen";
  }, [
    currentMeasurement,
    isPolygonInfoMode,
    selectedPolygonSurfaceTypeLabel,
    selectedPolygonSurfaceTypeValue,
    selectedPolylineSummary,
    measurementMode,
    isAnnotationMode,
    showPointInfoMode,
    planarMeasurementCreationMode,
    pointLabelOnCreate,
    polygonSurfaceTypePreset,
  ]);
  const hasMeasurementData =
    measurements.length > 0 || planarPolygonGroups.length > 0;
  const hasInfoBoxContent =
    Boolean(currentMeasurement) ||
    isPolygonInfoMode ||
    (measurementMode !== MeasurementMode.NONE && hasMeasurementData);
  const currentMeasurementBadgeText = useMemo(() => {
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return undefined;
    }
    return getBadgeTextForPointId(currentMeasurement.id);
  }, [currentMeasurement, getBadgeTextForPointId]);
  const distanceTitleBadgeText = useMemo(() => {
    if (measurementMode !== MeasurementMode.PointQuery) return undefined;
    return getBadgeTextForPointId(distanceTitleContext?.shapeId ?? null);
  }, [distanceTitleContext?.shapeId, getBadgeTextForPointId, measurementMode]);
  return (
    <div>
      {hasInfoBoxContent && (
        <CarmaResponsiveInfoBox
          width={pixelWidth}
          onPanelClick={() => {}}
          collapsible={!!currentMeasurement || isPolygonInfoMode}
          headingColor={infoBoxHeaderColor}
          heading={
            <div className="w-full px-2 flex items-center justify-between">
              <span
                className="truncate font-bold text-white"
                title={activeMeasurementTypeTitle}
              >
                {activeMeasurementTypeTitle}
              </span>
            </div>
          }
          subtitle={
            <>
              {isPolygonInfoMode ? (
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
                        placeholderText={selectedPolygonDefaultHeading}
                        clearPlaceholderOnFocus
                        showOrder={false}
                        leadingBadgeText={selectedPolygonBadgeText}
                        collapsedContent={formatAreaAdaptive(
                          selectedPolygonPrimaryAreaSquareMeters
                        )}
                        editable={true}
                        capitalize={false}
                        multiline={true}
                      />
                    </span>
                    <div className="flex justify-end items-center shrink-0 mt-0 gap-2">
                      <Tooltip
                        getPopupContainer={() => document.body}
                        title="Zum Polygon fliegen"
                      >
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
                      <Tooltip
                        getPopupContainer={() => document.body}
                        title={
                          isSelectedPolygonHidden
                            ? "Polygon einblenden"
                            : "Polygon ausblenden"
                        }
                      >
                        <VisibilityToggleButton
                          isVisible={!isSelectedPolygonHidden}
                          onToggle={() => toggleSelectedPolygonHidden()}
                          ariaLabel={
                            isSelectedPolygonHidden
                              ? "Polygon einblenden"
                              : "Polygon ausblenden"
                          }
                          dataTestId="toggle-polygon-visibility-btn"
                          className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                          fontSize={INFOBOX_ACTION_TOGGLE_SIZE_PX}
                          iconSlotWidth={INFOBOX_ACTION_TOGGLE_SIZE_PX}
                          iconSlotHeight={INFOBOX_ACTION_TOGGLE_SIZE_PX}
                          style={INFOBOX_ACTION_TOGGLE_BUTTON_STYLE}
                        />
                      </Tooltip>
                      <Tooltip
                        getPopupContainer={() => document.body}
                        title="Polygon löschen"
                      >
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
                        {formatNumber(
                          selectedPolylineSummary.totalLengthMeters
                        )}{" "}
                        m • Horizontal:{" "}
                        {formatNumber(
                          selectedPolylineSummary.totalHorizontalLengthMeters
                        )}{" "}
                        m • Höhendifferenz:{" "}
                        {formatNumber(
                          Math.abs(
                            selectedPolylineSummary.startEndElevationDeltaMeters
                          )
                        )}{" "}
                        m
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setIsPolygonSurfaceTypePickerOpen((prev) => !prev);
                          }}
                          className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left text-gray-500 underline-offset-2 hover:underline"
                          data-test-id="infobox-polygon-surface-type-toggle"
                        >
                          {selectedPolygonSurfaceTypeLabel}
                        </button>
                        {isPolygonSurfaceTypePickerOpen && (
                          <Select
                            size="small"
                            value={selectedPolygonSurfaceTypeValue}
                            options={POLYGON_SURFACE_TYPE_OPTIONS}
                            onChange={(nextType) => {
                              updateSelectedPolygonSurfaceType(
                                nextType as PolygonSurfaceTypeOption
                              );
                              setIsPolygonSurfaceTypePickerOpen(false);
                            }}
                            style={{ minWidth: 148 }}
                            onClick={stopEventPropagation}
                            onMouseDown={stopEventPropagation}
                            data-test-id="infobox-polygon-surface-type-select"
                          />
                        )}
                        <span>
                          •{" "}
                          {formatAreaAdaptive(
                            selectedPolygonPrimaryAreaSquareMeters
                          )}
                        </span>
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
                        key={
                          distanceTitleContext?.shapeId ?? currentMeasurement.id
                        }
                        order={visibleMeasurements.length - currentIndex}
                        title={
                          distanceTitleContext?.title ??
                          (getCustomPointMeasurementName(
                            currentMeasurement.name
                          ) ||
                            "")
                        }
                        shapeId={
                          distanceTitleContext?.shapeId ?? currentMeasurement.id
                        }
                        setUpdateMeasurementStatus={() => {}}
                        updateTitleMeasurementById={handleMeasurementNameUpdate}
                        isCollapsed={collapsedInfoBox}
                        placeholderText={
                          measurementMode === MeasurementMode.PointQuery
                            ? distanceTitleContext?.placeholderText
                            : pointLabelOnCreate
                            ? lastCustomPointLabel
                            : isPointMeasurementEntry(currentMeasurement) &&
                              !isAnnotationMode
                            ? `Punkt ${
                                pointMeasurements.findIndex(
                                  (measurement) =>
                                    measurement.id === currentMeasurement.id
                                ) + 1
                              }`
                            : undefined
                        }
                        clearPlaceholderOnFocus={false}
                        showOrder={false}
                        leadingBadgeText={
                          measurementMode === MeasurementMode.PointQuery
                            ? distanceTitleBadgeText ??
                              currentMeasurementBadgeText
                            : currentMeasurementBadgeText
                        }
                        collapsedContent={
                          isPointMeasurementEntry(currentMeasurement)
                            ? isAnnotationMode
                              ? ""
                              : `NHN ${formatNumber(
                                  currentMeasurement.geometryWGS84.height
                                )} m`
                            : ""
                        }
                        editable={true}
                        capitalize={false}
                        multiline={true}
                        autoFocusTrigger={labelFocusTrigger}
                      />
                    </span>
                    <div className="flex justify-end items-center shrink-0 mt-0 gap-2">
                      {!isReference && !isAnnotationMode && (
                        <Tooltip
                          getPopupContainer={() => document.body}
                          title="Als Referenzhöhe setzen"
                        >
                          <FontAwesomeIcon
                            onClick={setAsReferenceHandler}
                            className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                            icon={faArrowsDownToLine}
                            data-test-id="set-reference-btn"
                          />
                        </Tooltip>
                      )}
                      <Tooltip
                        getPopupContainer={() => document.body}
                        title="Zur Messung fliegen"
                      >
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
                      <Tooltip
                        getPopupContainer={() => document.body}
                        title={
                          isCurrentMeasurementHidden
                            ? "Messung einblenden"
                            : "Messung ausblenden"
                        }
                      >
                        <VisibilityToggleButton
                          isVisible={!isCurrentMeasurementHidden}
                          onToggle={() => toggleCurrentMeasurementHidden()}
                          ariaLabel={
                            isCurrentMeasurementHidden
                              ? "Messung einblenden"
                              : "Messung ausblenden"
                          }
                          dataTestId="toggle-measurement-visibility-btn"
                          className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                          fontSize={INFOBOX_ACTION_TOGGLE_SIZE_PX}
                          iconSlotWidth={INFOBOX_ACTION_TOGGLE_SIZE_PX}
                          iconSlotHeight={INFOBOX_ACTION_TOGGLE_SIZE_PX}
                          style={INFOBOX_ACTION_TOGGLE_BUTTON_STYLE}
                        />
                      </Tooltip>
                      {currentMeasurement && (
                        <Tooltip
                          getPopupContainer={() => document.body}
                          title={
                            isCurrentMeasurementLocked
                              ? "Sperre aufheben"
                              : "Messung sperren"
                          }
                        >
                          <LockToggleButton
                            isLocked={isCurrentMeasurementLocked}
                            onToggle={() =>
                              toggleMeasurementLockById(currentMeasurement.id)
                            }
                            ariaLabel={
                              isCurrentMeasurementLocked
                                ? "Sperre aufheben"
                                : "Messung sperren"
                            }
                            dataTestId="toggle-measurement-lock-btn"
                            className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                            fontSize={INFOBOX_ACTION_TOGGLE_SIZE_PX}
                            iconSlotWidth={INFOBOX_ACTION_TOGGLE_SIZE_PX}
                            iconSlotHeight={INFOBOX_ACTION_TOGGLE_SIZE_PX}
                            style={INFOBOX_ACTION_TOGGLE_BUTTON_STYLE}
                          />
                        </Tooltip>
                      )}
                      <Tooltip
                        getPopupContainer={() => document.body}
                        title="Löschen"
                      >
                        <FontAwesomeIcon
                          onClick={deleteShapeHandler}
                          className="cursor-pointer text-base text-[#808080] hover:text-[#a0a0a0]"
                          icon={faTrashCan}
                          data-test-id="delete-measurement-btn"
                        />
                      </Tooltip>
                    </div>
                  </div>
                  {!isAnnotationMode &&
                    isPointMeasurementEntry(currentMeasurement) &&
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
                            Lat °
                            {coordinateEditValues?.latitudeHemisphere ?? "N"}
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
                            Lon °
                            {coordinateEditValues?.longitudeHemisphere ?? "O"}
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
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={startAbsoluteElevationEditMode}
                              className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left text-[10px] font-normal text-gray-500 whitespace-nowrap"
                              data-test-id="elevation-display-btn"
                            >
                              {formatNumber(
                                currentMeasurement.geometryWGS84.height
                              )}{" "}
                              m ü. NHN
                              {isReference ? " ist Bezugshöhe" : ""}
                            </button>
                            {(() => {
                              const isAbsElevVisible =
                                currentMeasurement.pointLabelMode ===
                                "absoluteElevation";
                              return (
                                <Tooltip
                                  getPopupContainer={() => document.body}
                                  title={
                                    isAbsElevVisible
                                      ? "NHN-Höhe im Label ausblenden"
                                      : "NHN-Höhe im Label anzeigen"
                                  }
                                >
                                  <VisibilityToggleButton
                                    isVisible={isAbsElevVisible}
                                    onToggle={(nextVisible) => {
                                      setPointLabelMetricModeById(
                                        currentMeasurement.id,
                                        nextVisible
                                          ? "absoluteElevation"
                                          : "elevation"
                                      );
                                    }}
                                    stopPropagation
                                    ariaLabel={
                                      isAbsElevVisible
                                        ? "NHN-Höhe im Label ausblenden"
                                        : "NHN-Höhe im Label anzeigen"
                                    }
                                    dataTestId="toggle-abs-elevation-label-btn"
                                    className="cursor-pointer text-[10px] text-[#808080] hover:text-[#a0a0a0]"
                                    iconSlotWidth={12}
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      padding: 0,
                                    }}
                                  />
                                </Tooltip>
                              );
                            })()}
                          </span>
                        )}
                      </div>
                    ))}
                </div>
              ) : null}
            </>
          }
          content={
            <>
              {isPolygonInfoMode ? (
                <div className="text-[12px] mb-0">
                  <div className="text-sm pl-2 pr-1">
                    {selectedPolylineSummary ? (
                      <>
                        <div className="mb-1">
                          <span className="text-gray-500 mr-1">
                            Gesamtlänge:
                          </span>
                          <span className="tabular-nums">
                            {formatNumber(
                              selectedPolylineSummary.totalLengthMeters
                            )}{" "}
                            m
                          </span>
                        </div>
                        <div className="mb-1">
                          <span className="text-gray-500 mr-1">
                            Horizontaldistanz:
                          </span>
                          <span className="tabular-nums">
                            {formatNumber(
                              selectedPolylineSummary.totalHorizontalLengthMeters
                            )}{" "}
                            m
                          </span>
                        </div>
                        <div className="mb-1 inline-flex items-center gap-2">
                          <span className="text-gray-500">
                            Segmentdarstellung:
                          </span>
                          <span className="text-gray-500">Direkt</span>
                          <Switch
                            size="small"
                            checked={polylineSegmentLineMode === "components"}
                            onChange={(checked) =>
                              setPolylineSegmentLineMode(
                                checked ? "components" : "direct"
                              )
                            }
                            aria-label="Polygonzug-Segmentdarstellung umschalten"
                            data-test-id="infobox-polyline-line-mode-toggle"
                          />
                          <span className="text-gray-500">Komponenten</span>
                        </div>
                        <div className="mb-1">
                          {isPolylineVerticalOffsetEditModeActive ? (
                            <span
                              className="inline-flex items-center gap-1"
                              onClick={stopEventPropagation}
                            >
                              <InputNumber
                                value={polylineVerticalOffsetMeters}
                                onChange={
                                  handlePolylineVerticalOffsetInputChange
                                }
                                {...elevationInputSharedProps}
                                onPressEnter={
                                  handlePolylineVerticalOffsetInputPressEnter
                                }
                                style={{
                                  width: polylineVerticalOffsetInputWidthPx,
                                }}
                                data-test-id="infobox-polyline-vertical-offset-edit-input"
                              />
                              <button
                                type="button"
                                onClick={stopPolylineVerticalOffsetEditMode}
                                className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                data-test-id="infobox-polyline-vertical-offset-edit-complete-btn"
                                aria-label="Polygonzug-Vertikalversatzbearbeitung abschließen"
                              >
                                <FontAwesomeIcon icon={faCheck} />
                              </button>
                              <span>m Vertikalversatz ab Ankerpunkt</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={startPolylineVerticalOffsetEditMode}
                                className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left tabular-nums"
                                data-test-id="infobox-polyline-vertical-offset-display-btn"
                              >
                                {formatNumber(polylineVerticalOffsetMeters)} m
                              </button>
                              <span>Vertikalversatz ab Ankerpunkt</span>
                            </span>
                          )}
                        </div>
                        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px]">
                          <span className="text-gray-500">Aufstieg:</span>
                          <span className="tabular-nums">
                            {formatNumber(selectedPolylineSummary.ascentMeters)}{" "}
                            m
                          </span>
                          <span className="text-gray-500">Abstieg:</span>
                          <span className="tabular-nums">
                            {formatNumber(
                              selectedPolylineSummary.descentMeters
                            )}{" "}
                            m
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
                          <span className="text-gray-500 mr-1">
                            Δ Start/Ende:
                          </span>
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
                        <div className="mb-1">
                          <span className="text-gray-500 mr-1">
                            Ø horizontales Segment:
                          </span>
                          <span className="tabular-nums">
                            {formatNumber(
                              selectedPolylineSummary.meanHorizontalSegmentLengthMeters
                            )}{" "}
                            m
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mb-1">
                          <span className="text-gray-500 mr-1">
                            {selectedPolygonSurfaceTypeValue === "footprint"
                              ? "Fläche:"
                              : "Oberfläche:"}
                          </span>
                          <span className="tabular-nums">
                            {formatAreaAdaptive(
                              selectedPolygonSurfaceTypeValue === "footprint"
                                ? selectedPolygonHorizontalAreaSquareMeters
                                : selectedConnectedPlanarPolygonTotalAreaSquareMeters
                            )}
                          </span>
                        </div>
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
                        {showSurfaceAreaForType && (
                          <div className="mb-1">
                            <span className="text-gray-500 mr-1">
                              3D-Umfang:
                            </span>
                            <span className="tabular-nums">
                              {formatSignificant(
                                selectedPolygonCircumferenceSummary.threeDMeters
                              )}{" "}
                              m
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
                        {hasConnectedPlanarPolygonGroups && (
                          <div className="mb-1">
                            <span className="text-gray-500 mr-1">
                              Teilflächen:
                            </span>
                            <span>
                              {selectedConnectedPlanarPolygonGroups.length}
                            </span>
                          </div>
                        )}
                        {(selectedPolygonSurfaceTypeValue === "facade" ||
                          selectedPolygonSurfaceTypeValue === "roof") && (
                          <div className="mb-1">
                            <span className="text-gray-500 mr-1">
                              {selectedPolygonSurfaceTypeValue === "facade"
                                ? "Fassadenrichtung:"
                                : "Dachrichtung:"}
                            </span>
                            <span>
                              {selectedPolygonTiltInfo.normalDirectionText}
                            </span>
                          </div>
                        )}
                        {selectedPolygonSurfaceTypeValue === "roof" && (
                          <>
                            <div className="mb-1">
                              <span className="text-gray-500 mr-1">
                                Ø Dachneigung:
                              </span>
                              <span className="tabular-nums">
                                {selectedConnectedRoofAverageSlopeDeg === null
                                  ? "Keine Dächer"
                                  : `${formatNumber(
                                      selectedConnectedRoofAverageSlopeDeg
                                    )}°`}
                              </span>
                            </div>
                            {hasConnectedPlanarPolygonGroups && (
                              <div className="mb-1">
                                <span className="text-gray-500 mr-1">
                                  Dachneigung je Dach:
                                </span>
                                <span>
                                  {selectedConnectedRoofSlopeLabels.length > 0
                                    ? selectedConnectedRoofSlopeLabels.join(
                                        " • "
                                      )
                                    : "Keine Dächer"}
                                </span>
                              </div>
                            )}
                            <div className="mb-1">
                              <span className="text-gray-500 mr-1">
                                Kippwinkel:
                              </span>
                              <span className="tabular-nums">
                                {formatNumber(selectedPolygonTiltInfo.tiltDeg)}°
                                ({selectedPolygonTiltInfo.slopePercentText})
                              </span>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : currentMeasurement ? (
                <div>
                  {!isAnnotationMode && !isReferencePointWithoutEdges ? (
                    <div className="text-[12px] mb-0">
                      {isPointMeasurementEntry(currentMeasurement) && (
                        <>
                          <div className="mt-1 text-sm pl-2">
                            {pointRelationRows.length > 0 ? (
                              <div className="pr-1">
                                <div className="flex flex-col items-start gap-1 mb-1">
                                  {verticalOffsetValue !== null && (
                                    <div className="inline-flex items-center gap-1">
                                      {isVerticalOffsetEditModeActive ? (
                                        <span
                                          className="inline-flex items-center gap-1"
                                          onClick={stopEventPropagation}
                                        >
                                          <InputNumber
                                            value={verticalOffsetValue}
                                            onChange={
                                              handleVerticalOffsetInputChange
                                            }
                                            {...elevationInputSharedProps}
                                            style={{
                                              width: verticalOffsetInputWidthPx,
                                            }}
                                            data-test-id="vertical-offset-edit-input"
                                          />
                                          <button
                                            type="button"
                                            onClick={stopVerticalOffsetEditMode}
                                            className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                            data-test-id="vertical-offset-edit-complete-btn"
                                            aria-label="Vertikalversatzbearbeitung abschließen"
                                          >
                                            <FontAwesomeIcon icon={faCheck} />
                                          </button>
                                          <span>
                                            m Vertikalversatz ab Ankerpunkt
                                          </span>
                                        </span>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            onClick={
                                              startVerticalOffsetEditMode
                                            }
                                            className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left"
                                            data-test-id="vertical-offset-display-btn"
                                          >
                                            {formatNumber(verticalOffsetValue)}{" "}
                                            m
                                          </button>
                                          <span>
                                            Vertikalversatz ab Ankerpunkt
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                  {!isReference &&
                                    (isRelativeElevationEditActive ? (
                                      <span
                                        className="inline-flex items-center gap-1"
                                        onClick={stopEventPropagation}
                                      >
                                        <InputNumber
                                          value={relativeElevationValue}
                                          onChange={handleElevationInputChange}
                                          {...elevationInputSharedProps}
                                          style={{
                                            width:
                                              relativeElevationInputWidthPx,
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
                                        <span>
                                          m relative Höhe über Bezugspunkt
                                        </span>
                                        {isRelativeElevationLabelEnabled &&
                                        absoluteElevationWithNhnSuffix ? (
                                          <span>
                                            ({absoluteElevationWithNhnSuffix})
                                          </span>
                                        ) : null}
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 flex-wrap">
                                        <button
                                          type="button"
                                          onClick={
                                            startRelativeElevationEditMode
                                          }
                                          className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left"
                                          data-test-id="relative-elevation-display-btn"
                                        >
                                          {formatNumber(relativeElevationValue)}{" "}
                                          m
                                        </button>
                                        {(() => {
                                          const isRelElevVisible =
                                            (currentMeasurement.pointLabelMode ??
                                              "elevation") === "elevation";
                                          return (
                                            <Tooltip
                                              getPopupContainer={() =>
                                                document.body
                                              }
                                              title={
                                                isRelElevVisible
                                                  ? "Relative Höhe im Label ausblenden"
                                                  : "Relative Höhe im Label anzeigen"
                                              }
                                            >
                                              <VisibilityToggleButton
                                                isVisible={isRelElevVisible}
                                                onToggle={(nextVisible) => {
                                                  setPointLabelMetricModeById(
                                                    currentMeasurement.id,
                                                    nextVisible
                                                      ? "elevation"
                                                      : "none"
                                                  );
                                                }}
                                                stopPropagation
                                                ariaLabel={
                                                  isRelElevVisible
                                                    ? "Relative Höhe im Label ausblenden"
                                                    : "Relative Höhe im Label anzeigen"
                                                }
                                                dataTestId="toggle-rel-elevation-label-btn"
                                                className="cursor-pointer text-[10px] text-[#808080] hover:text-[#a0a0a0]"
                                                iconSlotWidth={12}
                                                style={{
                                                  background: "transparent",
                                                  border: "none",
                                                  padding: 0,
                                                }}
                                              />
                                            </Tooltip>
                                          );
                                        })()}
                                        <span>
                                          relative Höhe über Bezugspunkt
                                        </span>
                                        {isRelativeElevationLabelEnabled &&
                                        absoluteElevationWithNhnSuffix ? (
                                          <span>
                                            ({absoluteElevationWithNhnSuffix})
                                          </span>
                                        ) : null}
                                      </span>
                                    ))}
                                </div>
                                <table className="w-full text-[10px] leading-tight">
                                  <thead>
                                    <tr className="text-left text-gray-500">
                                      <th className="font-normal pr-2">
                                        Punkt
                                      </th>
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
                                          relationMetricEdit.kind ===
                                            "vertical" ? (
                                            <span
                                              className="inline-flex items-center gap-1"
                                              onClick={stopEventPropagation}
                                            >
                                              {!row.isImplicitReferenceRow && (
                                                <VisibilityToggleButton
                                                  isVisible={
                                                    row.lineVisibility
                                                      .vertical &&
                                                    row.lineVisibility
                                                      .horizontal
                                                  }
                                                  onToggle={() =>
                                                    toggleDistanceRelationLineVisibilityByKind(
                                                      row.relationId,
                                                      "components"
                                                    )
                                                  }
                                                  disabled={!row.relationId}
                                                  ariaLabel="Komponentenlinien ein- oder ausblenden"
                                                  className="cursor-pointer text-[9px] text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                                  iconSlotWidth={10}
                                                  style={{
                                                    border: 0,
                                                    background: "transparent",
                                                    padding: 0,
                                                  }}
                                                />
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
                                                  width:
                                                    getElevationInputWidthPx(
                                                      row.elevation
                                                    ),
                                                }}
                                                data-test-id={`relation-vertical-edit-input-${row.relatedPointId}`}
                                              />
                                              <button
                                                type="button"
                                                onClick={
                                                  stopRelationMetricEditMode
                                                }
                                                className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                                data-test-id={`relation-vertical-edit-complete-btn-${row.relatedPointId}`}
                                                aria-label="Vertikale Distanz bearbeiten abschließen"
                                              >
                                                <FontAwesomeIcon
                                                  icon={faCheck}
                                                />
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
                                              <VisibilityToggleButton
                                                isVisible={
                                                  row.lineVisibility.vertical &&
                                                  row.lineVisibility.horizontal
                                                }
                                                onToggle={() =>
                                                  toggleDistanceRelationLineVisibilityByKind(
                                                    row.relationId,
                                                    "components"
                                                  )
                                                }
                                                disabled={!row.relationId}
                                                ariaLabel="Komponentenlinien ein- oder ausblenden"
                                                className="cursor-pointer text-[9px] text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                                iconSlotWidth={10}
                                                style={{
                                                  border: 0,
                                                  background: "transparent",
                                                  padding: 0,
                                                }}
                                              />
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
                                                  width:
                                                    getElevationInputWidthPx(
                                                      row.horizontalDistance
                                                    ),
                                                }}
                                                data-test-id={`relation-horizontal-edit-input-${row.relatedPointId}`}
                                              />
                                              <button
                                                type="button"
                                                onClick={
                                                  stopRelationMetricEditMode
                                                }
                                                className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                                data-test-id={`relation-horizontal-edit-complete-btn-${row.relatedPointId}`}
                                                aria-label="Horizontale Distanz bearbeiten abschließen"
                                              >
                                                <FontAwesomeIcon
                                                  icon={faCheck}
                                                />
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
                                              {formatNumber(
                                                row.horizontalDistance
                                              )}{" "}
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
                                              {formatNumber(
                                                row.horizontalDistance
                                              )}{" "}
                                              m
                                            </button>
                                          )}
                                        </td>
                                        <td className="text-right tabular-nums pr-2">
                                          {relationMetricEdit?.relatedPointId ===
                                            row.relatedPointId &&
                                          relationMetricEdit.kind ===
                                            "direct" ? (
                                            <span
                                              className="inline-flex items-center gap-1"
                                              onClick={stopEventPropagation}
                                            >
                                              {!row.isImplicitReferenceRow && (
                                                <VisibilityToggleButton
                                                  isVisible={
                                                    row.lineVisibility.direct
                                                  }
                                                  onToggle={() =>
                                                    toggleDistanceRelationLineVisibilityByKind(
                                                      row.relationId,
                                                      "direct"
                                                    )
                                                  }
                                                  disabled={!row.relationId}
                                                  ariaLabel="Direkte Linie ein- oder ausblenden"
                                                  className="cursor-pointer text-[9px] text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                                  iconSlotWidth={10}
                                                  style={{
                                                    border: 0,
                                                    background: "transparent",
                                                    padding: 0,
                                                  }}
                                                />
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
                                                  width:
                                                    getElevationInputWidthPx(
                                                      row.distance
                                                    ),
                                                }}
                                                data-test-id={`relation-direct-edit-input-${row.relatedPointId}`}
                                              />
                                              <button
                                                type="button"
                                                onClick={
                                                  stopRelationMetricEditMode
                                                }
                                                className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                                data-test-id={`relation-direct-edit-complete-btn-${row.relatedPointId}`}
                                                aria-label="Direkte Distanz bearbeiten abschließen"
                                              >
                                                <FontAwesomeIcon
                                                  icon={faCheck}
                                                />
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
                                              <VisibilityToggleButton
                                                isVisible={
                                                  row.lineVisibility.direct
                                                }
                                                onToggle={() =>
                                                  toggleDistanceRelationLineVisibilityByKind(
                                                    row.relationId,
                                                    "direct"
                                                  )
                                                }
                                                disabled={!row.relationId}
                                                ariaLabel="Direkte Linie ein- oder ausblenden"
                                                className="cursor-pointer text-[9px] text-[#808080] hover:text-[#a0a0a0] disabled:opacity-40 disabled:cursor-default"
                                                iconSlotWidth={10}
                                                style={{
                                                  border: 0,
                                                  background: "transparent",
                                                  padding: 0,
                                                }}
                                              />
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
                              <div className="pr-1 flex flex-col items-start gap-1">
                                {verticalOffsetValue !== null && (
                                  <div className="inline-flex items-center gap-1">
                                    {isVerticalOffsetEditModeActive ? (
                                      <span
                                        className="inline-flex items-center gap-1"
                                        onClick={stopEventPropagation}
                                      >
                                        <InputNumber
                                          value={verticalOffsetValue}
                                          onChange={
                                            handleVerticalOffsetInputChange
                                          }
                                          {...elevationInputSharedProps}
                                          style={{
                                            width: verticalOffsetInputWidthPx,
                                          }}
                                          data-test-id="vertical-offset-edit-input"
                                        />
                                        <button
                                          type="button"
                                          onClick={stopVerticalOffsetEditMode}
                                          className="px-1.5 py-[1px] text-[11px] leading-[14px] border rounded border-[#0078a8] text-[#0078a8] bg-white hover:bg-[#e8f4fa]"
                                          data-test-id="vertical-offset-edit-complete-btn"
                                          aria-label="Vertikalversatzbearbeitung abschließen"
                                        >
                                          <FontAwesomeIcon icon={faCheck} />
                                        </button>
                                        <span>
                                          m Vertikalversatz ab Ankerpunkt
                                        </span>
                                      </span>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={startVerticalOffsetEditMode}
                                          className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left"
                                          data-test-id="vertical-offset-display-btn"
                                        >
                                          {formatNumber(verticalOffsetValue)} m
                                        </button>
                                        <span>
                                          Vertikalversatz ab Ankerpunkt
                                        </span>
                                      </>
                                    )}
                                  </div>
                                )}
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
                                    <span>
                                      m relative Höhe über Bezugspunkt
                                    </span>
                                    {isRelativeElevationLabelEnabled &&
                                    absoluteElevationWithNhnSuffix ? (
                                      <span>
                                        ({absoluteElevationWithNhnSuffix})
                                      </span>
                                    ) : null}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={startRelativeElevationEditMode}
                                      className="cursor-pointer bg-transparent border-0 p-0 m-0 text-left"
                                      data-test-id="relative-elevation-display-btn"
                                    >
                                      {formatNumber(relativeElevationValue)} m
                                    </button>
                                    {(() => {
                                      const isRelElevVisible =
                                        (currentMeasurement.pointLabelMode ??
                                          "elevation") === "elevation";
                                      return (
                                        <Tooltip
                                          getPopupContainer={() =>
                                            document.body
                                          }
                                          title={
                                            isRelElevVisible
                                              ? "Relative Höhe im Label ausblenden"
                                              : "Relative Höhe im Label anzeigen"
                                          }
                                        >
                                          <VisibilityToggleButton
                                            isVisible={isRelElevVisible}
                                            onToggle={(nextVisible) => {
                                              setPointLabelMetricModeById(
                                                currentMeasurement.id,
                                                nextVisible
                                                  ? "elevation"
                                                  : "none"
                                              );
                                            }}
                                            stopPropagation
                                            ariaLabel={
                                              isRelElevVisible
                                                ? "Relative Höhe im Label ausblenden"
                                                : "Relative Höhe im Label anzeigen"
                                            }
                                            dataTestId="toggle-rel-elevation-label-btn"
                                            className="cursor-pointer text-[10px] text-[#808080] hover:text-[#a0a0a0]"
                                            iconSlotWidth={12}
                                            style={{
                                              background: "transparent",
                                              border: "none",
                                              padding: 0,
                                            }}
                                          />
                                        </Tooltip>
                                      );
                                    })()}
                                    <span>relative Höhe über Bezugspunkt</span>
                                    {isRelativeElevationLabelEnabled &&
                                    absoluteElevationWithNhnSuffix ? (
                                      <span>
                                        ({absoluteElevationWithNhnSuffix})
                                      </span>
                                    ) : null}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                  <div className="flex justify-center items-center w-full px-2 mt-1 pt-1">
                    <span
                      className="text-[#0078a8] cursor-pointer"
                      onClick={flyToAllMeasurements}
                    >
                      {pointAndAnnotationCount} Messungen und Anmerkungen
                      verfügbar
                    </span>
                  </div>
                  {showContextNavigation && (
                    <div className="flex justify-between items-center w-full px-2 mt-0 mb-1">
                      <a
                        className="renderAsLink text-[#0078a8] cursor-pointer"
                        onClick={decreaseContextHandler}
                        data-test-id="switch-measurement-left"
                        style={{ fontSize: "10.5px" }}
                        aria-label="Vorherige Messung"
                      >
                        <FontAwesomeIcon icon={faAnglesLeft} />
                      </a>
                      <span className="mx-4">
                        {currentContextMeasurementIndex >= 0
                          ? currentContextMeasurementIndex + 1
                          : 1}{" "}
                        von {contextNavigationEntries.length}
                      </span>
                      <a
                        className="renderAsLink text-[#0078a8] cursor-pointer"
                        onClick={increaseContextHandler}
                        data-test-id="switch-measurement-right"
                        style={{ fontSize: "10.5px" }}
                        aria-label="Nächste Messung"
                      >
                        <FontAwesomeIcon icon={faAnglesRight} />
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <></>
              )}
            </>
          }
        />
      )}
    </div>
  );
}
