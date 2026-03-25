import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import {
  getHashParams,
  normalizeOptions,
  updateHashHistoryState,
} from "@carma-commons/utils";

import { usePopStateListener } from "./hooks/usePopStateListener";
import {
  getAliasReverseLookup,
  applyHashCodecs,
  computeHashDiff,
} from "./utils";
import {
  defaultHashCodecs,
  defaultHashKeyAliases,
  defaultHashKeyOrder,
} from "./hashCodecs";
import { sceneViewStateHashCodecs } from "./scene-state-hash/hashParamCodecs";

interface HashUpdateOptions {
  clearKeys?: string[];
  clearKeySetIds?: string[];
  label?: string;
  replace?: boolean;
}

export const HASH_CLEAR_KEY_SET = {
  SCENE_VIEW_STATE: "scene-view-state",
  LAUNCH_MODE: "launch-mode",
} as const;

export type HashClearKeySetId =
  (typeof HASH_CLEAR_KEY_SET)[keyof typeof HASH_CLEAR_KEY_SET];

const compileManagedSceneViewStateClearKeys = (
  hashCodecs: HashCodecs
): string[] =>
  Object.keys(sceneViewStateHashCodecs).filter((key) => key in hashCodecs);

export type HashCodec<T = unknown> = {
  name?: string;
  decode: (value: string | undefined) => T;
  encode: (value: T) => string | undefined;
};

export type HashCodecs = Record<string, HashCodec>;
export type HashKeyAliases = Record<string, string>;

const HASH_UPDATE_LABEL_UNSPECIFIED = "unspecified";

const hashUpdateDefaults: Required<HashUpdateOptions> = {
  clearKeys: [],
  clearKeySetIds: [],
  label: HASH_UPDATE_LABEL_UNSPECIFIED,
  replace: false,
};

const logHashChange = ({
  source,
  label,
  replace,
  params,
  encodedParams,
  removeKeys,
  beforeRaw,
  afterRaw,
  changedKeys,
  removedKeys,
}: {
  source: HashChangeSource;
  label?: string;
  replace?: boolean;
  params?: Record<string, unknown>;
  encodedParams?: Record<string, unknown>;
  removeKeys?: string[];
  beforeRaw: Record<string, string>;
  afterRaw: Record<string, string>;
  changedKeys: string[];
  removedKeys: string[];
}) => {
  console.debug("[HASH]", {
    source,
    label,
    replace,
    params,
    encodedParams,
    removeKeys,
    changedKeys,
    removedKeys,
    beforeRaw,
    afterRaw,
    href: window.location.href,
  });
};

export const HASH_CHANGE_SOURCE = {
  UPDATE: "update",
  POPSTATE: "popstate",
  HASHCHANGE: "hashchange",
} as const;
export type HashChangeSource =
  (typeof HASH_CHANGE_SOURCE)[keyof typeof HASH_CHANGE_SOURCE];
export type HashChangeEvent = {
  raw: Record<string, string>;
  values: Record<string, unknown>;
  changedKeys: string[];
  removedKeys: string[];
  label?: string;
  replace?: boolean;
  source: HashChangeSource;
};

interface HashStateContextType {
  getHash: () => Record<string, string>;
  getHashValues: () => Record<string, unknown>;
  updateHash: (
    params?: Record<string, unknown>,
    options?: HashUpdateOptions
  ) => void;
  registerClearKeySet: (id: string, keys: readonly string[]) => () => void;
  registerOnPopState: (callback: (e: HashChangeEvent) => void) => () => void;
}

const HashStateContext = createContext<HashStateContextType | undefined>(
  undefined
);

export type HashStateProviderSharedProps = {
  children: React.ReactNode;
  keyAliases?: Record<string, string>;
  hashCodecs?: HashCodecs;
  keyOrder?: string[];
};

export type HashStateProviderBaseProps = HashStateProviderSharedProps & {
  routedPath: string;
};

export const HashStateProviderBase: React.FC<HashStateProviderBaseProps> = ({
  children,
  keyAliases = defaultHashKeyAliases,
  hashCodecs = defaultHashCodecs,
  keyOrder = defaultHashKeyOrder,
  routedPath,
}) => {
  const aliasReverseLookup = useMemo(
    () => getAliasReverseLookup(keyAliases),
    [keyAliases]
  );
  const onPopStateCallbacksRef = useRef<Array<(e: HashChangeEvent) => void>>(
    []
  );
  const clearKeySetsRef = useRef<Map<string, readonly string[]>>(new Map());
  const managedSceneViewStateClearKeys = useMemo(
    () => compileManagedSceneViewStateClearKeys(hashCodecs),
    [hashCodecs]
  );
  const prevRawRef = useRef<Record<string, string>>(getHashParams());

  const registerClearKeySet = useCallback(
    (id: string, keys: readonly string[]) => {
      const normalizedKeys = Array.from(
        new Set(keys.filter((key) => key.length > 0))
      );

      clearKeySetsRef.current.set(id, normalizedKeys);

      return () => {
        clearKeySetsRef.current.delete(id);
      };
    },
    []
  );

  const registerOnPopState = useCallback(
    (callback: (e: HashChangeEvent) => void) => {
      if (!onPopStateCallbacksRef.current.includes(callback)) {
        onPopStateCallbacksRef.current.push(callback);
      }
      const cleanup = () => {
        onPopStateCallbacksRef.current = onPopStateCallbacksRef.current.filter(
          (cb) => cb !== callback
        );
      };
      return cleanup;
    },
    []
  );

  const onPopState = useCallback((e: HashChangeEvent) => {
    onPopStateCallbacksRef.current.forEach((callback) => callback(e));
  }, []);

  const getHash = useCallback(() => getHashParams(), []);

  const getHashValues = useCallback(() => {
    const params = getHashParams();
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      const fullKey = aliasReverseLookup[key] || key;
      const newValue =
        hashCodecs && hashCodecs[fullKey]
          ? hashCodecs[fullKey].decode(value)
          : value;
      values[fullKey] = newValue;
    }
    return values;
  }, [hashCodecs, aliasReverseLookup]);

  const updateHash = useCallback(
    (
      params: Record<string, unknown> | undefined,
      options?: HashUpdateOptions
    ) => {
      const beforeRaw = prevRawRef.current || getHashParams();
      const { clearKeys, clearKeySetIds, label, replace } = normalizeOptions(
        options,
        hashUpdateDefaults
      );

      const { newParams, undefinedKeys } = params
        ? applyHashCodecs(params, hashCodecs, keyAliases)
        : { newParams: {}, undefinedKeys: [] };

      const writtenKeys = new Set(Object.keys(newParams));
      const scopedClearKeys = clearKeySetIds.flatMap((id) => {
        const registered = clearKeySetsRef.current.get(id);
        if (registered) {
          return registered;
        }

        if (id === HASH_CLEAR_KEY_SET.SCENE_VIEW_STATE) {
          return managedSceneViewStateClearKeys;
        }

        return [];
      });
      const resolvedClearKeys = [
        ...new Set([...clearKeys, ...scopedClearKeys]),
      ].map((key) => keyAliases?.[key] ?? key);
      const clearAndUndefinedKeys = [
        ...resolvedClearKeys,
        ...undefinedKeys,
      ].filter((key) => !writtenKeys.has(key));

      updateHashHistoryState(newParams, routedPath, {
        removeKeys: clearAndUndefinedKeys,
        keyOrder,
        label: label || HASH_UPDATE_LABEL_UNSPECIFIED,
        replace,
      });

      const afterRaw = getHashParams();
      const { changedKeys, removedKeys } = computeHashDiff(
        beforeRaw,
        afterRaw,
        aliasReverseLookup
      );
      logHashChange({
        source: HASH_CHANGE_SOURCE.UPDATE,
        label,
        replace,
        params,
        encodedParams: newParams,
        removeKeys: clearAndUndefinedKeys,
        beforeRaw,
        afterRaw,
        changedKeys,
        removedKeys,
      });
      prevRawRef.current = afterRaw;
    },
    [
      aliasReverseLookup,
      routedPath,
      keyAliases,
      hashCodecs,
      keyOrder,
      managedSceneViewStateClearKeys,
    ]
  );

  usePopStateListener(
    onPopState,
    prevRawRef,
    getHashValues,
    aliasReverseLookup
  );

  const value = useMemo(
    () => ({
      getHash,
      getHashValues,
      updateHash,
      registerClearKeySet,
      registerOnPopState,
    }),
    [
      getHash,
      getHashValues,
      updateHash,
      registerClearKeySet,
      registerOnPopState,
    ]
  );

  return (
    <HashStateContext.Provider value={value}>
      {children}
    </HashStateContext.Provider>
  );
};

export function useHashState() {
  const ctx = useContext(HashStateContext);
  if (!ctx) {
    throw new Error("useHashState must be used within a HashStateProvider");
  }
  return ctx;
}
