import { CSSProperties, useMemo, useCallback, useEffect } from "react";
import { Modal } from "antd";
import { isKeyboardTargetEditable } from "@carma-commons/utils";
import {
  isPointAnnotationEntry,
  isPointMeasurementEntry,
  type AnnotationToolManager,
} from "@carma-mapping/annotations/core";
import {
  useAnnotationCollection,
  usePlanarMeasurements,
  useAnnotationSelectionState,
  useAnnotationSettings,
  useAnnotationTools,
} from "../context/AnnotationsProvider";

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
  const tools = useAnnotationTools();
  const selection = useAnnotationSelectionState();
  const annotations = useAnnotationCollection();
  const settings = useAnnotationSettings();
  const planarMeasurements = usePlanarMeasurements();

  const measurementById = useMemo(
    () =>
      new Map(
        annotations.items.map((measurement) => [measurement.id, measurement])
      ),
    [annotations.items]
  );

  const deletableSelectedPointIds = useMemo(
    () =>
      selection.ids.filter((id) => {
        const m = measurementById.get(id);
        return Boolean(m && isPointAnnotationEntry(m) && !m.locked);
      }),
    [measurementById, selection.ids]
  );

  const selectedPointIds = useMemo(
    () =>
      selection.ids
        .map((id) => {
          const m = measurementById.get(id);
          return m && isPointAnnotationEntry(m) ? id : null;
        })
        .filter((id): id is string => typeof id === "string"),
    [measurementById, selection.ids]
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
  const hasAnyMeasurements =
    annotations.items.length > 0 || planarMeasurements.length > 0;

  const toggleSelectedVisibility = useCallback(() => {
    if (selectedPointIds.length === 0) return;
    annotations.toggleVisibilityByIds(selectedPointIds);
  }, [annotations, selectedPointIds]);

  const toggleSelectedLock = useCallback(() => {
    if (selectedPointIds.length === 0) return;
    annotations.toggleLockByIds(selectedPointIds);
  }, [annotations, selectedPointIds]);

  const requestDeleteSelectedPoints = useCallback(() => {
    const selectedPointIdSet = new Set(deletableSelectedPointIds);
    const protectedPolygonCandidate = planarMeasurements.find((group) => {
      if (!group.closed || group.nodeIds.length > 3) {
        return false;
      }
      const nodeIds = group.nodeIds.filter((nodeId): nodeId is string =>
        Boolean(nodeId)
      );
      if (nodeIds.length === 0) {
        return false;
      }
      const includesAnyNode = nodeIds.some((nodeId) =>
        selectedPointIdSet.has(nodeId)
      );
      if (!includesAnyNode) {
        return false;
      }
      const includesAllNodes = nodeIds.every((nodeId) =>
        selectedPointIdSet.has(nodeId)
      );
      return !includesAllNodes;
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
          annotations.removeByIds(protectedPolygonCandidate.nodeIds);
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
          annotations.removeSelection();
        },
      });
      return;
    }
    annotations.removeSelection();
  }, [
    annotations,
    deletableSelectedPointCount,
    deletableSelectedPointIds,
    planarMeasurements,
  ]);

  const requestClearAllMeasurements = useCallback(() => {
    if (!hasAnyMeasurements) return;

    Modal.confirm({
      centered: true,
      title: "Alle Messungen löschen",
      content:
        "Alle vorhandenen Messungen wirklich löschen? Dieser Schritt kann nicht rueckgaengig gemacht werden.",
      okText: "Alle löschen",
      cancelText: "Abbrechen",
      okButtonProps: { danger: true },
      onOk: () => {
        annotations.removeAll();
      },
    });
  }, [annotations, hasAnyMeasurements]);

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

  const { activeToolType: toolbarToolType, handleToolTypeChange } =
    useAnnotationToolMode(tools.activeToolType, tools.requestModeChange);

  const handleDistanceLineVisibilityChange = useCallback(
    (kind: "direct" | "vertical" | "horizontal", visible: boolean) => {
      settings.distance.setCreationLineVisibilityByKind(kind, visible);
    },
    [settings.distance]
  );

  return (
    <div
      className="w-full"
      style={{ backgroundColor: "transparent", pointerEvents: "auto" }}
    >
      <AnnotationModeToolbar
        activeToolType={toolbarToolType}
        onToolTypeChange={handleToolTypeChange}
        showPrimaryToolbar={showPrimaryToolbar}
        showSecondaryToolbar={showSecondaryToolbar}
        selectAdditiveMode={selection.mode.additive}
        onSelectAdditiveModeChange={selection.setAdditiveMode}
        selectRectangleMode={selection.mode.rectangle}
        onSelectRectangleModeChange={selection.setRectangleMode}
        selectedMeasurementCount={selectedMeasurementCount}
        selectedLabelCount={selectedLabelCount}
        onClearAllMeasurements={requestClearAllMeasurements}
        hasAnyMeasurements={hasAnyMeasurements}
        onDeleteSelectedPoints={requestDeleteSelectedPoints}
        onToggleSelectedVisibility={toggleSelectedVisibility}
        onToggleSelectedLock={toggleSelectedLock}
        selectedVisibilityHidden={selectedVisibilityHidden}
        selectedLocked={selectedLocked}
        hasDeletableSelection={hasDeletableSelection}
        distanceLineVisibility={settings.distance.creationLineVisibility}
        onDistanceLineVisibilityChange={handleDistanceLineVisibilityChange}
        distanceStickyToFirstPoint={settings.distance.stickyToFirstPoint}
        onDistanceStickyToFirstPointChange={
          settings.distance.setStickyToFirstPoint
        }
        pointVerticalOffsetMeters={settings.point.verticalOffsetMeters}
        onPointVerticalOffsetChange={settings.point.setVerticalOffsetMeters}
        polylineVerticalOffsetMeters={settings.polyline.verticalOffsetMeters}
        onPolylineVerticalOffsetChange={
          settings.polyline.setVerticalOffsetMeters
        }
        polylineSegmentLineMode={settings.polyline.segmentLineMode}
        onPolylineSegmentLineModeChange={settings.polyline.setSegmentLineMode}
        pointSoloMode={settings.point.temporaryMode}
        onPointSoloModeChange={settings.point.setTemporaryMode}
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
