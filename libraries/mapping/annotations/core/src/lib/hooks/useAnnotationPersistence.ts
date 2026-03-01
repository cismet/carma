import { useEffect, useRef } from "react";

import type { BaseAnnotationEntry } from "../types/annotationTypes";
import {
  loadMeasurements,
  saveMeasurements,
} from "../utils/annotationPersistence";

interface AnnotationPersistenceOptions {
  storageKey?: string;
  enabled?: boolean;
  ready?: boolean;
  restoreDelayMs?: number;
}

export const useAnnotationPersistence = <TEntry extends BaseAnnotationEntry>(
  measurements: TEntry[],
  setMeasurements: (value: TEntry[]) => void,
  options: AnnotationPersistenceOptions = {}
) => {
  const {
    storageKey,
    enabled = true,
    ready = true,
    restoreDelayMs = 250,
  } = options;
  const lastSavedRef = useRef<string | null>(null);
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    if (!enabled || !ready || hasRestoredRef.current) {
      return;
    }

    const savedMeasurements = loadMeasurements<TEntry>(storageKey);
    if (savedMeasurements && savedMeasurements.length > 0) {
      setTimeout(() => {
        setMeasurements(savedMeasurements);
      }, restoreDelayMs);
    }

    hasRestoredRef.current = true;
  }, [enabled, ready, restoreDelayMs, setMeasurements, storageKey]);

  useEffect(() => {
    if (!enabled || !hasRestoredRef.current) {
      return;
    }

    const currentJson = JSON.stringify(measurements);
    if (currentJson !== lastSavedRef.current) {
      saveMeasurements(storageKey, measurements);
      lastSavedRef.current = currentJson;
    }
  }, [enabled, measurements, storageKey]);
};
