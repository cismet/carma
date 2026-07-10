import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ANNOTATION_TYPES,
  formatMeasurementShortLabelToken,
} from "@carma-mapping/annotations/core";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import {
  buildStoredAnnotationGeoJsonFeatureCollection,
  downloadAnnotationGeoJsonFile,
  resolveAnnotationExportDescriptor,
  sanitizeAnnotationExportFileSegment,
} from "../utils/annotation-geo-json-export";
import {
  selectAuthoringAnnotationEntries,
  type AppendAnnotationsRuntimePersistenceStateOptions,
} from "../utils/annotation-tool-collections";
import {
  ANNOTATION_SHORT_LABEL_SOURCES,
  appendAnnotationEntities,
  buildAnnotationsRuntimeGeoJsonFeatureCollection,
  buildAnnotationsRuntimePersistenceState,
  buildMeasurementEntities,
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
  findAnnotationEntryById,
  removeAnnotationsByIds,
  removeNodeFromAnnotation,
  readMaxNumericSuffix,
  resolveNodeLinkIdForNodeId,
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
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  type CesiumGeographicCoordinate,
  type AnnotationNodeLinkId,
  type StoredAnnotation,
} from "../store";
import { buildAnnotationToolRegistry } from "../registry";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type {
  AnnotationToolDraftStore,
  AnnotationToolPlugin,
  PointQueryPickResult,
} from "../registry";
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
import type { AnnotationLabelTextRequester } from "./use-annotation-label-text-request";
import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  requestDefaultAnnotationDeleteConfirmation,
  type AnnotationDeleteConfirmationRequester,
  type AnnotationDeleteRequestOptions,
} from "./annotation-delete-confirmation";
import { resolveDraftNodeIdsAfterEditedNodeRemoval } from "./edited-node-removal.helpers";

const {
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
} = ANNOTATION_TYPES;

const resolveMinimumNodeCountForAnnotation = (
  annotation: StoredAnnotation
): number | null => {
  switch (annotation.toolType) {
    case ANNOTATION_TYPE_DISTANCE:
    case ANNOTATION_TYPE_POLYLINE:
      return 2;
    case ANNOTATION_TYPE_AREA_GROUND:
    case ANNOTATION_TYPE_AREA_PLANAR:
    case ANNOTATION_TYPE_AREA_VERTICAL:
      return 3;
    default:
      return null;
  }
};

type UseAnnotationsRuntimeAssemblyOptions = {
  scene: Scene | null;
  plugins: readonly AnnotationToolPlugin[];
  initialActiveToolType?: AnnotationToolId;
  initialPointTemporaryMode: boolean;
  formatOptions: AnnotationsRuntimeFormatOptions;
  lineLabelOptions: PartialAnnotationLineLabelOptions;
  initialPersistenceState: AnnotationsRuntimePersistenceEnvelope | null;
  onPersistenceStateChange?: (
    state: AnnotationsRuntimePersistenceEnvelope
  ) => void;
  requestLabelText?: AnnotationLabelTextRequester;
  confirmAnnotationDelete?: AnnotationDeleteConfirmationRequester;
};

export const useAnnotationsAssembly = ({
  scene,
  plugins,
  initialActiveToolType,
  initialPointTemporaryMode,
  formatOptions,
  lineLabelOptions,
  initialPersistenceState,
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

  const [activeEditedNodeId, setActiveEditedNodeId] = useState<string | null>(
    null
  );
  const [activePointQueryPickResult, setActivePointQueryPickResult] =
    useState<PointQueryPickResult | null>(null);
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
          isToolTypeAvailable: (toolType) =>
            Boolean(registry.getPlugin(toolType)),
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

  // Single funnel for every tool change (direct, mode lifecycle, keyboard
  // cancel). A mode change resets the focus, so the info box falls back to the
  // new mode's own instruction instead of still showing the previously focused
  // measurement. The edit gizmo closes with the selection — see the deselect
  // effect in usePointEditingGizmo. Re-selecting the active tool is a no-op, so
  // leaving edit mode with Escape keeps the measurement selected.
  const setActiveToolTypeInStore = useCallback(
    (toolType: AnnotationToolId) => {
      const previousToolType = annotationsStore.getState().annotationToolType;
      annotationsStore.dispatch(setAnnotationToolType(toolType));
      if (previousToolType === toolType) {
        return;
      }

      setActiveEditedNodeId(null);
      annotationsStore.dispatch(setSelectedAnnotationId(null));
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
      if (annotationId === null) {
        setActiveEditedNodeId(null);
      }
      annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
    },
    [annotationsStore]
  );

  const setSelectedAnnotationIdsInStore = useCallback(
    (annotationIds: readonly string[]) => {
      if (annotationIds.length === 0) {
        setActiveEditedNodeId(null);
      }
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
    const points = selectAuthoringAnnotationEntries(runtimeState).flatMap(
      (annotationEntry) =>
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
      if (annotationId === null) {
        setActiveEditedNodeId(null);
      }
      annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
      flyToAnnotationById(annotationId);
    },
    [annotationsStore, flyToAnnotationById]
  );

  const requestAnnotationDeleteConfirmation = useCallback(
    (
      annotations: readonly StoredAnnotation[],
      options?: AnnotationDeleteRequestOptions
    ) => {
      if (annotations.length === 0) {
        return Promise.resolve(false);
      }

      if (options?.skipConfirmation) {
        return Promise.resolve(true);
      }

      const requester =
        confirmAnnotationDelete ?? requestDefaultAnnotationDeleteConfirmation;

      return Promise.resolve(
        requester({
          annotations,
          source:
            options?.source ??
            ANNOTATION_DELETE_CONFIRMATION_SOURCES.PROGRAMMATIC,
        })
      ).catch((error) => {
        console.error("[Annotations] Delete confirmation failed", error);
        return false;
      });
    },
    [confirmAnnotationDelete]
  );
  const hasOpenActiveToolDraft = useCallback(() => {
    const activeToolType = annotationsStore.getState().annotationToolType;
    return annotationToolDraftStore.get(activeToolType).coordinates.length > 0;
  }, [annotationToolDraftStore, annotationsStore]);

  const removeAnnotationEntriesByIds = useCallback(
    (
      annotationIds: readonly string[],
      options?: AnnotationDeleteRequestOptions
    ) => {
      const requestedAnnotationIds = Array.from(new Set(annotationIds));
      if (requestedAnnotationIds.length === 0) {
        return;
      }

      if (hasOpenActiveToolDraft()) {
        return;
      }

      const runtimeState = annotationsStore.getState();
      const targetAnnotations = requestedAnnotationIds
        .map((annotationId) =>
          findAnnotationEntryById(runtimeState.annotationEntries, annotationId)
        )
        .filter(
          (annotation): annotation is StoredAnnotation =>
            annotation !== null && !annotation.locked && !annotation.readOnly
        );

      if (targetAnnotations.length === 0) {
        return;
      }

      void requestAnnotationDeleteConfirmation(targetAnnotations, options).then(
        (confirmed) => {
          if (!confirmed) {
            return;
          }

          const currentState = annotationsStore.getState();
          const removableAnnotationIds = targetAnnotations
            .map((annotation) =>
              findAnnotationEntryById(
                currentState.annotationEntries,
                annotation.id
              )
            )
            .filter(
              (annotation): annotation is StoredAnnotation =>
                annotation !== null &&
                !annotation.locked &&
                !annotation.readOnly
            )
            .map((annotation) => annotation.id);

          if (removableAnnotationIds.length === 0) {
            return;
          }

          annotationsStore.dispatch(
            removeAnnotationsByIds({
              annotationIds: removableAnnotationIds,
            })
          );
        }
      );
    },
    [
      annotationsStore,
      hasOpenActiveToolDraft,
      requestAnnotationDeleteConfirmation,
    ]
  );

  const removeAnnotationEntryById = useCallback(
    (annotationId: string, options?: AnnotationDeleteRequestOptions) => {
      const targetEntry = findAnnotationEntryById(
        annotationsStore.getState().annotationEntries,
        annotationId
      );
      if (!targetEntry || targetEntry.locked || targetEntry.readOnly) {
        return;
      }

      removeAnnotationEntriesByIds([annotationId], options);
    },
    [annotationsStore, removeAnnotationEntriesByIds]
  );

  const removeSelectedAnnotationEntries = useCallback(
    (options?: AnnotationDeleteRequestOptions) => {
      const runtimeState = annotationsStore.getState();
      const removableAnnotationIds =
        resolveRemovableSelectedAnnotationIds(runtimeState);
      if (removableAnnotationIds.length === 0) {
        return;
      }

      removeAnnotationEntriesByIds(removableAnnotationIds, options);
    },
    [annotationsStore, removeAnnotationEntriesByIds]
  );

  const removeEditedNode = useCallback(() => {
    if (!activeEditedNodeId) {
      return false;
    }

    const runtimeState = annotationsStore.getState();
    const candidateAnnotations = runtimeState.annotationEntries.filter(
      (annotation) =>
        !annotation.locked &&
        !annotation.readOnly &&
        annotation.nodeIds.includes(activeEditedNodeId) &&
        resolveMinimumNodeCountForAnnotation(annotation) !== null
    );
    if (candidateAnnotations.length === 0) {
      return false;
    }

    const selectedAnnotationIds =
      runtimeState.selectionState.selectedAnnotationIds;
    const targetAnnotation =
      [...selectedAnnotationIds]
        .reverse()
        .map(
          (selectedAnnotationId) =>
            candidateAnnotations.find(
              (annotation) => annotation.id === selectedAnnotationId
            ) ?? null
        )
        .find((annotation): annotation is StoredAnnotation =>
          Boolean(annotation)
        ) ??
      candidateAnnotations[0] ??
      null;
    if (!targetAnnotation) {
      return false;
    }

    const remainingNodeIds = targetAnnotation.nodeIds.filter(
      (nodeId) => nodeId !== activeEditedNodeId
    );
    const minimumNodeCount =
      resolveMinimumNodeCountForAnnotation(targetAnnotation);
    if (minimumNodeCount === null) {
      return false;
    }

    if (remainingNodeIds.length >= minimumNodeCount) {
      annotationsStore.dispatch(
        removeNodeFromAnnotation({
          annotationId: targetAnnotation.id,
          nodeId: activeEditedNodeId,
        })
      );
      setActiveEditedNodeId(null);
      return true;
    }

    const draftNodeIds = resolveDraftNodeIdsAfterEditedNodeRemoval({
      nodeIds: targetAnnotation.nodeIds,
      editedNodeId: activeEditedNodeId,
      closed: targetAnnotation.closed === true,
    });
    if (draftNodeIds.length !== remainingNodeIds.length) {
      return false;
    }

    const nodeById = new Map(
      runtimeState.nodes.map((node) => [node.id, node] as const)
    );
    const draftNodes = draftNodeIds
      .map((nodeId) => nodeById.get(nodeId) ?? null)
      .filter((node): node is NonNullable<typeof node> => Boolean(node));
    if (draftNodes.length !== draftNodeIds.length) {
      return false;
    }

    // Removing this node drops the measurement below its minimum node count, so
    // it deletes the whole measurement — confirm first (matches the "nach
    // Rückfrage" help and the other delete paths). The node-edit keyboard handler
    // is already "handled" (true); the actual removal runs once confirmed.
    void requestAnnotationDeleteConfirmation([targetAnnotation], {
      source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.KEYBOARD,
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      // Keep the degraded measurement's draft so it can be restored, but stay in
      // Select mode — restoring must not switch to the authoring tool.
      annotationToolDraftStore.set(targetAnnotation.toolType, {
        coordinates: draftNodes.map((node) => node.coordinate),
        linkedNodeGroupIds: draftNodeIds.map((nodeId) =>
          resolveNodeLinkIdForNodeId(runtimeState.linkedNodeGroups, nodeId)
        ),
        feedback: null,
      });
      annotationsStore.dispatch(
        removeAnnotationsByIds({
          annotationIds: [targetAnnotation.id],
          nextSelectedAnnotationId: null,
        })
      );
      setActiveEditedNodeId(null);
    });
    return true;
  }, [
    activeEditedNodeId,
    annotationToolDraftStore,
    annotationsStore,
    requestAnnotationDeleteConfirmation,
  ]);

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

  const buildAllAnnotationsGeoJson =
    useCallback((): AnnotationsRuntimeGeoJsonFeatureCollection => {
      return buildAnnotationsRuntimeGeoJsonFeatureCollection(
        buildAnnotationsRuntimePersistenceState(annotationsStore.getState())
      );
    }, [annotationsStore]);

  const exportAllAnnotationsGeoJson = useCallback(() => {
    downloadAnnotationGeoJsonFile(
      "annotations.geojson",
      buildAllAnnotationsGeoJson()
    );
  }, [buildAllAnnotationsGeoJson]);

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
      if (!targetEntry || targetEntry.readOnly) {
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
        targetEntry.nodeIds.includes(activeEditedNodeId ?? "")
      ) {
        setActiveEditedNodeId(null);
      }
    },
    [activeEditedNodeId, annotationsStore]
  );

  const selectAllAnnotationEntries = useCallback(() => {
    const runtimeState = annotationsStore.getState();
    annotationsStore.dispatch(
      setSelectedAnnotationIds(selectAllAnnotationIds(runtimeState))
    );
  }, [annotationsStore]);

  const updateAnnotationDisplayName = useCallback(
    (annotationId: string, displayName: string) => {
      const targetEntry = findAnnotationEntryById(
        annotationsStore.getState().annotationEntries,
        annotationId
      );
      if (!targetEntry || targetEntry.locked || targetEntry.readOnly) {
        return;
      }

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
      const targetEntry = findAnnotationEntryById(
        annotationsStore.getState().annotationEntries,
        annotationId
      );
      if (!targetEntry || targetEntry.locked || targetEntry.readOnly) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          shortLabel: shortLabel.trim(),
          shortLabelSource: ANNOTATION_SHORT_LABEL_SOURCES.CUSTOM,
        })
      );
    },
    [annotationsStore]
  );

  const toggleAnnotationElevationDisplayMode = useCallback(
    (
      annotationId: string,
      currentElevationDisplayMode?: NonNullable<
        StoredAnnotation["elevationDisplayMode"]
      >
    ) => {
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
            currentElevationDisplayMode ?? targetEntry.elevationDisplayMode
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

      const matchingPlugins =
        registry.getPluginsByAnnotationType(annotationType);
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
        const resolvedShortLabel = resolvedOptions?.shortLabel?.trim();
        resolvedOptions = {
          ...resolvedOptions,
          shortLabel:
            resolvedShortLabel ||
            formatMeasurementShortLabelToken(toolType, nextShortLabelCounter),
          shortLabelSource: resolvedShortLabel
            ? resolvedOptions?.shortLabelSource ??
              ANNOTATION_SHORT_LABEL_SOURCES.CUSTOM
            : ANNOTATION_SHORT_LABEL_SOURCES.DEFAULT,
          shortLabelCounter: resolvedShortLabel
            ? resolvedOptions?.shortLabelCounter
            : nextShortLabelCounter,
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

  const appendAnnotationsRuntimePersistenceState = useCallback(
    (
      persistenceState: AnnotationsRuntimePersistenceEnvelope,
      options: AppendAnnotationsRuntimePersistenceStateOptions = {}
    ): readonly string[] => {
      const mapId = (id: string) =>
        options.idPrefix ? `${options.idPrefix}:${id}` : id;
      const existingAnnotationIds = new Set(
        annotationsStore.getState().annotationEntries.map(({ id }) => id)
      );
      const appendedAnnotationIds: string[] = [];

      for (const annotationEntry of persistenceState.tables.annotationEntries) {
        const nextAnnotationId = mapId(annotationEntry.id);
        if (
          options.skipExisting &&
          existingAnnotationIds.has(nextAnnotationId)
        ) {
          if (
            options.annotationRole !== undefined ||
            options.readOnly !== undefined
          ) {
            annotationsStore.dispatch(
              updateAnnotationEntryById({
                annotationId: nextAnnotationId,
                annotationRole: options.annotationRole,
                readOnly: options.readOnly,
              })
            );
          }
          continue;
        }

        const sourceNodeIds = new Set(annotationEntry.nodeIds);
        const sourceEdgeIds = new Set(annotationEntry.edgeIds);
        const nodes = persistenceState.tables.nodes
          .filter((node) => sourceNodeIds.has(node.id))
          .map((node) => ({
            ...node,
            id: mapId(node.id),
          }));
        const edges = persistenceState.tables.edges
          .filter((edge) => sourceEdgeIds.has(edge.id))
          .map((edge) => ({
            ...edge,
            id: mapId(edge.id),
            startNodeId: mapId(edge.startNodeId),
            endNodeId: mapId(edge.endNodeId),
          }));
        const linkedNodeGroups = persistenceState.tables.linkedNodeGroups
          .filter((nodeLink) =>
            nodeLink.nodeIds.some((nodeId) => sourceNodeIds.has(nodeId))
          )
          .map((nodeLink) => ({
            ...nodeLink,
            id: mapId(nodeLink.id),
            nodeIds: nodeLink.nodeIds
              .filter((nodeId) => sourceNodeIds.has(nodeId))
              .map(mapId),
          }));

        annotationsStore.dispatch(
          appendAnnotationEntities({
            annotationEntry: {
              ...annotationEntry,
              id: nextAnnotationId,
              nodeIds: annotationEntry.nodeIds.map(mapId),
              edgeIds: annotationEntry.edgeIds.map(mapId),
              annotationRole:
                options.annotationRole ?? annotationEntry.annotationRole,
              readOnly: options.readOnly ?? annotationEntry.readOnly,
              externalCollection:
                options.externalCollection ??
                annotationEntry.externalCollection,
            },
            nodes,
            linkedNodeGroups,
            edges,
            selectAnnotationId: options.selectAnnotationId,
          })
        );
        existingAnnotationIds.add(nextAnnotationId);
        appendedAnnotationIds.push(nextAnnotationId);
      }

      return appendedAnnotationIds;
    },
    [annotationsStore]
  );

  const removeExternalAnnotationsByCollection = useCallback(
    (
      externalCollection: NonNullable<StoredAnnotation["externalCollection"]>
    ): readonly string[] => {
      const annotationIds = annotationsStore
        .getState()
        .annotationEntries.filter(
          (annotationEntry) =>
            annotationEntry.externalCollection?.type ===
              externalCollection.type &&
            annotationEntry.externalCollection.id === externalCollection.id
        )
        .map((annotationEntry) => annotationEntry.id);

      if (annotationIds.length === 0) {
        return [];
      }

      annotationsStore.dispatch(
        removeAnnotationsByIds({
          annotationIds,
          nextSelectedAnnotationId: null,
        })
      );
      return annotationIds;
    },
    [annotationsStore]
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
      annotationToolDraftStore,
      annotationsStore,
      formatOptions,
      activePointQueryPickResult,
      activeEditedNodeId,
      addAnnotation,
      appendAnnotationsRuntimePersistenceState,
      removeExternalAnnotationsByCollection,
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
      activePointQueryPickResult,
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
      removeAnnotationEntryById,
      removeAnnotationEntriesByIds,
      removeExternalAnnotationsByCollection,
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
      removeSelectedAnnotations: removeSelectedAnnotationEntries,
      removeEditedNode,
      addAnnotation,
      bindPreviewSnapTargetNodeClick,
      activeEditedNodeId,
      getHoveredPointQueryNodeId,
      setHoveredPointQueryNodeId,
      onPointQueryPickResultChange: setActivePointQueryPickResult,
      formatOptions,
      lineLabelOptions,
      bindApi: bindLifecycleHostApi,
      requestLabelText,
    },
    runtimeVisualHost: {
      scene,
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
