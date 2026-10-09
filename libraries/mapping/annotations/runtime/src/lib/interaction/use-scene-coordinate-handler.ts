import type { Vector3 } from "three";
import {
  geographicCoordinateFromEcef,
  getEllipsoidalAltitudeOrZero,
  type AnnotationGeographicCoordinate,
} from "@carma-mapping/annotations/core";

import {
  ANNOTATION_POINT_QUERY_CLICK_STRATEGY,
  type AnnotationEngine,
  type AnnotationPointQueryOptions,
} from "../engine";
import type { AnnotationPointQueryInputModifier } from "./lifecycle";
type UseSceneCoordinateHandlerOptions = {
  enabled: boolean;
  onCoordinate?: (
    coordinate: AnnotationGeographicCoordinate,
    screenPosition?: { x: number; y: number },
    options?: { inputModifier?: AnnotationPointQueryInputModifier }
  ) => void;
  onLineFinish?: () => void;
  onHoverCoordinateChange?: (
    coordinate: AnnotationGeographicCoordinate | null,
    screenPosition?: { x: number; y: number }
  ) => void;
  onHoverSampleChange?: (sample: {
    coordinate: AnnotationGeographicCoordinate | null;
    screenPosition: { x: number; y: number };
    pointECEF: Vector3 | null;
    surfaceNormalECEF: Vector3 | null;
    inputModifier?: AnnotationPointQueryInputModifier;
  }) => void;
  onScreenPositionChange?: (
    screenPosition: { x: number; y: number } | null
  ) => void;
  singleClickDelayMs?: number;
  inputModifiers?: readonly AnnotationPointQueryInputModifier[];
};

const runtimeCoordinateFromEcef = (
  positionECEF: Vector3
): AnnotationGeographicCoordinate => {
  const coordinateWgs84 = geographicCoordinateFromEcef(positionECEF);

  return {
    longitude: coordinateWgs84.longitude,
    latitude: coordinateWgs84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(coordinateWgs84.altitude),
  };
};

// Hook order stays stable: the engine is fixed for the host lifetime, so the
// resolved hook never changes within a mounted host.
const useNoopPointQuery = (_options: AnnotationPointQueryOptions) => undefined;

export const useSceneCoordinateHandler = (
  engine: AnnotationEngine | null,
  {
    enabled,
    onCoordinate,
    onLineFinish,
    onHoverCoordinateChange,
    onHoverSampleChange,
    onScreenPositionChange,
    singleClickDelayMs = 220,
    inputModifiers,
  }: UseSceneCoordinateHandlerOptions
) => {
  const usePointQuery = engine?.hooks.usePointQuery ?? useNoopPointQuery;
  usePointQuery({
    enabled,
    hideCursorWhileEnabled: true,
    clickStrategy: onLineFinish
      ? ANNOTATION_POINT_QUERY_CLICK_STRATEGY.DELAYED_LINE_FINISH
      : ANNOTATION_POINT_QUERY_CLICK_STRATEGY.IMMEDIATE,
    config: { clickDelayMs: singleClickDelayMs },
    inputModifiers,
    onPointCreate: (payload) => {
      onCoordinate?.(
        runtimeCoordinateFromEcef(payload.pickedPositionECEF),
        {
          x: payload.screenPosition.x,
          y: payload.screenPosition.y,
        },
        { inputModifier: payload.inputModifier }
      );
    },
    onLineFinish,
    onPointerMove: (
      positionECEF,
      screenPosition,
      surfaceNormalECEF,
      options
    ) => {
      const runtimeCoordinate = positionECEF
        ? runtimeCoordinateFromEcef(positionECEF)
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
        ...(options?.inputModifier
          ? { inputModifier: options.inputModifier }
          : {}),
      });
    },
    onScreenPositionChange,
  });
};
