import { useEffect, useState } from "react";
import { MeasurementToolType } from "../MeasurementModeToolbar";

interface UseMeasurementToolModeProps {
  isSelectionMode: boolean;
  isLabelMode: boolean;
  isImplicitMode: boolean;
  onSelectMode: () => void;
  onLabelMode: () => void;
  onPointMode: () => void;
  onImplicitMode: () => void;
}

export const useMeasurementToolMode = ({
  isSelectionMode,
  isLabelMode,
  isImplicitMode,
  onSelectMode,
  onLabelMode,
  onPointMode,
  onImplicitMode,
}: UseMeasurementToolModeProps) => {
  const [lastNonSelectionToolType, setLastNonSelectionToolType] =
    useState<MeasurementToolType>(
      isLabelMode ? "label" : isImplicitMode ? "distance" : "point"
    );
  const [activeToolType, setActiveToolType] = useState<MeasurementToolType>(
    isSelectionMode
      ? "select"
      : isLabelMode
      ? "label"
      : isImplicitMode
      ? "distance"
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
    onImplicitMode();
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
    if (isImplicitMode) {
      setActiveToolType("distance");
      setLastNonSelectionToolType("distance");
      return;
    }
    setActiveToolType("point");
    setLastNonSelectionToolType("point");
  }, [isImplicitMode, isSelectionMode, isLabelMode]);

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
