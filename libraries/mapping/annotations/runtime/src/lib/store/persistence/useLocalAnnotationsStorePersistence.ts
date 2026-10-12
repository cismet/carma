import { requestAnnotationsFormatUpgrade } from "./request-annotations-format-upgrade";
import { useCallback, useEffect, useMemo } from "react";

import {
  loadAnnotationsRuntimePersistenceState,
  saveAnnotationsRuntimePersistenceState,
} from "./annotations-store-persistence";
import type { AnnotationsRuntimePersistenceEnvelope } from "./persistence-format";

type UseLocalAnnotationsRuntimePersistenceOptions = {
  enabled?: boolean;
  storageKey: string;
  requestFormatUpgrade?: () => Promise<boolean>;
};

export const useLocalAnnotationsRuntimePersistence = ({
  enabled = true,
  storageKey,
  requestFormatUpgrade,
}: UseLocalAnnotationsRuntimePersistenceOptions) => {
  useEffect(() => {
    if (!enabled || !requestFormatUpgrade || typeof window === "undefined")
      return;
    void requestAnnotationsFormatUpgrade(storageKey, requestFormatUpgrade);
  }, [enabled, requestFormatUpgrade, storageKey]);

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
