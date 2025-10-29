import { HashCodec, HashCodecs } from ".";
import { mapStyleShortNames, defaultPrecisions } from "../../constants";

/**
 * Generic helper for boolean-like codec mappings
 * Maps a truthy string value to one state and falsy/absent to another
 */
export function createBooleanCodec<T>(
  truthyValue: string,
  truthyResult: T,
  falsyResult: T
): HashCodec {
  return {
    decode: (v: string | undefined) =>
      v === truthyValue ? truthyResult : falsyResult,
    encode: (v: unknown) =>
      typeof v === "string" && v === truthyResult ? truthyValue : undefined,
  };
}

const getStringLookupCodec = <T extends string>(
  mapping: Record<T, string>
): HashCodec => {
  const reverse = Object.fromEntries(
    Object.entries(mapping).map(([k, v]) => [v, k])
  );
  return {
    encode: (value: T | unknown) =>
      typeof value === "string" ? mapping[value] : undefined,
    decode: (value: string | undefined) =>
      value !== undefined ? reverse[value] : undefined,
  };
};

const getNumberCodec = (fixed?: number, trailingZeros = false): HashCodec => ({
  encode: (value: unknown) => {
    if (typeof value === "string" && value.length > 0) {
      return value; // Allow preformatted string values to pass through as is
    }

    if (typeof value === "number") {
      if (isNaN(value) || !isFinite(value)) {
        return undefined;
      }
      if (fixed === undefined) {
        return value.toString();
      }
      const fixedValue = value.toFixed(fixed);
      return trailingZeros ? fixedValue : parseFloat(fixedValue).toString();
    }
    return undefined;
  },
  decode: (value: string | undefined) =>
    value !== undefined && value !== "" ? parseFloat(value) : undefined,
});

/**
 * Default hash codecs for URL encoding/decoding.
 *
 * - mapStyle: Uses mapStyleShortNames for compression ("karte" <-> "0")
 * - lat/lng/zoom: Numeric with precision from defaultPrecisions
 * - engine: Boolean codec ("1" = cesium3d, absent = leaflet2d)
 * - heading/bearing/pitch: Numeric position parameters
 */
export const defaultHashCodecs: HashCodecs = Object.freeze({
  mapStyle: getStringLookupCodec(mapStyleShortNames), // "karte" <-> "0", "luftbild" <-> "1"
  lat: getNumberCodec(defaultPrecisions.latitude),
  lng: getNumberCodec(defaultPrecisions.longitude),
  zoom: getNumberCodec(defaultPrecisions.zoom),
  heading: getNumberCodec(defaultPrecisions.heading),
  bearing: getNumberCodec(defaultPrecisions.bearing), // bearing is used by maplibre
  pitch: getNumberCodec(2),
  engine: createBooleanCodec("1", "cesium3d", "leaflet2d"),
});
