import { formatFixedNumber } from "@carma-commons/utils/number-format";

import type {
  HashParamValueCodec,
  StateKeyToHashParamValueCodecMap,
  StateKeyToHashParamNameAliases,
} from "../HashStateProvider";
import {
  SCENE_VIEW_STATE_HASH_PARAM_NAMES,
  SCENE_VIEW_STATE_HASH_PARAM_NAME_ORDER,
  SCENE_VIEW_STATE_STATE_KEY_TO_HASH_PARAM_NAME_ALIASES,
} from "./hashParamNames";
export const sceneViewStateStateKeyToHashParamNameAliases: StateKeyToHashParamNameAliases =
  SCENE_VIEW_STATE_STATE_KEY_TO_HASH_PARAM_NAME_ALIASES;

export const sceneViewStateHashParamNameOrder: string[] =
  SCENE_VIEW_STATE_HASH_PARAM_NAME_ORDER;

const getNumberCodec = (
  fixed?: number,
  trailingZeros = false
): HashParamValueCodec => ({
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

export const sceneViewStateStateKeyToHashParamValueCodecMap: StateKeyToHashParamValueCodecMap =
  Object.freeze({
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.LATITUDE]: getNumberCodec(7),
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.LONGITUDE]: getNumberCodec(7),
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.ZOOM]: getNumberCodec(3),
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.ALTITUDE]: getNumberCodec(2),
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.BEARING]: getNumberCodec(2),
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.PITCH]: getNumberCodec(2),
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.ROLL]: getNumberCodec(2),
    [SCENE_VIEW_STATE_HASH_PARAM_NAMES.FOV]: getNumberCodec(2),
  });
