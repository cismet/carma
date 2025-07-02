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

  const updateHash = useCallback(
    (
      params: Record<string, unknown> | undefined,
      options?: HashUpdateOptions
    ) => {
      const { clearKeys, label } = normalizeOptions(
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
      });
    },
    [location.pathname, keyAliases, hashCodecs, keyOrder]
  );

  const value = useRef<HashStateContextType>({
    getHash,
    getHashValues,
    updateHash,
  });
  value.current.getHash = getHash;
  value.current.getHashValues = getHashValues;
  value.current.updateHash = updateHash;

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
