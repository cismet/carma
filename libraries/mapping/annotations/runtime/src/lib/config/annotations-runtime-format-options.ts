import {
  FORMAT_LOCALE,
  LENGTH_UNIT_MODE,
  type FormatAreaSquareMetersAdaptiveOptions,
  type FormatDecimalNumberOptions,
  type FormatDegreesOptions,
  type FormatLengthMetersOptions,
  type GeographicCoordinateFormatOptions,
} from "@carma-units";

export type AnnotationsRuntimeFormatOptions = {
  lengthMeters?: FormatLengthMetersOptions;
  areaSquareMeters?: FormatAreaSquareMetersAdaptiveOptions;
  degrees?: FormatDegreesOptions;
  geographicCoordinate?: GeographicCoordinateFormatOptions;
  decimalNumber?: FormatDecimalNumberOptions;
};

export const ANNOTATIONS_RUNTIME_FORMAT_DEFAULTS: AnnotationsRuntimeFormatOptions =
  {
    lengthMeters: {
      locale: FORMAT_LOCALE.DE_DE,
      unitMode: LENGTH_UNIT_MODE.METERS,
      maximumFractionDigitsMeters: 2,
    },
    areaSquareMeters: {
      locale: FORMAT_LOCALE.DE_DE,
    },
    degrees: {
      locale: FORMAT_LOCALE.DE_DE,
    },
    geographicCoordinate: {
      locale: FORMAT_LOCALE.DE_DE,
      fractionDigits: 6,
    },
    decimalNumber: {
      locale: FORMAT_LOCALE.DE_DE,
      fractionDigits: 2,
      useGrouping: false,
    },
  };
