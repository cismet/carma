import { formatSignificantNumber } from "./formatSignificantNumber";

const NARROW_NO_BREAK_SPACE = "\u202F";

export type FormatAreaSquareMetersAdaptiveOptions = {
  locale?: Intl.LocalesArgument;
  significantDigits?: number;
  hectareThresholdSquareMeters?: number;
};

const DEFAULT_HECTARE_THRESHOLD_SQUARE_METERS = 4999;

export const formatAreaSquareMetersAdaptive = (
  areaSquareMeters: number,
  options?: FormatAreaSquareMetersAdaptiveOptions
): string => {
  if (!Number.isFinite(areaSquareMeters) || areaSquareMeters <= 0) {
    return `0${NARROW_NO_BREAK_SPACE}m²`;
  }

  const hectareThresholdSquareMeters =
    options?.hectareThresholdSquareMeters ??
    DEFAULT_HECTARE_THRESHOLD_SQUARE_METERS;
  const sharedNumberFormatOptions = {
    locale: options?.locale,
    significantDigits: options?.significantDigits,
  };

  if (areaSquareMeters > hectareThresholdSquareMeters) {
    return `${formatSignificantNumber(
      areaSquareMeters / 10000,
      sharedNumberFormatOptions
    )}${NARROW_NO_BREAK_SPACE}ha`;
  }

  return `${formatSignificantNumber(
    areaSquareMeters,
    sharedNumberFormatOptions
  )}${NARROW_NO_BREAK_SPACE}m²`;
};
