import {
  readLongerEdgeFovFromIntrinsics,
  readVerticalFovFromLongerEdge,
  readZoomStepScale,
} from "@carma-commons/camera/model";
import { clamp } from "@carma-commons/math";
import type { Radians } from "@carma-units";

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
    ? (clamp(targetVerticalFov, minimumFovRad, maximumFovRad) as Radians)
    : null;
};
