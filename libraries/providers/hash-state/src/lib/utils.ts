import { diffHashParams, getHashParams } from "@carma-commons/utils";
import type {
  HashCodecs,
  HashKeyAliases,
  HashKeyLookup,
  RawHashParams,
} from "./hashStateShared";
import { sceneViewStateHashCodecs } from "./scene-state-hash/hashParamCodecs";

export const toUniqueStrings = (
  keys: string[],
  lookUp: HashKeyLookup
): string[] => {
  // Map alias keys back to original and deduplicate
  return [...new Set(keys.map((k: string) => lookUp[k] || k))];
};

export const getAliasReverseLookup = (aliases: HashKeyAliases) => {
  const reverseLookup: HashKeyLookup = {};
  for (const [original, alias] of Object.entries(aliases)) {
    reverseLookup[alias] = original;
  }
  return reverseLookup;
};

export const computeHashDiff = (
  beforeRaw: RawHashParams,
  afterRaw: RawHashParams,
  aliasReverseLookup: HashKeyLookup
) => {
  const { changedKeys: changedAliasKeys, removedKeys: removedAliasKeys } =
    diffHashParams(beforeRaw, afterRaw);
  const changedKeys = toUniqueStrings(changedAliasKeys, aliasReverseLookup);
  const removedKeys = toUniqueStrings(removedAliasKeys, aliasReverseLookup);
  return { changedKeys, removedKeys };
};

export const compileManagedSceneViewStateClearKeys = (
  hashCodecs: HashCodecs
): string[] =>
  Object.keys(sceneViewStateHashCodecs).filter((key) => key in hashCodecs);

export const createHashReadKeyLookup = (
  hashCodecs: HashCodecs,
  keyAliases: HashKeyAliases
): HashKeyLookup => {
  const lookup: HashKeyLookup = {};
  const managedKeys = new Set([
    ...Object.keys(hashCodecs),
    ...Object.keys(keyAliases),
  ]);

  for (const key of managedKeys) {
    lookup[keyAliases[key] ?? key] = key;
  }

  return lookup;
};

export const decodeHashValues = (
  params: RawHashParams,
  hashReadKeyLookup: HashKeyLookup,
  hashCodecs: HashCodecs
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    const resolvedKey = hashReadKeyLookup[key];
    if (!resolvedKey) {
      continue;
    }

    values[resolvedKey] = hashCodecs[resolvedKey]
      ? hashCodecs[resolvedKey].decode(value)
      : value;
  }

  return values;
};

export const normalizeClearKeySetKeys = (keys: readonly string[]): string[] =>
  Array.from(new Set(keys.filter((key) => key.length > 0)));

export const resolveScopedClearKeys = (
  clearKeySetIds: string[],
  clearKeySets: ReadonlyMap<string, readonly string[]>,
  managedSceneViewStateClearKeys: string[],
  sceneViewStateClearKeySetId: string
): string[] =>
  clearKeySetIds.flatMap((id) => {
    const registered = clearKeySets.get(id);
    if (registered) {
      return registered;
    }

    if (id === sceneViewStateClearKeySetId) {
      return managedSceneViewStateClearKeys;
    }

    return [];
  });

export const resolveClearAndUndefinedKeys = ({
  clearKeys,
  scopedClearKeys,
  keyAliases,
  undefinedKeys,
  writtenKeys,
}: {
  clearKeys: string[];
  scopedClearKeys: string[];
  keyAliases: HashKeyAliases;
  undefinedKeys: string[];
  writtenKeys: Set<string>;
}): string[] => {
  const resolvedClearKeys = [
    ...new Set([...clearKeys, ...scopedClearKeys]),
  ].map((key) => keyAliases[key] ?? key);

  return [...resolvedClearKeys, ...undefinedKeys].filter(
    (key) => !writtenKeys.has(key)
  );
};

export const applyHashCodecs = (
  params: Record<string, unknown>,
  hashCodecs: Record<string, { encode: (v: unknown) => string | undefined }>,
  keyAliases: HashKeyAliases
) => {
  const newParams = {};
  const undefinedKeys: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    const codec = hashCodecs[key];
    const encoded = codec ? codec.encode(value) : value;
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
