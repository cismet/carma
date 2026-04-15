import type { Cartesian3 } from "@carma-cesium";
import {
  CESIUM_POINT_QUERY_CLICK_STRATEGY,
  useCesiumPointQuery,
} from "@carma-mapping/engines/cesium/react/interactions";
import {
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma-mapping/engines/cesium/core";

import type { RuntimeCoordinate } from "../store";
import type { RuntimeScene } from "../types/runtime-scene.types";
type UseSceneCoordinateHandlerOptions = {
  enabled: boolean;
  onCoordinate?: (
    coordinate: RuntimeCoordinate,
    screenPosition?: { x: number; y: number }
  ) => void;
  onLineFinish?: () => void;
  onHoverCoordinateChange?: (
    coordinate: RuntimeCoordinate | null,
    screenPosition?: { x: number; y: number }
  ) => void;
  onHoverSampleChange?: (sample: {
    coordinate: RuntimeCoordinate | null;
    screenPosition: { x: number; y: number };
    pointECEF: Cartesian3 | null;
    surfaceNormalECEF: Cartesian3 | null;
  }) => void;
  onScreenPositionChange?: (
    screenPosition: { x: number; y: number } | null
  ) => void;
  singleClickDelayMs?: number;
};

const runtimeCoordinateFromCartesian = (
  positionECEF: Cartesian3
): RuntimeCoordinate => {
  const coordinateWgs84 = getDegreesFromCartesian(positionECEF);

  return {
    longitude: coordinateWgs84.longitude,
    latitude: coordinateWgs84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(coordinateWgs84.altitude),
  };
};

export const useSceneCoordinateHandler = (
  scene: RuntimeScene | null,
  {
    enabled,
    onCoordinate,
    onLineFinish,
    onHoverCoordinateChange,
    onHoverSampleChange,
    onScreenPositionChange,
    singleClickDelayMs = 220,
  }: UseSceneCoordinateHandlerOptions
) => {
  useCesiumPointQuery(scene, {
    enabled,
    hideCursorWhileEnabled: true,
    clickStrategy: onLineFinish
      ? CESIUM_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH
      : CESIUM_POINT_QUERY_CLICK_STRATEGY.IMMEDIATE,
    pointClickDelayMs: singleClickDelayMs,
    onPointCreate: (payload) => {
      onCoordinate?.(
        runtimeCoordinateFromCartesian(payload.pickedPositionECEF),
        {
          x: payload.screenPosition.x,
          y: payload.screenPosition.y,
        }
      );
    },
    onLineFinish,
    onPointerMove: (positionECEF, screenPosition, surfaceNormalECEF) => {
      const runtimeCoordinate = positionECEF
        ? runtimeCoordinateFromCartesian(positionECEF)
        : null;
      const runtimeScreenPosition = {
        x: screenPosition.x,
        y: screenPosition.y,
      };

      onHoverCoordinateChange?.(runtimeCoordinate, runtimeScreenPosition);
      onHoverSampleChange?.({
        coordinate: runtimeCoordinate,
        screenPosition: runtimeScreenPosition,
        pointECEF: positionECEF ?? null,
        surfaceNormalECEF: surfaceNormalECEF ?? null,
      });
    },
    onScreenPositionChange,
  });
};
