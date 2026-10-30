import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLabelOverlay } from "@carma-providers/label-overlay";

import {
  buildToolSessions,
  useManagedAnnotationKeyboardShortcuts,
  useModeLifecycle,
  usePointQueryToolRouting,
} from "../interaction/lifecycle";
import type { PointQueryIndicatorController } from "../interaction/create-point-query-indicator-controller";
import { useSceneCoordinateHandler } from "../interaction/use-scene-coordinate-handler";
import {
  resolveAnnotationCancelToolId,
  resolvePrimaryAnnotationInteractionToolId,
} from "../utils/annotation-tool-collections";
import { useAnnotationsSelector } from "../store";
import type {
  AnnotationsStore,
  AnnotationGeographicCoordinate,
} from "../store";
import type {
  AnnotationToolId,
  AnnotationEngine,
  AnnotationEnginePointQueryInputModifier,
} from "@carma-mapping/annotations/core";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import type { AnnotationReferenceObjectSizingOptions } from "../config/annotation-reference-object-sizing";
import type { AnnotationLabelTextRequester } from "./use-annotation-label-text-request";
import type { AnnotationDeleteRequestOptions } from "./annotation-delete-confirmation";
import type {
  AnnotationToolAuthoringController,
  AnnotationToolDraftStore,
  AnnotationToolRegistry,
  PointQueryPickResult,
} from "../registry";
import { ANNOTATIONS_HOST_DEFAULTS } from "./annotations-host-defaults";
import { resolveSnappedPointQueryPickResult } from "./resolve-point-query-pick-result";
import type { AddAnnotation } from "./use-annotation-add";
import { usePointTemporaryModeCommit } from "./use-point-temporary-mode-commit";
import { useRequestPointAt } from "./use-request-point-at";
import {
  useActiveAuthoringController,
  usePointQueryIndicator,
} from "./use-point-query-visuals";
import {
  type RuntimeLifecycleHostApi,
  NOOP_RUNTIME_LIFECYCLE_HOST_API,
} from "./lifecycle-host-api";
import { RUNTIME_AUTHORING_REJECTED_SAMPLE_COLOR_CSS } from "../config/runtime-authoring-colors";

const CURRENT_FRAME_UPDATE_OPTIONS = { requestRender: false } as const;

type RuntimeAuthoringHostProps = {
  engine: AnnotationEngine | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  annotationToolDraftStore: AnnotationToolDraftStore;
  setActiveToolTypeInStore: (toolType: AnnotationToolId) => void;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  removeSelectedAnnotations: (options?: AnnotationDeleteRequestOptions) => void;
  removeEditedNode: () => boolean;
  addAnnotation: AddAnnotation;
  bindApi: (api: RuntimeLifecycleHostApi) => void;
  bindPreviewSnapTargetNodeClick: (
    handler: (nodeId: string) => boolean
  ) => void | (() => void);
  activeEditedNodeId: string | null;
  getHoveredPointQueryNodeId: () => string | null;
  setHoveredPointQueryNodeId: (nodeId: string | null) => void;
  onPointQueryPickResultChange: (
    pickResult: PointQueryPickResult | null
  ) => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
  lineLabelOptions: PartialAnnotationLineLabelOptions;
  referenceObjectSizing: AnnotationReferenceObjectSizingOptions;
  requestLabelText?: AnnotationLabelTextRequester;
};

export const RuntimeAuthoringHost = ({
  engine,
  registry,
  annotationsStore,
  annotationToolDraftStore,
  setActiveToolTypeInStore,
  focusAdjacentAnnotationEntry,
  removeSelectedAnnotations,
  removeEditedNode,
  addAnnotation,
  bindApi,
  bindPreviewSnapTargetNodeClick,
  activeEditedNodeId,
  getHoveredPointQueryNodeId,
  setHoveredPointQueryNodeId,
  onPointQueryPickResultChange,
  formatOptions,
  lineLabelOptions,
  referenceObjectSizing,
  requestLabelText,
}: RuntimeAuthoringHostProps) => {
  const labelOverlay = useLabelOverlay();
  const activeToolType = useAnnotationsSelector(
    (state) => state.annotationToolType
  );
  const nodes = useAnnotationsSelector(
    (annotationsState) => annotationsState.nodes
  );
  const linkedNodeGroups = useAnnotationsSelector(
    (annotationsState) => annotationsState.linkedNodeGroups
  );
  const pointTemporaryMode = useAnnotationsSelector(
    (annotationsState) => annotationsState.settingsState.pointTemporaryMode
  );
  const hoverClearTimeoutRef = useRef<number | null>(null);
  const activeAuthoringControllerRef =
    useRef<AnnotationToolAuthoringController | null>(null);
  const pointQueryIndicatorControllerRef =
    useRef<PointQueryIndicatorController | null>(null);
  const latestPointQueryPickResultRef = useRef<PointQueryPickResult | null>(
    null
  );
  const setLatestPointQueryPickResult = useCallback(
    (
      pickResult: PointQueryPickResult | null,
      options?: { requestRender?: boolean }
    ) => {
      latestPointQueryPickResultRef.current = pickResult;
      activeAuthoringControllerRef.current?.setPointQueryPickResult(
        pickResult,
        options
      );
      onPointQueryPickResultChange(pickResult);
    },
    [onPointQueryPickResultChange]
  );
  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  );

  const clearScheduledHoverReset = useCallback(() => {
    if (hoverClearTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(hoverClearTimeoutRef.current);
    hoverClearTimeoutRef.current = null;
  }, []);
  const clearPointQueryIndicator = useCallback(() => {
    pointQueryIndicatorControllerRef.current?.setVisualStyle(null);
    pointQueryIndicatorControllerRef.current?.clearPreview();
  }, []);
  const clearHoveredPointQueryNode = useCallback(
    () => setHoveredPointQueryNodeId(null),
    [setHoveredPointQueryNodeId]
  );
  const resetPointQuerySampleState = useCallback(() => {
    clearScheduledHoverReset();
    setLatestPointQueryPickResult(null);
    clearPointQueryIndicator();
    clearHoveredPointQueryNode();
  }, [
    clearHoveredPointQueryNode,
    clearPointQueryIndicator,
    clearScheduledHoverReset,
    setLatestPointQueryPickResult,
  ]);
  const resolveHoveredPointQueryNode = useCallback(() => {
    const hoveredNodeId = getHoveredPointQueryNodeId();
    return hoveredNodeId ? nodeById.get(hoveredNodeId) ?? null : null;
  }, [getHoveredPointQueryNodeId, nodeById]);

  const sessionContext = useMemo(
    () => ({
      getState: annotationsStore.getState,
      dispatch: annotationsStore.dispatch,
      setActiveToolType: setActiveToolTypeInStore,
      drafts: annotationToolDraftStore,
      requestLabelText,
      addAnnotation,
    }),
    [
      addAnnotation,
      annotationToolDraftStore,
      annotationsStore.dispatch,
      annotationsStore.getState,
      requestLabelText,
      setActiveToolTypeInStore,
    ]
  );
  const toolSessions = useMemo(
    () => buildToolSessions(registry, sessionContext),
    [registry, sessionContext]
  );
  const activePlugin = registry.getPlugin(activeToolType) ?? null;
  const primaryInteractionToolId = useMemo(
    () => resolvePrimaryAnnotationInteractionToolId(registry.plugins),
    [registry.plugins]
  );
  const cancelToolId = useMemo(
    () => resolveAnnotationCancelToolId(registry),
    [registry]
  );

  usePointTemporaryModeCommit({
    pointTemporaryMode,
    annotationToolDraftStore,
    addAnnotation,
  });

  const {
    requestModeChange,
    requestActivateTool,
    requestFinishMeasurement: requestRawFinishMeasurement,
  } = useModeLifecycle(
    activeToolType,
    toolSessions,
    resetPointQuerySampleState
  );
  const requestFinishMeasurement = useCallback(() => {
    const didFinish = requestRawFinishMeasurement();
    if (didFinish) {
      resetPointQuerySampleState();
    }
    return didFinish;
  }, [requestRawFinishMeasurement, resetPointQuerySampleState]);

  const {
    handlePointQueryPointCreated,
    resolvePointQueryCoordinate,
    activeToolSession,
  } = usePointQueryToolRouting({
    engine,
    nodes,
    linkedNodeGroups,
    activeToolType,
    toolSessions,
    getToolPlugin: (toolType) => registry.getPlugin(toolType) ?? null,
    sessionContext,
  });
  const handlePointQueryCoordinateCreated = useCallback(
    (
      coordinate: AnnotationGeographicCoordinate,
      screenPosition?: { x: number; y: number },
      options?: { inputModifier?: AnnotationEnginePointQueryInputModifier }
    ) => {
      handlePointQueryPointCreated(coordinate, screenPosition, {
        inputModifier: options?.inputModifier,
      });
      resetPointQuerySampleState();
    },
    [handlePointQueryPointCreated, resetPointQuerySampleState]
  );

  const pointQueryEnabled = Boolean(
    (activeToolSession?.onNodeCreated ||
      activePlugin?.pointQuery?.onPointCreated) &&
      !activeEditedNodeId
  );
  const requestPointAt = useRequestPointAt({
    engine,
    pointQueryEnabled,
    onPointCreated: handlePointQueryCoordinateCreated,
  });

  useEffect(() => {
    bindApi({
      requestModeChange,
      requestActivateTool,
      requestFinishMeasurement,
      requestPointAt,
    });

    return () => {
      bindApi(NOOP_RUNTIME_LIFECYCLE_HOST_API);
    };
  }, [
    bindApi,
    requestFinishMeasurement,
    requestModeChange,
    requestActivateTool,
    requestPointAt,
  ]);

  const pointQueryEnabledRef = useRef(pointQueryEnabled);
  pointQueryEnabledRef.current = pointQueryEnabled;
  const resolveHoveredPointQueryNodeRef = useRef(resolveHoveredPointQueryNode);
  resolveHoveredPointQueryNodeRef.current = resolveHoveredPointQueryNode;
  const handlePreviewSnapTargetNodeClick = useCallback(
    (nodeId: string) => {
      if (!pointQueryEnabled) {
        return false;
      }

      const targetNode = nodes.find((node) => node.id === nodeId) ?? null;
      if (!targetNode) {
        return false;
      }

      handlePointQueryPointCreated(targetNode.coordinate, undefined, {
        forcedSnappedNodeId: nodeId,
      });
      resetPointQuerySampleState();
      return true;
    },
    [
      handlePointQueryPointCreated,
      nodes,
      pointQueryEnabled,
      resetPointQuerySampleState,
    ]
  );
  useEffect(() => {
    const cleanup =
      bindPreviewSnapTargetNodeClick(handlePreviewSnapTargetNodeClick) ??
      undefined;
    return cleanup;
  }, [bindPreviewSnapTargetNodeClick, handlePreviewSnapTargetNodeClick]);

  const pointQueryVisualRefs = {
    indicatorControllerRef: pointQueryIndicatorControllerRef,
    authoringControllerRef: activeAuthoringControllerRef,
    latestPickResultRef: latestPointQueryPickResultRef,
    pointQueryEnabledRef,
  };
  usePointQueryIndicator({
    engine,
    referenceObjectSizing,
    lineLabelOptions,
    pointQueryEnabled,
    refs: pointQueryVisualRefs,
    resolveHoveredPointQueryNodeRef,
  });
  useActiveAuthoringController({
    engine,
    activePlugin,
    context: {
      annotationsStore,
      drafts: annotationToolDraftStore,
      labelOverlay,
      formatOptions,
      lineLabelOptions,
    },
    pointQueryEnabled,
    refs: pointQueryVisualRefs,
  });

  useEffect(() => {
    if (pointQueryEnabled) {
      return;
    }

    clearHoveredPointQueryNode();
  }, [clearHoveredPointQueryNode, pointQueryEnabled]);

  useSceneCoordinateHandler(engine, {
    enabled: pointQueryEnabled,
    inputModifiers: activePlugin?.pointQuery?.inputModifiers,
    onCoordinate: handlePointQueryCoordinateCreated,
    onLineFinish: activeToolSession?.finishesOnLoopClosure
      ? () => {
          requestFinishMeasurement();
        }
      : undefined,
    onHoverSampleChange: ({
      coordinate,
      screenPosition,
      pointECEF,
      surfaceNormalECEF,
      inputModifier,
    }) => {
      if (!pointQueryEnabled || !pointECEF || !coordinate) {
        clearScheduledHoverReset();
        hoverClearTimeoutRef.current = window.setTimeout(() => {
          hoverClearTimeoutRef.current = null;
          setLatestPointQueryPickResult(null);
          clearPointQueryIndicator();
        }, ANNOTATIONS_HOST_DEFAULTS.hoverClearDelayMs);
        return;
      }

      clearScheduledHoverReset();
      const { pickResult, isLockedToSnapPoint } =
        resolveSnappedPointQueryPickResult({
          engine,
          hoveredNode: resolveHoveredPointQueryNode(),
          coordinate,
          screenPosition,
          pointECEF,
          surfaceNormalECEF,
          inputModifier,
          resolvePointQueryCoordinate,
        });
      // The point-query callback runs before the engine renders a frame, so
      // all authoring visuals are applied to the frame already in progress;
      // requesting another frame here would render once more per pointer
      // sample.
      setLatestPointQueryPickResult(pickResult, CURRENT_FRAME_UPDATE_OPTIONS);
      pointQueryIndicatorControllerRef.current?.setPreview(
        {
          pointECEF: pickResult.pointECEF,
          surfaceNormalECEF: pickResult.surfaceNormalECEF,
          lockToPreviewPoint: isLockedToSnapPoint,
        },
        CURRENT_FRAME_UPDATE_OPTIONS
      );
      const isPointQueryPickResultAcceptable =
        activeAuthoringControllerRef.current?.isPointQueryPickResultAcceptable?.() ??
        true;
      const pointQueryVisualStyle =
        activeAuthoringControllerRef.current?.getPointQueryVisualStyle?.();
      pointQueryIndicatorControllerRef.current?.setVisualStyle(
        pointQueryVisualStyle !== undefined
          ? pointQueryVisualStyle
          : isPointQueryPickResultAcceptable
          ? null
          : { color: RUNTIME_AUTHORING_REJECTED_SAMPLE_COLOR_CSS },
        CURRENT_FRAME_UPDATE_OPTIONS
      );
    },
  });

  useEffect(() => {
    if (pointQueryEnabled) {
      return;
    }

    clearScheduledHoverReset();
    setLatestPointQueryPickResult(null);
    activeAuthoringControllerRef.current?.setEnabled(false);
    clearPointQueryIndicator();
  }, [
    clearPointQueryIndicator,
    clearScheduledHoverReset,
    pointQueryEnabled,
    setLatestPointQueryPickResult,
  ]);

  useEffect(
    () => () => {
      clearScheduledHoverReset();
      setLatestPointQueryPickResult(null);
    },
    [clearScheduledHoverReset, setLatestPointQueryPickResult]
  );

  useManagedAnnotationKeyboardShortcuts({
    activePlugin,
    activeToolSession,
    activeToolType,
    cancelToolId,
    clearInteractionState: resetPointQuerySampleState,
    focusAdjacentAnnotationEntry,
    removeEditedNode,
    removeSelectedAnnotations,
    requestFinishMeasurement,
    requestModeChange,
    requestActivateTool,
    sessionContext,
    setActiveToolTypeInStore,
  });

  return null;
};
