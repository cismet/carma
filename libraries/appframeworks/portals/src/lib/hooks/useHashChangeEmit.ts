import { useEffect, type MutableRefObject } from "react";
import { getHashParams, diffHashParams } from "@carma-commons/utils";
import type {
  HashParamNameToStateKeyMap,
  HashParams,
} from "@carma-providers/hash-state";

type Emitter = (e: {
  hashParams: HashParams;
  stateValues: Record<string, unknown>;
  changedStateKeys: string[];
  removedStateKeys: string[];
  source: "popstate" | "hashchange";
}) => void;

export function useHashChangeEmit(args: {
  emit: Emitter;
  getHashStateValues: () => Record<string, unknown>;
  hashParamNameToStateKey: HashParamNameToStateKeyMap;
  previousHashParamsRef: MutableRefObject<HashParams>;
}) {
  const {
    emit,
    getHashStateValues,
    hashParamNameToStateKey,
    previousHashParamsRef,
  } = args;

  useEffect(() => {
    const handle = (source: "popstate" | "hashchange") => () => {
      const previousHashParams = previousHashParamsRef.current || {};
      const nextHashParams = getHashParams();
      const {
        changedKeys: changedHashParamNames,
        removedKeys: removedHashParamNames,
      } = diffHashParams(previousHashParams, nextHashParams);
      const toStateKey = (hashParamName: string) =>
        hashParamNameToStateKey[hashParamName] || hashParamName;
      const changedStateKeys = [
        ...new Set(changedHashParamNames.map(toStateKey)),
      ];
      const removedStateKeys = [
        ...new Set(removedHashParamNames.map(toStateKey)),
      ];
      emit({
        hashParams: nextHashParams,
        stateValues: getHashStateValues(),
        changedStateKeys,
        removedStateKeys,
        source,
      });
      previousHashParamsRef.current = nextHashParams;
    };

    const onPop = handle("popstate");
    const onHash = handle("hashchange");
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    };
  }, [
    emit,
    getHashStateValues,
    hashParamNameToStateKey,
    previousHashParamsRef,
  ]);
}
