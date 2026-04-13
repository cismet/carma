import { useEffect, type MutableRefObject } from "react";

import { getHashParams } from "@carma-commons/utils";

import type { HashChangeEvent } from "../HashStateProvider";
import { computeHashDiff } from "../utils";
const BROWSER_POPSTATE_EVENT = "popstate";
const HASH_CHANGE_SOURCE_POPSTATE: HashChangeEvent["source"] =
  BROWSER_POPSTATE_EVENT;

/**
 * Listens to browser back/forward navigation (popstate) and calls the callback.
 * Does NOT listen to hashchange - hash is write-only after initial load.
 */
export function usePopStateListener(
  onPopState: (e: HashChangeEvent) => void,
  prevRawRef: MutableRefObject<Record<string, string>>,
  getHashValues: () => Record<string, unknown>,
  aliasReverseLookup: Record<string, string>
) {
  useEffect(() => {
    const handlePopState = () => {
      const beforeRaw = prevRawRef.current || {};
      const afterRaw = getHashParams();
      const { changedKeys, removedKeys } = computeHashDiff(
        beforeRaw,
        afterRaw,
        aliasReverseLookup
      );
      onPopState({
        raw: afterRaw,
        values: getHashValues(),
        changedKeys,
        removedKeys,
        source: HASH_CHANGE_SOURCE_POPSTATE,
      });
      console.debug("[HASH]", {
        source: HASH_CHANGE_SOURCE_POPSTATE,
        changedKeys,
        removedKeys,
        beforeRaw,
        afterRaw,
        href: window.location.href,
      });
      prevRawRef.current = afterRaw;
    };

    window.addEventListener(BROWSER_POPSTATE_EVENT, handlePopState);
    return () => {
      window.removeEventListener(BROWSER_POPSTATE_EVENT, handlePopState);
    };
  }, [onPopState, getHashValues, aliasReverseLookup, prevRawRef]);
}
