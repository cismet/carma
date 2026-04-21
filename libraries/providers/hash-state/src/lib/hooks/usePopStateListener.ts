import { useEffect, type MutableRefObject } from "react";

import { getHashParams } from "@carma-commons/utils";

import type {
  HashParamNameToStateKeyMap,
  HashStateChangeEvent,
  HashParams,
} from "../HashStateProvider";
import { computeHashDiff } from "../utils";
const BROWSER_POPSTATE_EVENT = "popstate";
const HASH_CHANGE_SOURCE_POPSTATE: HashStateChangeEvent["source"] =
  BROWSER_POPSTATE_EVENT;

/**
 * Listens to browser back/forward navigation (popstate) and calls the callback.
 * Does NOT listen to hashchange - hash is write-only after initial load.
 */
export function usePopStateListener(
  onPopState: (e: HashStateChangeEvent) => void,
  previousHashParamsRef: MutableRefObject<HashParams>,
  getHashStateValues: () => Record<string, unknown>,
  hashParamNameToStateKey: HashParamNameToStateKeyMap
) {
  useEffect(() => {
    const handlePopState = () => {
      const previousHashParams = previousHashParamsRef.current || {};
      const nextHashParams = getHashParams();
      const { changedStateKeys, removedStateKeys } = computeHashDiff(
        previousHashParams,
        nextHashParams,
        hashParamNameToStateKey
      );
      onPopState({
        hashParams: nextHashParams,
        stateValues: getHashStateValues(),
        changedStateKeys,
        removedStateKeys,
        source: HASH_CHANGE_SOURCE_POPSTATE,
      });
      console.debug("[HASH]", {
        source: HASH_CHANGE_SOURCE_POPSTATE,
        changedStateKeys,
        removedStateKeys,
        previousHashParams,
        nextHashParams,
        href: window.location.href,
      });
      previousHashParamsRef.current = nextHashParams;
    };

    window.addEventListener(BROWSER_POPSTATE_EVENT, handlePopState);
    return () => {
      window.removeEventListener(BROWSER_POPSTATE_EVENT, handlePopState);
    };
  }, [
    onPopState,
    getHashStateValues,
    hashParamNameToStateKey,
    previousHashParamsRef,
  ]);
}
