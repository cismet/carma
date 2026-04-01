import type { Meters } from "../base/lengths";

import { formatDecimalNumber } from "./decimal-format";
import { formatSignificantNumber } from "./formatSignificantNumber";
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

export type FormatLengthMetersScientificOptions = {
  locale?: Intl.LocalesArgument;
  significantDigits?: number;
};

export type FormattedLengthMetersScientificParts = {
  coefficient: string;
  exponent: number | null;
  unit: "m";
  text: string;
};

const DEFAULT_LENGTH_FORMAT_OPTIONS: Required<FormatLengthMetersOptions> = {
  locale: FORMAT_LOCALE.EN_US,
  kilometerThresholdMeters: 1000,
  maximumFractionDigitsMeters: 2,
  maximumFractionDigitsKilometers: 2,
  unitMode: LENGTH_UNIT_MODE.ADAPTIVE,
};

const DEFAULT_SCIENTIFIC_LENGTH_FORMAT_OPTIONS: Required<FormatLengthMetersScientificOptions> =
  {
    locale: FORMAT_LOCALE.EN_US,
    significantDigits: 3,
  };

const THIN_SPACE = "\u2009";
const NARROW_NO_BREAK_SPACE = "\u202F";

const clampScientificSignificantDigits = (value: number): number =>
  Math.max(1, Math.min(12, Math.floor(value)));

const readScientificSignificantDigits = (
  options?: FormatLengthMetersScientificOptions
): number => {
  const candidate = options?.significantDigits;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return clampScientificSignificantDigits(candidate);
  }

  return DEFAULT_SCIENTIFIC_LENGTH_FORMAT_OPTIONS.significantDigits;
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

export const formatLengthMetersScientific = (
  value: Meters | number,
  options?: FormatLengthMetersScientificOptions
): string => {
  return formatLengthMetersScientificParts(value, options).text;
};

export const formatLengthMetersScientificParts = (
  value: Meters | number,
  options?: FormatLengthMetersScientificOptions
): FormattedLengthMetersScientificParts => {
  const numericValue = value as number;

  if (!Number.isFinite(numericValue)) {
    return {
      coefficient: String(numericValue),
      exponent: null,
      unit: "m",
      text: `${String(numericValue)} m`,
    };
  }

  if (numericValue === 0) {
    return {
      coefficient: "0",
      exponent: null,
      unit: "m",
      text: "0 m",
    };
  }

  const { locale, significantDigits } = {
    ...DEFAULT_SCIENTIFIC_LENGTH_FORMAT_OPTIONS,
    ...options,
  };
  const resolvedSignificantDigits = readScientificSignificantDigits({
    significantDigits,
  });
  const [coefficientSource = "0", exponentSource = "0"] = numericValue
    .toExponential(resolvedSignificantDigits - 1)
    .split("e");
  const coefficient = Number.parseFloat(coefficientSource);
  const exponent = Number.parseInt(exponentSource, 10);
  const formattedCoefficient = formatSignificantNumber(coefficient, {
    locale,
    significantDigits: resolvedSignificantDigits,
  });

  return {
    coefficient: formattedCoefficient,
    exponent,
    unit: "m",
    text: `${formattedCoefficient}${THIN_SPACE}\u00D7${THIN_SPACE}10^${exponent}${NARROW_NO_BREAK_SPACE}m`,
  };
};
