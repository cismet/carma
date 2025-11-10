import { useEffect, type MutableRefObject } from "react";
import { getHashParams } from "@carma-commons/utils";
import { computeHashDiff } from "./utils";
import type { HashChangeEvent } from "./HashStateProvider";

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
        source: "popstate",
      });
      prevRawRef.current = afterRaw;
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [onPopState, getHashValues, aliasReverseLookup, prevRawRef]);
}
