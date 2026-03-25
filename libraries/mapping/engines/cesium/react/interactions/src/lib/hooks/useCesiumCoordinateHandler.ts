import { useEffect } from "react";

import {
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  resolveGeographicCoordinateFromScreenPosition,
  type CesiumGeographicCoordinate,
  type Cartesian2,
  type Scene,
} from "@carma/cesium";

export type CesiumCoordinateHandlerOptions = {
  scene: Scene | null;
  enabled: boolean;
  onCoordinate?: (
    coordinate: CesiumGeographicCoordinate,
    screenPosition?: { x: number; y: number }
  ) => void;
  onDoubleCoordinate?: (
    coordinate: CesiumGeographicCoordinate,
    screenPosition?: { x: number; y: number }
  ) => void;
  onHoverCoordinateChange?: (
    coordinate: CesiumGeographicCoordinate | null,
    screenPosition?: { x: number; y: number }
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
        onCoordinate(coordinate, {
          x: event.position.x,
          y: event.position.y,
        });
        return;
      }

      clearSingleClickTimeout();
      singleClickTimeout = window.setTimeout(() => {
        onCoordinate(coordinate, {
          x: event.position.x,
          y: event.position.y,
        });
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
          ),
          {
            x: event.endPosition.x,
            y: event.endPosition.y,
          }
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
          onDoubleCoordinate(coordinate, {
            x: event.position.x,
            y: event.position.y,
          });
        }
      }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    }

    return () => {
      clearSingleClickTimeout();
      onScreenPositionChange?.(null);
      onHoverCoordinateChange?.(null, undefined);
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
