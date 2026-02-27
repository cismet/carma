import { useMemo, useCallback, useEffect } from "react";
import { Modal } from "antd";
import {
  isPointMeasurementEntry,
  MeasurementMode,
  type MeasurementEntry,
} from "@carma-mapping/annotations/cesium";
import { MeasurementModeToolbar } from "./MeasurementModeToolbar";
import { useMeasurementToolMode } from "./hooks/useMeasurementToolMode";
import { useMeasurements } from "../context/MeasurementsContext";
import { useMeasurementSelection } from "../context/MeasurementSelectionContext";
import { useMeasurementModeOptions } from "../context/MeasurementModeOptionsContext";
import type { MeasurementToolManager } from "../tools/measurementToolManager";

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
  toolManager,
}: {
  pixelWidth?: number;
  toolManager?: MeasurementToolManager;
}) {
  const {
    measurementMode,
    setMeasurementMode,
    measurements,
    setMeasurements,
    clearMeasurementsByIds,
    deleteSelectedPointMeasurements,
    temporaryMode,
    setTemporaryMode,
    pointVerticalOffsetMeters,
    setPointVerticalOffsetMeters,
    pointLabelOnCreate,
    setPointLabelOnCreate,
  } = useMeasurements<MeasurementMode, MeasurementEntry>();

  const {
    selectedMeasurementIds,
    selectionModeActive,
    setSelectionModeActive,
    selectModeAdditive,
    setSelectModeAdditive,
    selectModeRectangle,
    setSelectModeRectangle,
  } = useMeasurementSelection();

  const {
    planarPolygonGroups,
    distanceModeStickyToFirstPoint,
    setDistanceModeStickyToFirstPoint,
    distanceCreationLineVisibility,
    setDistanceCreationLineVisibilityByKind,
    polylineVerticalOffsetMeters,
    setPolylineVerticalOffsetMeters,
    polylineSegmentLineMode,
    setPolylineSegmentLineMode,
    planarMeasurementCreationMode,
    setPlanarMeasurementCreationMode,
    setPolygonSurfaceTypePreset,
    polygonSurfaceTypePreset,
  } = useMeasurementModeOptions();

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
    const selectedPointIdSet = new Set(deletableSelectedPointIds);
    const protectedPolygonCandidate = planarPolygonGroups.find((group) => {
      if (!group.closed || group.vertexPointIds.length > 3) {
        return false;
      }
      const vertexIds = group.vertexPointIds.filter(
        (vertexId): vertexId is string => Boolean(vertexId)
      );
      if (vertexIds.length === 0) {
        return false;
      }
      const includesAnyVertex = vertexIds.some((vertexId) =>
        selectedPointIdSet.has(vertexId)
      );
      if (!includesAnyVertex) {
        return false;
      }
      const includesAllVertices = vertexIds.every((vertexId) =>
        selectedPointIdSet.has(vertexId)
      );
      return !includesAllVertices;
    });

    if (protectedPolygonCandidate) {
      Modal.confirm({
        centered: true,
        title: "Polygon löschen?",
        content:
          "Ein einzelner Knoten kann bei Polygonen mit 3 oder weniger Punkten nicht gelöscht werden. Soll stattdessen das gesamte Polygon gelöscht werden?",
        okText: "Polygon löschen",
        cancelText: "Abbrechen",
        okButtonProps: { danger: true },
        onOk: () => {
          clearMeasurementsByIds(protectedPolygonCandidate.vertexPointIds);
        },
      });
      return;
    }

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
  }, [
    clearMeasurementsByIds,
    deleteSelectedPointMeasurements,
    deletableSelectedPointCount,
    deletableSelectedPointIds,
    planarPolygonGroups,
  ]);

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

  const isAreaMode =
    measurementMode === MeasurementMode.PolylineMeasure &&
    planarMeasurementCreationMode === "polygon";

  const { activeToolType, handleToolTypeChange } = useMeasurementToolMode({
    isSelectionMode: selectionModeActive,
    isLabelMode: pointLabelOnCreate,
    isDistanceMode: measurementMode === MeasurementMode.PointQuery,
    isAreaMode: isAreaMode && polygonSurfaceTypePreset === "footprint",
    isVerticalMode: isAreaMode && polygonSurfaceTypePreset === "facade",
    isPlanarMode:
      isAreaMode &&
      (polygonSurfaceTypePreset === "roof" ||
        polygonSurfaceTypePreset === "terrain"),
    isPolylineMode:
      measurementMode === MeasurementMode.PolylineMeasure &&
      planarMeasurementCreationMode === "polyline",
    onSelectMode: () => {
      setPointLabelOnCreate(false);
      setMeasurementMode(MeasurementMode.NONE);
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
    onDistanceMode: () => {
      setPointLabelOnCreate(false);
      setMeasurementMode(MeasurementMode.PointQuery);
      setSelectionModeActive(false);
    },
    onAreaMode: () => {
      setPointLabelOnCreate(false);
      setMeasurementMode(MeasurementMode.PolylineMeasure);
      setPlanarMeasurementCreationMode("polygon");
      setPolygonSurfaceTypePreset("footprint");
      setSelectionModeActive(false);
    },
    onVerticalMode: () => {
      setPointLabelOnCreate(false);
      setMeasurementMode(MeasurementMode.PolylineMeasure);
      setPlanarMeasurementCreationMode("polygon");
      setPolygonSurfaceTypePreset("facade");
      setSelectionModeActive(false);
    },
    onPlanarMode: () => {
      setPointLabelOnCreate(false);
      setMeasurementMode(MeasurementMode.PolylineMeasure);
      setPlanarMeasurementCreationMode("polygon");
      setPolygonSurfaceTypePreset("roof");
      setSelectionModeActive(false);
    },
    onPolylineMode: () => {
      setPointLabelOnCreate(false);
      setMeasurementMode(MeasurementMode.PolylineMeasure);
      setPlanarMeasurementCreationMode("polyline");
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
        selectRectangleMode={selectModeRectangle}
        onSelectRectangleModeChange={setSelectModeRectangle}
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
        polylineVerticalOffsetMeters={polylineVerticalOffsetMeters}
        onPolylineVerticalOffsetChange={setPolylineVerticalOffsetMeters}
        polylineSegmentLineMode={polylineSegmentLineMode}
        onPolylineSegmentLineModeChange={setPolylineSegmentLineMode}
        pointSoloMode={temporaryMode}
        onPointSoloModeChange={setTemporaryMode}
        pixelWidth={pixelWidth}
        toolManager={toolManager}
      />
    </div>
  );
}

export default MeasurementToolbar3D;
