import { diffHashParams } from "@carma-commons/utils";
import type {
  StateKeyToHashParamValueCodecMap,
  HashParamNameToStateKeyMap,
  HashParams,
  StateKeyToHashParamNameAliases,
  StateKeyToHashParamNameMap,
} from "./hashStateShared";
import { sceneViewStateStateKeyToHashParamValueCodecMap } from "./scene-state-hash/hashParamCodecs";

type HashParamNameMaps = {
  hashParamNameToStateKey: HashParamNameToStateKeyMap;
  stateKeyToHashParamName: StateKeyToHashParamNameMap;
};

const createManagedKeySet = (
  stateKeyToHashParamValueCodecMap: StateKeyToHashParamValueCodecMap,
  stateKeyAliases: StateKeyToHashParamNameAliases
) =>
  new Set([
    ...Object.keys(stateKeyToHashParamValueCodecMap),
    ...Object.keys(stateKeyAliases),
  ]);

export const toUniqueStrings = (
  keys: string[],
  lookUp: Record<string, string>
): string[] => {
  // Map alias keys back to original and deduplicate
  return [...new Set(keys.map((k: string) => lookUp[k] || k))];
};

export const createHashParamNameMaps = (
  stateKeyToHashParamValueCodecMap: StateKeyToHashParamValueCodecMap,
  stateKeyAliases: StateKeyToHashParamNameAliases
): HashParamNameMaps => {
  const hashParamNameToStateKey: HashParamNameToStateKeyMap = {};
  const stateKeyToHashParamName: StateKeyToHashParamNameMap = {};
  const managedKeys = createManagedKeySet(
    stateKeyToHashParamValueCodecMap,
    stateKeyAliases
  );

  for (const stateKey of managedKeys) {
    const hashParamAlias = stateKeyAliases[stateKey];

    stateKeyToHashParamName[stateKey] = hashParamAlias ?? stateKey;

    if (hashParamAlias) {
      hashParamNameToStateKey[hashParamAlias] = stateKey;
      continue;
    }

    hashParamNameToStateKey[stateKey] = stateKey;
  }

  return {
    hashParamNameToStateKey,
    stateKeyToHashParamName,
  };
};

export const computeHashDiff = (
  previousHashParams: HashParams,
  nextHashParams: HashParams,
  hashParamNameToStateKeyLookup: HashParamNameToStateKeyMap
) => {
  const {
    changedKeys: changedHashParamNames,
    removedKeys: removedHashParamNames,
  } = diffHashParams(previousHashParams, nextHashParams);
  const changedStateKeys = toUniqueStrings(
    changedHashParamNames,
    hashParamNameToStateKeyLookup
  );
  const removedStateKeys = toUniqueStrings(
    removedHashParamNames,
    hashParamNameToStateKeyLookup
  );
  return { changedStateKeys, removedStateKeys };
};

export const compileManagedSceneViewStateClearStateKeys = (
  stateKeyToHashParamValueCodecMap: StateKeyToHashParamValueCodecMap
): string[] =>
  Object.keys(sceneViewStateStateKeyToHashParamValueCodecMap).filter(
    (key) => key in stateKeyToHashParamValueCodecMap
  );

export const decodeHashParamsToStateValues = (
  hashParams: HashParams,
  hashParamNameToStateKey: HashParamNameToStateKeyMap,
  stateKeyToHashParamValueCodecMap: StateKeyToHashParamValueCodecMap
): Record<string, unknown> => {
  const stateValues: Record<string, unknown> = {};

  for (const [hashParamName, value] of Object.entries(hashParams)) {
    const resolvedStateKey = hashParamNameToStateKey[hashParamName];
    if (!resolvedStateKey) {
      continue;
    }

    stateValues[resolvedStateKey] = stateKeyToHashParamValueCodecMap[
      resolvedStateKey
    ]
      ? stateKeyToHashParamValueCodecMap[resolvedStateKey].decode(value)
      : value;
  }

  return stateValues;
};

export const normalizeClearStateKeySetStateKeys = (
  keys: readonly string[]
): string[] => Array.from(new Set(keys.filter((key) => key.length > 0)));

export const resolveScopedClearStateKeys = (
  clearStateKeySetIds: string[],
  clearStateKeySets: ReadonlyMap<string, readonly string[]>,
  managedSceneViewStateClearStateKeys: string[],
  sceneViewStateClearStateKeySetId: string
): string[] =>
  clearStateKeySetIds.flatMap((id) => {
    const registered = clearStateKeySets.get(id);
    if (registered) {
      return registered;
    }

    if (id === sceneViewStateClearStateKeySetId) {
      return managedSceneViewStateClearStateKeys;
    }

    return [];
  });

export const resolveClearAndUndefinedKeys = ({
  clearStateKeys,
  scopedClearStateKeys,
  stateKeyToHashParamName,
  undefinedKeys,
  writtenKeys,
}: {
  clearStateKeys: string[];
  scopedClearStateKeys: string[];
  stateKeyToHashParamName: StateKeyToHashParamNameMap;
  undefinedKeys: string[];
  writtenKeys: Set<string>;
}): string[] => {
  const resolvedClearStateKeys = [
    ...new Set([...clearStateKeys, ...scopedClearStateKeys]),
  ].map((key) => stateKeyToHashParamName[key] ?? key);

  return [...resolvedClearStateKeys, ...undefinedKeys].filter(
    (key) => !writtenKeys.has(key)
  );
};

export const applyHashParamValueCodecs = (
  params: Record<string, unknown>,
  stateKeyToHashParamValueCodecMap: StateKeyToHashParamValueCodecMap,
  stateKeyToHashParamName: StateKeyToHashParamNameMap
) => {
  const newParams = {};
  const undefinedKeys: string[] = [];

  for (const [stateKey, value] of Object.entries(params)) {
    const codec = stateKeyToHashParamValueCodecMap[stateKey];
    const encoded = codec ? codec.encode(value) : value;
    const hashParamName = stateKeyToHashParamName[stateKey] ?? stateKey;

    if (encoded === undefined) {
      undefinedKeys.push(hashParamName);
    } else {
      newParams[hashParamName] = encoded;
    }
  }

  return { newParams, undefinedKeys };
};

export default toUniqueStrings;
