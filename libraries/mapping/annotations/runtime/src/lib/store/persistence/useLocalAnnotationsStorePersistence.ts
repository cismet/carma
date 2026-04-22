import { useCallback, useMemo } from "react";

import type {
  AnnotationsRuntimePersistenceEnvelope,
} from "./annotations-store-persistence";
import {
  loadAnnotationsRuntimePersistenceState,
  saveAnnotationsRuntimePersistenceState,
} from "./annotations-store-persistence";

type UseLocalAnnotationsStorePersistenceOptions = {
  enabled?: boolean;
  storageKey: string;
};

export const useLocalAnnotationsStorePersistence = ({
  enabled = true,
  storageKey,
}: UseLocalAnnotationsStorePersistenceOptions) => {
  const initialPersistenceState = useMemo(() => {
    if (!enabled || typeof window === "undefined") {
      return null;
    }

    return loadAnnotationsRuntimePersistenceState(storageKey);
  }, [enabled, storageKey]);

  const onPersistenceStateChange = useCallback(
    (
      state: AnnotationsRuntimePersistenceEnvelope
    ) => {
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

export const useLocalAnnotationsRuntimePersistence =
  useLocalAnnotationsStorePersistence;
