import { isFiniteNumber } from "@carma/math";
import type { CssPixels, Meters, Radians } from "@carma/units/types";
import type {
  CameraOrthographicScale,
  CameraIntrinsics,
  CameraViewOffset,
} from "./camera-view-specification";
import { CAMERA_TYPE } from "./camera-view-specification";

export type ElementSizeLike =
  | {
      clientWidth?: number;
      clientHeight?: number;
    }
  | null
  | undefined;

const DEFAULT_PROJECTION_CENTER_RADIUS_PX = 960;
const MIN_TAN_HALF_FOV = 1e-6;

const readAspectRatio = ({
  aspect,
  viewportWidthPx,
  viewportHeightPx,
}: {
  aspect?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): number | undefined => {
  if (isFiniteNumber(aspect) && aspect > 0) {
    return aspect;
  }

  return isFiniteNumber(viewportWidthPx) &&
    isFiniteNumber(viewportHeightPx) &&
    viewportWidthPx > 0 &&
    viewportHeightPx > 0
    ? viewportWidthPx / viewportHeightPx
    : undefined;
};

export const readHorizontalFovFromVertical = (
  verticalFov: number | undefined,
  aspect: number | undefined
): Radians | undefined =>
  isFiniteNumber(verticalFov) &&
  verticalFov > 0 &&
  isFiniteNumber(aspect) &&
  aspect > 0
    ? ((Math.atan(Math.tan(verticalFov * 0.5) * aspect) * 2) as Radians)
    : undefined;

export const readVerticalFovFromLongerEdge = (
  longerEdgeFov: number | undefined,
  aspect: number | undefined
): Radians | undefined => {
  if (
    !isFiniteNumber(longerEdgeFov) ||
    longerEdgeFov <= 0 ||
    !isFiniteNumber(aspect) ||
    aspect <= 0
  ) {
    return undefined;
  }

  return aspect > 1
    ? ((Math.atan(Math.tan(longerEdgeFov * 0.5) / aspect) * 2) as Radians)
    : (longerEdgeFov as Radians);
};

export const readLongerEdgeFovFromIntrinsics = (
  intrinsics: Pick<CameraIntrinsics, "fov" | "fovHorizontal">,
  options: {
    aspect?: number;
    viewportWidthPx?: number;
    viewportHeightPx?: number;
  } = {}
): Radians | undefined => {
  const aspect = readAspectRatio(options);
  const derivedHorizontalFov = readHorizontalFovFromVertical(
    intrinsics.fov,
    aspect
  );
  const finiteCandidates = [
    intrinsics.fov,
    intrinsics.fovHorizontal,
    derivedHorizontalFov,
  ].filter(
    (candidate) => isFiniteNumber(candidate) && candidate > 0
  ) as number[];

  return finiteCandidates.length > 0
    ? (Math.max(...finiteCandidates) as Radians)
    : undefined;
};

const readOrthographicMetersPerCssPixel = (
  intrinsics:
    | Pick<CameraIntrinsics, "type" | "orthographicScale">
    | null
    | undefined
): Meters | null => {
  const metersPerCssPixel = intrinsics?.orthographicScale?.metersPerCssPixel;

  return intrinsics?.type === CAMERA_TYPE.ORTHOGRAPHIC &&
    isFiniteNumber(metersPerCssPixel) &&
    metersPerCssPixel > 0
    ? (metersPerCssPixel as Meters)
    : null;
};

export const buildOrthographicScale = (
  metersPerCssPixel: number
): CameraOrthographicScale | undefined =>
  isFiniteNumber(metersPerCssPixel) && metersPerCssPixel > 0
    ? {
        metersPerCssPixel,
      }
    : undefined;

export const readViewOffsetFromElement = (
  element: ElementSizeLike
): CameraViewOffset | undefined => {
  const widthPx = element?.clientWidth;
  const heightPx = element?.clientHeight;
  if (
    !isFiniteNumber(widthPx) ||
    !isFiniteNumber(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0
  ) {
    return undefined;
  }

  return {
    fullWidth: widthPx as CssPixels,
    fullHeight: heightPx as CssPixels,
    offsetX: 0 as CssPixels,
    offsetY: 0 as CssPixels,
    width: widthPx as CssPixels,
    height: heightPx as CssPixels,
  };
};

const readProjectionCenterRadiusPx = ({
  viewportWidthPx,
  viewportHeightPx,
}: {
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): number | null => {
  if (
    isFiniteNumber(viewportWidthPx) &&
    isFiniteNumber(viewportHeightPx) &&
    viewportWidthPx > 0 &&
    viewportHeightPx > 0
  ) {
    const centerRadiusPx = Math.max(viewportWidthPx, viewportHeightPx) * 0.5;
    return isFiniteNumber(centerRadiusPx) && centerRadiusPx > 0
      ? centerRadiusPx
      : null;
  }

  return DEFAULT_PROJECTION_CENTER_RADIUS_PX;
};

const readTanHalfFov = (fovRad: number): number | null => {
  if (!isFiniteNumber(fovRad)) {
    return null;
  }

  const tanHalfFov = Math.tan(fovRad * 0.5);
  return isFiniteNumber(tanHalfFov) && Math.abs(tanHalfFov) >= MIN_TAN_HALF_FOV
    ? tanHalfFov
    : null;
};

export const readMetersPerCssPixel = ({
  rangeM,
  fovRad,
  viewportWidthPx,
  viewportHeightPx,
}: {
  rangeM: number;
  fovRad: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): Meters | null => {
  const projectionCenterRadiusPx = readProjectionCenterRadiusPx({
    viewportWidthPx,
    viewportHeightPx,
  });
  const tanHalfFov = readTanHalfFov(fovRad);
  if (
    projectionCenterRadiusPx === null ||
    tanHalfFov === null ||
    !isFiniteNumber(rangeM) ||
    rangeM <= 0
  ) {
    return null;
  }

  const groundRadiusM = rangeM * Math.abs(tanHalfFov);
  const metersPerCssPixel = groundRadiusM / projectionCenterRadiusPx;
  return isFiniteNumber(metersPerCssPixel) && metersPerCssPixel > 0
    ? (metersPerCssPixel as Meters)
    : null;
};

export const readMetersPerCssPixelFromIntrinsics = ({
  intrinsics,
  rangeM,
  viewportWidthPx,
  viewportHeightPx,
}: {
  intrinsics: Pick<
    CameraIntrinsics,
    "type" | "fov" | "fovHorizontal" | "orthographicScale"
  >;
  rangeM?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): Meters | null => {
  const orthographicMetersPerCssPixel =
    readOrthographicMetersPerCssPixel(intrinsics);
  if (orthographicMetersPerCssPixel !== null) {
    return orthographicMetersPerCssPixel;
  }

  const longerEdgeFov = readLongerEdgeFovFromIntrinsics(intrinsics, {
    viewportWidthPx,
    viewportHeightPx,
  });
  if (
    !isFiniteNumber(longerEdgeFov) ||
    longerEdgeFov <= 0 ||
    !isFiniteNumber(rangeM) ||
    rangeM <= 0
  ) {
    return null;
  }

  return readMetersPerCssPixel({
    rangeM,
    fovRad: longerEdgeFov,
    viewportWidthPx,
    viewportHeightPx,
  });
};

export const readRangeFromMetersPerCssPixel = ({
  metersPerCssPixel,
  fovRad,
  minRangeM = 0.01,
  viewportWidthPx,
  viewportHeightPx,
}: {
  metersPerCssPixel: number;
  fovRad: number;
  minRangeM?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): Meters | null => {
  const projectionCenterRadiusPx = readProjectionCenterRadiusPx({
    viewportWidthPx,
    viewportHeightPx,
  });
  const tanHalfFov = readTanHalfFov(fovRad);
  if (
    projectionCenterRadiusPx === null ||
    tanHalfFov === null ||
    !isFiniteNumber(metersPerCssPixel) ||
    metersPerCssPixel <= 0
  ) {
    return null;
  }

  const groundRadiusM = metersPerCssPixel * projectionCenterRadiusPx;
  const rangeM = groundRadiusM / Math.abs(tanHalfFov);
  return isFiniteNumber(rangeM) && rangeM >= minRangeM
    ? (rangeM as Meters)
    : null;
};
