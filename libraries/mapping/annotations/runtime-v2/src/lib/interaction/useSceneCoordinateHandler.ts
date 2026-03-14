import { useCesiumCoordinateHandler } from "@carma-mapping/engines/cesium/react/interactions";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";

type UseSceneCoordinateHandlerArgs = {
  scene: RuntimeScene | null;
  enabled: boolean;
  onCoordinate?: (
    coordinate: RuntimeCoordinate,
    screenPosition?: { x: number; y: number }
  ) => void;
  onDoubleCoordinate?: (
    coordinate: RuntimeCoordinate,
    screenPosition?: { x: number; y: number }
  ) => void;
  onHoverCoordinateChange?: (
    coordinate: RuntimeCoordinate | null,
    screenPosition?: { x: number; y: number }
  ) => void;
  onScreenPositionChange?: (
    screenPosition: { x: number; y: number } | null
  ) => void;
  singleClickDelayMs?: number;
};

export const useSceneCoordinateHandler = ({
  scene,
  enabled,
  onCoordinate,
  onDoubleCoordinate,
  onHoverCoordinateChange,
  onScreenPositionChange,
  singleClickDelayMs = 220,
}: UseSceneCoordinateHandlerArgs) => {
  useCesiumCoordinateHandler({
    scene,
    enabled,
    onCoordinate,
    onDoubleCoordinate,
    onHoverCoordinateChange,
    onScreenPositionChange,
    singleClickDelayMs,
  });
};
