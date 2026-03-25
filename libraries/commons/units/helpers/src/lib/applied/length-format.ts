import type { Meters } from "@carma/units/types";

export type FormatLengthMetersOptions = {
  locale?: string;
  kilometerThresholdMeters?: number;
  maximumFractionDigitsMeters?: number;
  maximumFractionDigitsKilometers?: number;
};

const DEFAULT_LENGTH_FORMAT_OPTIONS: Required<FormatLengthMetersOptions> = {
  locale: "en-US",
  kilometerThresholdMeters: 1000,
  maximumFractionDigitsMeters: 2,
  maximumFractionDigitsKilometers: 2,
};

const formatWithGrouping = (
  value: number,
  locale: string,
  maximumFractionDigits: number
) =>
  new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    useGrouping: true,
  }).format(value);

export const formatLengthMeters = (
  value: Meters | number,
  options?: FormatLengthMetersOptions
): string => {
  const {
    locale,
    kilometerThresholdMeters,
    maximumFractionDigitsMeters,
    maximumFractionDigitsKilometers,
  } = {
    ...DEFAULT_LENGTH_FORMAT_OPTIONS,
    ...options,
  };

  const numericValue = value as number;
  const absoluteValue = Math.abs(numericValue);

  if (absoluteValue >= kilometerThresholdMeters) {
    return `${formatWithGrouping(
      numericValue / 1000,
      locale,
      maximumFractionDigitsKilometers
    )} km`;
  }

  return `${formatWithGrouping(
    numericValue,
    locale,
    maximumFractionDigitsMeters
  )} m`;
};
