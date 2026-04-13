import { PerspectiveFrustum } from "@carma-cesium";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const readPerspectiveFrustumVerticalFov = (
  frustum:
    | Pick<PerspectiveFrustum, "fov" | "fovy" | "aspectRatio">
    | null
    | undefined
): number | undefined => {
  if (frustum && isFiniteNumber(frustum.fovy) && frustum.fovy > 0) {
    return frustum.fovy;
  }

  if (!frustum || !isFiniteNumber(frustum.fov) || frustum.fov <= 0) {
    return undefined;
  }

  if (isFiniteNumber(frustum.aspectRatio) && frustum.aspectRatio > 1) {
    return Math.atan(Math.tan(frustum.fov * 0.5) / frustum.aspectRatio) * 2;
  }

  return frustum.fov;
};

export const readPerspectiveFrustumLongerEdgeFov = (
  frustum: Pick<PerspectiveFrustum, "fov"> | null | undefined
): number | undefined => {
  if (!frustum || !isFiniteNumber(frustum.fov) || frustum.fov <= 0) {
    return undefined;
  }

  return frustum.fov;
};

export const writePerspectiveFrustumVerticalFov = (
  frustum: PerspectiveFrustum,
  verticalFov: number
): void => {
  if (!isFiniteNumber(verticalFov) || verticalFov <= 0) {
    return;
  }

  frustum.fov =
    isFiniteNumber(frustum.aspectRatio) && frustum.aspectRatio > 1
      ? Math.atan(Math.tan(verticalFov * 0.5) * frustum.aspectRatio) * 2
      : verticalFov;
};

export const writePerspectiveFrustumLongerEdgeFov = (
  frustum: PerspectiveFrustum,
  longerEdgeFov: number
): void => {
  if (!isFiniteNumber(longerEdgeFov) || longerEdgeFov <= 0) {
    return;
  }

  frustum.fov = longerEdgeFov;
};
