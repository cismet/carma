import { useCallback, useEffect, useMemo, useRef } from "react";
import { SceneTransforms, defined } from "@carma-cesium";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import { useLabelOverlay } from "@carma-providers/label-overlay";
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
import { areCoordinatesEqual } from "../utils/coordinate-equality";
import { useAnnotationsSelector } from "../store";
import type {
  AnnotationsStore,
  AddAnnotationOptions,
  CesiumGeographicCoordinate,
  AnnotationNodeLinkId,
  StoredAnnotation,
} from "../store";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PartialAnnotationLineLabelOptions } from "../config/annotation-line-label-options";
import type { AnnotationLabelTextRequester } from "./use-annotation-label-text-request";
import {
  ANNOTATION_TOOL_PLUGIN_KINDS,
  type AnnotationToolAuthoringController,
  type AnnotationToolAuthoringContext,
  type AnnotationToolDraftStore,
  type AnnotationToolRegistry,
  type PointQueryPickResult,
} from "../registry";
import type { Scene } from "@carma-cesium";
import { ANNOTATIONS_HOST_DEFAULTS } from "./annotations-host-defaults";
import {
  type RuntimeLifecycleHostApi,
  NOOP_RUNTIME_LIFECYCLE_HOST_API,
} from "./lifecycle-host-api";

const { POINT: ANNOTATION_TYPE_POINT } = ANNOTATION_TYPES;
const POINT_QUERY_REJECTED_SAMPLE_COLOR_CSS = "#ef4444";

type RuntimeAuthoringHostProps = {
  scene: Scene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  annotationToolDraftStore: AnnotationToolDraftStore;
  setActiveToolTypeInStore: (toolType: AnnotationToolId) => void;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  addAnnotation: (
    toolType: StoredAnnotation["toolType"],
    coordinates: readonly CesiumGeographicCoordinate[],
    options?: AddAnnotationOptions,
    linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[],
    sourceToolId?: AnnotationToolId
  ) => StoredAnnotation;
  bindApi: (api: RuntimeLifecycleHostApi) => void;
  bindPreviewSnapTargetNodeClick: (
    handler: (nodeId: string) => boolean
  ) => void | (() => void);
  activeMoveGizmoNodeId: string | null;
  getHoveredPointQueryNodeId: () => string | null;
  setHoveredPointQueryNodeId: (nodeId: string | null) => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
  lineLabelOptions: PartialAnnotationLineLabelOptions;
  requestLabelText?: AnnotationLabelTextRequester;
};

export const RuntimeAuthoringHost = ({
  scene,
  registry,
  annotationsStore,
  annotationToolDraftStore,
  setActiveToolTypeInStore,
  focusAdjacentAnnotationEntry,
  addAnnotation,
  bindApi,
  bindPreviewSnapTargetNodeClick,
  activeMoveGizmoNodeId,
  getHoveredPointQueryNodeId,
  setHoveredPointQueryNodeId,
  formatOptions,
  lineLabelOptions,
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
  const clearHoveredPointQueryNode = useCallback(
    () => setHoveredPointQueryNodeId(null),
    [setHoveredPointQueryNodeId]
  );
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
      const pointDraft = annotationToolDraftStore.get(ANNOTATION_TYPE_POINT);
      if (pointDraft.coordinates.length > 0) {
        pointDraft.coordinates.forEach((coordinate, index) => {
          addAnnotation(
            ANNOTATION_TYPE_POINT,
            [coordinate],
            undefined,
            [pointDraft.linkedNodeGroupIds[index] ?? null],
            ANNOTATION_TYPE_POINT
          );
        });
        annotationToolDraftStore.clear(ANNOTATION_TYPE_POINT);
      }
    }
    previousPointTemporaryModeRef.current = currentPointTemporaryMode;
  }, [addAnnotation, annotationToolDraftStore, pointTemporaryMode]);

  const { requestModeChange, requestActivateTool, requestFinishMeasurement } =
    useModeLifecycle(activeToolType, toolSessions, clearHoveredPointQueryNode);

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
      requestActivateTool,
      requestFinishMeasurement,
    });

    return () => {
      bindApi(NOOP_RUNTIME_LIFECYCLE_HOST_API);
    };
  }, [
    bindApi,
    requestFinishMeasurement,
    requestModeChange,
    requestActivateTool,
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
    const nextPointQueryIndicatorController =
      createPointQueryIndicatorController(scene, {
        radius: ANNOTATIONS_HOST_DEFAULTS.pointQuery.discRadiusMeters,
        showNormalLine: true,
        tangentDiscVisualizerTrailSampleCount:
          ANNOTATIONS_HOST_DEFAULTS.pointQuery.discSmoothingSampleCount,
        tangentDiscVisualizerSmoothingWindowMs:
          ANNOTATIONS_HOST_DEFAULTS.pointQuery.discSmoothingWindowMs,
        tangentDiscVisualizerWeightDecayGamma:
          ANNOTATIONS_HOST_DEFAULTS.pointQuery.discSmoothingWeightDecayGamma,
      });
    pointQueryIndicatorControllerRef.current =
      nextPointQueryIndicatorController;
    nextPointQueryIndicatorController?.setEnabled(pointQueryEnabled);
    if (pointQueryEnabled && latestPointQueryPickResultRef.current) {
      nextPointQueryIndicatorController?.setPreview({
        pointECEF: latestPointQueryPickResultRef.current.pointECEF,
        surfaceNormalECEF:
          latestPointQueryPickResultRef.current.surfaceNormalECEF,
        lockToPreviewPoint: resolveHoveredPointQueryNode() !== null,
      });
    } else {
      nextPointQueryIndicatorController?.clearPreview();
    }

    return () => {
      pointQueryIndicatorControllerRef.current?.destroy();
      pointQueryIndicatorControllerRef.current = null;
    };
  }, [pointQueryEnabled, resolveHoveredPointQueryNode, scene]);

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
        labelOverlay,
        requestRender: () => {
          if (scene && !scene.isDestroyed()) {
            scene.requestRender();
          }
        },
        formatOptions,
        lineLabelOptions,
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
    labelOverlay,
    pointQueryEnabled,
    lineLabelOptions,
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
      coordinate: CesiumGeographicCoordinate;
      screenPosition: { x: number; y: number };
      pointECEF: PointQueryPickResult["pointECEF"];
      surfaceNormalECEF: PointQueryPickResult["surfaceNormalECEF"];
    }): PointQueryPickResult => {
      const hoveredPointQueryNode = resolveHoveredPointQueryNode();
      const resolvedHoverCoordinate =
        hoveredPointQueryNode?.coordinate ??
        resolvePointQueryCoordinate(coordinate, screenPosition);
      const isHoverLockedToSnapPoint =
        hoveredPointQueryNode !== null ||
        !areCoordinatesEqual(resolvedHoverCoordinate, coordinate);
      const resolvedHoverPointECEF =
        isHoverLockedToSnapPoint
          ? cartesian3FromGeographicCoordinate(resolvedHoverCoordinate)
          : pointECEF;
      const resolvedHoverSurfaceNormalECEF =
        isHoverLockedToSnapPoint && resolvedHoverPointECEF
          ? getLocalUpDirectionAtAnchor(resolvedHoverPointECEF)
          : surfaceNormalECEF;
      const resolvedHoverScreenPosition =
        isHoverLockedToSnapPoint &&
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
          isHoverLockedToSnapPoint && defined(resolvedHoverScreenPosition)
            ? {
                x: resolvedHoverScreenPosition.x,
                y: resolvedHoverScreenPosition.y,
              }
            : screenPosition,
        pointECEF: resolvedHoverPointECEF ?? pointECEF,
        surfaceNormalECEF: resolvedHoverSurfaceNormalECEF,
      };
    },
    [resolveHoveredPointQueryNode, resolvePointQueryCoordinate, scene]
  );

  useSceneCoordinateHandler(scene, {
    enabled: pointQueryEnabled,
    onCoordinate: handlePointQueryPointCreated,
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
    }) => {
      if (!pointQueryEnabled || !pointECEF || !coordinate) {
        clearScheduledHoverReset();
        hoverClearTimeoutRef.current = window.setTimeout(() => {
          hoverClearTimeoutRef.current = null;
          latestPointQueryPickResultRef.current = null;
          activeAuthoringControllerRef.current?.setPointQueryPickResult(null);
          pointQueryIndicatorControllerRef.current?.setVisualStyle(null);
          pointQueryIndicatorControllerRef.current?.clearPreview();
        }, ANNOTATIONS_HOST_DEFAULTS.hoverClearDelayMs);
        return;
      }

      clearScheduledHoverReset();
      latestPointQueryPickResultRef.current = resolvePointQueryPickResult({
        coordinate,
        screenPosition,
        pointECEF,
        surfaceNormalECEF,
      });
      const hoveredPointQueryNode = resolveHoveredPointQueryNode();
      const isHoverLockedToSnapPoint =
        hoveredPointQueryNode !== null ||
        !areCoordinatesEqual(
          latestPointQueryPickResultRef.current.coordinate,
          coordinate
        );
      pointQueryIndicatorControllerRef.current?.setPreview({
        pointECEF: latestPointQueryPickResultRef.current.pointECEF,
        surfaceNormalECEF:
          latestPointQueryPickResultRef.current.surfaceNormalECEF,
        lockToPreviewPoint: isHoverLockedToSnapPoint,
      });
      activeAuthoringControllerRef.current?.setPointQueryPickResult(
        latestPointQueryPickResultRef.current
      );
      const isPointQueryPickResultAcceptable =
        activeAuthoringControllerRef.current?.isPointQueryPickResultAcceptable?.() ??
        true;
      pointQueryIndicatorControllerRef.current?.setVisualStyle(
        isPointQueryPickResultAcceptable
          ? null
          : { color: POINT_QUERY_REJECTED_SAMPLE_COLOR_CSS }
      );
    },
  });

  useEffect(() => {
    if (pointQueryEnabled) {
      return;
    }

    clearScheduledHoverReset();
    latestPointQueryPickResultRef.current = null;
    activeAuthoringControllerRef.current?.setPointQueryPickResult(null);
    activeAuthoringControllerRef.current?.setEnabled(false);
    pointQueryIndicatorControllerRef.current?.setVisualStyle(null);
    pointQueryIndicatorControllerRef.current?.clearPreview();
  }, [clearScheduledHoverReset, pointQueryEnabled]);

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
    requestActivateTool,
    sessionContext,
    setActiveToolTypeInStore,
  });

  return null;
};
