import { useCesiumCoordinateHandler } from "@carma-mapping/annotations/cesium";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtimeScene.types";

type UseSceneCoordinateHandlerArgs = {
  scene: RuntimeScene | null;
  enabled: boolean;
  onCoordinate?: (coordinate: RuntimeCoordinate) => void;
  onDoubleCoordinate?: (coordinate: RuntimeCoordinate) => void;
  onHoverCoordinateChange?: (coordinate: RuntimeCoordinate | null) => void;
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
