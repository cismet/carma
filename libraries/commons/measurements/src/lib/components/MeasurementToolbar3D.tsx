import { useState, useMemo, useCallback, useEffect } from "react";
import { Modal } from "antd";
import {
  useCesiumMeasurements,
  isPointMeasurementEntry,
  MeasurementMode,
} from "@carma-mapping/engines/cesium/measurements";
import {
  MeasurementModeToolbar,
  PolygonSubType,
} from "./MeasurementModeToolbar";
import { useMeasurementToolMode } from "./hooks/useMeasurementToolMode";

const isKeyboardTargetEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  return target.isContentEditable;
};

export function MeasurementToolbar3D({
  pixelWidth = 350,
}: {
  pixelWidth?: number;
}) {
  const {
    measurementMode,
    setMeasurementMode,
    measurements,
    setMeasurements,
    selectedMeasurementIds,
    selectionModeActive,
    setSelectionModeActive,
    selectModeAdditive,
    setSelectModeAdditive,
    deleteSelectedPointMeasurements,
    temporaryMode,
    setTemporaryMode,
    distanceModeStickyToFirstPoint,
    setDistanceModeStickyToFirstPoint,
    distanceCreationLineVisibility,
    setDistanceCreationLineVisibilityByKind,
    pointVerticalOffsetMeters,
    setPointVerticalOffsetMeters,
    pointLabelOnCreate,
    setPointLabelOnCreate,
  } = useCesiumMeasurements();

  const [activePolygonSubType, setActivePolygonSubType] =
    useState<PolygonSubType>("oblique");

  const measurementById = useMemo(
    () => new Map(measurements.map((m) => [m.id, m])),
    [measurements]
  );

  const deletableSelectedPointIds = useMemo(
    () =>
      selectedMeasurementIds.filter((id) => {
        const m = measurementById.get(id);
        return Boolean(m && isPointMeasurementEntry(m) && !m.locked);
      }),
    [measurementById, selectedMeasurementIds]
  );

  const selectedPointIds = useMemo(
    () =>
      selectedMeasurementIds
        .map((id) => {
          const m = measurementById.get(id);
          return m && isPointMeasurementEntry(m) ? id : null;
        })
        .filter((id): id is string => typeof id === "string"),
    [measurementById, selectedMeasurementIds]
  );

  const selectedMeasurementCount = useMemo(
    () =>
      selectedPointIds.filter((id) => {
        const m = measurementById.get(id);
        return Boolean(
          m && isPointMeasurementEntry(m) && !m.auxiliaryLabelAnchor
        );
      }).length,
    [measurementById, selectedPointIds]
  );

  const selectedLabelCount = useMemo(
    () =>
      selectedPointIds.filter((id) => {
        const m = measurementById.get(id);
        return Boolean(
          m && isPointMeasurementEntry(m) && m.auxiliaryLabelAnchor
        );
      }).length,
    [measurementById, selectedPointIds]
  );

  const selectedVisibilityHidden =
    selectedPointIds.length > 0 &&
    selectedPointIds.every((id) => Boolean(measurementById.get(id)?.hidden));

  const selectedLocked =
    selectedPointIds.length > 0 &&
    selectedPointIds.every((id) => Boolean(measurementById.get(id)?.locked));

  const deletableSelectedPointCount = deletableSelectedPointIds.length;
  const hasDeletableSelection = deletableSelectedPointCount > 0;

  const toggleSelectedVisibility = useCallback(() => {
    if (selectedPointIds.length === 0) return;
    const selectedIdSet = new Set(selectedPointIds);
    const shouldHide = !selectedPointIds.every((id) =>
      Boolean(measurementById.get(id)?.hidden)
    );
    setMeasurements((prev) =>
      prev.map((m) =>
        selectedIdSet.has(m.id) ? { ...m, hidden: shouldHide } : m
      )
    );
  }, [measurementById, selectedPointIds, setMeasurements]);

  const toggleSelectedLock = useCallback(() => {
    if (selectedPointIds.length === 0) return;
    const selectedIdSet = new Set(selectedPointIds);
    const shouldLock = !selectedPointIds.every((id) =>
      Boolean(measurementById.get(id)?.locked)
    );
    setMeasurements((prev) =>
      prev.map((m) =>
        selectedIdSet.has(m.id) ? { ...m, locked: shouldLock } : m
      )
    );
  }, [measurementById, selectedPointIds, setMeasurements]);

  const requestDeleteSelectedPoints = useCallback(() => {
    if (deletableSelectedPointCount > 1) {
      Modal.confirm({
        centered: true,
        title: "Mehrere Messungen löschen",
        content: `${deletableSelectedPointCount} ausgewählte Messungen wirklich löschen?`,
        okText: "Löschen",
        cancelText: "Abbrechen",
        okButtonProps: { danger: true },
        onOk: () => {
          deleteSelectedPointMeasurements();
        },
      });
      return;
    }
    deleteSelectedPointMeasurements();
  }, [deleteSelectedPointMeasurements, deletableSelectedPointCount]);

  useEffect(() => {
    const handleMultiDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isKeyboardTargetEditable(event.target)) return;
      if (deletableSelectedPointCount <= 1) return;
      event.preventDefault();
      event.stopPropagation();
      requestDeleteSelectedPoints();
    };
    window.addEventListener("keydown", handleMultiDeleteKey, true);
    return () => {
      window.removeEventListener("keydown", handleMultiDeleteKey, true);
    };
  }, [deletableSelectedPointCount, requestDeleteSelectedPoints]);

  const { activeToolType, handleToolTypeChange } = useMeasurementToolMode({
    isSelectionMode: selectionModeActive,
    isLabelMode: pointLabelOnCreate,
    isImplicitMode: measurementMode === MeasurementMode.PointQuery,
    onSelectMode: () => {
      setPointLabelOnCreate(false);
      if (measurementMode === MeasurementMode.NONE) {
        setMeasurementMode(MeasurementMode.PointMeasure);
      }
      setSelectionModeActive(true);
    },
    onLabelMode: () => {
      setPointLabelOnCreate(true);
      setMeasurementMode(MeasurementMode.PointMeasure);
      setSelectionModeActive(false);
    },
    onPointMode: () => {
      setPointLabelOnCreate(false);
      setMeasurementMode(MeasurementMode.PointMeasure);
      setSelectionModeActive(false);
    },
    onImplicitMode: () => {
      setPointLabelOnCreate(false);
      setMeasurementMode(MeasurementMode.PointQuery);
      setSelectionModeActive(false);
    },
  });

  const handleDistanceLineVisibilityChange = useCallback(
    (kind: "direct" | "vertical" | "horizontal", visible: boolean) => {
      setDistanceCreationLineVisibilityByKind(kind, visible);
    },
    [setDistanceCreationLineVisibilityByKind]
  );

  return (
    <div
      className="w-full"
      style={{ backgroundColor: "transparent", pointerEvents: "auto" }}
    >
      <MeasurementModeToolbar
        activeToolType={activeToolType}
        onToolTypeChange={handleToolTypeChange}
        selectAdditiveMode={selectModeAdditive}
        onSelectAdditiveModeChange={setSelectModeAdditive}
        selectedMeasurementCount={selectedMeasurementCount}
        selectedLabelCount={selectedLabelCount}
        onDeleteSelectedPoints={requestDeleteSelectedPoints}
        onToggleSelectedVisibility={toggleSelectedVisibility}
        onToggleSelectedLock={toggleSelectedLock}
        selectedVisibilityHidden={selectedVisibilityHidden}
        selectedLocked={selectedLocked}
        hasDeletableSelection={hasDeletableSelection}
        distanceLineVisibility={distanceCreationLineVisibility}
        onDistanceLineVisibilityChange={handleDistanceLineVisibilityChange}
        distanceStickyToFirstPoint={distanceModeStickyToFirstPoint}
        onDistanceStickyToFirstPointChange={setDistanceModeStickyToFirstPoint}
        pointVerticalOffsetMeters={pointVerticalOffsetMeters}
        onPointVerticalOffsetChange={setPointVerticalOffsetMeters}
        pointSoloMode={temporaryMode}
        onPointSoloModeChange={setTemporaryMode}
        activePolygonSubType={activePolygonSubType}
        onPolygonSubTypeChange={setActivePolygonSubType}
        pixelWidth={pixelWidth}
      />
    </div>
  );
}

export default MeasurementToolbar3D;
