import { useEffect, type MutableRefObject } from "react";
import { getHashParams, diffHashParams } from "@carma-commons/utils";
import type { HashKeyLookup, RawHashParams } from "@carma-providers/hash-state";

type Emitter = (e: {
  raw: RawHashParams;
  values: Record<string, unknown>;
  changedKeys: string[];
  removedKeys: string[];
  source: "popstate" | "hashchange";
}) => void;

export function useHashChangeEmit(args: {
  emit: Emitter;
  getHashValues: () => Record<string, unknown>;
  aliasReverseLookup: HashKeyLookup;
  prevRawRef: MutableRefObject<RawHashParams>;
}) {
  const { emit, getHashValues, aliasReverseLookup, prevRawRef } = args;

  useEffect(() => {
    const handle = (source: "popstate" | "hashchange") => () => {
      const beforeRaw = prevRawRef.current || {};
      const afterRaw = getHashParams();
      const { changedKeys: changedAliasKeys, removedKeys: removedAliasKeys } =
        diffHashParams(beforeRaw, afterRaw);
      const toOriginal = (k: string) => aliasReverseLookup[k] || k;
      const changedKeys = [...new Set(changedAliasKeys.map(toOriginal))];
      const removedKeys = [...new Set(removedAliasKeys.map(toOriginal))];
      emit({
        raw: afterRaw,
        values: getHashValues(),
        changedKeys,
        removedKeys,
        source,
      });
      prevRawRef.current = afterRaw;
    };

    const onPop = handle("popstate");
    const onHash = handle("hashchange");
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    };
  }, [emit, getHashValues, aliasReverseLookup, prevRawRef]);
}
