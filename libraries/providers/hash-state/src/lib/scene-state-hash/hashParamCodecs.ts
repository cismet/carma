import type {
  HashCodec,
  HashCodecs,
  HashKeyAliases,
} from "../HashStateProvider";

export const sceneViewStateHashKeyAliases: HashKeyAliases = {
  bearing: "b",
  pitch: "p",
  altitude: "h",
};

export const sceneViewStateHashKeyOrder: string[] = [
  "lat",
  "lng",
  "zoom",
  "b",
  "p",
  "h",
  "range",
  "fov",
];

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

export const sceneViewStateHashCodecs: HashCodecs = Object.freeze({
  lat: getNumberCodec(7),
  lng: getNumberCodec(7),
  zoom: getNumberCodec(3),
  altitude: getNumberCodec(2),
  range: getNumberCodec(2),
  bearing: getNumberCodec(2),
  pitch: getNumberCodec(2),
  fov: getNumberCodec(2),
});
