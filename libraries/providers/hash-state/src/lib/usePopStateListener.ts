import { useEffect, type MutableRefObject } from "react";
import { getHashParams, diffHashParams } from "@carma-commons/utils";

type Emitter = (e: {
  raw: Record<string, string>;
  values: Record<string, unknown>;
  changedKeys: string[];
  removedKeys: string[];
  source: "popstate";
}) => void;

const toUniqueStrings = (
  keys: string[],
  lookUp: Record<string, string>
): string[] => [...new Set(keys.map((k: string) => lookUp[k] || k))];

/**
 * Listens to browser back/forward navigation (popstate) and emits hash changes.
 * Does NOT listen to hashchange - hash is write-only after initial load.
 */
export function usePopStateListener(args: {
  emit: Emitter;
  getHashValues: () => Record<string, unknown>;
  aliasReverseLookup: Record<string, string>;
  prevRawRef: MutableRefObject<Record<string, string>>;
}) {
  const { emit, getHashValues, aliasReverseLookup, prevRawRef } = args;

  useEffect(() => {
    const onPopState = () => {
      const beforeRaw = prevRawRef.current || {};
      const afterRaw = getHashParams();
      const { changedKeys: changedAliasKeys, removedKeys: removedAliasKeys } =
        diffHashParams(beforeRaw, afterRaw);
      const changedKeys = toUniqueStrings(changedAliasKeys, aliasReverseLookup);
      const removedKeys = toUniqueStrings(removedAliasKeys, aliasReverseLookup);
      emit({
        raw: afterRaw,
        values: getHashValues(),
        changedKeys,
        removedKeys,
        source: "popstate",
      });
      prevRawRef.current = afterRaw;
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [emit, getHashValues, aliasReverseLookup, prevRawRef]);
}
