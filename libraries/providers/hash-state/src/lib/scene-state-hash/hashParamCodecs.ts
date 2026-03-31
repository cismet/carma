import { formatFixedNumber } from "@carma-commons/utils/number-format";
import type {
  HashCodec,
  HashCodecs,
  HashKeyAliases,
} from "../HashStateProvider";
import {
  SCENE_VIEW_STATE_HASH_KEY_ALIASES,
  SCENE_VIEW_STATE_HASH_KEYS,
  SCENE_VIEW_STATE_HASH_KEY_ORDER,
} from "./hashKeys";

export const sceneViewStateHashKeyAliases: HashKeyAliases =
  SCENE_VIEW_STATE_HASH_KEY_ALIASES;

export const sceneViewStateHashKeyOrder: string[] =
  SCENE_VIEW_STATE_HASH_KEY_ORDER;

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
      return formatFixedNumber(value, fixed, {
        trimTrailingZeros: !trailingZeros,
      });
    }
    return undefined;
  },
  decode: (value: string | undefined) =>
    value !== undefined ? parseFloat(value) : undefined,
});

export const sceneViewStateHashCodecs: HashCodecs = Object.freeze({
  [SCENE_VIEW_STATE_HASH_KEYS.LATITUDE]: getNumberCodec(7),
  [SCENE_VIEW_STATE_HASH_KEYS.LONGITUDE]: getNumberCodec(7),
  [SCENE_VIEW_STATE_HASH_KEYS.ZOOM]: getNumberCodec(3),
  [SCENE_VIEW_STATE_HASH_KEYS.ALTITUDE]: getNumberCodec(2),
  [SCENE_VIEW_STATE_HASH_KEYS.RANGE]: getNumberCodec(2),
  [SCENE_VIEW_STATE_HASH_KEYS.BEARING]: getNumberCodec(2),
  [SCENE_VIEW_STATE_HASH_KEYS.PITCH]: getNumberCodec(2),
  [SCENE_VIEW_STATE_HASH_KEYS.ROLL]: getNumberCodec(2),
  [SCENE_VIEW_STATE_HASH_KEYS.FOV]: getNumberCodec(2),
});
