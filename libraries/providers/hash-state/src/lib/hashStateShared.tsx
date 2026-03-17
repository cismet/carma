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
import { getAliasReverseLookup, applyHashCodecs } from "./utils";
import {
  defaultHashCodecs,
  defaultHashKeyAliases,
  defaultHashKeyOrder,
} from "./hashCodecs";

interface HashUpdateOptions {
  clearKeys?: string[];
  label?: string;
  replace?: boolean;
}

export type HashCodec<T = unknown> = {
  name?: string;
  decode: (value: string | undefined) => T;
  encode: (value: T) => string | undefined;
};

export type HashCodecs = Record<string, HashCodec>;
export type HashKeyAliases = Record<string, string>;
export type HashRoutingMode = "routed" | "neutral";

const hashUpdateDefaults: Required<HashUpdateOptions> = {
  clearKeys: [],
  label: "unspecified",
  replace: false,
};

export type HashChangeSource = "update" | "popstate" | "hashchange";
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
  const prevRawRef = useRef<Record<string, string>>(getHashParams());

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
      const { clearKeys, label, replace } = normalizeOptions(
        options,
        hashUpdateDefaults
      );

      const { newParams, undefinedKeys } = params
        ? applyHashCodecs(params, hashCodecs, keyAliases)
        : { newParams: {}, undefinedKeys: [] };

      const writtenKeys = new Set(Object.keys(newParams));
      const resolvedClearKeys = clearKeys.map(
        (key) => keyAliases?.[key] ?? key
      );
      const clearAndUndefinedKeys = [
        ...resolvedClearKeys,
        ...undefinedKeys,
      ].filter((key) => !writtenKeys.has(key));

      updateHashHistoryState(newParams, routedPath, {
        removeKeys: clearAndUndefinedKeys,
        keyOrder,
        label: label || "unspecified",
        replace,
      });

      const afterRaw = getHashParams();
      prevRawRef.current = afterRaw;
    },
    [routedPath, keyAliases, hashCodecs, keyOrder]
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
      registerOnPopState,
    }),
    [getHash, getHashValues, updateHash, registerOnPopState]
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
