import {
  defaultStateKeyToHashParamNameAliases,
  normalizeHashParamsForWrite,
  type HashParams,
  type StateKeyToHashParamNameAliases,
} from "@carma-providers/hash-state";

const DEFAULT_OMITTED_SHARE_HASH_KEYS = ["config", "appKey"] as const;

type NormalizeShareHashParamsOptions = {
  stateKeyAliases?: StateKeyToHashParamNameAliases;
  omittedKeys?: readonly string[];
};

export const normalizeShareHashParams = (
  hashParams: HashParams,
  options: NormalizeShareHashParamsOptions = {}
): HashParams =>
  normalizeHashParamsForWrite(hashParams, {
    stateKeyAliases:
      options.stateKeyAliases ?? defaultStateKeyToHashParamNameAliases,
    omittedKeys: options.omittedKeys ?? DEFAULT_OMITTED_SHARE_HASH_KEYS,
  });
