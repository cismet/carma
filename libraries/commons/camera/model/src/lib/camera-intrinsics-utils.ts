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

export const readLogTanHalfFov = (fovRad: number): number | null => {
  const tanHalfFov = readTanHalfFov(fovRad);

  return tanHalfFov !== null && tanHalfFov > 0 ? Math.log(tanHalfFov) : null;
};

export const readFovFromLogTanHalfFov = (
  logTanHalfFov: number
): Radians | null => {
  if (!isFiniteNumber(logTanHalfFov)) {
    return null;
  }

  const tanHalfFov = Math.exp(logTanHalfFov);
  const fovRad = 2 * Math.atan(tanHalfFov);

  return isFiniteNumber(fovRad) && fovRad > 0 ? (fovRad as Radians) : null;
};

export const interpolateDollyCompensatedFov = ({
  startFovRad,
  targetFovRad,
  progress,
}: {
  startFovRad: number;
  targetFovRad: number;
  progress: number;
}): Radians | null => {
  const startLogTanHalfFov = readLogTanHalfFov(startFovRad);
  const targetLogTanHalfFov = readLogTanHalfFov(targetFovRad);

  if (
    startLogTanHalfFov === null ||
    targetLogTanHalfFov === null ||
    !isFiniteNumber(progress)
  ) {
    return null;
  }

  const interpolatedLogTanHalfFov =
    startLogTanHalfFov +
    (targetLogTanHalfFov - startLogTanHalfFov) * progress;

  return readFovFromLogTanHalfFov(interpolatedLogTanHalfFov);
};

export const interpolateDollyCompensatedRange = ({
  startRangeM,
  startFovRad,
  targetFovRad,
  progress,
  minRangeM = 0.01,
  viewportWidthPx,
  viewportHeightPx,
}: {
  startRangeM: number;
  startFovRad: number;
  targetFovRad: number;
  progress: number;
  minRangeM?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): Meters | null => {
  const interpolatedFovRad = interpolateDollyCompensatedFov({
    startFovRad,
    targetFovRad,
    progress,
  });

  if (interpolatedFovRad === null) {
    return null;
  }

  return readDollyCompensatedRange({
    currentRangeM: startRangeM,
    currentFovRad: startFovRad,
    targetFovRad: interpolatedFovRad,
    minRangeM,
    viewportWidthPx,
    viewportHeightPx,
  });
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

export const readLongerEdgeFovFromMetersPerCssPixel = ({
  metersPerCssPixel,
  rangeM,
  viewportWidthPx,
  viewportHeightPx,
}: {
  metersPerCssPixel: number;
  rangeM: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): Radians | null => {
  const projectionCenterRadiusPx = readProjectionCenterRadiusPx({
    viewportWidthPx,
    viewportHeightPx,
  });

  if (
    projectionCenterRadiusPx === null ||
    !isFiniteNumber(metersPerCssPixel) ||
    metersPerCssPixel <= 0 ||
    !isFiniteNumber(rangeM) ||
    rangeM <= 0
  ) {
    return null;
  }

  const tanHalfFov = (metersPerCssPixel * projectionCenterRadiusPx) / rangeM;
  const longerEdgeFov = Math.atan(Math.abs(tanHalfFov)) * 2;

  return isFiniteNumber(longerEdgeFov) && longerEdgeFov > 0
    ? (longerEdgeFov as Radians)
    : null;
};

export const readZoomStepScale = ({
  direction,
  zoomDelta,
}: {
  direction: "in" | "out";
  zoomDelta: number;
}): number | null => {
  if (!isFiniteNumber(zoomDelta) || zoomDelta <= 0) {
    return null;
  }

  const scale = Math.pow(2, direction === "out" ? zoomDelta : -zoomDelta);
  return isFiniteNumber(scale) && scale > 0 ? scale : null;
};

export const readMetersPerCssPixelAfterZoomStep = ({
  metersPerCssPixel,
  direction,
  zoomDelta,
}: {
  metersPerCssPixel: number;
  direction: "in" | "out";
  zoomDelta: number;
}): Meters | null => {
  const zoomStepScale = readZoomStepScale({
    direction,
    zoomDelta,
  });

  if (
    zoomStepScale === null ||
    !isFiniteNumber(metersPerCssPixel) ||
    metersPerCssPixel <= 0
  ) {
    return null;
  }

  const targetMetersPerCssPixel = metersPerCssPixel * zoomStepScale;
  return isFiniteNumber(targetMetersPerCssPixel) && targetMetersPerCssPixel > 0
    ? (targetMetersPerCssPixel as Meters)
    : null;
};

export const readTargetRangeForZoomStepFromIntrinsics = ({
  intrinsics,
  currentRangeM,
  direction,
  zoomDelta,
  minRangeM = 0.01,
  viewportWidthPx,
  viewportHeightPx,
}: {
  intrinsics: Pick<
    CameraIntrinsics,
    "type" | "fov" | "fovHorizontal" | "orthographicScale"
  >;
  currentRangeM: number;
  direction: "in" | "out";
  zoomDelta: number;
  minRangeM?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): Meters | null => {
  const currentMetersPerCssPixel = readMetersPerCssPixelFromIntrinsics({
    intrinsics,
    rangeM: currentRangeM,
    viewportWidthPx,
    viewportHeightPx,
  });
  const targetMetersPerCssPixel =
    currentMetersPerCssPixel !== null
      ? readMetersPerCssPixelAfterZoomStep({
          metersPerCssPixel: currentMetersPerCssPixel,
          direction,
          zoomDelta,
        })
      : null;
  const longerEdgeFov = readLongerEdgeFovFromIntrinsics(intrinsics, {
    viewportWidthPx,
    viewportHeightPx,
  });

  if (
    targetMetersPerCssPixel === null ||
    !isFiniteNumber(longerEdgeFov) ||
    longerEdgeFov <= 0
  ) {
    return null;
  }

  return readRangeFromMetersPerCssPixel({
    metersPerCssPixel: targetMetersPerCssPixel,
    fovRad: longerEdgeFov,
    minRangeM,
    viewportWidthPx,
    viewportHeightPx,
  });
};

export const readTargetLongerEdgeFovForZoomStepFromIntrinsics = ({
  intrinsics,
  currentRangeM,
  direction,
  zoomDelta,
  viewportWidthPx,
  viewportHeightPx,
}: {
  intrinsics: Pick<
    CameraIntrinsics,
    "type" | "fov" | "fovHorizontal" | "orthographicScale"
  >;
  currentRangeM: number;
  direction: "in" | "out";
  zoomDelta: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): Radians | null => {
  const currentMetersPerCssPixel = readMetersPerCssPixelFromIntrinsics({
    intrinsics,
    rangeM: currentRangeM,
    viewportWidthPx,
    viewportHeightPx,
  });
  const targetMetersPerCssPixel =
    currentMetersPerCssPixel !== null
      ? readMetersPerCssPixelAfterZoomStep({
          metersPerCssPixel: currentMetersPerCssPixel,
          direction,
          zoomDelta,
        })
      : null;

  if (targetMetersPerCssPixel === null) {
    return null;
  }

  return readLongerEdgeFovFromMetersPerCssPixel({
    metersPerCssPixel: targetMetersPerCssPixel,
    rangeM: currentRangeM,
    viewportWidthPx,
    viewportHeightPx,
  });
};

export const readDollyCompensatedRange = ({
  currentRangeM,
  currentFovRad,
  targetFovRad,
  minRangeM = 0.01,
  viewportWidthPx,
  viewportHeightPx,
}: {
  currentRangeM: number;
  currentFovRad: number;
  targetFovRad: number;
  minRangeM?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): Meters | null => {
  const metersPerCssPixel = readMetersPerCssPixel({
    rangeM: currentRangeM,
    fovRad: currentFovRad,
    viewportWidthPx,
    viewportHeightPx,
  });

  if (metersPerCssPixel === null) {
    return null;
  }

  return readRangeFromMetersPerCssPixel({
    metersPerCssPixel,
    fovRad: targetFovRad,
    minRangeM,
    viewportWidthPx,
    viewportHeightPx,
  });
};
