import {
  readLongerEdgeFovFromIntrinsics,
  readVerticalFovFromLongerEdge,
  readZoomStepScale,
} from "@carma-commons/camera/model";
import type { Radians } from "@carma-units";

import {
  clampCesiumVerticalFov,
  readCesiumVerticalFovBounds,
} from "./fov-bounds";

export const computeNextCesiumWheelFov = (
  currentFovRad: number,
  direction: "in" | "out",
  {
    zoomDelta,
    minimumFovRad,
    maximumFovRad,
    viewportWidthPx,
    viewportHeightPx,
  }: {
    zoomDelta: number;
    minimumFovRad: number;
    maximumFovRad: number;
    viewportWidthPx?: number;
    viewportHeightPx?: number;
  }
): Radians | null => {
  const verticalFovBounds = readCesiumVerticalFovBounds({
    minimumFovRad,
    maximumFovRad,
  });

  if (!verticalFovBounds) {
    return null;
  }

  const currentLongerEdgeFov = readLongerEdgeFovFromIntrinsics(
    {
      fov: currentFovRad as Radians,
    },
    {
      viewportWidthPx,
      viewportHeightPx,
    }
  );
  const zoomStepScale = readZoomStepScale({
    direction,
    zoomDelta,
  });
  const aspectRatio =
    typeof viewportWidthPx === "number" &&
    Number.isFinite(viewportWidthPx) &&
    viewportWidthPx > 0 &&
    typeof viewportHeightPx === "number" &&
    Number.isFinite(viewportHeightPx) &&
    viewportHeightPx > 0
      ? viewportWidthPx / viewportHeightPx
      : undefined;

  if (
    typeof currentLongerEdgeFov !== "number" ||
    !Number.isFinite(currentLongerEdgeFov) ||
    currentLongerEdgeFov <= 0 ||
    typeof zoomStepScale !== "number" ||
    !Number.isFinite(zoomStepScale) ||
    zoomStepScale <= 0
  ) {
    return null;
  }

  const targetLongerEdgeFov =
    2 * Math.atan(Math.tan(currentLongerEdgeFov * 0.5) * zoomStepScale);
  const targetVerticalFov = readVerticalFovFromLongerEdge(
    targetLongerEdgeFov,
    aspectRatio
  );

  return typeof targetVerticalFov === "number" &&
    Number.isFinite(targetVerticalFov)
    ? (clampCesiumVerticalFov(targetVerticalFov, verticalFovBounds) as Radians)
    : null;
};
