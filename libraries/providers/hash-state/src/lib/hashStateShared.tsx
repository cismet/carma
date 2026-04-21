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

import {
  defaultStateKeyToHashParamValueCodecMap,
  defaultHashParamNameOrder,
  defaultStateKeyToHashParamNameAliases,
} from "./hashParamValueCodecs";
import { usePopStateListener } from "./hooks/usePopStateListener";
import {
  applyHashParamValueCodecs,
  compileManagedSceneViewStateClearStateKeys,
  computeHashDiff,
  createHashParamNameMaps,
  decodeHashParamsToStateValues,
  normalizeClearStateKeySetStateKeys,
  resolveClearAndUndefinedKeys,
  resolveScopedClearStateKeys,
} from "./utils";
interface HashStateUpdateOptions {
  clearStateKeys?: string[];
  clearStateKeySetIds?: string[];
  label?: string;
  replace?: boolean;
}

export const HASH_CLEAR_STATE_KEY_SET = {
  SCENE_VIEW_STATE: "scene-view-state",
  LAUNCH_MODE: "launch-mode",
} as const;

export type HashClearStateKeySetId =
  (typeof HASH_CLEAR_STATE_KEY_SET)[keyof typeof HASH_CLEAR_STATE_KEY_SET];

export type HashParamValueCodec<T = unknown> = {
  name?: string;
  decode: (value: string | undefined) => T;
  encode: (value: T) => string | undefined;
};

export type StateKeyToHashParamValueCodecMap = Record<
  string,
  HashParamValueCodec
>;
export type StateKeyToHashParamNameAliases = Record<string, string>;
export type HashParamNameToStateKeyMap = Record<string, string>;
export type StateKeyToHashParamNameMap = Record<string, string>;
export type HashParams = Record<string, string>;

const HASH_UPDATE_LABEL_UNSPECIFIED = "unspecified";

const hashStateUpdateDefaults: Required<HashStateUpdateOptions> = {
  clearStateKeys: [],
  clearStateKeySetIds: [],
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
  previousHashParams,
  nextHashParams,
  changedStateKeys,
  removedStateKeys,
}: {
  source: HashStateChangeSource;
  label?: string;
  replace?: boolean;
  params?: Record<string, unknown>;
  encodedParams?: Record<string, unknown>;
  removeKeys?: string[];
  previousHashParams: HashParams;
  nextHashParams: HashParams;
  changedStateKeys: string[];
  removedStateKeys: string[];
}) => {
  console.debug("[HASH]", {
    source,
    label,
    replace,
    params,
    encodedParams,
    removeKeys,
    changedStateKeys,
    removedStateKeys,
    previousHashParams,
    nextHashParams,
    href: window.location.href,
  });
};

export const HASH_STATE_CHANGE_SOURCE = {
  UPDATE: "update",
  POPSTATE: "popstate",
  HASHCHANGE: "hashchange",
} as const;
export type HashStateChangeSource =
  (typeof HASH_STATE_CHANGE_SOURCE)[keyof typeof HASH_STATE_CHANGE_SOURCE];
export type HashStateChangeEvent = {
  hashParams: HashParams;
  stateValues: Record<string, unknown>;
  changedStateKeys: string[];
  removedStateKeys: string[];
  label?: string;
  replace?: boolean;
  source: HashStateChangeSource;
};

interface HashStateContextType {
  getHashParams: () => HashParams;
  getHashStateValues: () => Record<string, unknown>;
  updateHashState: (
    params?: Record<string, unknown>,
    options?: HashStateUpdateOptions
  ) => void;
  registerClearStateKeySet: (
    id: string,
    stateKeys: readonly string[]
  ) => () => void;
  registerOnPopState: (
    callback: (e: HashStateChangeEvent) => void
  ) => () => void;
}

const HashStateContext = createContext<HashStateContextType | undefined>(
  undefined
);

export type HashStateProviderSharedProps = {
  children: React.ReactNode;
  stateKeyAliases?: StateKeyToHashParamNameAliases;
  stateKeyToHashParamValueCodecMap?: StateKeyToHashParamValueCodecMap;
  hashParamNameOrder?: string[];
};

export type RoutedHashStateProviderProps = HashStateProviderSharedProps & {
  routedPath: string;
};

export const RoutedHashStateProvider: React.FC<
  RoutedHashStateProviderProps
> = ({
  children,
  stateKeyAliases = defaultStateKeyToHashParamNameAliases,
  stateKeyToHashParamValueCodecMap = defaultStateKeyToHashParamValueCodecMap,
  hashParamNameOrder = defaultHashParamNameOrder,
  routedPath,
}) => {
  const hashParamNameMaps = useMemo(
    () =>
      createHashParamNameMaps(
        stateKeyToHashParamValueCodecMap,
        stateKeyAliases
      ),
    [stateKeyToHashParamValueCodecMap, stateKeyAliases]
  );
  const popStateCallbacksRef = useRef<Array<(e: HashStateChangeEvent) => void>>(
    []
  );
  const clearStateKeySetsRef = useRef<Map<string, readonly string[]>>(
    new Map()
  );
  const managedSceneViewStateClearStateKeys = useMemo(
    () =>
      compileManagedSceneViewStateClearStateKeys(
        stateKeyToHashParamValueCodecMap
      ),
    [stateKeyToHashParamValueCodecMap]
  );
  const previousHashParamsRef = useRef<HashParams>(getHashParams());

  const registerClearStateKeySet = useCallback(
    (id: string, stateKeys: readonly string[]) => {
      const normalizedStateKeys = normalizeClearStateKeySetStateKeys(stateKeys);

      clearStateKeySetsRef.current.set(id, normalizedStateKeys);

      return () => {
        clearStateKeySetsRef.current.delete(id);
      };
    },
    []
  );

  const registerOnPopState = useCallback(
    (callback: (e: HashStateChangeEvent) => void) => {
      if (!popStateCallbacksRef.current.includes(callback)) {
        popStateCallbacksRef.current.push(callback);
      }
      const cleanup = () => {
        popStateCallbacksRef.current = popStateCallbacksRef.current.filter(
          (cb) => cb !== callback
        );
      };
      return cleanup;
    },
    []
  );

  const dispatchPopState = useCallback((e: HashStateChangeEvent) => {
    popStateCallbacksRef.current.forEach((callback) => callback(e));
  }, []);

  const getHashParamsFromLocation = useCallback(() => getHashParams(), []);

  const getHashStateValues = useCallback(() => {
    return decodeHashParamsToStateValues(
      getHashParams(),
      hashParamNameMaps.hashParamNameToStateKey,
      stateKeyToHashParamValueCodecMap
    );
  }, [stateKeyToHashParamValueCodecMap, hashParamNameMaps]);

  const updateHashState = useCallback(
    (
      params: Record<string, unknown> | undefined,
      options?: HashStateUpdateOptions
    ) => {
      const previousHashParams =
        previousHashParamsRef.current || getHashParams();
      const { clearStateKeys, clearStateKeySetIds, label, replace } =
        normalizeOptions(options, hashStateUpdateDefaults);

      const { newParams, undefinedKeys } = params
        ? applyHashParamValueCodecs(
            params,
            stateKeyToHashParamValueCodecMap,
            hashParamNameMaps.stateKeyToHashParamName
          )
        : { newParams: {}, undefinedKeys: [] };

      const writtenHashParamNames = new Set(Object.keys(newParams));
      const scopedClearStateKeys = resolveScopedClearStateKeys(
        clearStateKeySetIds,
        clearStateKeySetsRef.current,
        managedSceneViewStateClearStateKeys,
        HASH_CLEAR_STATE_KEY_SET.SCENE_VIEW_STATE
      );
      const clearedHashParamNames = resolveClearAndUndefinedKeys({
        clearStateKeys,
        scopedClearStateKeys,
        stateKeyToHashParamName: hashParamNameMaps.stateKeyToHashParamName,
        undefinedKeys,
        writtenKeys: writtenHashParamNames,
      });

      updateHashHistoryState(newParams, routedPath, {
        removeKeys: clearedHashParamNames,
        keyOrder: hashParamNameOrder,
        label: label || HASH_UPDATE_LABEL_UNSPECIFIED,
        replace,
      });

      const nextHashParams = getHashParams();
      const { changedStateKeys, removedStateKeys } = computeHashDiff(
        previousHashParams,
        nextHashParams,
        hashParamNameMaps.hashParamNameToStateKey
      );
      logHashChange({
        source: HASH_STATE_CHANGE_SOURCE.UPDATE,
        label,
        replace,
        params,
        encodedParams: newParams,
        removeKeys: clearedHashParamNames,
        previousHashParams,
        nextHashParams,
        changedStateKeys,
        removedStateKeys,
      });
      previousHashParamsRef.current = nextHashParams;
    },
    [
      hashParamNameMaps,
      routedPath,
      stateKeyToHashParamValueCodecMap,
      hashParamNameOrder,
      managedSceneViewStateClearStateKeys,
    ]
  );

  usePopStateListener(
    dispatchPopState,
    previousHashParamsRef,
    getHashStateValues,
    hashParamNameMaps.hashParamNameToStateKey
  );

  const value = useMemo(
    () => ({
      getHashParams: getHashParamsFromLocation,
      getHashStateValues,
      updateHashState,
      registerClearStateKeySet,
      registerOnPopState,
    }),
    [
      getHashParamsFromLocation,
      getHashStateValues,
      updateHashState,
      registerClearStateKeySet,
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
