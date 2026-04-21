import {
  defaultHashCodecs,
  defaultHashKeyOrder,
  type HashCodec,
  type HashCodecs,
} from "@carma-providers/hash-state";

export const FLOODINGMAP_HASH_KEYS = {
  QUERY_X: "qx",
  QUERY_Y: "qy",
} as const;

export const FLOODINGMAP_QUERY_HASH_CLEAR_KEYS = [
  FLOODINGMAP_HASH_KEYS.QUERY_X,
  FLOODINGMAP_HASH_KEYS.QUERY_Y,
] as const;

const floodingmapQueryPositionHashCodec: HashCodec = {
  decode: (value: string | undefined): number | undefined => {
    if (value === undefined) {
      return undefined;
    }

    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : undefined;
  },
  encode: (value: unknown): string | undefined => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }

    return String(value);
  },
};

export const FLOODINGMAP_HASH_CODECS: HashCodecs = {
  ...defaultHashCodecs,
  [FLOODINGMAP_HASH_KEYS.QUERY_X]: floodingmapQueryPositionHashCodec,
  [FLOODINGMAP_HASH_KEYS.QUERY_Y]: floodingmapQueryPositionHashCodec,
};

export const FLOODINGMAP_HASH_KEY_ORDER: string[] = [
  ...defaultHashKeyOrder,
  ...FLOODINGMAP_QUERY_HASH_CLEAR_KEYS,
];
