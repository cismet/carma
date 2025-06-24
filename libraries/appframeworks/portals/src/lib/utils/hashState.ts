import { HashCodec, HashCodecs } from "../contexts/HashStateProvider";

export const defaultHashKeyAliases = {
  mapStyle: "m",
  isOblique: "oblq",
};

// TODO move to a shared location
enum MapStyleKeys {
  TOPO = "karte",
  AERIAL = "luftbild",
}

const mapStyleShortNames: Record<MapStyleKeys, string> = {
  [MapStyleKeys.TOPO]: "0",
  [MapStyleKeys.AERIAL]: "1",
};

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
  lat: getNumberCodec(7),
  lng: getNumberCodec(7),
  zoom: getNumberCodec(2),
  heading: getNumberCodec(2),
  bearing: getNumberCodec(2), // bearing is used by maplibre
  pitch: getNumberCodec(2),
});
