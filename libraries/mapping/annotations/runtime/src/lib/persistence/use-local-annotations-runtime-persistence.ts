import { useCallback, useMemo } from "react";

import type { AnnotationsRuntimePersistenceEnvelope } from "./annotations-persistence";
import {
  loadAnnotationsRuntimePersistenceState,
  saveAnnotationsRuntimePersistenceState,
} from "./annotations-persistence";

type UseLocalAnnotationsRuntimePersistenceOptions = {
  enabled?: boolean;
  storageKey: string;
};

export const useLocalAnnotationsRuntimePersistence = ({
  enabled = true,
  storageKey,
}: UseLocalAnnotationsRuntimePersistenceOptions) => {
  const initialPersistenceState = useMemo(() => {
    if (!enabled || typeof window === "undefined") {
      return null;
    }

    return loadAnnotationsRuntimePersistenceState(storageKey);
  }, [enabled, storageKey]);

  const onPersistenceStateChange = useCallback(
    (state: AnnotationsRuntimePersistenceEnvelope) => {
      if (!enabled || typeof window === "undefined") {
        return;
      }

      saveAnnotationsRuntimePersistenceState(storageKey, state);
    },
    [enabled, storageKey]
  );

  return {
    initialPersistenceState,
    onPersistenceStateChange: enabled ? onPersistenceStateChange : undefined,
  };
};
