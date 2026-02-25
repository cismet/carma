import { useEffect, useState } from "react";
import { MeasurementToolType } from "../MeasurementModeToolbar";

interface UseMeasurementToolModeProps {
  isSelectionMode: boolean;
  isLabelMode: boolean;
  isDistanceMode: boolean;
  isAreaFootprintMode: boolean;
  isAreaFacadeMode: boolean;
  isAreaRoofMode: boolean;
  isPolylineMode: boolean;
  onSelectMode: () => void;
  onLabelMode: () => void;
  onPointMode: () => void;
  onDistanceMode: () => void;
  onAreaFootprintMode: () => void;
  onAreaFacadeMode: () => void;
  onAreaRoofMode: () => void;
  onPolylineMode: () => void;
}

const resolveToolType = ({
  isSelectionMode,
  isLabelMode,
  isDistanceMode,
  isAreaFootprintMode,
  isAreaFacadeMode,
  isAreaRoofMode,
  isPolylineMode,
}: Pick<
  UseMeasurementToolModeProps,
  | "isSelectionMode"
  | "isLabelMode"
  | "isDistanceMode"
  | "isAreaFootprintMode"
  | "isAreaFacadeMode"
  | "isAreaRoofMode"
  | "isPolylineMode"
>): MeasurementToolType => {
  if (isSelectionMode) return "select";
  if (isLabelMode) return "label";
  if (isDistanceMode) return "distance";
  if (isAreaFootprintMode) return "area-footprint";
  if (isAreaFacadeMode) return "area-facade";
  if (isAreaRoofMode) return "area-roof";
  if (isPolylineMode) return "polyline";
  return "point";
};

export const useMeasurementToolMode = ({
  isSelectionMode,
  isLabelMode,
  isDistanceMode,
  isAreaFootprintMode,
  isAreaFacadeMode,
  isAreaRoofMode,
  isPolylineMode,
  onSelectMode,
  onLabelMode,
  onPointMode,
  onDistanceMode,
  onAreaFootprintMode,
  onAreaFacadeMode,
  onAreaRoofMode,
  onPolylineMode,
}: UseMeasurementToolModeProps) => {
  const initialToolType = resolveToolType({
    isSelectionMode,
    isLabelMode,
    isDistanceMode,
    isAreaFootprintMode,
    isAreaFacadeMode,
    isAreaRoofMode,
    isPolylineMode,
  });

  const [lastNonSelectionToolType, setLastNonSelectionToolType] =
    useState<MeasurementToolType>(
      initialToolType === "select" ? "point" : initialToolType
    );
  const [activeToolType, setActiveToolType] =
    useState<MeasurementToolType>(initialToolType);

  const triggerToolCallback = (toolType: MeasurementToolType) => {
    switch (toolType) {
      case "select":
        return onSelectMode();
      case "label":
        return onLabelMode();
      case "point":
        return onPointMode();
      case "distance":
        return onDistanceMode();
      case "polyline":
        return onPolylineMode();
      case "area-footprint":
        return onAreaFootprintMode();
      case "area-facade":
        return onAreaFacadeMode();
      case "area-roof":
        return onAreaRoofMode();
    }
  };

  useEffect(() => {
    const resolved = resolveToolType({
      isSelectionMode,
      isLabelMode,
      isDistanceMode,
      isAreaFootprintMode,
      isAreaFacadeMode,
      isAreaRoofMode,
      isPolylineMode,
    });
    setActiveToolType(resolved);
    if (resolved !== "select") {
      setLastNonSelectionToolType(resolved);
    }
  }, [
    isSelectionMode,
    isLabelMode,
    isDistanceMode,
    isAreaFootprintMode,
    isAreaFacadeMode,
    isAreaRoofMode,
    isPolylineMode,
  ]);

  const handleToolTypeChange = (toolType: MeasurementToolType) => {
    if (toolType === activeToolType && toolType !== "select") {
      setLastNonSelectionToolType(toolType);
      setActiveToolType("select");
      triggerToolCallback("select");
      return;
    }

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
