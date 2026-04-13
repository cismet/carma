import { clamp } from "@carma-commons/math";

export type CesiumVerticalFovBounds = {
  minimumFovRad: number;
  maximumFovRad: number;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const readCesiumVerticalFovBounds = ({
  minimumFovRad,
  maximumFovRad,
}: Partial<CesiumVerticalFovBounds>): CesiumVerticalFovBounds | null =>
  isFiniteNumber(minimumFovRad) && isFiniteNumber(maximumFovRad)
    ? {
        minimumFovRad,
        maximumFovRad,
      }
    : null;

export const clampCesiumVerticalFov = (
  verticalFovRad: number,
  bounds: CesiumVerticalFovBounds | null
) =>
  bounds
    ? clamp(verticalFovRad, bounds.minimumFovRad, bounds.maximumFovRad)
    : verticalFovRad;
