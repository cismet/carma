import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useEffect,
} from "react";
import {
  getHashParams,
  normalizeOptions,
  updateHashHistoryState,
} from "@carma-commons/utils";
import { useLocation } from "react-router-dom";

interface HashUpdateOptions {
  clearKeys?: string[];
  label?: string;
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
};

interface HashStateContextType {
  getHash: () => Record<string, string>;
  getHashValues: () => Record<string, unknown>;
  updateHash: (
    params: Record<string, unknown> | undefined,
    options?: HashUpdateOptions
  ) => void;
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
  const aliasReverseLookup = useMemo(
    () => getAliasReverseLookup(keyAliases || {}),
    [keyAliases]
  );
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

  // Debounced hash update to prevent excessive history updates
  const pendingUpdate = useRef<{
    params: Record<string, unknown> | undefined;
    options?: HashUpdateOptions;
  } | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const executeHashUpdate = useCallback(() => {
    if (!pendingUpdate.current) {
      return;
    }

    const { params, options } = pendingUpdate.current;
    pendingUpdate.current = null;

    const { clearKeys, label } = normalizeOptions(options, hashUpdateDefaults);

    // Apply aliases and encoding to the params
    const newParams = {};
    const undefinedKeys: string[] = [];

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        const newValue =
          hashCodecs && hashCodecs[key] ? hashCodecs[key].encode(value) : value;
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

    console.debug(
      "[Routing][HashStateProvider] executeHashUpdate",
      label || "unspecified",
      "params:",
      params,
      "final params:",
      newParams,
      "clear keys:",
      clearAndUndefinedKeys,
      "current hash:",
      window.location.hash
    );

    updateHashHistoryState(newParams, location.pathname, {
      removeKeys: clearAndUndefinedKeys,
      keyOrder,
      label: label || "unspecified",
    });
  }, [location.pathname, keyAliases, hashCodecs, keyOrder]);

  const updateHash = useCallback(
    (
      params: Record<string, unknown> | undefined,
      options?: HashUpdateOptions
    ) => {
      const { clearKeys, label } = normalizeOptions(
        options,
        hashUpdateDefaults
      );

      // Apply aliases and encoding to check for changes
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

      // Check if the update would actually change anything
      const currentParams = getHashParams();
      const wouldChange =
        Object.keys(newParams).some(
          (key) => currentParams[key] !== newParams[key]
        ) ||
        clearAndUndefinedKeys.some((key) => currentParams[key] !== undefined) ||
        Object.keys(currentParams).some(
          (key) =>
            !clearAndUndefinedKeys.includes(key) && newParams[key] === undefined
        );

      if (!wouldChange) {
        console.debug(
          "[Routing][HashStateProvider] updateHash - SKIPPED (no changes)",
          label || "unspecified",
          "params:",
          params,
          "current params:",
          currentParams,
          "new params:",
          newParams
        );
        return;
      }

      // Store the pending update (overwrites any previous pending update)
      pendingUpdate.current = { params, options };

      console.debug(
        "[Routing][HashStateProvider] updateHash - SCHEDULED",
        label || "unspecified",
        "params:",
        params
      );

      // Clear existing timeout and schedule processing
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Debounce: wait 100ms for more updates before processing
      timeoutRef.current = setTimeout(executeHashUpdate, 100);
    },
    [executeHashUpdate, keyAliases, hashCodecs]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const value = {
    getHash,
    getHashValues,
    updateHash,
  };

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
