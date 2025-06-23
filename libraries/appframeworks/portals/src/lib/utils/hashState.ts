import { HashCodec, HashCodecs } from "../contexts/HashStateProvider";

export const defaultHashKeyAliases = {
  mapStyle: "m",
  cesiumMapStyle: "m",
};

// TODO move to a shared location
enum MapStyleKeys {
  TOPO = "karte",
  AERIAL = "luftbild",
}

type cesiumKeys = "primary" | "secondary";

const mapStyleShortNames: Record<MapStyleKeys, string> = {
  [MapStyleKeys.TOPO]: "0",
  [MapStyleKeys.AERIAL]: "1",
};

const cesiumMapStyleShortNames: Record<cesiumKeys, string> = {
  primary: "0",
  secondary: "1",
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
  cesiumMapStyle: getStringLookupCodec(cesiumMapStyleShortNames),
  lat: getNumberCodec(7),
  lng: getNumberCodec(7),
  zoom: getNumberCodec(2),
});
