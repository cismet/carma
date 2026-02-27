import { useEffect, useRef } from "react";

import type { MeasurementCollection } from "../types/MeasurementTypes";
import {
  loadMeasurements,
  saveMeasurements,
} from "../utils/measurementPersistence";

interface MeasurementPersistenceOptions {
  storageKey?: string;
  enabled?: boolean;
  ready?: boolean;
  restoreDelayMs?: number;
}

export const useMeasurementPersistence = (
  measurements: MeasurementCollection,
  setMeasurements: (value: MeasurementCollection) => void,
  options: MeasurementPersistenceOptions = {}
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

    const savedMeasurements = loadMeasurements(storageKey);
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
