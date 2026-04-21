import {
  defaultStateKeyToHashParamValueCodecMap,
  defaultHashParamNameOrder,
  type HashParamValueCodec,
  type StateKeyToHashParamValueCodecMap,
} from "@carma-providers/hash-state";

export const FLOODINGMAP_HASH_KEYS = {
  QUERY_X: "qx",
  QUERY_Y: "qy",
} as const;

export const FLOODINGMAP_QUERY_HASH_CLEAR_KEYS = [
  FLOODINGMAP_HASH_KEYS.QUERY_X,
  FLOODINGMAP_HASH_KEYS.QUERY_Y,
] as const;

const floodingmapQueryPositionHashParamValueCodec: HashParamValueCodec = {
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

export const FLOODINGMAP_STATE_KEY_TO_HASH_PARAM_VALUE_CODEC_MAP: StateKeyToHashParamValueCodecMap =
  {
    ...defaultStateKeyToHashParamValueCodecMap,
    [FLOODINGMAP_HASH_KEYS.QUERY_X]:
      floodingmapQueryPositionHashParamValueCodec,
    [FLOODINGMAP_HASH_KEYS.QUERY_Y]:
      floodingmapQueryPositionHashParamValueCodec,
  };

export const FLOODINGMAP_HASH_PARAM_NAME_ORDER: string[] = [
  ...defaultHashParamNameOrder,
  ...FLOODINGMAP_QUERY_HASH_CLEAR_KEYS,
];
