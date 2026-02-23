import { useEffect, useState } from "react";
import { MeasurementToolType } from "../MeasurementModeToolbar";

interface UseMeasurementToolModeProps {
  isSelectionMode: boolean;
  isLabelMode: boolean;
  isDistanceMode: boolean;
  isPolygonMode: boolean;
  isPolylineMode: boolean;
  onSelectMode: () => void;
  onLabelMode: () => void;
  onPointMode: () => void;
  onDistanceMode: () => void;
  onPolygonMode: () => void;
  onPolylineMode: () => void;
}

export const useMeasurementToolMode = ({
  isSelectionMode,
  isLabelMode,
  isDistanceMode,
  isPolygonMode,
  isPolylineMode,
  onSelectMode,
  onLabelMode,
  onPointMode,
  onDistanceMode,
  onPolygonMode,
  onPolylineMode,
}: UseMeasurementToolModeProps) => {
  const [lastNonSelectionToolType, setLastNonSelectionToolType] =
    useState<MeasurementToolType>(
      isLabelMode
        ? "label"
        : isDistanceMode
        ? "distance"
        : isPolygonMode
        ? "polygon"
        : isPolylineMode
        ? "polyline"
        : "point"
    );
  const [activeToolType, setActiveToolType] = useState<MeasurementToolType>(
    isSelectionMode
      ? "select"
      : isLabelMode
      ? "label"
      : isDistanceMode
      ? "distance"
      : isPolygonMode
      ? "polygon"
      : isPolylineMode
      ? "polyline"
      : "point"
  );

  const triggerToolCallback = (toolType: MeasurementToolType) => {
    if (toolType === "select") {
      onSelectMode();
      return;
    }
    if (toolType === "label") {
      onLabelMode();
      return;
    }
    if (toolType === "point") {
      onPointMode();
      return;
    }
    if (toolType === "polyline") {
      onPolylineMode();
      return;
    }
    if (toolType === "polygon") {
      onPolygonMode();
      return;
    }
    onDistanceMode();
  };

  useEffect(() => {
    if (isSelectionMode) {
      setActiveToolType("select");
      return;
    }
    if (isLabelMode) {
      setActiveToolType("label");
      setLastNonSelectionToolType("label");
      return;
    }
    if (isDistanceMode) {
      setActiveToolType("distance");
      setLastNonSelectionToolType("distance");
      return;
    }
    if (isPolygonMode) {
      setActiveToolType("polygon");
      setLastNonSelectionToolType("polygon");
      return;
    }
    if (isPolylineMode) {
      setActiveToolType("polyline");
      setLastNonSelectionToolType("polyline");
      return;
    }
    setActiveToolType("point");
    setLastNonSelectionToolType("point");
  }, [
    isDistanceMode,
    isPolygonMode,
    isPolylineMode,
    isSelectionMode,
    isLabelMode,
  ]);

  const handleToolTypeChange = (toolType: MeasurementToolType) => {
    if (toolType === "select" && activeToolType === "select") {
      setActiveToolType(lastNonSelectionToolType);
      triggerToolCallback(lastNonSelectionToolType);
      return;
    }

    if (toolType === "select") {
      setLastNonSelectionToolType((prev) =>
        activeToolType === "select" ? prev : activeToolType
      );
      setActiveToolType("select");
      triggerToolCallback("select");
      return;
    }

    setLastNonSelectionToolType(toolType);
    setActiveToolType(toolType);
    triggerToolCallback(toolType);
  };

  return {
    activeToolType,
    handleToolTypeChange,
  };
};
