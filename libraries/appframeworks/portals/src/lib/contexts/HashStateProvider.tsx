import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  getHashParams,
  normalizeOptions,
  updateHashHistoryState,
  diffHashParams,
} from "@carma-commons/utils";
import { useLocation, useNavigate } from "react-router-dom";
import { useHashChangeEmit } from "../hooks/useHashChangeEmit";

interface HashUpdateOptions {
  clearKeys?: string[];
  label?: string;
  // If true, do not add a new history entry; replace current one instead
  replace?: boolean;
}
export type HashCodec<T = unknown> = {
  name?: string;
  decode: (value: string | undefined) => T;
  encode: (value: T) => string | undefined;
};

export type HashCodecs = Record<string, HashCodec>;
export type HashKeyAliases = Record<string, string>;

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
export type HashSubscribeOptions = {
  keys?: string[];
  labels?: string[];
};

interface HashStateContextType {
  getHash: () => Record<string, string>;
  getHashValues: () => Record<string, unknown>;
  updateHash: (
    params: Record<string, unknown> | undefined,
    options?: HashUpdateOptions
  ) => void;
  subscribe: (
    listener: (e: HashChangeEvent) => void,
    opts?: HashSubscribeOptions
  ) => () => void;
}

const HashStateContext = createContext<HashStateContextType | undefined>(
  undefined
);

const getAliasReverseLookup = (aliases: Record<string, string>) => {
  const reverseLookup: Record<string, string> = {};
  for (const [original, alias] of Object.entries(aliases)) {
    reverseLookup[alias] = original;
  }
  return reverseLookup;
};

export const HashStateProvider: React.FC<{
  children: React.ReactNode;
  keyAliases?: Record<string, string>;
  hashCodecs?: HashCodecs;
  keyOrder?: string[];
}> = ({ children, keyAliases, hashCodecs, keyOrder }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const aliasReverseLookup = useMemo(
    () => getAliasReverseLookup(keyAliases || {}),
    [keyAliases]
  );
  const listenersRef = useRef<
    Set<{ listener: (e: HashChangeEvent) => void; opts?: HashSubscribeOptions }>
  >(new Set());
  const prevRawRef = useRef<Record<string, string>>(getHashParams());
  // returns the current hash parameters as an object as is with aliased keys
  const getHash = useCallback(() => getHashParams(), []);
  // return the decoded hash values with their original keys, not aliases
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

  const emit = useCallback((e: HashChangeEvent) => {
    listenersRef.current.forEach(({ listener, opts }) => {
      const keyFilterOk =
        !opts?.keys ||
        opts.keys.some((k) =>
          new Set([...e.changedKeys, ...e.removedKeys]).has(k)
        );
      const labelFilterOk =
        !opts?.labels ||
        (e.label !== undefined && opts.labels.includes(e.label));
      if (keyFilterOk && labelFilterOk) listener(e);
    });
  }, []);

  const subscribe = useCallback<HashStateContextType["subscribe"]>(
    (listener, opts) => {
      const entry = { listener, opts };
      listenersRef.current.add(entry);
      return () => {
        listenersRef.current.delete(entry);
      };
    },
    []
  );

  const updateHash = useCallback(
    (
      params: Record<string, unknown> | undefined,
      options?: HashUpdateOptions
    ) => {
      const beforeRaw = getHashParams();
      const { clearKeys, label, replace } = normalizeOptions(
        options,
        hashUpdateDefaults
      );
      // build new params object with aliases applied
      const newParams = {};
      const undefinedKeys: string[] = [];

      if (params) {
        for (const [key, value] of Object.entries(params)) {
          const newValue =
            hashCodecs && hashCodecs[key]
              ? hashCodecs[key].encode(value)
              : value;
          const newKey =
            keyAliases && keyAliases[key] !== undefined ? keyAliases[key] : key;

          if (newValue === undefined) {
            undefinedKeys.push(newKey);
          } else {
            newParams[newKey] = newValue;
          }
        }
      }

      const clearAndUndefinedKeys = [...clearKeys, ...undefinedKeys];

      updateHashHistoryState(newParams, location.pathname, {
        removeKeys: clearAndUndefinedKeys,
        keyOrder,
        label: label || "unspecified",
        replace,
        navigate,
      });

      const afterRaw = getHashParams();
      const { changedKeys: changedAliasKeys, removedKeys: removedAliasKeys } =
        diffHashParams(beforeRaw, afterRaw);
      const toOriginal = (k: string) => aliasReverseLookup[k] || k;
      const changedKeys = [...new Set(changedAliasKeys.map(toOriginal))];
      const removedKeys = [...new Set(removedAliasKeys.map(toOriginal))];

      emit({
        raw: afterRaw,
        values: getHashValues(),
        changedKeys,
        removedKeys,
        label,
        replace,
        source: "update",
      });
      prevRawRef.current = afterRaw;
    },
    [
      location.pathname,
      keyAliases,
      hashCodecs,
      keyOrder,
      emit,
      getHashValues,
      aliasReverseLookup,
    ]
  );

  useHashChangeEmit({
    emit: (e) => emit(e as any),
    getHashValues,
    aliasReverseLookup,
    prevRawRef,
  });

  const value = useRef<HashStateContextType>({
    getHash,
    getHashValues,
    updateHash,
    subscribe,
  });
  value.current.getHash = getHash;
  value.current.getHashValues = getHashValues;
  value.current.updateHash = updateHash;
  value.current.subscribe = subscribe;

  return (
    <HashStateContext.Provider value={value.current}>
      {children}
    </HashStateContext.Provider>
  );
};

export function useHashState() {
  const ctx = useContext(HashStateContext);
  if (!ctx)
    throw new Error("useHashState must be used within a HashStateProvider");
  return ctx;
}
