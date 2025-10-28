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
  onHashInitialized: (
    callback: (hashValues: Record<string, unknown>) => void
  ) => void;
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

interface HashStateProviderProps {
  children: React.ReactNode;
  config?: HashStateConfig;
}

export const HashStateProvider = ({
  children,
  config,
}: HashStateProviderProps) => {
  config = config ?? defaultHashConfig;

  const location = useLocation();
  const navigate = useNavigate();
  const isInitializedRef = useRef(false);
  const callbacksRef = useRef<
    Array<(hashValues: Record<string, unknown>) => void>
  >([]);

  console.debug(
    "[HashStateProvider] Render:",
    config?.length || 0,
    location.pathname + location.hash
  );

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

  const onHashInitialized = useCallback(
    (callback: (hashValues: Record<string, unknown>) => void) => {
      if (isInitializedRef.current) {
        // Already initialized, call immediately with current hash values
        callback(getHashValues());
      } else {
        // Not initialized yet, queue the callback
        callbacksRef.current.push(callback);
      }
    },
    [getHashValues]
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
      console.debug("[HashStateProvider] updateHash", {
        beforeRaw,
        afterRaw,
      });
      prevRawRef.current = afterRaw;
    },
    [
      location.pathname,
      keyToValueName,
      codecs,
      //fieldOrder,
      getHashValues,
      valueNameToKey,
    ]
  );

  // Mark as initialized after first render when hash state has settled
  useEffect(() => {
    const hashValues = getHashValues();
    console.log(
      "[HashStateProvider] Setting isInitialized to true",
      hashValues
    );
    isInitializedRef.current = true;

    // Invoke all queued callbacks
    if (callbacksRef.current.length > 0) {
      console.log(
        `[HashStateProvider] Invoking ${callbacksRef.current.length} queued callback(s)`
      );
      callbacksRef.current.forEach((cb) => cb(hashValues));
      callbacksRef.current = []; // Clear the queue
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      hashParams: getHash(),
      getHash,
      getHashValues,
      updateHash,
      onHashInitialized,
    }),
    [getHash, getHashValues, updateHash, onHashInitialized]
  );

  return (
    <HashStateContext.Provider value={value}>
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
