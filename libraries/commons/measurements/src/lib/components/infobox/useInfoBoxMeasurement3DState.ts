import {
  useState,
  useEffect,
  useContext,
  useCallback,
  useMemo,
  MouseEvent as ReactMouseEvent,
} from "react";
import {
  Cartesian3,
  Ellipsoid,
  Matrix4,
  Transforms,
  getDegreesFromCartesian,
} from "@carma/cesium";
import { getActiveMeasurementTypeTitle } from "./InfoBoxMeasurement3D.formatters";
import { resolveInfoBoxMeasurementViewType } from "./InfoBoxMeasurement3D.types";
import { UIContext } from "react-cismap/contexts/UIContextProvider";
import {
  useCesiumMeasurements,
  DEFAULT_POINT_MEASUREMENT_PLACEHOLDER,
  MeasurementMode,
  type MeasurementEntry,
  type PointMeasurementEntry,
  isPointMeasurementEntry,
  getEuclideanDistance,
  getENU,
  isTraverseMeasurementEntry,
} from "@carma-mapping/engines/cesium/measurements";
import { useMeasurements } from "../../context/MeasurementsContext";
import { useMeasurementSelection } from "../../context/MeasurementSelectionContext";
import { useMeasurementEdit } from "../../context/MeasurementEditContext";
import { useCesiumContext } from "@carma-mapping/engines/cesium";
import {
  SPATIAL_MARKUP_KIND_AREA,
  SPATIAL_MARKUP_KIND_DISTANCE,
  SPATIAL_MARKUP_KIND_POINT,
  SPATIAL_MARKUP_KIND_POLYLINE,
} from "../../types/measurementKindRegistry";
import {
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  type PolylineSegmentLineMode,
} from "../../types/measurementTypes";
import {
  buildRelationMoveAxisCandidates,
  getElevationInputWidthPx,
  sanitizePureLabelFontSizePx,
  stopEventPropagation,
  formatSignificant,
} from "./InfoBoxMeasurement3D.helpers";
import {
  PURE_LABEL_COLOR_STYLE_OPTIONS,
  PURE_LABEL_DEFAULT_BACKGROUND_COLOR,
  PURE_LABEL_DEFAULT_FONT_SIZE_PX,
  PURE_LABEL_DEFAULT_TEXT_COLOR,
  PURE_LABEL_FONT_SIZE_STEP_PX,
  PURE_LABEL_MAX_FONT_SIZE_PX,
  PURE_LABEL_MIN_FONT_SIZE_PX,
  type PolygonSurfaceTypeOption,
  type PureLabelColorStyleId,
} from "./InfoBoxMeasurement3D.config";
import {
  type MeasurementNavigationEntry,
  useInfoBoxPointTypeNavigation,
} from "./useInfoBoxPointTypeNavigation";
import { useInfoBoxDistanceRelationsState } from "./useInfoBoxDistanceRelationsState";
import {
  DEFAULT_DISTANCE_MEASUREMENT_PLACEHOLDER,
  useInfoBoxDistancePreviewState,
} from "./useInfoBoxDistancePreviewState";

const MIN_ELEVATION_STEP_METERS = 0.1;
const MIN_COORDINATE_STEP_DEGREES = 0.000001;
const STEP_DISTANCE_FACTOR = 0.001;
const METERS_PER_DEGREE_LAT = 111320;
const COORDINATE_INPUT_WIDTH_PX = 112;
type ElevationEditTarget = "absolute" | "relative";
type RelationMetricEditKind = "vertical" | "horizontal" | "direct";

export function useInfoBoxMeasurement3DState() {
  const {
    measurements,
    measurementsByType,
    measurementMode,
    pointLabelOnCreate,
    updateMeasurementNameById,
    updatePointLabelAppearanceById,
    toggleMeasurementLockById,
    setMeasurements,
    clearMeasurementsByIds,
    setPointMeasurementElevationById,
    setPointMeasurementCoordinatesById,
  } = useMeasurements<MeasurementMode, MeasurementEntry>();
  const { selectedMeasurementId, selectMeasurementById } =
    useMeasurementSelection();

  const {
    activeMeasurementId,
    livePreviewPointECEF,
    setReferencePoint,
    referencePoint,
    moveGizmoPointId,
    isMoveGizmoDragging,
    startMoveGizmoForMeasurementId,
    stopMoveGizmo,
    flyToMeasurementById,
    flyToAllMeasurements,
  } = useCesiumMeasurements();
  const { clearLockedEditMeasurementId } = useMeasurementEdit();
  const { getScene } = useCesiumContext();
  const { collapsedInfoBox } = useContext<typeof UIContext>(UIContext);

  const effectiveMeasurementId = activeMeasurementId ?? selectedMeasurementId;
  const [currentIndex, setCurrentIndex] = useState(0);
  const pointMeasureEntriesByType = useMemo<PointMeasurementEntry[]>(
    () => measurementsByType("pointMeasure").filter(isPointMeasurementEntry),
    [measurementsByType]
  );
  const {
    pointMeasurements,
    pointMeasureOrderById,
    navigationEntries,
    nextPointMeasureOrder,
  } = useInfoBoxPointTypeNavigation(measurements, pointMeasureEntriesByType);
  const [prevLen, setPrevLen] = useState(navigationEntries.length);
  const currentNavigationEntry = navigationEntries[currentIndex] ?? null;
  const currentMeasurement = currentNavigationEntry?.measurement;
  const currentPointMeasureOrder =
    currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? pointMeasureOrderById[currentMeasurement.id] ?? null
      : null;
  const livePreviewPointGeometryWGS84 = useMemo(() => {
    if (!livePreviewPointECEF) return null;
    const previewPoint = getDegreesFromCartesian(livePreviewPointECEF);
    if (
      !Number.isFinite(previewPoint.latitude) ||
      !Number.isFinite(previewPoint.longitude)
    ) {
      return null;
    }
    return {
      latitude: previewPoint.latitude,
      longitude: previewPoint.longitude,
      height: previewPoint.altitude ?? 0,
    };
  }, [livePreviewPointECEF]);
  const isPureLabelMeasurement = Boolean(
    currentMeasurement &&
      isPointMeasurementEntry(currentMeasurement) &&
      currentMeasurement.auxiliaryLabelAnchor
  );
  const shouldAutofocusLabelTitle =
    pointLabelOnCreate &&
    measurementMode === MeasurementMode.PointMeasure &&
    Boolean(
      currentMeasurement &&
        isPointMeasurementEntry(currentMeasurement) &&
        effectiveMeasurementId === currentMeasurement.id
    );
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
  const selectedPlanarPolygonGroup = null;
  const selectedPlanarPolygonOrder = 0;
  const selectedConnectedPlanarPolygonTotalAreaSquareMeters = 0;
  const selectedConnectedRoofAverageSlopeDeg = null;
  const selectedConnectedRoofSlopeLabels: string[] = [];
  const isCurrentPointMeasurement = Boolean(
    currentMeasurement &&
      isPointMeasurementEntry(currentMeasurement) &&
      !currentMeasurement.auxiliaryLabelAnchor
  );
  const currentPointMeasurementHidden = Boolean(
    isCurrentPointMeasurement && currentMeasurement?.hidden
  );
  const currentPointMeasurementLocked = Boolean(
    isCurrentPointMeasurement && currentMeasurement?.locked
  );
  const showPointInfoMode = Boolean(
    currentMeasurement && isPointMeasurementEntry(currentMeasurement)
  );
  const isPolygonInfoMode = false;
  const isPureLabelPreviewMode =
    pointLabelOnCreate &&
    measurementMode === MeasurementMode.PointMeasure &&
    !isPolygonInfoMode &&
    !currentMeasurement;
  const isPointCreatePreviewMode =
    measurementMode === MeasurementMode.PointMeasure &&
    !pointLabelOnCreate &&
    !isPolygonInfoMode &&
    Boolean(livePreviewPointGeometryWGS84);
  const selectedPolylineSummary = null;
  const selectedPolylineSegmentLineMode: PolylineSegmentLineMode =
    LINEAR_SEGMENT_LINE_MODE_COMPONENTS;
  const suppressPolygonAreaInDirectPolylineMode = false;
  const updateSelectedPolylineSegmentLineMode = (
    _nextMode: PolylineSegmentLineMode
  ) => {};
  const selectedPolygonCircumferenceSummary = {
    planarMeters: 0,
    threeDMeters: 0,
  };
  const isElevationEditModeActive =
    Boolean(moveGizmoPointId) &&
    isPointMeasurementEntry(currentMeasurement) &&
    moveGizmoPointId === currentMeasurement.id;

  useEffect(() => {
    if (navigationEntries.length !== prevLen) {
      setPrevLen(navigationEntries.length);
      if (navigationEntries.length === 0) {
        setCurrentIndex(0);
        return;
      }
      if (currentIndex >= navigationEntries.length) {
        setCurrentIndex(0);
      }
    }
  }, [navigationEntries.length, prevLen, currentIndex]);

  useEffect(() => {
    let selectedIndex = -1;
    if (effectiveMeasurementId) {
      selectedIndex = navigationEntries.findIndex(
        (entry) =>
          entry.kind === "measurement" &&
          entry.measurement.id === effectiveMeasurementId
      );
    }
    if (selectedIndex >= 0 && selectedIndex !== currentIndex) {
      setCurrentIndex(selectedIndex);
    }
  }, [currentIndex, navigationEntries, effectiveMeasurementId]);

  useEffect(() => {
    setIsCoordinateEditModeActive(false);
    setElevationEditTarget(null);
    setRelationMetricEdit(null);
    setEditStepDistanceMeters(null);
    setEditedLatitude(null);
    setEditedLongitude(null);
  }, [currentMeasurement?.id]);

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

  const selectNavigationEntry = (
    entry: MeasurementNavigationEntry | null | undefined
  ) => {
    if (!entry) {
      selectMeasurementById(null);
      return;
    }
    selectMeasurementById(entry.measurement.id);
  };

  const decreaseCurrentHandler = () => {
    if (navigationEntries.length === 0) return;
    const newIndex =
      currentIndex <= 0 ? navigationEntries.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
    selectNavigationEntry(navigationEntries[newIndex]);
  };

  const increaseCurrentHandler = () => {
    if (navigationEntries.length === 0) return;
    const newIndex =
      currentIndex >= navigationEntries.length - 1 ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
    selectNavigationEntry(navigationEntries[newIndex]);
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
  const toggleCurrentPointMeasurementVisibility = (e) => {
    e.stopPropagation();
    if (
      !currentMeasurement ||
      !isPointMeasurementEntry(currentMeasurement) ||
      currentMeasurement.auxiliaryLabelAnchor
    ) {
      return;
    }
    setMeasurements((prev) =>
      prev.map((measurement) =>
        measurement.id === currentMeasurement.id
          ? { ...measurement, hidden: !measurement.hidden }
          : measurement
      )
    );
  };
  const toggleCurrentPointMeasurementLock = (e) => {
    e.stopPropagation();
    if (
      !currentMeasurement ||
      !isPointMeasurementEntry(currentMeasurement) ||
      currentMeasurement.auxiliaryLabelAnchor
    ) {
      return;
    }
    toggleMeasurementLockById(currentMeasurement.id);
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
    clearLockedEditMeasurementId();
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
    clearLockedEditMeasurementId();
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

  const flyToMeasurement = useCallback(() => {
    if (!currentMeasurement) return;
    flyToMeasurementById(currentMeasurement.id);
  }, [currentMeasurement, flyToMeasurementById]);

  const infoBoxHeaderColor = "rgba(59, 130, 246, 0.7)";

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

  const pureLabelAppearance = useMemo(() => {
    if (
      !currentMeasurement ||
      !isPointMeasurementEntry(currentMeasurement) ||
      !currentMeasurement.auxiliaryLabelAnchor
    ) {
      return null;
    }

    const fontSizePx = sanitizePureLabelFontSizePx(
      currentMeasurement.labelAppearance?.fontSizePx
    );
    const backgroundColor =
      currentMeasurement.labelAppearance?.backgroundColor?.trim() ||
      PURE_LABEL_DEFAULT_BACKGROUND_COLOR;
    const textColor =
      currentMeasurement.labelAppearance?.textColor?.trim() ||
      PURE_LABEL_DEFAULT_TEXT_COLOR;
    return {
      fontSizePx,
      backgroundColor,
      textColor,
    };
  }, [currentMeasurement]);

  const selectedPureLabelColorStyleId = useMemo(() => {
    if (!pureLabelAppearance) return PURE_LABEL_COLOR_STYLE_OPTIONS[0]?.value;
    return (
      PURE_LABEL_COLOR_STYLE_OPTIONS.find(
        (option) =>
          option.backgroundColor === pureLabelAppearance.backgroundColor &&
          option.textColor === pureLabelAppearance.textColor
      )?.value ?? PURE_LABEL_COLOR_STYLE_OPTIONS[0]?.value
    );
  }, [pureLabelAppearance]);

  const updateCurrentPureLabelAppearance = useCallback(
    (nextAppearance: {
      fontSizePx?: number;
      backgroundColor?: string;
      textColor?: string;
    }) => {
      if (
        !currentMeasurement ||
        !isPointMeasurementEntry(currentMeasurement) ||
        !currentMeasurement.auxiliaryLabelAnchor
      ) {
        return;
      }
      const mergedAppearance = {
        ...(currentMeasurement.labelAppearance ?? {}),
        ...nextAppearance,
      };
      updatePointLabelAppearanceById(currentMeasurement.id, mergedAppearance);
    },
    [currentMeasurement, updatePointLabelAppearanceById]
  );

  const adjustCurrentPureLabelFontSize = useCallback(
    (deltaPx: number) => {
      if (!pureLabelAppearance) return;
      const nextFontSizePx = sanitizePureLabelFontSizePx(
        pureLabelAppearance.fontSizePx + deltaPx
      );
      updateCurrentPureLabelAppearance({ fontSizePx: nextFontSizePx });
    },
    [pureLabelAppearance, updateCurrentPureLabelAppearance]
  );

  const handlePureLabelColorStyleChange = useCallback(
    (styleId: PureLabelColorStyleId) => {
      const styleOption = PURE_LABEL_COLOR_STYLE_OPTIONS.find(
        (option) => option.value === styleId
      );
      if (!styleOption) return;
      updateCurrentPureLabelAppearance({
        backgroundColor: styleOption.backgroundColor,
        textColor: styleOption.textColor,
      });
    },
    [updateCurrentPureLabelAppearance]
  );

  const referencePointMeasurementId = useMemo(() => {
    if (!referencePoint) return null;
    const referenceMeasurement = pointMeasurements.find(
      (measurement) =>
        getEuclideanDistance(measurement.geometryECEF, referencePoint) <= 0.001
    );
    return referenceMeasurement?.id ?? null;
  }, [pointMeasurements, referencePoint]);
  const {
    pointRelationRows,
    currentPointHasDistanceRelations,
    removeDistanceRelationById,
    addDistanceRelationForCurrentPoint,
    toggleDistanceRelationLineVisibilityByKind,
  } = useInfoBoxDistanceRelationsState({
    currentMeasurement,
    pointMeasurements,
    referencePointMeasurementId,
  });
  const {
    isDistanceCreatePreviewMode,
    isCurrentPointDistanceMeasurement,
    hasActiveDistancePreviewAnchor,
    livePreviewDistanceRow,
    currentDistanceMeasureOrder,
    currentDistanceMeasurementOrderDisplay,
    distancePreviewOrder,
    distancePreviewOrderToken,
    distanceNavigationInstructionText,
  } = useInfoBoxDistancePreviewState({
    currentMeasurement,
    isPolygonInfoMode,
    currentPointHasDistanceRelations,
  });

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
    (isPointCreatePreviewMode || isDistanceCreatePreviewMode) &&
    livePreviewPointECEF &&
    referencePoint
      ? getENU(livePreviewPointECEF, referencePoint).up
      : currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? referencePoint
        ? getENU(currentMeasurement.geometryECEF, referencePoint).up
        : 0
      : 0;
  const relativeElevationInputWidthPx = getElevationInputWidthPx(
    relativeElevationValue
  );

  const selectedPolygonVertexLabels: string[] = [];
  const selectedPolygonSurfaceTypeLabel = "";
  const selectedPolygonSurfaceTypeValue: PolygonSurfaceTypeOption = "roof";
  const selectedPolygonTiltInfo = {
    tiltDeg: 0,
    slopePercentText: "0 %",
    normalDirectionText: "",
  };
  const selectedPolygonHorizontalAreaSquareMeters = 0;
  const showSurfaceAreaForType = true;
  const showHorizontalAreaForType = false;
  const selectedPolygonPrimaryAreaSquareMeters = 0;
  const updateSelectedPolygonSurfaceType = (
    _nextType: PolygonSurfaceTypeOption
  ) => {};

  const isReferencePointWithoutEdges =
    Boolean(currentMeasurement) &&
    isPointMeasurementEntry(currentMeasurement) &&
    isReference &&
    pointRelationRows.length === 0;
  const measurementViewType = useMemo(
    () =>
      resolveInfoBoxMeasurementViewType({
        isPolygonInfoMode,
        hasSelectedPolylineSummary: Boolean(selectedPolylineSummary),
        selectedPolygonSurfaceTypeValue,
        selectedPolygonSurfaceTypeLabel,
        isTraverseMeasurement: Boolean(
          currentMeasurement && isTraverseMeasurementEntry(currentMeasurement)
        ),
        isPureLabelMeasurement,
        isPureLabelPreviewMode,
        showPointInfoMode,
        isPointCreatePreviewMode,
        isDistanceCreatePreviewMode,
        isCurrentPointDistanceMeasurement,
      }),
    [
      currentMeasurement,
      isCurrentPointDistanceMeasurement,
      isDistanceCreatePreviewMode,
      isPolygonInfoMode,
      isPointCreatePreviewMode,
      isPureLabelMeasurement,
      isPureLabelPreviewMode,
      selectedPolygonSurfaceTypeLabel,
      selectedPolygonSurfaceTypeValue,
      selectedPolylineSummary,
      showPointInfoMode,
    ]
  );
  const activeMeasurementTypeTitle = useMemo(
    () => getActiveMeasurementTypeTitle(measurementViewType),
    [measurementViewType]
  );
  const isPlanarPolygonMeasurementView =
    isPolygonInfoMode &&
    (measurementViewType.kind === SPATIAL_MARKUP_KIND_POLYLINE ||
      measurementViewType.kind === SPATIAL_MARKUP_KIND_AREA);
  const isPointOrDistanceLivePreview =
    (measurementViewType.kind === SPATIAL_MARKUP_KIND_POINT ||
      measurementViewType.kind === SPATIAL_MARKUP_KIND_DISTANCE) &&
    measurementViewType.isLivePreview;
  const livePreviewMeasurementKind = isPointOrDistanceLivePreview
    ? measurementViewType.kind
    : null;
  const isPureLabelLivePreview =
    measurementViewType.kind === "pureLabel" &&
    measurementViewType.isLivePreview;
  const navigationInstructionText =
    measurementViewType.kind === SPATIAL_MARKUP_KIND_POINT &&
    measurementViewType.isLivePreview
      ? "Klick auf das Modell, um den Punkt zu setzen."
      : measurementViewType.kind === SPATIAL_MARKUP_KIND_DISTANCE &&
        measurementViewType.isLivePreview
      ? distanceNavigationInstructionText
      : null;
  const currentMeasurementPlaceholder =
    measurementViewType.kind === SPATIAL_MARKUP_KIND_DISTANCE
      ? DEFAULT_DISTANCE_MEASUREMENT_PLACEHOLDER
      : DEFAULT_POINT_MEASUREMENT_PLACEHOLDER;
  const currentMeasurementOrder =
    measurementViewType.kind === SPATIAL_MARKUP_KIND_DISTANCE
      ? currentDistanceMeasureOrder
      : measurementViewType.kind === SPATIAL_MARKUP_KIND_POINT
      ? currentPointMeasureOrder
      : null;
  const currentMeasurementOrderDisplay =
    measurementViewType.kind === SPATIAL_MARKUP_KIND_DISTANCE
      ? currentDistanceMeasurementOrderDisplay
      : measurementViewType.kind === SPATIAL_MARKUP_KIND_POINT
      ? currentPointMeasureOrder
        ? `${currentPointMeasureOrder}`
        : null
      : null;

  return {
    activeMeasurementTypeTitle,
    infoBoxHeaderColor,
    collapsible: !!currentMeasurement || isPolygonInfoMode,
    footerProps: {
      totalEntries: navigationEntries.length,
      currentIndex,
      instructionText: navigationInstructionText,
      onFlyToAllMeasurements: flyToAllMeasurements,
      onPreviousMeasurement: decreaseCurrentHandler,
      onNextMeasurement: increaseCurrentHandler,
    },
    subtitleProps: {
      isPlanarPolygonMeasurementView,
      selectedPlanarPolygonGroup,
      selectedPlanarPolygonOrder,
      collapsedInfoBox,
      selectedPolylineSummary,
      suppressPolygonAreaInDirectPolylineMode,
      selectedPolygonPrimaryAreaSquareMeters,
      selectedPolygonSurfaceTypeLabel,
      handlePolygonNameUpdate: () => {},
      flyToSelectedPolygon: () => {},
      deleteSelectedPolygon: () => {},
      isPureLabelLivePreview,
      navigationEntriesLength: navigationEntries.length,
      livePreviewMeasurementKind,
      nextPointMeasureOrder,
      nextDistanceMeasureOrder: distancePreviewOrder,
      nextDistanceMeasureOrderToken: distancePreviewOrderToken,
      defaultPointMeasurementPlaceholder: DEFAULT_POINT_MEASUREMENT_PLACEHOLDER,
      defaultDistanceMeasurementPlaceholder:
        DEFAULT_DISTANCE_MEASUREMENT_PLACEHOLDER,
      livePreviewPointGeometryWGS84,
      currentMeasurement,
      isReference,
      currentIndex,
      shouldAutofocusLabelTitle,
      handleMeasurementNameUpdate,
      currentMeasurementOrder,
      currentMeasurementOrderDisplay,
      currentMeasurementPlaceholder,
      flyToMeasurement,
      isCurrentPointMeasurement,
      currentPointMeasurementHidden,
      toggleCurrentPointMeasurementVisibility,
      currentPointMeasurementLocked,
      toggleCurrentPointMeasurementLock,
      isPureLabelMeasurement,
      setAsReferenceHandler,
      deleteShapeHandler,
      isCoordinateEditModeActive,
      coordinateEditValues,
      setEditedLatitude,
      setEditedLongitude,
      applyCoordinateDraft,
      inputStepConfig,
      handleCoordinateInputPressEnter,
      coordinateInputWidthPx: COORDINATE_INPUT_WIDTH_PX,
      completeCoordinateEditMode,
      startCoordinateEditMode,
      isAbsoluteElevationEditActive,
      stopEventPropagation,
      handleElevationInputChange,
      elevationInputSharedProps,
      absoluteElevationInputWidthPx,
      stopElevationEditMode,
      startAbsoluteElevationEditMode,
    },
    contentProps: {
      isPlanarPolygonMeasurementView,
      selectedPolylineSummary,
      selectedPolylineSegmentLineMode,
      updateSelectedPolylineSegmentLineMode,
      stopEventPropagation,
      selectedPolygonSurfaceTypeValue,
      polygonSurfaceTypeOptions: [],
      updateSelectedPolygonSurfaceType,
      showSurfaceAreaForType,
      showHorizontalAreaForType,
      selectedConnectedPlanarPolygonTotalAreaSquareMeters,
      selectedPolygonHorizontalAreaSquareMeters,
      selectedPolygonCircumferenceSummary,
      formatSignificant,
      selectedConnectedPlanarPolygonCount: 0,
      selectedConnectedRoofAverageSlopeDeg,
      selectedConnectedRoofSlopeLabels,
      selectedPolygonTiltInfo,
      selectedPolygonVertexLabels,
      isPureLabelLivePreview,
      hasActiveDistancePreviewAnchor,
      livePreviewDistanceRow,
      livePreviewPointGeometryWGS84,
      currentMeasurement,
      measurementViewType,
      pureLabelAppearance,
      selectedPureLabelColorStyleId,
      pureLabelDefaultFontSizePx: PURE_LABEL_DEFAULT_FONT_SIZE_PX,
      pureLabelMinFontSizePx: PURE_LABEL_MIN_FONT_SIZE_PX,
      pureLabelMaxFontSizePx: PURE_LABEL_MAX_FONT_SIZE_PX,
      pureLabelFontSizeStepPx: PURE_LABEL_FONT_SIZE_STEP_PX,
      pureLabelColorStyleOptions: PURE_LABEL_COLOR_STYLE_OPTIONS.map(
        (option) => ({
          value: option.value,
          label: option.label,
        })
      ),
      adjustCurrentPureLabelFontSize,
      handlePureLabelColorStyleChange,
      isReferencePointWithoutEdges,
      pointRelationRows,
      isRelativeElevationEditActive,
      relativeElevationValue,
      elevationInputSharedProps,
      relativeElevationInputWidthPx,
      handleElevationInputChange,
      stopElevationEditMode,
      startRelativeElevationEditMode,
      relationMetricEdit,
      relationMetricInputSharedProps,
      handleRelationMetricValueChange,
      stopRelationMetricEditMode,
      startRelationMetricEditMode,
      toggleDistanceRelationLineVisibilityByKind,
      addDistanceRelationForCurrentPoint,
      removeDistanceRelationById,
    },
  };
}
