import { useCallback, useMemo } from "react";
import {
  type AnnotationPersistenceEnvelopeV2Base,
  type BaseAnnotationEntry,
} from "@carma-mapping/annotations/core";
import {
  loadAnnotationPersistenceState,
  saveAnnotationPersistenceState,
} from "./annotationPersistence";

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
    (state: AnnotationPersistenceEnvelopeV2Base<TEntry>) => {
      if (!enabled || typeof window === "undefined") {
        return;
      }

      saveAnnotationPersistenceState(
        storageKey,
        state as AnnotationPersistenceEnvelopeV2Base<BaseAnnotationEntry>
      );
    },
    [enabled, storageKey]
  );

  return {
    initialPersistenceState,
    onPersistenceStateChange: enabled ? onPersistenceStateChange : undefined,
  };
};
