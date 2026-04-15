import { useCallback, useEffect, useMemo, useRef } from "react";
import { SceneTransforms, defined } from "@carma-cesium";
import {
  cartesian3FromGeographicCoordinate,
  getLocalUpDirectionAtAnchor,
} from "@carma-mapping/engines/cesium/core";

import {
  buildToolSessions,
  useManagedAnnotationKeyboardShortcuts,
  useModeLifecycle,
  usePointQueryToolRouting,
} from "../interaction/lifecycle";
import {
  createPointQueryIndicatorController,
  type PointQueryIndicatorController,
} from "../interaction/create-point-query-indicator-controller";
import { useSceneCoordinateHandler } from "../interaction/use-scene-coordinate-handler";
import { finalizeTemporaryAnnotations, useAnnotationsSelector } from "../store";
import type {
  AnnotationsStore,
  RuntimeAddAnnotationOptions,
  RuntimeCoordinate,
  RuntimeNodeLinkId,
  RuntimeMeasurement,
} from "../store";
import { ANNOTATION_TOOL_PLUGIN_KINDS } from "../tools";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import type {
  AnnotationToolAuthoringController,
  AnnotationToolDraftStore,
  AnnotationToolRegistry,
  AnnotationToolAuthoringContext,
  PointQueryPickResult,
} from "../tools/annotation-tool-plugin.types";
import type { RuntimeScene } from "../types/runtime-scene.types";
import type { RuntimeToolId } from "../types/runtime-tool.types";
import { ANNOTATIONS_RUNTIME_HOST_DEFAULTS } from "./annotations-runtime-host-defaults";
import {
  type RuntimeLifecycleHostApi,
  NOOP_RUNTIME_LIFECYCLE_HOST_API,
} from "./runtime-lifecycle-host-api";

type RuntimeAuthoringHostProps = {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  annotationToolDraftStore: AnnotationToolDraftStore;
  setActiveToolTypeInStore: (toolType: RuntimeToolId) => void;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions,
    linkedNodeGroupIds?: readonly (RuntimeNodeLinkId | null | undefined)[]
  ) => RuntimeMeasurement;
  setCursorOverlayEnabled: (enabled: boolean) => void;
  bindApi: (api: RuntimeLifecycleHostApi) => void;
  bindPreviewSnapTargetNodeClick: (
    handler: (nodeId: string) => boolean
  ) => void | (() => void);
  activeMoveGizmoNodeId: string | null;
  hoveredPointQueryNodeId: string | null;
  onHoveredPointQueryNodeIdChange: (nodeId: string | null) => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions: Partial<PreviewLineLabelVisualOptions>;
};

export const RuntimeAuthoringHost = ({
  scene,
  registry,
  annotationsStore,
  annotationToolDraftStore,
  setActiveToolTypeInStore,
  focusAdjacentAnnotationEntry,
  addAnnotation,
  setCursorOverlayEnabled,
  bindApi,
  bindPreviewSnapTargetNodeClick,
  activeMoveGizmoNodeId,
  hoveredPointQueryNodeId,
  onHoveredPointQueryNodeIdChange,
  formatOptions,
  previewLineLabelVisualOptions,
}: RuntimeAuthoringHostProps) => {
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
  const hoveredPointQueryNode = useMemo(
    () =>
      hoveredPointQueryNodeId
        ? nodes.find((node) => node.id === hoveredPointQueryNodeId) ?? null
        : null,
    [hoveredPointQueryNodeId, nodes]
  );

  const clearScheduledHoverReset = useCallback(() => {
    if (hoverClearTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(hoverClearTimeoutRef.current);
    hoverClearTimeoutRef.current = null;
  }, []);
  const clearHoveredPointQueryNode = useCallback(
    () => onHoveredPointQueryNodeIdChange(null),
    [onHoveredPointQueryNodeIdChange]
  );

  const sessionContext = useMemo(
    () => ({
      getState: annotationsStore.getState,
      dispatch: annotationsStore.dispatch,
      setActiveToolType: setActiveToolTypeInStore,
      drafts: annotationToolDraftStore,
      addAnnotation,
    }),
    [
      addAnnotation,
      annotationToolDraftStore,
      annotationsStore.dispatch,
      annotationsStore.getState,
      setActiveToolTypeInStore,
    ]
  );
  const toolSessions = useMemo(
    () => buildToolSessions(registry, sessionContext),
    [registry, sessionContext]
  );
  const activePlugin = registry.getPlugin(activeToolType) ?? null;
  const primaryInteractionToolId = useMemo(
    () =>
      registry.plugins.find(
        (plugin) => plugin.kind === ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION
      )?.id ?? null,
    [registry.plugins]
  );

  const previousPointTemporaryModeRef = useRef(pointTemporaryMode);
  useEffect(() => {
    const previousPointTemporaryMode = previousPointTemporaryModeRef.current;
    const currentPointTemporaryMode = pointTemporaryMode;
    if (previousPointTemporaryMode && !currentPointTemporaryMode) {
      annotationsStore.dispatch(finalizeTemporaryAnnotations());
    }
    previousPointTemporaryModeRef.current = currentPointTemporaryMode;
  }, [annotationsStore, pointTemporaryMode]);

  const {
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
  } = useModeLifecycle(activeToolType, toolSessions, () => {
    setCursorOverlayEnabled(false);
  });

  const {
    handlePointQueryPointCreated,
    resolvePointQueryCoordinate,
    activeToolSession,
  } = usePointQueryToolRouting({
    scene,
    nodes,
    linkedNodeGroups,
    activeToolType,
    toolSessions,
    getToolPlugin: (toolType) => registry.getPlugin(toolType) ?? null,
    sessionContext,
  });

  useEffect(() => {
    bindApi({
      requestModeChange,
      requestStartMeasurement,
      requestFinishMeasurement,
    });

    return () => {
      bindApi(NOOP_RUNTIME_LIFECYCLE_HOST_API);
    };
  }, [
    bindApi,
    requestFinishMeasurement,
    requestModeChange,
    requestStartMeasurement,
  ]);

  const pointQueryEnabled = Boolean(
    (activeToolSession?.onNodeCreated ||
      activePlugin?.pointQuery?.onPointCreated) &&
      !activeMoveGizmoNodeId
  );
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
      return true;
    },
    [handlePointQueryPointCreated, nodes, pointQueryEnabled]
  );
  useEffect(() => {
    const cleanup =
      bindPreviewSnapTargetNodeClick(handlePreviewSnapTargetNodeClick) ??
      undefined;
    return cleanup;
  }, [bindPreviewSnapTargetNodeClick, handlePreviewSnapTargetNodeClick]);

  useEffect(() => {
    pointQueryIndicatorControllerRef.current?.destroy();
    pointQueryIndicatorControllerRef.current =
      createPointQueryIndicatorController(scene, {
        radius: ANNOTATIONS_RUNTIME_HOST_DEFAULTS.pointQuery.discRadiusMeters,
        showNormalLine: true,
        tangentDiscVisualizerTrailSampleCount:
          ANNOTATIONS_RUNTIME_HOST_DEFAULTS.pointQuery.discSmoothingSampleCount,
        tangentDiscVisualizerSmoothingWindowMs:
          ANNOTATIONS_RUNTIME_HOST_DEFAULTS.pointQuery.discSmoothingWindowMs,
        tangentDiscVisualizerWeightDecayGamma:
          ANNOTATIONS_RUNTIME_HOST_DEFAULTS.pointQuery
            .discSmoothingWeightDecayGamma,
      });

    return () => {
      pointQueryIndicatorControllerRef.current?.destroy();
      pointQueryIndicatorControllerRef.current = null;
    };
  }, [scene]);

  useEffect(() => {
    pointQueryIndicatorControllerRef.current?.setEnabled(pointQueryEnabled);
  }, [pointQueryEnabled]);

  useEffect(() => {
    activeAuthoringControllerRef.current?.destroy();
    const nextAuthoringController =
      activePlugin?.authoringVisuals?.createController({
        scene,
        annotationsStore,
        drafts: annotationToolDraftStore,
        requestRender: () => {
          if (scene && !scene.isDestroyed()) {
            scene.requestRender();
          }
        },
        formatOptions,
        previewLineLabelVisualOptions,
      } satisfies AnnotationToolAuthoringContext) ?? null;
    activeAuthoringControllerRef.current = nextAuthoringController;
    nextAuthoringController?.setEnabled(pointQueryEnabled);
    nextAuthoringController?.setPointQueryPickResult(
      pointQueryEnabled ? latestPointQueryPickResultRef.current : null
    );

    return () => {
      activeAuthoringControllerRef.current?.destroy();
      activeAuthoringControllerRef.current = null;
    };
  }, [
    activePlugin,
    annotationsStore,
    annotationToolDraftStore,
    formatOptions,
    pointQueryEnabled,
    previewLineLabelVisualOptions,
    scene,
  ]);

  useEffect(() => {
    activeAuthoringControllerRef.current?.setEnabled(pointQueryEnabled);
    if (!pointQueryEnabled) {
      activeAuthoringControllerRef.current?.setPointQueryPickResult(null);
    }
  }, [pointQueryEnabled]);

  useEffect(() => {
    if (pointQueryEnabled) {
      return;
    }

    clearHoveredPointQueryNode();
  }, [clearHoveredPointQueryNode, pointQueryEnabled]);

  const resolvePointQueryPickResult = useCallback(
    ({
      coordinate,
      screenPosition,
      pointECEF,
      surfaceNormalECEF,
    }: {
      coordinate: RuntimeCoordinate;
      screenPosition: { x: number; y: number };
      pointECEF: PointQueryPickResult["pointECEF"];
      surfaceNormalECEF: PointQueryPickResult["surfaceNormalECEF"];
    }): PointQueryPickResult => {
      const resolvedHoverCoordinate =
        hoveredPointQueryNode?.coordinate ??
        resolvePointQueryCoordinate(coordinate, screenPosition);
      const resolvedHoverPointECEF =
        hoveredPointQueryNode !== null
          ? cartesian3FromGeographicCoordinate(resolvedHoverCoordinate)
          : pointECEF;
      const resolvedHoverSurfaceNormalECEF =
        hoveredPointQueryNode !== null && resolvedHoverPointECEF
          ? getLocalUpDirectionAtAnchor(resolvedHoverPointECEF)
          : surfaceNormalECEF;
      const resolvedHoverScreenPosition =
        hoveredPointQueryNode !== null &&
        scene &&
        !scene.isDestroyed() &&
        resolvedHoverPointECEF
          ? SceneTransforms.worldToWindowCoordinates(
              scene,
              resolvedHoverPointECEF
            )
          : undefined;

      return {
        coordinate: resolvedHoverCoordinate,
        screenPosition:
          hoveredPointQueryNode !== null && defined(resolvedHoverScreenPosition)
            ? {
                x: resolvedHoverScreenPosition.x,
                y: resolvedHoverScreenPosition.y,
              }
            : screenPosition,
        pointECEF: resolvedHoverPointECEF ?? pointECEF,
        surfaceNormalECEF: resolvedHoverSurfaceNormalECEF,
      };
    },
    [hoveredPointQueryNode, resolvePointQueryCoordinate, scene]
  );

  useSceneCoordinateHandler(scene, {
    enabled: pointQueryEnabled,
    onCoordinate: handlePointQueryPointCreated,
    onLineFinish: activeToolSession?.finishesOnLoopClosure
      ? () => {
          requestFinishMeasurement();
        }
      : undefined,
    onScreenPositionChange: (screenPosition) => {
      setCursorOverlayEnabled(pointQueryEnabled && screenPosition !== null);
    },
    onHoverSampleChange: ({
      coordinate,
      screenPosition,
      pointECEF,
      surfaceNormalECEF,
    }) => {
      if (!pointQueryEnabled || !pointECEF || !coordinate) {
        clearScheduledHoverReset();
        hoverClearTimeoutRef.current = window.setTimeout(() => {
          hoverClearTimeoutRef.current = null;
          latestPointQueryPickResultRef.current = null;
          activeAuthoringControllerRef.current?.setPointQueryPickResult(null);
          pointQueryIndicatorControllerRef.current?.clearPreview();
        }, ANNOTATIONS_RUNTIME_HOST_DEFAULTS.hoverClearDelayMs);
        return;
      }

      clearScheduledHoverReset();
      latestPointQueryPickResultRef.current = resolvePointQueryPickResult({
        coordinate,
        screenPosition,
        pointECEF,
        surfaceNormalECEF,
      });
      pointQueryIndicatorControllerRef.current?.setPreview({
        pointECEF: latestPointQueryPickResultRef.current.pointECEF,
        surfaceNormalECEF:
          latestPointQueryPickResultRef.current.surfaceNormalECEF,
        lockToPreviewPoint: hoveredPointQueryNode !== null,
      });
      activeAuthoringControllerRef.current?.setPointQueryPickResult(
        latestPointQueryPickResultRef.current
      );
    },
  });

  useEffect(() => {
    if (pointQueryEnabled) {
      return;
    }

    clearScheduledHoverReset();
    setCursorOverlayEnabled(false);
    latestPointQueryPickResultRef.current = null;
    activeAuthoringControllerRef.current?.setPointQueryPickResult(null);
    activeAuthoringControllerRef.current?.setEnabled(false);
    pointQueryIndicatorControllerRef.current?.clearPreview();
  }, [clearScheduledHoverReset, pointQueryEnabled, setCursorOverlayEnabled]);

  useEffect(
    () => () => {
      clearScheduledHoverReset();
    },
    [clearScheduledHoverReset]
  );

  useManagedAnnotationKeyboardShortcuts({
    activePlugin,
    activeToolSession,
    activeToolType,
    focusAdjacentAnnotationEntry,
    primaryInteractionToolId,
    requestFinishMeasurement,
    requestModeChange,
    requestStartMeasurement,
    sessionContext,
    setActiveToolTypeInStore,
    setCursorOverlayEnabled,
  });

  return null;
};
