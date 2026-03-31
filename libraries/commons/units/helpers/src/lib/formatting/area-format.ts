import { formatSignificantNumber } from "./formatSignificantNumber";

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
    return "0 m²";
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
    )} ha`;
  }

  return `${formatSignificantNumber(
    areaSquareMeters,
    sharedNumberFormatOptions
  )} m²`;
};
