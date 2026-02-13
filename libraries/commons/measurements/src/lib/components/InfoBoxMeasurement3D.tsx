import { useState, useEffect, useContext, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTrashCan,
  faArrowsDownToLine,
  faCheck,
  faEye,
  faEyeSlash,
  faAnglesLeft,
  faAnglesRight,
} from "@fortawesome/free-solid-svg-icons";
import MeasurementTitle from "./MeasurementTitle";
import { UIContext } from "react-cismap/contexts/UIContextProvider";
import Icon from "react-cismap/commons/Icon";
import "../styles/infoBox.css";
import { InputNumber, Tooltip } from "antd";
import { ResponsiveInfoBox } from "@carma-appframeworks/portals";
import {
  useCesiumMeasurements,
  DEFAULT_POINT_MEASUREMENT_PLACEHOLDER,
  isPointMeasurementEntry,
  getEuclideanDistance,
  getENU,
  formatNumber,
  isTraverseMeasurementEntry,
  getCustomPointMeasurementName,
} from "@carma-mapping/engines/cesium/measurements";
import { useCesiumContext } from "@carma-mapping/engines/cesium";
import { flyToPointGroup } from "../utils/cesiumFlyTo";

const MIN_ELEVATION_STEP_METERS = 0.1;
const MIN_COORDINATE_STEP_DEGREES = 0.000001;
const STEP_DISTANCE_FACTOR = 0.001;
const METERS_PER_DEGREE_LAT = 111320;
const ELEVATION_MAX_RESOLUTION_DECIMALS = 2;
const ELEVATION_INPUT_MIN_WIDTH_PX = 76;
const ELEVATION_INPUT_MAX_WIDTH_PX = 126;
const ELEVATION_INPUT_CHARACTER_WIDTH_PX = 8;
const ELEVATION_INPUT_CONTROLS_PADDING_PX = 34;
const COORDINATE_INPUT_WIDTH_PX = 112;
type ElevationEditTarget = "absolute" | "relative";

const formatElevationValueForWidth = (value: number): string => {
  const roundedValue = Number(value.toFixed(ELEVATION_MAX_RESOLUTION_DECIMALS));
  const decimalDigits =
    roundedValue
      .toFixed(ELEVATION_MAX_RESOLUTION_DECIMALS)
      .split(".")[1]
      ?.replace(/0+$/, "").length ?? 0;

  return roundedValue.toLocaleString("de-DE", {
    minimumFractionDigits: decimalDigits,
    maximumFractionDigits: decimalDigits,
  });
};

const getElevationInputWidthPx = (value: number | null | undefined): number => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return ELEVATION_INPUT_MIN_WIDTH_PX;
  }

  const valueText = formatElevationValueForWidth(value);
  const estimatedWidth =
    valueText.length * ELEVATION_INPUT_CHARACTER_WIDTH_PX +
    ELEVATION_INPUT_CONTROLS_PADDING_PX;

  return Math.max(
    ELEVATION_INPUT_MIN_WIDTH_PX,
    Math.min(ELEVATION_INPUT_MAX_WIDTH_PX, estimatedWidth)
  );
};

const stopEventPropagation = (event: React.MouseEvent<HTMLElement>) => {
  event.stopPropagation();
};

export function InfoBoxMeasurement3D({ pixelWidth = 350 }) {
  const {
    measurements,
    clearMeasurementsByIds,
    setReferencePoint,
    referencePoint,
    referenceElevation,
    selectedMeasurementId,
    selectMeasurementById,
    updateMeasurementNameById,
    showSelectedReferenceLine,
    setShowSelectedReferenceLine,
    moveGizmoPointId,
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
  const [editedLatitude, setEditedLatitude] = useState<number | null>(null);
  const [editedLongitude, setEditedLongitude] = useState<number | null>(null);

  // Measurements reversed to show newest first
  const visibleMeasurements = [...measurements].reverse();
  const currentMeasurement = visibleMeasurements[currentIndex];
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

  const setSelectedReferenceLineVisibility = (checked: boolean, e?) => {
    e?.stopPropagation?.();
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    selectMeasurementById(currentMeasurement.id);
    setShowSelectedReferenceLine(checked);
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
    setPointMeasurementElevationById(currentMeasurement.id, value);
  };

  const handleRelativeElevationInputChange = (value: number | null) => {
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    if (value === null || !Number.isFinite(value)) {
      return;
    }
    setPointMeasurementElevationById(
      currentMeasurement.id,
      referenceElevation + value
    );
  };

  const startCoordinateEditMode = (e?) => {
    e?.stopPropagation?.();
    if (!currentMeasurement || !isPointMeasurementEntry(currentMeasurement)) {
      return;
    }
    selectMeasurementById(currentMeasurement.id);
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
    if (!isCoordinateEditModeActive && !isElevationEditModeActive) return;

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
      }
    };

    window.addEventListener("keydown", handleWindowEnter, true);
    return () => {
      window.removeEventListener("keydown", handleWindowEnter, true);
    };
  }, [
    isCoordinateEditModeActive,
    isElevationEditModeActive,
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
  let relativeValues = null;

  const handleMeasurementNameUpdate = (
    measurementId: string | number,
    name: string
  ) => {
    if (typeof measurementId !== "string") return;
    updateMeasurementNameById(measurementId, name);
  };

  if (currentMeasurement && isPointMeasurementEntry(currentMeasurement)) {
    if (isSingleMeasurement) {
      isReference = true;
    } else if (referencePoint) {
      const dist = getEuclideanDistance(
        currentMeasurement.geometryECEF,
        referencePoint
      );
      if (dist > 0.001) {
        const enu = getENU(currentMeasurement.geometryECEF, referencePoint);
        relativeValues = { distance: dist, up: enu.up };
      } else {
        isReference = true;
      }
    }
  }

  const absoluteElevationInputWidthPx =
    currentMeasurement && isPointMeasurementEntry(currentMeasurement)
      ? getElevationInputWidthPx(currentMeasurement.geometryWGS84.height)
      : ELEVATION_INPUT_MIN_WIDTH_PX;
  const relativeElevationInputWidthPx = getElevationInputWidthPx(
    relativeValues?.up ?? 0
  );

  return (
    <div>
      <ResponsiveInfoBox
        pixelwidth={pixelWidth}
        panelClick={() => {}}
        isCollapsible={!!currentMeasurement}
        header={
          <div
            className="w-full pl-1"
            style={{ backgroundColor: infoBoxHeaderColor }}
          >
            3D Messungen
          </div>
        }
        alwaysVisibleDiv={
          currentMeasurement ? (
            <div className="mt-1 mb-0 w-full px-2 flex justify-between items-start gap-4">
              <span
                style={{ cursor: "default", width: "100%" }}
                className={`font-bold ${isReference ? "italic" : ""}`}
              >
                <MeasurementTitle
                  key={currentMeasurement.id}
                  order={visibleMeasurements.length - currentIndex}
                  title={
                    getCustomPointMeasurementName(currentMeasurement.name) || ""
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
                />
                {isPointMeasurementEntry(currentMeasurement) &&
                  (isCoordinateEditModeActive ? (
                    <div
                      className="text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center gap-1"
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
                      className="text-[10px] font-normal text-gray-500 -mt-1 min-h-[16px] flex items-center cursor-pointer"
                      onClick={startCoordinateEditMode}
                      data-test-id="coordinates-display-btn"
                    >
                      {formatCoordinate(
                        currentMeasurement.geometryWGS84.latitude,
                        true
                      )}{" "}
                      {formatCoordinate(
                        currentMeasurement.geometryWGS84.longitude,
                        false
                      )}
                    </div>
                  ))}
              </span>
              <div className="flex justify-end items-center w-[18%] mt-0 gap-2">
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
          currentMeasurement ? (
            <div>
              <div className="text-[12px] mb-0">
                {isPointMeasurementEntry(currentMeasurement) && (
                  <>
                    <div className="mt-1 text-sm pl-2 grid grid-cols-[max-content_max-content_1fr] gap-x-2">
                      {isReference ? (
                        <>
                          <div
                            className="font-semibold cursor-pointer min-h-[24px] flex items-center"
                            onClick={startAbsoluteElevationEditMode}
                          >
                            NHN-Höhe
                          </div>
                          <div className="font-semibold text-right tabular-nums min-h-[24px] flex items-center justify-end">
                            {isAbsoluteElevationEditActive ? (
                              <span className="inline-flex items-center gap-1">
                                <InputNumber
                                  value={
                                    currentMeasurement.geometryWGS84.height
                                  }
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
                                className="cursor-pointer bg-transparent border-0 p-0 m-0 font-semibold text-right tabular-nums"
                                data-test-id="elevation-display-btn"
                              >
                                {formatNumber(
                                  currentMeasurement.geometryWGS84.height
                                )}{" "}
                                m
                              </button>
                            )}
                          </div>
                          <div className="min-h-[24px]"></div>
                        </>
                      ) : (
                        <>
                          <div
                            className="cursor-pointer min-h-[24px] flex items-center"
                            onClick={startRelativeElevationEditMode}
                          >
                            Höhe<sub>Relativ</sub>
                          </div>
                          <div
                            className="text-right tabular-nums cursor-pointer min-h-[24px] flex items-center justify-end"
                            onClick={startRelativeElevationEditMode}
                          >
                            {isRelativeElevationEditActive ? (
                              <span className="inline-flex items-center gap-1">
                                <InputNumber
                                  value={relativeValues?.up ?? 0}
                                  onChange={handleRelativeElevationInputChange}
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
                                  data-test-id="elevation-edit-complete-btn"
                                  aria-label="Höhenbearbeitung abschließen"
                                >
                                  <FontAwesomeIcon icon={faCheck} />
                                </button>
                                <span>m</span>
                              </span>
                            ) : (
                              `${formatNumber(relativeValues?.up ?? 0)} m`
                            )}
                          </div>
                          <div className="whitespace-nowrap min-h-[24px] flex items-center">
                            {isAbsoluteElevationEditActive ? (
                              <span className="inline-flex items-center gap-1">
                                <span>(NHN</span>
                                <InputNumber
                                  value={
                                    currentMeasurement.geometryWGS84.height
                                  }
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
                                <span>m)</span>
                              </span>
                            ) : isRelativeElevationEditActive ? (
                              <span>
                                (NHN{" "}
                                {formatNumber(
                                  currentMeasurement.geometryWGS84.height
                                )}{" "}
                                m)
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={startAbsoluteElevationEditMode}
                                className="cursor-pointer bg-transparent border-0 p-0 m-0 whitespace-nowrap"
                                data-test-id="elevation-display-btn"
                              >
                                (NHN{" "}
                                {formatNumber(
                                  currentMeasurement.geometryWGS84.height
                                )}{" "}
                                m)
                              </button>
                            )}
                          </div>

                          <div>Distanz</div>
                          <div className="text-right tabular-nums">
                            {formatNumber(relativeValues?.distance ?? 0)} m
                          </div>
                          <div className="flex items-center pl-1">
                            <button
                              type="button"
                              onClick={(event) =>
                                setSelectedReferenceLineVisibility(
                                  !showSelectedReferenceLine,
                                  event
                                )
                              }
                              className="cursor-pointer bg-transparent border-0 p-0 m-0 text-[10px] leading-none text-[#808080] hover:text-[#a0a0a0]"
                              aria-label={
                                showSelectedReferenceLine
                                  ? "Distanzlinie ausblenden"
                                  : "Distanzlinie anzeigen"
                              }
                              aria-pressed={showSelectedReferenceLine}
                              title={
                                showSelectedReferenceLine
                                  ? "Distanzlinie ausblenden"
                                  : "Distanzlinie anzeigen"
                              }
                              data-test-id="toggle-selected-reference-line-btn"
                            >
                              <FontAwesomeIcon
                                icon={
                                  showSelectedReferenceLine ? faEyeSlash : faEye
                                }
                              />
                            </button>
                          </div>
                        </>
                      )}
                      {isReference && !isSingleMeasurement && (
                        <div className="col-span-3 italic">
                          ist Referenzhöhe
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
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
