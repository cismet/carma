import type {
  FormatAreaSquareMetersAdaptiveOptions,
  FormatDecimalNumberOptions,
  FormatDegreesOptions,
  FormatLengthMetersOptions,
  GeographicCoordinateFormatOptions,
} from "@carma-units";

export type AnnotationsRuntimeFormatOptions = {
  lengthMeters?: FormatLengthMetersOptions;
  areaSquareMeters?: FormatAreaSquareMetersAdaptiveOptions;
  degrees?: FormatDegreesOptions;
  geographicCoordinate?: GeographicCoordinateFormatOptions;
  decimalNumber?: FormatDecimalNumberOptions;
};
