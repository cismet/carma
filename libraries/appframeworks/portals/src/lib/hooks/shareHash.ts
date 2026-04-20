import {
  defaultHashKeyAliases,
  type HashKeyAliases,
  type RawHashParams,
} from "@carma-providers/hash-state";

const DEFAULT_OMITTED_SHARE_HASH_KEYS = ["config", "appKey"] as const;

type NormalizeShareHashParamsOptions = {
  keyAliases?: HashKeyAliases;
  omittedKeys?: readonly string[];
};

export const normalizeShareHashParams = (
  params: RawHashParams,
  options: NormalizeShareHashParamsOptions = {}
): RawHashParams => {
  const {
    keyAliases = defaultHashKeyAliases,
    omittedKeys = DEFAULT_OMITTED_SHARE_HASH_KEYS,
  } = options;
  const omittedKeySet = new Set(omittedKeys);
  const normalizedParams = Object.fromEntries(
    Object.entries(params).filter(([key]) => !omittedKeySet.has(key))
  );

  for (const [canonicalKey, aliasKey] of Object.entries(keyAliases)) {
    if (aliasKey in normalizedParams) {
      delete normalizedParams[canonicalKey];
    }
  }

  return normalizedParams;
};
