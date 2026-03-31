import type { Degrees } from "@carma/units/types";

import { FORMAT_LOCALE } from "./locales";
export const GEOGRAPHIC_DIRECTION_STYLE = {
  CARDINAL: "cardinal",
  SIGNED: "signed",
} as const;

export const GEOGRAPHIC_COORDINATE_AXIS = {
  LATITUDE: "latitude",
  LONGITUDE: "longitude",
} as const;

export const GEOGRAPHIC_FRACTION_AXIS = {
  LAT: "lat",
  LON: "lon",
} as const;

export type GeographicDirectionStyle =
  (typeof GEOGRAPHIC_DIRECTION_STYLE)[keyof typeof GEOGRAPHIC_DIRECTION_STYLE];
export type GeographicCoordinateAxis =
  (typeof GEOGRAPHIC_COORDINATE_AXIS)[keyof typeof GEOGRAPHIC_COORDINATE_AXIS];
export type GeographicFractionAxis =
  (typeof GEOGRAPHIC_FRACTION_AXIS)[keyof typeof GEOGRAPHIC_FRACTION_AXIS];

export type GeographicFractionDigits =
  | number
  | {
      lat?: number;
      lon?: number;
    };

export type GeographicCoordinateFormatOptions = {
  fractionDigits?: GeographicFractionDigits;
  locale?: Intl.LocalesArgument;
  directionStyle?: GeographicDirectionStyle;
  unitSymbol?: string | false;
};

const DEFAULT_FRACTION_DIGITS = 6;
const DEFAULT_LOCALE = FORMAT_LOCALE.DE_DE;

const clampFractionDigits = (value: number): number =>
  Math.max(0, Math.min(12, Math.floor(value)));

const formatFixedCoordinateNumber = (
  value: number,
  fixedDigits: number
): string | undefined => {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return parseFloat(value.toFixed(fixedDigits)).toString();
};

const readAxisFractionDigits = (
  axis: GeographicFractionAxis,
  options?: GeographicCoordinateFormatOptions
): number => {
  const candidate = options?.fractionDigits;
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return clampFractionDigits(candidate);
  }
  if (candidate && typeof candidate === "object") {
    const axisDigits = candidate[axis];
    if (typeof axisDigits === "number" && Number.isFinite(axisDigits)) {
      return clampFractionDigits(axisDigits);
    }
  }
  return DEFAULT_FRACTION_DIGITS;
};

const formatLocalizedFixedCoordinate = (
  value: number,
  axis: GeographicFractionAxis,
  options?: GeographicCoordinateFormatOptions
) => {
  const fractionDigits = readAxisFractionDigits(axis, options);
  const formatted = formatFixedCoordinateNumber(value, fractionDigits);
  if (formatted === undefined) {
    return "unresolved";
  }

  return Number(formatted).toLocaleString(options?.locale ?? DEFAULT_LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  });
};

const readLatitudeCardinal = (value: number): string => (value < 0 ? "S" : "N");

const readPrimaryLocale = (
  locale?: Intl.LocalesArgument
): string | undefined => {
  if (typeof locale === "string") {
    return locale;
  }
  if (Array.isArray(locale)) {
    const firstLocale = locale.find(
      (entry): entry is string => typeof entry === "string" && entry.length > 0
    );
    return firstLocale;
  }
  return undefined;
};

const readLongitudeCardinal = (
  value: number,
  locale?: Intl.LocalesArgument
): string => {
  if (value < 0) {
    return "W";
  }

  const primaryLocale = readPrimaryLocale(locale) ?? DEFAULT_LOCALE;
  return primaryLocale.toLowerCase().startsWith("de") ? "O" : "E";
};

const readUnitSymbol = (options?: GeographicCoordinateFormatOptions): string =>
  typeof options?.unitSymbol === "string"
    ? options.unitSymbol
    : options?.unitSymbol === false
    ? ""
    : "°";

const formatCoordinateDegrees = (
  valueDeg: Degrees,
  axis: GeographicCoordinateAxis,
  options?: GeographicCoordinateFormatOptions
): string => {
  if (!Number.isFinite(valueDeg)) {
    return "unresolved";
  }

  const directionStyle =
    options?.directionStyle ?? GEOGRAPHIC_DIRECTION_STYLE.CARDINAL;
  const localized = formatLocalizedFixedCoordinate(
    directionStyle === GEOGRAPHIC_DIRECTION_STYLE.CARDINAL
      ? Math.abs(valueDeg)
      : valueDeg,
    axis === GEOGRAPHIC_COORDINATE_AXIS.LATITUDE
      ? GEOGRAPHIC_FRACTION_AXIS.LAT
      : GEOGRAPHIC_FRACTION_AXIS.LON,
    options
  );

  if (localized === "unresolved") {
    return localized;
  }

  const unitSymbol = readUnitSymbol(options);
  if (directionStyle === GEOGRAPHIC_DIRECTION_STYLE.SIGNED) {
    return `${localized}${unitSymbol}`;
  }

  const cardinal =
    axis === GEOGRAPHIC_COORDINATE_AXIS.LATITUDE
      ? readLatitudeCardinal(valueDeg)
      : readLongitudeCardinal(valueDeg, options?.locale);

  return `${localized}${unitSymbol}${cardinal}`;
};

export const formatLatitudeDegrees = (
  valueDeg: Degrees,
  options?: GeographicCoordinateFormatOptions
): string =>
  formatCoordinateDegrees(
    valueDeg,
    GEOGRAPHIC_COORDINATE_AXIS.LATITUDE,
    options
  );

export const formatLongitudeDegrees = (
  valueDeg: Degrees,
  options?: GeographicCoordinateFormatOptions
): string =>
  formatCoordinateDegrees(
    valueDeg,
    GEOGRAPHIC_COORDINATE_AXIS.LONGITUDE,
    options
  );

export const formatLatLonDegrees = (
  latitudeDeg: Degrees,
  longitudeDeg: Degrees,
  options?: GeographicCoordinateFormatOptions
): readonly [string, string] => [
  formatLatitudeDegrees(latitudeDeg, options),
  formatLongitudeDegrees(longitudeDeg, options),
];
