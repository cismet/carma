import { useEffect, type MutableRefObject } from "react";
import { getHashParams, diffHashParams } from "@carma-commons/utils";

type Emitter = (e: {
  raw: Record<string, string>;
  values: Record<string, unknown>;
  changedKeys: string[];
  removedKeys: string[];
  source: "popstate" | "hashchange";
}) => void;

export function useHashChangeEmit(args: {
  emit: Emitter;
  getHashValues: () => Record<string, unknown>;
  aliasReverseLookup: Record<string, string>;
  prevRawRef: MutableRefObject<Record<string, string>>;
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
