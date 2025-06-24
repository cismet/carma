import React, { createContext, useCallback, useContext, useRef } from "react";
import { getHashParams, updateHashHistoryState } from "@carma-commons/utils";
import { useLocation } from "react-router-dom";
import { normalizeOptions } from "../../../../../commons/utils/src/lib/normalizeOptions";

interface HashUpdateOptions {
  clearKeys?: string[];
  debugLabel?: string;
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
  debugLabel: "unspecified",
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

export const HashStateProvider: React.FC<{
  children: React.ReactNode;
  keyAliases?: Record<string, string>;
  hashCodecs?: HashCodecs;
  keyOrder?: string[];
}> = ({ children, keyAliases, hashCodecs, keyOrder }) => {
  const location = useLocation();
  const getHash = useCallback(() => getHashParams(), []);
  const getHashValues = useCallback(() => {
    const params = getHashParams();
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      const newKey =
        keyAliases && keyAliases[key] !== undefined ? keyAliases[key] : key;
      const newValue =
        hashCodecs && hashCodecs[key] ? hashCodecs[key].decode(value) : value;
      values[newKey] = newValue;
      values[key] = newValue;
    }
    return values;
  }, [keyAliases, hashCodecs]);

  const updateHash = useCallback(
    (
      params: Record<string, unknown> | undefined,
      options?: HashUpdateOptions
    ) => {
      const { clearKeys, debugLabel } = normalizeOptions(
        options,
        hashUpdateDefaults
      );
      // build new params object with aliases applied
      const newParams = {};
      const currentParams = getHashParams();
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

      const merged = { ...currentParams, ...newParams };

      updateHashHistoryState(merged, location.pathname, {
        removeKeys: clearAndUndefinedKeys,
        keyOrder,
        label: debugLabel || "unspecified",
      });
    },
    [location.pathname, keyAliases, hashCodecs]
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
