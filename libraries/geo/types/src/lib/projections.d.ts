import type { Meters, NumericUnit } from "@carma/units/types";

declare const WebMercatorEastingSymbol: unique symbol;
declare const WebMercatorNorthingSymbol: unique symbol;
declare const UTMETRSEastingSymbol: unique symbol;
declare const UTMETRSNorthingSymbol: unique symbol;

export type ETRS89UTMZone = 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37;

export namespace Coordinates {
  export type WebMercatorEastingMeters = Meters &
    NumericUnit<typeof WebMercatorEastingSymbol>;
  export type WebMercatorNorthingMeters = Meters &
    NumericUnit<typeof WebMercatorNorthingSymbol>;
  export type WebMercator = {
    x: WebMercatorEastingMeters;
    y: WebMercatorNorthingMeters;
  };

  export type ETRS89UTMEastingMeters = Meters &
    NumericUnit<typeof UTMETRSEastingSymbol>;
  export type ETRS89UTMNorthingMeters = Meters &
    NumericUnit<typeof UTMETRSNorthingSymbol>;
  export type ETRS89UTM = {
    east: ETRS89UTMEastingMeters;
    north: ETRS89UTMNorthingMeters;
    zone: ETRS89UTMZone;
  };
}
