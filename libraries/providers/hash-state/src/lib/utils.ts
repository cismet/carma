import { diffHashParams, getHashParams } from "@carma-commons/utils";

export const toUniqueStrings = (
  keys: string[],
  lookUp: Record<string, string>
): string[] => {
  // Map alias keys back to original and deduplicate
  return [...new Set(keys.map((k: string) => lookUp[k] || k))];
};

export const getAliasReverseLookup = (aliases: Record<string, string>) => {
  const reverseLookup: Record<string, string> = {};
  for (const [original, alias] of Object.entries(aliases)) {
    reverseLookup[alias] = original;
  }
  return reverseLookup;
};

export const computeHashDiff = (
  beforeRaw: Record<string, string>,
  afterRaw: Record<string, string>,
  aliasReverseLookup: Record<string, string>
) => {
  const { changedKeys: changedAliasKeys, removedKeys: removedAliasKeys } =
    diffHashParams(beforeRaw, afterRaw);
  const changedKeys = toUniqueStrings(changedAliasKeys, aliasReverseLookup);
  const removedKeys = toUniqueStrings(removedAliasKeys, aliasReverseLookup);
  return { changedKeys, removedKeys };
};

export const applyHashCodecs = (
  params: Record<string, unknown>,
  hashCodecs: Record<string, { encode: (v: unknown) => string | undefined }>,
  keyAliases: Record<string, string>
) => {
  const newParams = {};
  const undefinedKeys: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    const encoded = hashCodecs?.[key]?.encode(value) ?? value;
    const aliasedKey = keyAliases?.[key] ?? key;

    if (encoded === undefined) {
      undefinedKeys.push(aliasedKey);
    } else {
      newParams[aliasedKey] = encoded;
    }
  }

  return { newParams, undefinedKeys };
};

export default toUniqueStrings;
