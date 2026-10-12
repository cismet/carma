import { useCallback, useMemo, useState } from "react";

import type { AnnotationToolId } from "@carma-mapping/annotations/core";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import { buildAnnotationToolRegistry } from "../registry";
import type { AnnotationToolPlugin } from "../registry";
import type { AnnotationEngine } from "../engine";
import type {
  AnnotationsRuntimePersistenceEnvelope,
  StoredAnnotation,
} from "../store";
import type { AppendAnnotationsRuntimePersistenceStateOptions } from "../utils/annotation-tool-collections";
import type { AnnotationDeleteConfirmationRequester } from "./annotation-delete-confirmation";
import {
  appendPersistenceStateToStore,
  removeExternalAnnotationsFromStore,
} from "./external-annotations-collection";
import type { AnnotationLabelTextRequester } from "./use-annotation-label-text-request";
import { useAnnotationAdd } from "./use-annotation-add";
import { useAnnotationEntryActions } from "./use-annotation-entry-actions";
import { useAnnotationExports } from "./use-annotation-exports";
import { useAnnotationFocus } from "./use-annotation-focus";
import { useAnnotationRemoval } from "./use-annotation-removal";
import { useAnnotationsRuntimeStores } from "./use-annotations-runtime-stores";
import { useEditedNodeRemoval } from "./use-edited-node-removal";
import { useRuntimeHostBridge } from "./use-runtime-host-bridge";

type UseAnnotationsRuntimeAssemblyOptions = {
  engine: AnnotationEngine | null;
  plugins: readonly AnnotationToolPlugin[];
  initialActiveToolType?: AnnotationToolId;
  initialPointTemporaryMode: boolean;
  formatOptions: AnnotationsRuntimeFormatOptions;
  lineLabelOptions: PartialAnnotationLineLabelOptions;
  initialPersistenceState: AnnotationsRuntimePersistenceEnvelope | null;
  storeKey?: string;
  onPersistenceStateChange?: (
    state: AnnotationsRuntimePersistenceEnvelope
  ) => void;
  requestLabelText?: AnnotationLabelTextRequester;
  confirmAnnotationDelete?: AnnotationDeleteConfirmationRequester;
};

/** Assembles the runtime stores, services and host props of the provider. */
export const useAnnotationsAssembly = ({
  engine,
  plugins,
  initialActiveToolType,
  initialPointTemporaryMode,
  formatOptions,
  lineLabelOptions,
  initialPersistenceState,
  storeKey,
  onPersistenceStateChange,
  requestLabelText,
  confirmAnnotationDelete,
}: UseAnnotationsRuntimeAssemblyOptions) => {
  const registry = useMemo(
    () => buildAnnotationToolRegistry(plugins),
    [plugins]
  );
  const fallbackToolType = registry.orderedDescriptors[0]?.id ?? null;

  if (!fallbackToolType) {
    throw new Error("AnnotationsProvider requires at least one tool plugin.");
  }

  const {
    annotationsStore,
    annotationToolDraftStore,
    activePointQueryPickResultStore,
    sequenceRefs,
  } = useAnnotationsRuntimeStores({
    registry,
    initialToolType:
      initialActiveToolType && registry.getPlugin(initialActiveToolType)
        ? initialActiveToolType
        : fallbackToolType,
    initialPointTemporaryMode,
    initialPersistenceState,
    storeKey,
    onPersistenceStateChange,
  });
  const [activeEditedNodeId, setActiveEditedNodeId] = useState<string | null>(
    null
  );

  const {
    setActiveToolTypeInStore,
    setActiveToolType,
    bindLifecycleHostApi,
    lifecycleRequests,
    bindPreviewSnapTargetNodeClick,
    handlePreviewSnapTargetNodeClick,
    setHoveredPointQueryNodeId,
    getHoveredPointQueryNodeId,
  } = useRuntimeHostBridge({ annotationsStore, setActiveEditedNodeId });
  const {
    setSelectedAnnotationIdInStore,
    setSelectedAnnotationIdsInStore,
    selectAllAnnotationEntries,
    focusAdjacentAnnotationEntry,
    flyToAnnotationById,
    flyToAllAnnotations,
    focusAnnotationId,
  } = useAnnotationFocus({ engine, annotationsStore, setActiveEditedNodeId });
  const {
    requestAnnotationDeleteConfirmation,
    removeAnnotationEntriesByIds,
    removeAnnotationEntryById,
    removeSelectedAnnotationEntries,
  } = useAnnotationRemoval({
    annotationsStore,
    annotationToolDraftStore,
    confirmAnnotationDelete,
  });
  const removeEditedNode = useEditedNodeRemoval({
    annotationsStore,
    annotationToolDraftStore,
    activeEditedNodeId,
    setActiveEditedNodeId,
    requestAnnotationDeleteConfirmation,
  });
  const {
    exportAnnotationGeoJson,
    buildAllAnnotationsGeoJson,
    exportAllAnnotationsGeoJson,
  } = useAnnotationExports(annotationsStore);
  const {
    setElevationReferenceAnnotationIdInStore,
    setPointTemporaryModeInStore,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    toggleAnnotationElevationDisplayMode,
  } = useAnnotationEntryActions({
    annotationsStore,
    activeEditedNodeId,
    setActiveEditedNodeId,
  });
  const addAnnotation = useAnnotationAdd({
    engine,
    registry,
    annotationsStore,
    ...sequenceRefs,
  });

  const appendAnnotationsRuntimePersistenceState = useCallback(
    (
      persistenceState: AnnotationsRuntimePersistenceEnvelope,
      options?: AppendAnnotationsRuntimePersistenceStateOptions
    ) =>
      appendPersistenceStateToStore(
        annotationsStore,
        persistenceState,
        options
      ),
    [annotationsStore]
  );
  const removeExternalAnnotationsByCollection = useCallback(
    (externalCollection: NonNullable<StoredAnnotation["externalCollection"]>) =>
      removeExternalAnnotationsFromStore(annotationsStore, externalCollection),
    [annotationsStore]
  );

  const services = useMemo(
    () => ({
      engine,
      registry,
      annotationToolDraftStore,
      annotationsStore,
      formatOptions,
      activeEditedNodeId,
      addAnnotation,
      appendAnnotationsRuntimePersistenceState,
      removeExternalAnnotationsByCollection,
      setActiveToolType,
      requestModeChange: lifecycleRequests.requestModeChange,
      requestActivateTool: lifecycleRequests.requestActivateTool,
      requestFinishMeasurement: lifecycleRequests.requestFinishMeasurement,
      requestPointAt: lifecycleRequests.requestPointAt,
      focusAdjacentAnnotationEntry,
      focusAnnotationId,
      flyToAnnotationById,
      flyToAllAnnotations,
      removeAnnotationById: removeAnnotationEntryById,
      removeAnnotationsByIds: removeAnnotationEntriesByIds,
      buildAllAnnotationsGeoJson,
      exportAnnotationGeoJson,
      exportAllAnnotationsGeoJson,
      toggleAnnotationVisibility,
      toggleAnnotationLocked,
      removeSelectedAnnotations: removeSelectedAnnotationEntries,
      selectAllAnnotations: selectAllAnnotationEntries,
      setElevationReferenceAnnotationId:
        setElevationReferenceAnnotationIdInStore,
      toggleAnnotationElevationDisplayMode,
      updateAnnotationDisplayName,
      updateAnnotationShortLabel,
      setPointTemporaryMode: setPointTemporaryModeInStore,
      setSelectedAnnotationId: setSelectedAnnotationIdInStore,
      setSelectedAnnotationIds: setSelectedAnnotationIdsInStore,
    }),
    [
      addAnnotation,
      appendAnnotationsRuntimePersistenceState,
      activeEditedNodeId,
      annotationToolDraftStore,
      annotationsStore,
      buildAllAnnotationsGeoJson,
      focusAdjacentAnnotationEntry,
      focusAnnotationId,
      exportAllAnnotationsGeoJson,
      exportAnnotationGeoJson,
      flyToAllAnnotations,
      flyToAnnotationById,
      formatOptions,
      lifecycleRequests,
      removeAnnotationEntryById,
      removeAnnotationEntriesByIds,
      removeExternalAnnotationsByCollection,
      removeSelectedAnnotationEntries,
      registry,
      engine,
      selectAllAnnotationEntries,
      setElevationReferenceAnnotationIdInStore,
      setActiveToolType,
      setPointTemporaryModeInStore,
      setSelectedAnnotationIdInStore,
      setSelectedAnnotationIdsInStore,
      toggleAnnotationLocked,
      toggleAnnotationElevationDisplayMode,
      toggleAnnotationVisibility,
      updateAnnotationDisplayName,
      updateAnnotationShortLabel,
    ]
  );

  return {
    annotationsStore,
    registry,
    services,
    activePointQueryPickResultStore,
    setActiveToolType,
    runtimeAuthoringHost: {
      engine,
      registry,
      annotationsStore,
      annotationToolDraftStore,
      setActiveToolTypeInStore,
      focusAdjacentAnnotationEntry,
      removeSelectedAnnotations: removeSelectedAnnotationEntries,
      removeEditedNode,
      addAnnotation,
      bindPreviewSnapTargetNodeClick,
      activeEditedNodeId,
      getHoveredPointQueryNodeId,
      setHoveredPointQueryNodeId,
      onPointQueryPickResultChange: activePointQueryPickResultStore.setSnapshot,
      formatOptions,
      lineLabelOptions,
      bindApi: bindLifecycleHostApi,
      requestLabelText,
    },
    runtimeVisualHost: {
      engine,
      registry,
      annotationsStore,
      annotationToolDraftStore,
      setElevationReferenceAnnotationId:
        setElevationReferenceAnnotationIdInStore,
      toggleAnnotationElevationDisplayMode,
      onActiveEditedNodeIdChange: setActiveEditedNodeId,
      onHoveredPointQueryNodeIdChange: setHoveredPointQueryNodeId,
      onPreviewSnapTargetNodeClick: handlePreviewSnapTargetNodeClick,
      activeEditedNodeId,
      formatOptions,
      lineLabelOptions,
    },
  };
};
