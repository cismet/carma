import {
  LENGTH_UNIT_MODE,
  formatDecimalNumber,
  formatAreaSquareMetersAdaptive,
  formatLatLonDegrees,
  formatLengthMeters,
} from "@carma/units/helpers";
import type { Degrees } from "@carma/units/types";

export const formatNumber = (value: number, precision = 2): string =>
  formatDecimalNumber(value, {
    locale: "de-DE",
    fractionDigits: precision,
  });

export const formatAreaAdaptive = (areaSquareMeters: number): string => {
  return formatAreaSquareMetersAdaptive(areaSquareMeters, {
    locale: "de-DE",
  });
};

export const formatGeographic = (
  longitude: number,
  latitude: number,
  altitude?: number
): string[] => [
  ...formatLatLonDegrees(latitude as Degrees, longitude as Degrees, {
    fractionDigits: 6,
    locale: "de-DE",
  }),
  altitude !== undefined
    ? `𝘩 ${formatLengthMeters(altitude, {
        locale: "de-DE",
        unitMode: LENGTH_UNIT_MODE.METERS,
      })}`
    : "",
];

export const formatCartesian = (x: number, y: number, z: number): string[] => [
  `X ${formatLengthMeters(x, {
    locale: "de-DE",
    unitMode: LENGTH_UNIT_MODE.METERS,
  })}`,
  `Y ${formatLengthMeters(y, {
    locale: "de-DE",
    unitMode: LENGTH_UNIT_MODE.METERS,
  })}`,
  `Z ${formatLengthMeters(z, {
    locale: "de-DE",
    unitMode: LENGTH_UNIT_MODE.METERS,
  })}`,
];
