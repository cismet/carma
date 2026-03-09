import { CSSProperties, useMemo, useCallback, useEffect } from "react";
import { Modal } from "antd";
import { isKeyboardTargetEditable } from "@carma-commons/utils";
import {
  isPointAnnotationEntry,
  ANNOTATION_TYPE_DISTANCE,
  SELECT_TOOL_TYPE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  PLANAR_TOOL_CREATION_MODE_POLYGON,
  PLANAR_TOOL_CREATION_MODE_POLYLINE,
  useAnnotations,
  useAnnotationSelection,
  useAnnotationModeOptions,
  type AnnotationEntry,
  type AnnotationMode,
  type AnnotationToolManager,
} from "@carma-mapping/annotations/core";

import { AnnotationModeToolbar } from "./AnnotationModeToolbar";
import { useAnnotationToolMode } from "./hooks/useAnnotationToolMode";

export function AnnotationToolbar3D({
  pixelWidth = 350,
  toolManager,
  showPrimaryToolbar = true,
  showSecondaryToolbar = true,
  enableMultiDeleteHotkey = true,
  secondaryToolbarContainerStyle,
  secondaryToolbarCollapsedByDefault = false,
  secondaryToolbarDirection = "down",
}: {
  pixelWidth?: number;
  toolManager?: AnnotationToolManager;
  showPrimaryToolbar?: boolean;
  showSecondaryToolbar?: boolean;
  enableMultiDeleteHotkey?: boolean;
  secondaryToolbarContainerStyle?: CSSProperties;
  secondaryToolbarCollapsedByDefault?: boolean;
  secondaryToolbarDirection?: "down" | "right";
}) {
  const {
    annotationMode,
    setAnnotationMode,
    annotations,
    setAnnotations,
    clearAnnotationsByIds,
    deleteSelectedPointAnnotations,
    temporaryMode,
    setTemporaryMode,
    pointVerticalOffsetMeters,
    setPointVerticalOffsetMeters,
    pointLabelOnCreate,
    setPointLabelOnCreate,
  } = useAnnotations<AnnotationMode, AnnotationEntry>();

  const {
    selectedMeasurementIds,
    selectionModeActive,
    setSelectionModeActive,
    selectModeAdditive,
    setSelectModeAdditive,
    selectModeRectangle,
    setSelectModeRectangle,
  } = useAnnotationSelection();

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
    planarToolCreationMode,
    setPlanarToolCreationMode,
    setPolygonSurfaceTypePreset,
    polygonSurfaceTypePreset,
  } = useAnnotationModeOptions();

  const measurementById = useMemo(
    () => new Map(annotations.map((m) => [m.id, m])),
    [annotations]
  );

  const deletableSelectedPointIds = useMemo(
    () =>
      selectedMeasurementIds.filter((id) => {
        const m = measurementById.get(id);
        return Boolean(m && isPointAnnotationEntry(m) && !m.locked);
      }),
    [measurementById, selectedMeasurementIds]
  );

  const selectedPointIds = useMemo(
    () =>
      selectedMeasurementIds
        .map((id) => {
          const m = measurementById.get(id);
          return m && isPointAnnotationEntry(m) ? id : null;
        })
        .filter((id): id is string => typeof id === "string"),
    [measurementById, selectedMeasurementIds]
  );

  const selectedMeasurementCount = useMemo(
    () =>
      selectedPointIds.filter((id) => {
        const m = measurementById.get(id);
        return Boolean(
          m && isPointAnnotationEntry(m) && !m.auxiliaryLabelAnchor
        );
      }).length,
    [measurementById, selectedPointIds]
  );

  const selectedLabelCount = useMemo(
    () =>
      selectedPointIds.filter((id) => {
        const m = measurementById.get(id);
        return Boolean(
          m && isPointAnnotationEntry(m) && m.auxiliaryLabelAnchor
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
    setAnnotations((prev) =>
      prev.map((m) =>
        selectedIdSet.has(m.id) ? { ...m, hidden: shouldHide } : m
      )
    );
  }, [measurementById, selectedPointIds, setAnnotations]);

  const toggleSelectedLock = useCallback(() => {
    if (selectedPointIds.length === 0) return;
    const selectedIdSet = new Set(selectedPointIds);
    const shouldLock = !selectedPointIds.every((id) =>
      Boolean(measurementById.get(id)?.locked)
    );
    setAnnotations((prev) =>
      prev.map((m) =>
        selectedIdSet.has(m.id) ? { ...m, locked: shouldLock } : m
      )
    );
  }, [measurementById, selectedPointIds, setAnnotations]);

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
          clearAnnotationsByIds(protectedPolygonCandidate.vertexPointIds);
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
          deleteSelectedPointAnnotations();
        },
      });
      return;
    }
    deleteSelectedPointAnnotations();
  }, [
    clearAnnotationsByIds,
    deleteSelectedPointAnnotations,
    deletableSelectedPointCount,
    deletableSelectedPointIds,
    planarPolygonGroups,
  ]);

  useEffect(() => {
    if (!enableMultiDeleteHotkey) return;
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
  }, [
    deletableSelectedPointCount,
    enableMultiDeleteHotkey,
    requestDeleteSelectedPoints,
  ]);

  const isAreaMode =
    annotationMode === ANNOTATION_TYPE_POLYLINE &&
    planarToolCreationMode === PLANAR_TOOL_CREATION_MODE_POLYGON;
  const polygonSurfaceMeasurementType =
    polygonSurfaceTypePreset === "facade"
      ? ANNOTATION_TYPE_AREA_VERTICAL
      : polygonSurfaceTypePreset === "roof"
      ? ANNOTATION_TYPE_AREA_PLANAR
      : ANNOTATION_TYPE_AREA_GROUND;

  const { activeToolType, handleToolTypeChange } = useAnnotationToolMode({
    isSelectionMode: selectionModeActive,
    isLabelMode: pointLabelOnCreate,
    isDistanceMode: annotationMode === ANNOTATION_TYPE_DISTANCE,
    isAreaMode:
      isAreaMode &&
      polygonSurfaceMeasurementType === ANNOTATION_TYPE_AREA_GROUND,
    isVerticalMode:
      isAreaMode &&
      polygonSurfaceMeasurementType === ANNOTATION_TYPE_AREA_VERTICAL,
    isPlanarMode:
      isAreaMode &&
      polygonSurfaceMeasurementType === ANNOTATION_TYPE_AREA_PLANAR,
    isPolylineMode:
      annotationMode === ANNOTATION_TYPE_POLYLINE &&
      planarToolCreationMode === PLANAR_TOOL_CREATION_MODE_POLYLINE,
    onSelectMode: () => {
      setPointLabelOnCreate(false);
      setAnnotationMode(SELECT_TOOL_TYPE);
      setSelectionModeActive(true);
    },
    onLabelMode: () => {
      setPointLabelOnCreate(true);
      setAnnotationMode(ANNOTATION_TYPE_POINT);
      setSelectionModeActive(false);
    },
    onPointMode: () => {
      setPointLabelOnCreate(false);
      setAnnotationMode(ANNOTATION_TYPE_POINT);
      setSelectionModeActive(false);
    },
    onDistanceMode: () => {
      setPointLabelOnCreate(false);
      setAnnotationMode(ANNOTATION_TYPE_DISTANCE);
      setSelectionModeActive(false);
    },
    onAreaMode: () => {
      setPointLabelOnCreate(false);
      setAnnotationMode(ANNOTATION_TYPE_POLYLINE);
      setPlanarToolCreationMode(PLANAR_TOOL_CREATION_MODE_POLYGON);
      setPolygonSurfaceTypePreset("footprint");
      setSelectionModeActive(false);
    },
    onVerticalMode: () => {
      setPointLabelOnCreate(false);
      setAnnotationMode(ANNOTATION_TYPE_POLYLINE);
      setPlanarToolCreationMode(PLANAR_TOOL_CREATION_MODE_POLYGON);
      setPolygonSurfaceTypePreset("facade");
      setSelectionModeActive(false);
    },
    onPlanarMode: () => {
      setPointLabelOnCreate(false);
      setAnnotationMode(ANNOTATION_TYPE_POLYLINE);
      setPlanarToolCreationMode(PLANAR_TOOL_CREATION_MODE_POLYGON);
      setPolygonSurfaceTypePreset("roof");
      setSelectionModeActive(false);
    },
    onPolylineMode: () => {
      setPointLabelOnCreate(false);
      setAnnotationMode(ANNOTATION_TYPE_POLYLINE);
      setPlanarToolCreationMode(PLANAR_TOOL_CREATION_MODE_POLYLINE);
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
      <AnnotationModeToolbar
        activeToolType={activeToolType}
        onToolTypeChange={handleToolTypeChange}
        showPrimaryToolbar={showPrimaryToolbar}
        showSecondaryToolbar={showSecondaryToolbar}
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
        secondaryToolbarContainerStyle={secondaryToolbarContainerStyle}
        secondaryToolbarCollapsedByDefault={secondaryToolbarCollapsedByDefault}
        secondaryToolbarDirection={secondaryToolbarDirection}
      />
    </div>
  );
}

export default AnnotationToolbar3D;
