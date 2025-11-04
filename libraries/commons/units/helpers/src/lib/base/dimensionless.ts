import { Ratio } from "@carma/units/types";
// Todo consider expanding unit system to handle range clamped values
// like unit-range-ratio, but restrict them from using branded ops
// for this just returns the same Type

export const isUnitRangeRatio = (value: unknown): value is Ratio => {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
};

// For aspect ratios, zoom, scale factors
export const isPositiveRatio = (value: unknown): value is Ratio => {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
};

// For any dimensionless number
export const isRatio = (value: unknown): value is Ratio => {
  return typeof value === "number" && Number.isFinite(value);
};
