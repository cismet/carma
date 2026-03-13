import { useEffect } from "react";

import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
  type Scene,
} from "@carma/cesium";

import {
  resolveGeographicCoordinateFromScreenPosition,
  type CesiumGeographicCoordinate,
} from "./cesiumCoordinateAdapters";

export type CesiumCoordinateHandlerOptions = {
  scene: Scene | null;
  enabled: boolean;
  onCoordinate?: (coordinate: CesiumGeographicCoordinate) => void;
  onDoubleCoordinate?: (coordinate: CesiumGeographicCoordinate) => void;
  onHoverCoordinateChange?: (
    coordinate: CesiumGeographicCoordinate | null
  ) => void;
  onScreenPositionChange?: (
    screenPosition: { x: number; y: number } | null
  ) => void;
  singleClickDelayMs?: number;
};

export const useCesiumCoordinateHandler = ({
  scene,
  enabled,
  onCoordinate,
  onDoubleCoordinate,
  onHoverCoordinateChange,
  onScreenPositionChange,
  singleClickDelayMs = 220,
}: CesiumCoordinateHandlerOptions) => {
  useEffect(() => {
    if (!scene || scene.isDestroyed() || !enabled) {
      return;
    }

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    let singleClickTimeout: number | null = null;

    const clearSingleClickTimeout = () => {
      if (singleClickTimeout === null) {
        return;
      }

      window.clearTimeout(singleClickTimeout);
      singleClickTimeout = null;
    };

    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (!onCoordinate) {
        return;
      }

      const coordinate = resolveGeographicCoordinateFromScreenPosition(
        scene,
        event.position
      );
      if (!coordinate) {
        return;
      }

      if (!onDoubleCoordinate) {
        onCoordinate(coordinate);
        return;
      }

      clearSingleClickTimeout();
      singleClickTimeout = window.setTimeout(() => {
        onCoordinate(coordinate);
        singleClickTimeout = null;
      }, singleClickDelayMs);
    }, ScreenSpaceEventType.LEFT_CLICK);

    if (onScreenPositionChange || onHoverCoordinateChange) {
      handler.setInputAction((event: { endPosition: Cartesian2 }) => {
        scene.requestRender();
        onScreenPositionChange?.({
          x: event.endPosition.x,
          y: event.endPosition.y,
        });
        onHoverCoordinateChange?.(
          resolveGeographicCoordinateFromScreenPosition(
            scene,
            event.endPosition
          )
        );
      }, ScreenSpaceEventType.MOUSE_MOVE);
    }

    if (onDoubleCoordinate) {
      handler.setInputAction((event: { position: Cartesian2 }) => {
        clearSingleClickTimeout();

        const coordinate = resolveGeographicCoordinateFromScreenPosition(
          scene,
          event.position
        );
        if (coordinate) {
          onDoubleCoordinate(coordinate);
        }
      }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    }

    return () => {
      clearSingleClickTimeout();
      onScreenPositionChange?.(null);
      onHoverCoordinateChange?.(null);
      if (!handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [
    enabled,
    onCoordinate,
    onDoubleCoordinate,
    onHoverCoordinateChange,
    onScreenPositionChange,
    scene,
    singleClickDelayMs,
  ]);
};
