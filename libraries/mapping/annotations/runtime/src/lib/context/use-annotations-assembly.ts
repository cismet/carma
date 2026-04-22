import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatMeasurementShortLabelToken } from "@carma-mapping/annotations/core";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import {
  buildStoredAnnotationGeoJsonFeatureCollection,
  downloadAnnotationGeoJsonFile,
  resolveAnnotationExportDescriptor,
  sanitizeAnnotationExportFileSegment,
} from "../utils/annotation-geo-json-export";
import {
  appendAnnotationEntities,
  buildAnnotationsRuntimePersistenceState,
  buildMeasurementEntities,
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
  findAnnotationEntryById,
  removeAnnotationById,
  removeAnnotationsByIds,
  readMaxNumericSuffix,
  resolvePersistedAnnotationsStoreState,
  resolveRemovableSelectedAnnotationIds,
  resolveNextElevationDisplayMode,
  selectAdjacentAnnotationEntryId,
  selectAllAnnotationIds,
  setElevationReferenceAnnotationId as setElevationReferenceAnnotationIdAction,
  setAnnotationToolType,
  setPointTemporaryMode as setPointTemporaryModeInStoreAction,
  selectSelectedAnnotationId,
  setSelectedAnnotationId,
  setSelectedAnnotationIds,
  updateAnnotationEntryById,
  type AnnotationsStore,
  type AddAnnotationOptions,
  type AnnotationsRuntimePersistenceEnvelope,
  type CesiumGeographicCoordinate,
  type AnnotationNodeLinkId,
  type StoredAnnotation,
} from "../store";
import { buildAnnotationToolRegistry } from "../registry";
import type { AnnotationToolId } from "../registry/annotation-tool-id";
import type {
  AnnotationToolDraftStore,
  AnnotationToolPlugin,
} from "../registry/annotation-tool-plugin.types";
import type { Scene } from "@carma-cesium";
import {
  isShortLabelKind,
  resolveNextShortLabelCounterForToolType,
} from "../utils/short-label-sequence";
import {
  resolveAnnotationEntryCartesianPoints,
  resolveAnnotationEntryCoordinates,
} from "../utils/annotation-coordinates";
import { createAnnotationToolDraftStore } from "../interaction/lifecycle/create-annotation-tool-draft-store";
import { flyToAnnotationPoints } from "./annotation-fly-to";
import {
  NOOP_RUNTIME_LIFECYCLE_HOST_API,
  type RuntimeLifecycleHostApi,
} from "./lifecycle-host-api";

type UseAnnotationsRuntimeAssemblyOptions = {
  scene: Scene | null;
  plugins: readonly AnnotationToolPlugin[];
  initialActiveToolType?: AnnotationToolId;
  initialPointTemporaryMode: boolean;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions: Partial<PreviewLineLabelVisualOptions>;
  initialPersistenceState: AnnotationsRuntimePersistenceEnvelope | null;
  onPersistenceStateChange?: (
    state: AnnotationsRuntimePersistenceEnvelope
  ) => void;
};

export const useAnnotationsAssembly = ({
  scene,
  plugins,
  initialActiveToolType,
  initialPointTemporaryMode,
  formatOptions,
  previewLineLabelVisualOptions,
  initialPersistenceState,
  onPersistenceStateChange,
}: UseAnnotationsRuntimeAssemblyOptions) => {
  const registry = useMemo(
    () => buildAnnotationToolRegistry(plugins),
    [plugins]
  );
  const fallbackToolType = registry.orderedDescriptors[0]?.id ?? null;

  if (!fallbackToolType) {
    throw new Error("AnnotationsProvider requires at least one tool plugin.");
  }

  const resolvedInitialToolType =
    initialActiveToolType && registry.getPlugin(initialActiveToolType)
      ? initialActiveToolType
      : fallbackToolType;
  const annotationsStoreRef = useRef<AnnotationsStore | null>(null);
  const annotationToolDraftStoreRef = useRef<AnnotationToolDraftStore | null>(
    null
  );
  const lifecycleHostApiRef = useRef<RuntimeLifecycleHostApi>(
    NOOP_RUNTIME_LIFECYCLE_HOST_API
  );
  const previewSnapTargetNodeClickRef = useRef<(nodeId: string) => boolean>(
    () => false
  );
  const lastSerializedPersistenceStateRef = useRef<string | null>(null);
  const measurementSequenceRef = useRef(0);
  const nodeSequenceRef = useRef(0);
  const edgeSequenceRef = useRef(0);

  const [activeMoveGizmoNodeId, setActiveMoveGizmoNodeId] = useState<
    string | null
  >(null);
  const hoveredPointQueryNodeIdRef = useRef<string | null>(null);
  const setHoveredPointQueryNodeId = useCallback((nodeId: string | null) => {
    hoveredPointQueryNodeIdRef.current = nodeId;
  }, []);
  const getHoveredPointQueryNodeId = useCallback(
    () => hoveredPointQueryNodeIdRef.current,
    []
  );

  if (annotationsStoreRef.current === null) {
    const initialStoreState = initialPersistenceState
      ? resolvePersistedAnnotationsStoreState({
          initialToolType: resolvedInitialToolType,
          initialPointTemporaryMode,
          initialPersistenceState,
        })
      : createInitialAnnotationsStoreState({
          initialToolType: resolvedInitialToolType,
          initialPointTemporaryMode,
        });

    measurementSequenceRef.current = readMaxNumericSuffix(
      initialStoreState.annotationEntries.map(
        (annotationEntry) => annotationEntry.id
      )
    );
    nodeSequenceRef.current = readMaxNumericSuffix(
      initialStoreState.nodes.map((node) => node.id)
    );
    edgeSequenceRef.current = readMaxNumericSuffix(
      initialStoreState.edges.map((edge) => edge.id)
    );
    lastSerializedPersistenceStateRef.current = JSON.stringify(
      buildAnnotationsRuntimePersistenceState(initialStoreState)
    );
    annotationsStoreRef.current = createAnnotationsStore(initialStoreState);
  }
  if (annotationToolDraftStoreRef.current === null) {
    annotationToolDraftStoreRef.current = createAnnotationToolDraftStore();
  }

  const annotationsStore = annotationsStoreRef.current;
  const annotationToolDraftStore = annotationToolDraftStoreRef.current;

  const setActiveToolTypeInStore = useCallback(
    (toolType: AnnotationToolId) => {
      annotationsStore.dispatch(setAnnotationToolType(toolType));
    },
    [annotationsStore]
  );

  const setActiveToolType = useCallback(
    (toolType: AnnotationToolId) => {
      if (lifecycleHostApiRef.current === NOOP_RUNTIME_LIFECYCLE_HOST_API) {
        setActiveToolTypeInStore(toolType);
        return;
      }

      lifecycleHostApiRef.current.requestModeChange(toolType);
    },
    [setActiveToolTypeInStore]
  );
  const bindPreviewSnapTargetNodeClick = useCallback(
    (handler: (nodeId: string) => boolean) => {
      previewSnapTargetNodeClickRef.current = handler;
      return () => {
        if (previewSnapTargetNodeClickRef.current === handler) {
          previewSnapTargetNodeClickRef.current = () => false;
        }
      };
    },
    []
  );
  const handlePreviewSnapTargetNodeClick = useCallback(
    (nodeId: string) => previewSnapTargetNodeClickRef.current(nodeId),
    []
  );

  const setSelectedAnnotationIdInStore = useCallback(
    (annotationId: string | null) => {
      annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
    },
    [annotationsStore]
  );

  const setSelectedAnnotationIdsInStore = useCallback(
    (annotationIds: readonly string[]) => {
      annotationsStore.dispatch(setSelectedAnnotationIds(annotationIds));
    },
    [annotationsStore]
  );

  const setElevationReferenceAnnotationIdInStore = useCallback(
    (annotationId: string | null) => {
      annotationsStore.dispatch(
        setElevationReferenceAnnotationIdAction(annotationId)
      );
    },
    [annotationsStore]
  );

  const focusAdjacentAnnotationEntry = useCallback(
    (offset: -1 | 1) => {
      const runtimeState = annotationsStore.getState();
      const nextAnnotationId = selectAdjacentAnnotationEntryId(
        runtimeState.annotationEntries,
        selectSelectedAnnotationId(runtimeState),
        offset
      );

      annotationsStore.dispatch(setSelectedAnnotationId(nextAnnotationId));
    },
    [annotationsStore]
  );

  const flyToAnnotationById = useCallback(
    (annotationId: string | null) => {
      const runtimeState = annotationsStore.getState();
      const points = resolveAnnotationEntryCartesianPoints({
        annotationEntries: runtimeState.annotationEntries,
        nodes: runtimeState.nodes,
        annotationId,
      });
      flyToAnnotationPoints({
        scene,
        points,
      });
    },
    [annotationsStore, scene]
  );

  const flyToAllAnnotations = useCallback(() => {
    const runtimeState = annotationsStore.getState();
    const points = runtimeState.annotationEntries.flatMap((annotationEntry) =>
      resolveAnnotationEntryCartesianPoints({
        annotationEntries: runtimeState.annotationEntries,
        nodes: runtimeState.nodes,
        annotationId: annotationEntry.id,
      })
    );
    flyToAnnotationPoints({
      scene,
      points,
    });
  }, [annotationsStore, scene]);

  const focusAnnotationId = useCallback(
    (annotationId: string | null) => {
      annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
      flyToAnnotationById(annotationId);
    },
    [annotationsStore, flyToAnnotationById]
  );

  const removeAnnotationEntryById = useCallback(
    (annotationId: string) => {
      const targetEntry = findAnnotationEntryById(
        annotationsStore.getState().annotationEntries,
        annotationId
      );
      if (targetEntry?.locked) {
        return;
      }

      annotationsStore.dispatch(
        removeAnnotationById({
          annotationId,
          nextSelectedAnnotationId: null,
        })
      );
    },
    [annotationsStore]
  );

  const removeSelectedAnnotationEntries = useCallback(() => {
    const runtimeState = annotationsStore.getState();
    const removableAnnotationIds =
      resolveRemovableSelectedAnnotationIds(runtimeState);
    if (removableAnnotationIds.length === 0) {
      return;
    }

    annotationsStore.dispatch(
      removeAnnotationsByIds({
        annotationIds: removableAnnotationIds,
      })
    );
  }, [annotationsStore]);

  const exportAnnotationGeoJson = useCallback(
    (annotationId: string) => {
      const runtimeState = annotationsStore.getState();
      const annotation = findAnnotationEntryById(
        runtimeState.annotationEntries,
        annotationId
      );
      if (!annotation) {
        return;
      }

      const coordinates = resolveAnnotationEntryCoordinates({
        annotationEntries: runtimeState.annotationEntries,
        nodes: runtimeState.nodes,
        annotationId,
      });
      const featureCollection = buildStoredAnnotationGeoJsonFeatureCollection({
        annotation,
        coordinates,
      });
      if (!featureCollection) {
        return;
      }

      const exportDescriptor = resolveAnnotationExportDescriptor(annotation);
      const kindSegment = sanitizeAnnotationExportFileSegment(
        exportDescriptor.kind
      );
      const nameSegment = sanitizeAnnotationExportFileSegment(
        exportDescriptor.name
      );

      downloadAnnotationGeoJsonFile(
        `annotation-${kindSegment}-${nameSegment}.geojson`,
        featureCollection
      );
    },
    [annotationsStore]
  );

  const toggleAnnotationVisibility = useCallback(
    (annotationId: string) => {
      const targetEntry = findAnnotationEntryById(
        annotationsStore.getState().annotationEntries,
        annotationId
      );
      if (!targetEntry) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          hidden: !targetEntry.hidden,
        })
      );
    },
    [annotationsStore]
  );

  const toggleAnnotationLocked = useCallback(
    (annotationId: string) => {
      const targetEntry = findAnnotationEntryById(
        annotationsStore.getState().annotationEntries,
        annotationId
      );
      if (!targetEntry) {
        return;
      }

      const nextLocked = !targetEntry.locked;
      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          locked: nextLocked,
        })
      );

      if (
        nextLocked &&
        targetEntry.nodeIds.includes(activeMoveGizmoNodeId ?? "")
      ) {
        setActiveMoveGizmoNodeId(null);
      }
    },
    [activeMoveGizmoNodeId, annotationsStore]
  );

  const selectAllAnnotationEntries = useCallback(() => {
    const runtimeState = annotationsStore.getState();
    annotationsStore.dispatch(
      setSelectedAnnotationIds(selectAllAnnotationIds(runtimeState))
    );
  }, [annotationsStore]);

  const updateAnnotationDisplayName = useCallback(
    (annotationId: string, displayName: string) => {
      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          displayName: displayName.trim(),
        })
      );
    },
    [annotationsStore]
  );

  const updateAnnotationShortLabel = useCallback(
    (annotationId: string, shortLabel: string) => {
      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          shortLabel: shortLabel.trim(),
        })
      );
    },
    [annotationsStore]
  );

  const toggleAnnotationElevationDisplayMode = useCallback(
    (annotationId: string) => {
      const targetEntry = findAnnotationEntryById(
        annotationsStore.getState().annotationEntries,
        annotationId
      );
      if (!targetEntry) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          elevationDisplayMode: resolveNextElevationDisplayMode(
            targetEntry.elevationDisplayMode
          ),
        })
      );
    },
    [annotationsStore]
  );

  const setPointTemporaryModeInStore = useCallback(
    (temporaryMode: boolean) => {
      annotationsStore.dispatch(
        setPointTemporaryModeInStoreAction(temporaryMode)
      );
    },
    [annotationsStore]
  );

  const bindLifecycleHostApi = useCallback((api: RuntimeLifecycleHostApi) => {
    lifecycleHostApiRef.current = api;
  }, []);

  const resolvePluginForAnnotationAdd = useCallback(
    (
      annotationType: StoredAnnotation["toolType"],
      sourceToolId?: AnnotationToolId
    ) => {
      if (sourceToolId) {
        const sourcePlugin = registry.getPlugin(sourceToolId);
        if (sourcePlugin) {
          return sourcePlugin;
        }
      }

      const matchingPlugins = registry.getPluginsByAnnotationType(annotationType);
      return (
        matchingPlugins.find((plugin) => plugin.addAnnotation) ??
        matchingPlugins[0] ??
        null
      );
    },
    [registry]
  );

  const addAnnotation = useCallback(
    (
      toolType: StoredAnnotation["toolType"],
      coordinates: readonly CesiumGeographicCoordinate[],
      options?: AddAnnotationOptions,
      linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
      sourceToolId?: AnnotationToolId
    ) => {
      const runtimeStateBeforeInsert = annotationsStore.getState();
      const resolvedToolPlugin = resolvePluginForAnnotationAdd(
        toolType,
        sourceToolId
      );
      let resolvedOptions =
        resolvedToolPlugin?.addAnnotation?.resolveOptions({
          annotationType: toolType,
          toolId: sourceToolId ?? resolvedToolPlugin?.id ?? null,
          scene,
          coordinates,
          options,
          linkedNodeGroupIds,
        }) ?? options;

      if (isShortLabelKind(toolType)) {
        const nextShortLabelCounter = resolveNextShortLabelCounterForToolType({
          annotationEntries: runtimeStateBeforeInsert.annotationEntries,
          toolType,
        });
        resolvedOptions = {
          ...resolvedOptions,
          shortLabel:
            resolvedOptions?.shortLabel?.trim() ||
            formatMeasurementShortLabelToken(toolType, nextShortLabelCounter),
        };
      }

      const { annotationEntry, nodes, linkedNodeGroups, edges } =
        buildMeasurementEntities({
          toolType,
          coordinates,
          options: resolvedOptions,
          linkedNodeGroupIds,
          measurementSequenceRef,
          nodeSequenceRef,
          edgeSequenceRef,
        });

      annotationsStore.dispatch(
        appendAnnotationEntities({
          annotationEntry,
          nodes,
          linkedNodeGroups,
          edges,
          selectAnnotationId: annotationEntry.id,
        })
      );
      return annotationEntry;
    },
    [annotationsStore, resolvePluginForAnnotationAdd, scene]
  );

  useEffect(() => {
    if (!onPersistenceStateChange) {
      return;
    }

    const emitPersistenceState = () => {
      const nextPersistenceState = buildAnnotationsRuntimePersistenceState(
        annotationsStore.getState()
      );
      const serializedPersistenceState = JSON.stringify(nextPersistenceState);
      if (
        serializedPersistenceState === lastSerializedPersistenceStateRef.current
      ) {
        return;
      }

      onPersistenceStateChange(nextPersistenceState);
      lastSerializedPersistenceStateRef.current = serializedPersistenceState;
    };

    const unsubscribe = annotationsStore.subscribe(emitPersistenceState);
    return () => {
      unsubscribe();
    };
  }, [annotationsStore, onPersistenceStateChange]);

  const services = useMemo(
    () => ({
      scene,
      registry,
      annotationsStore,
      formatOptions,
      addAnnotation,
      setActiveToolType,
      requestModeChange: (toolType: AnnotationToolId) =>
        lifecycleHostApiRef.current.requestModeChange(toolType),
      requestActivateTool: (toolType?: AnnotationToolId) =>
        lifecycleHostApiRef.current.requestActivateTool(toolType),
      requestFinishMeasurement: () =>
        lifecycleHostApiRef.current.requestFinishMeasurement(),
      focusAdjacentAnnotationEntry,
      focusAnnotationId,
      flyToAnnotationById,
      flyToAllAnnotations,
      removeAnnotationById: removeAnnotationEntryById,
      exportAnnotationGeoJson,
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
      annotationsStore,
      focusAdjacentAnnotationEntry,
      focusAnnotationId,
      exportAnnotationGeoJson,
      flyToAllAnnotations,
      flyToAnnotationById,
      formatOptions,
      removeAnnotationEntryById,
      removeSelectedAnnotationEntries,
      registry,
      scene,
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
    setActiveToolType,
    runtimeAuthoringHost: {
      scene,
      registry,
      annotationsStore,
      annotationToolDraftStore,
      setActiveToolTypeInStore,
      focusAdjacentAnnotationEntry,
      addAnnotation,
      bindPreviewSnapTargetNodeClick,
      activeMoveGizmoNodeId,
      getHoveredPointQueryNodeId,
      setHoveredPointQueryNodeId,
      formatOptions,
      previewLineLabelVisualOptions,
      bindApi: bindLifecycleHostApi,
    },
    runtimeVisualHost: {
      scene,
      registry,
      annotationsStore,
      annotationToolDraftStore,
      setElevationReferenceAnnotationId:
        setElevationReferenceAnnotationIdInStore,
      toggleAnnotationElevationDisplayMode,
      onActiveMoveGizmoNodeIdChange: setActiveMoveGizmoNodeId,
      onHoveredPointQueryNodeIdChange: setHoveredPointQueryNodeId,
      onPreviewSnapTargetNodeClick: handlePreviewSnapTargetNodeClick,
      activeMoveGizmoNodeId,
      formatOptions,
      previewLineLabelVisualOptions,
    },
  };
};
