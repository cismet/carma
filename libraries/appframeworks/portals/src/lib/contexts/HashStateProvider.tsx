import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getHashParams,
  normalizeOptions,
  updateHashHistoryState,
  diffHashParams,
} from "@carma-commons/utils";
import { createBooleanCodec, defaultHashCodecs } from "./hashState";
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

// Field configuration for hash state management
export interface HashFieldConfig {
  // The key name in the hash (e.g., 'm' for mapStyle)
  hashParamKey: string;

  // Optional: The internal property name (e.g., 'mapStyle' when hashParamKey is 'm')
  // If not provided, hashParamKey is used as propertyName
  propertyName?: string;

  // Optional: Codec for encoding/decoding this field
  codec?: {
    encode?: (value: unknown) => string | undefined;
    decode?: (value: string | undefined) => unknown;
  };
}

export type HashStateConfig = HashFieldConfig[];

interface HashStateContextType {
  hashParams: Record<string, string>;
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
  isInitialized: boolean;
}

const HashStateContext = createContext<HashStateContextType | undefined>(
  undefined
);

const defaultHashConfig = Object.entries(defaultHashCodecs).map(
  ([key, codec]) => ({
    hashParamKey: key,
    propertyName: key,
    codec,
  })
);

export const HashStateProvider: React.FC<{
  children: React.ReactNode;
  config?: HashStateConfig;
}> = ({ children, config }) => {
  config = config ?? defaultHashConfig;

  const location = useLocation();
  const navigate = useNavigate();
  const [isInitialized, setIsInitialized] = useState(false);

  // Build lookups from config
  const { keyToValueName, valueNameToKey, codecs } = useMemo(() => {
    const keyToValueName: Record<string, string> = {};
    const valueNameToKey: Record<string, string> = {};
    const codecs: HashCodecs = {};
    const fieldOrder: string[] = [];

    config.forEach((field) => {
      const { hashParamKey, propertyName, codec } = field;
      const name = propertyName || hashParamKey;

      // Build field order from config
      fieldOrder.push(hashParamKey);

      // Build mappings if propertyName differs from hashParamKey
      if (propertyName && propertyName !== hashParamKey) {
        keyToValueName[hashParamKey] = name;
        valueNameToKey[name] = hashParamKey;
      }

      // Build codecs if provided
      if (codec) {
        codecs[name] = {
          encode: codec.encode || ((v) => String(v)),
          decode: codec.decode || ((v) => v),
        };
      }
    });

    return {
      keyToValueName,
      valueNameToKey,
      codecs,
      fieldOrder,
    };
  }, [config]);
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
      const fullKey = keyToValueName[key] || key;
      const newValue =
        codecs && codecs[fullKey] ? codecs[fullKey].decode(value) : value;
      values[fullKey] = newValue;
    }
    return values;
  }, [codecs, keyToValueName]);

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
            codecs && codecs[key] ? codecs[key].encode(value) : value;
          const newKey =
            valueNameToKey && valueNameToKey[key] !== undefined
              ? valueNameToKey[key]
              : key;

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
        label: label || "unspecified",
        replace,
        //navigate,
      });

      const afterRaw = getHashParams();
      const { changedKeys: changedAliasKeys, removedKeys: removedAliasKeys } =
        diffHashParams(beforeRaw, afterRaw);
      const toOriginal = (k: string) => valueNameToKey[k] || k;
      const changedKeys = [...new Set(changedAliasKeys.map(toOriginal))];
      const removedKeys = [...new Set(removedAliasKeys.map(toOriginal))];

      const eventPayload = {
        raw: afterRaw,
        values: getHashValues(),
        changedKeys,
        removedKeys,
        label,
        replace,
        source: "update" as const,
      };
      console.debug("[HashState] emit:update", {
        label,
        replace,
        changedKeys,
        removedKeys,
      });
      emit(eventPayload);
      prevRawRef.current = afterRaw;
    },
    [
      location.pathname,
      keyToValueName,
      codecs,
      //fieldOrder,
      emit,
      getHashValues,
      valueNameToKey,
    ]
  );

  useHashChangeEmit({
    emit: (e) => emit(e as any),
    getHashValues,
    valueNameToKey,
    prevRawRef,
  });

  // Mark as initialized after first render when hash state has settled
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  const value = useRef<HashStateContextType>({
    hashParams: getHash(),
    getHash,
    getHashValues,
    updateHash,
    subscribe,
    isInitialized,
  });
  value.current.hashParams = getHash();
  value.current.getHash = getHash;
  value.current.getHashValues = getHashValues;
  value.current.updateHash = updateHash;
  value.current.subscribe = subscribe;
  value.current.isInitialized = isInitialized;

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
