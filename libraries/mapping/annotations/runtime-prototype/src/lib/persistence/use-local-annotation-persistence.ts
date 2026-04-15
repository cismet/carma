import { useCallback, useMemo } from "react";

import {
  type AnnotationPersistenceEnvelopeBase,
  type BaseAnnotationEntry,
} from "@carma-mapping/annotations/core";

import {
  loadAnnotationPersistenceState,
  saveAnnotationPersistenceState,
} from "./annotation-persistence";
type UseLocalAnnotationPersistenceOptions = {
  enabled?: boolean;
  storageKey?: string;
};

export const useLocalAnnotationPersistence = <
  TEntry extends BaseAnnotationEntry = BaseAnnotationEntry
>({
  enabled = true,
  storageKey,
}: UseLocalAnnotationPersistenceOptions = {}) => {
  const initialPersistenceState = useMemo(() => {
    if (!enabled || typeof window === "undefined") {
      return null;
    }
    return loadAnnotationPersistenceState<TEntry>(storageKey);
  }, [enabled, storageKey]);

  const onPersistenceStateChange = useCallback(
    (state: AnnotationPersistenceEnvelopeBase<TEntry>) => {
      if (!enabled || typeof window === "undefined") {
        return;
      }

      saveAnnotationPersistenceState(
        storageKey,
        state as AnnotationPersistenceEnvelopeBase<BaseAnnotationEntry>
      );
    },
    [enabled, storageKey]
  );

  return {
    initialPersistenceState,
    onPersistenceStateChange: enabled ? onPersistenceStateChange : undefined,
  };
};
