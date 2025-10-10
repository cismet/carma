import { HashCodec, HashCodecs } from "../contexts/HashStateProvider";
import { mapStyleShortNames, defaultPrecisions } from "../constants";

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
    value !== undefined ? parseFloat(value) : undefined,
});

export const defaultHashCodecs: HashCodecs = Object.freeze({
  mapStyle: getStringLookupCodec(mapStyleShortNames),
  lat: getNumberCodec(defaultPrecisions.latitude),
  lng: getNumberCodec(defaultPrecisions.longitude),
  zoom: getNumberCodec(defaultPrecisions.zoom),
  heading: getNumberCodec(defaultPrecisions.heading),
  bearing: getNumberCodec(defaultPrecisions.bearing), // bearing is used by maplibre
  pitch: getNumberCodec(2),
});
