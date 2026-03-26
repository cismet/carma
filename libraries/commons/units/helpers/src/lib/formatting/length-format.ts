import type { Meters } from "@carma/units/types";
import { formatDecimalNumber } from "./decimal-format";
import { FORMAT_LOCALE } from "./locales";

export const LENGTH_UNIT_MODE = {
  ADAPTIVE: "adaptive",
  METERS: "meters",
} as const;

export type LengthUnitMode =
  (typeof LENGTH_UNIT_MODE)[keyof typeof LENGTH_UNIT_MODE];

export type FormatLengthMetersOptions = {
  locale?: string;
  kilometerThresholdMeters?: number;
  maximumFractionDigitsMeters?: number;
  maximumFractionDigitsKilometers?: number;
  unitMode?: LengthUnitMode;
};

const DEFAULT_LENGTH_FORMAT_OPTIONS: Required<FormatLengthMetersOptions> = {
  locale: FORMAT_LOCALE.EN_US,
  kilometerThresholdMeters: 1000,
  maximumFractionDigitsMeters: 2,
  maximumFractionDigitsKilometers: 2,
  unitMode: LENGTH_UNIT_MODE.ADAPTIVE,
};

export const formatLengthMeters = (
  value: Meters | number,
  options?: FormatLengthMetersOptions
): string => {
  const {
    locale,
    kilometerThresholdMeters,
    maximumFractionDigitsMeters,
    maximumFractionDigitsKilometers,
    unitMode,
  } = {
    ...DEFAULT_LENGTH_FORMAT_OPTIONS,
    ...options,
  };

  const numericValue = value as number;
  const absoluteValue = Math.abs(numericValue);

  if (unitMode === LENGTH_UNIT_MODE.METERS) {
    return `${formatDecimalNumber(numericValue, {
      locale,
      fractionDigits: maximumFractionDigitsMeters,
      useGrouping: true,
    })} m`;
  }

  if (absoluteValue >= kilometerThresholdMeters) {
    return `${formatDecimalNumber(numericValue / 1000, {
      locale,
      fractionDigits: maximumFractionDigitsKilometers,
      useGrouping: true,
    })} km`;
  }

  return `${formatDecimalNumber(numericValue, {
    locale,
    fractionDigits: maximumFractionDigitsMeters,
    useGrouping: true,
  })} m`;
};
