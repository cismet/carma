import { useEffect, useRef } from "react";

import type { AnnotationToolId } from "@carma-mapping/annotations/core";

import { createAnnotationToolDraftStore } from "../interaction/lifecycle/create-annotation-tool-draft-store";
import type { AnnotationToolRegistry } from "../registry";
import {
  buildAnnotationsRuntimePersistenceState,
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
  readMaxNumericSuffix,
  resolvePersistedAnnotationsStoreState,
  type AnnotationsRuntimePersistenceEnvelope,
} from "../store";
import { createActivePointQueryPickResultStore } from "./active-point-query-pick-result-store";

type UseAnnotationsRuntimeStoresOptions = {
  registry: AnnotationToolRegistry;
  initialToolType: AnnotationToolId;
  initialPointTemporaryMode: boolean;
  initialPersistenceState: AnnotationsRuntimePersistenceEnvelope | null;
  storeKey?: string;
  onPersistenceStateChange?: (
    state: AnnotationsRuntimePersistenceEnvelope
  ) => void;
};

const createRuntimeStores = ({
  registry,
  initialToolType,
  initialPointTemporaryMode,
  initialPersistenceState,
}: UseAnnotationsRuntimeStoresOptions) => {
  const state = initialPersistenceState
    ? resolvePersistedAnnotationsStoreState({
        initialToolType,
        initialPointTemporaryMode,
        initialPersistenceState,
        isToolTypeAvailable: (toolType) =>
          Boolean(registry.getPlugin(toolType)),
      })
    : createInitialAnnotationsStoreState({
        initialToolType,
        initialPointTemporaryMode,
      });
  return {
    annotationsStore: createAnnotationsStore(state),
    annotationToolDraftStore: createAnnotationToolDraftStore(),
    activePointQueryPickResultStore: createActivePointQueryPickResultStore(),
    sequenceRefs: {
      measurementSequenceRef: {
        current: readMaxNumericSuffix(
          state.annotationEntries.map(({ id }) => id)
        ),
      },
      nodeSequenceRef: {
        current: readMaxNumericSuffix(state.nodes.map(({ id }) => id)),
      },
      edgeSequenceRef: {
        current: readMaxNumericSuffix(state.edges.map(({ id }) => id)),
      },
    },
    lastSerializedPersistenceState: JSON.stringify(
      buildAnnotationsRuntimePersistenceState(state)
    ),
    mountedHosts: 0,
  };
};

// Simultaneously mounted mapping engines persist one working set per key.
const storesByPersistenceKey = new Map<
  string,
  ReturnType<typeof createRuntimeStores>
>();

export const useAnnotationsRuntimeStores = (
  options: UseAnnotationsRuntimeStoresOptions
) => {
  const { storeKey, onPersistenceStateChange } = options;
  const localStoresRef = useRef<ReturnType<typeof createRuntimeStores> | null>(
    null
  );
  let stores = storeKey
    ? storesByPersistenceKey.get(storeKey)
    : localStoresRef.current;
  if (!stores) {
    stores = createRuntimeStores(options);
    if (storeKey) storesByPersistenceKey.set(storeKey, stores);
    else localStoresRef.current = stores;
  }
  const currentStores = stores;
  useEffect(() => {
    if (!storeKey) return;
    storesByPersistenceKey.set(storeKey, currentStores);
    currentStores.mountedHosts += 1;
    return () => {
      currentStores.mountedHosts -= 1;
      if (
        currentStores.mountedHosts === 0 &&
        storesByPersistenceKey.get(storeKey) === currentStores
      ) {
        storesByPersistenceKey.delete(storeKey);
      }
    };
  }, [currentStores, storeKey]);

  useEffect(() => {
    if (!onPersistenceStateChange) return;
    return currentStores.annotationsStore.subscribe(() => {
      const state = buildAnnotationsRuntimePersistenceState(
        currentStores.annotationsStore.getState()
      );
      const serialized = JSON.stringify(state);
      if (serialized === currentStores.lastSerializedPersistenceState) return;
      onPersistenceStateChange(state);
      currentStores.lastSerializedPersistenceState = serialized;
    });
  }, [currentStores, onPersistenceStateChange]);

  return {
    annotationsStore: currentStores.annotationsStore,
    annotationToolDraftStore: currentStores.annotationToolDraftStore,
    activePointQueryPickResultStore:
      currentStores.activePointQueryPickResultStore,
    sequenceRefs: currentStores.sequenceRefs,
  };
};
