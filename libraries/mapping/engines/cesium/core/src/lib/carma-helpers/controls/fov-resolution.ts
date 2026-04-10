import {
  readLongerEdgeFovFromMetersPerCssPixel,
  readVerticalFovFromLongerEdge,
} from "@carma-commons/camera/model";
import type { Scene } from "@carma-cesium";
import type { Radians } from "@carma-units";

import { readSceneAspectRatio } from "./cesium-zoom-curves";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const readCesiumSceneVerticalFovForMetersPerCssPixel = (
  scene: Scene,
  {
    metersPerCssPixel,
    rangeM,
    fitMode = "longer-edge",
  }: {
    metersPerCssPixel: number;
    rangeM: number;
    fitMode?: "longer-edge" | "shorter-edge";
  }
): Radians | null => {
  if (fitMode === "shorter-edge") {
    const widthPx = scene.canvas?.clientWidth;
    const heightPx = scene.canvas?.clientHeight;
    const aspectRatio = readSceneAspectRatio(scene);
    const projectionCenterRadiusPx =
      typeof widthPx === "number" &&
      Number.isFinite(widthPx) &&
      widthPx > 0 &&
      typeof heightPx === "number" &&
      Number.isFinite(heightPx) &&
      heightPx > 0
        ? Math.min(widthPx, heightPx) * 0.5
        : null;

    if (
      !isFiniteNumber(metersPerCssPixel) ||
      metersPerCssPixel <= 0 ||
      !isFiniteNumber(rangeM) ||
      rangeM <= 0 ||
      projectionCenterRadiusPx === null ||
      aspectRatio === null
    ) {
      return null;
    }

    const tanHalfShorterEdgeFov =
      (metersPerCssPixel * projectionCenterRadiusPx) / rangeM;
    const shorterEdgeFov = Math.atan(Math.abs(tanHalfShorterEdgeFov)) * 2;

    if (!isFiniteNumber(shorterEdgeFov) || shorterEdgeFov <= 0) {
      return null;
    }

    const verticalFov =
      aspectRatio >= 1
        ? shorterEdgeFov
        : 2 * Math.atan(Math.tan(shorterEdgeFov * 0.5) / aspectRatio);

    return isFiniteNumber(verticalFov) ? (verticalFov as Radians) : null;
  }

  const longerEdgeFov = readLongerEdgeFovFromMetersPerCssPixel({
    metersPerCssPixel,
    rangeM,
    viewportWidthPx: scene.canvas?.clientWidth,
    viewportHeightPx: scene.canvas?.clientHeight,
  });
  const aspectRatio = readSceneAspectRatio(scene);

  if (!isFiniteNumber(longerEdgeFov) || aspectRatio === null) {
    return null;
  }

  const verticalFov = readVerticalFovFromLongerEdge(longerEdgeFov, aspectRatio);
  return isFiniteNumber(verticalFov) ? (verticalFov as Radians) : null;
};
