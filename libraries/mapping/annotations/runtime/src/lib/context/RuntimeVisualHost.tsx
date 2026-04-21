import { useCallback, useEffect, useMemo } from "react";
import {
  Cartesian3,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
} from "@carma-cesium";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import {
  cartesian3FromGeographicCoordinate,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma-mapping/engines/cesium/core";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type { PreviewLineLabelVisualOptions } from "../config/preview-line-label-visual-defaults";
import { useAnnotationToolDraftStates } from "./use-annotation-tool-draft-states";
import { useCursorOverlay } from "../interaction/use-cursor-overlay";
import { usePointEditingGizmo } from "../interaction/use-point-editing-gizmo";
import {
  type AnnotationsStore,
  findAnnotationEntryById,
  insertNodeIntoMeasurementEdge,
  selectSelectedAnnotationId,
  type StoredAnnotation,
  updateAnnotationEntryById,
  useAnnotationsSelector,
} from "../store";
import { ANNOTATION_TOOL_PLUGIN_KINDS } from "../tools";
import type {
  AnnotationToolDraftStore,
  AnnotationToolRegistry,
} from "../tools/annotation-tool-plugin.types";
import type { Scene } from "@carma-cesium";
import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "../render/measurement-render-models";
import { useMeasurementVisualizers } from "../render/use-measurement-visualizers";
import { useVisualLayers } from "../render/use-visual-layers";
import {
  resolveDistanceTriangleAnchorCoordinateRole,
  resolveDistanceTriangleAnchorCoordinateSelection,
  resolveOppositeDistanceTriangleAnchorCoordinateRole,
} from "../render/distance-triangle-overlay";
import { resolveAnnotationEntryCoordinates } from "../utils/annotation-coordinates";
import { useSelectionAdditiveModifierState } from "./use-selection-additive-modifier-state";
import { useAnnotationSelection } from "./use-annotation-selection";
import { ANNOTATIONS_HOST_DEFAULTS } from "./annotations-host-defaults";
import { resolveSceneSelectionTarget } from "./scene-selection-target";

const {
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
} = ANNOTATION_TYPES;

const isInsertNodeTargetToolType = (toolType: StoredAnnotation["toolType"]) =>
  toolType === ANNOTATION_TYPE_POLYLINE ||
  toolType === ANNOTATION_TYPE_AREA_GROUND ||
  toolType === ANNOTATION_TYPE_AREA_PLANAR ||
  toolType === ANNOTATION_TYPE_AREA_VERTICAL;

type RuntimeVisualHostProps = {
  scene: Scene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  annotationToolDraftStore: AnnotationToolDraftStore;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (annotationId: string) => void;
  onActiveMoveGizmoNodeIdChange: (nodeId: string | null) => void;
  onHoveredPointQueryNodeIdChange: (nodeId: string | null) => void;
  onPreviewSnapTargetNodeClick: (nodeId: string) => boolean;
  activeMoveGizmoNodeId: string | null;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions: Partial<PreviewLineLabelVisualOptions>;
};

const resolveInsertedNodeCoordinate = ({
  toolType,
  startCoordinate,
  endCoordinate,
}: {
  toolType: StoredAnnotation["toolType"];
  startCoordinate: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
  endCoordinate: {
    longitude: number;
    latitude: number;
    altitude: number;
  };
}) => {
  const midpointCoordinate = getDegreesFromCartesian(
    Cartesian3.midpoint(
      cartesian3FromGeographicCoordinate(startCoordinate),
      cartesian3FromGeographicCoordinate(endCoordinate),
      new Cartesian3()
    )
  );

  return {
    longitude: midpointCoordinate.longitude,
    latitude: midpointCoordinate.latitude,
    altitude:
      toolType === ANNOTATION_TYPE_AREA_GROUND
        ? getEllipsoidalAltitudeOrZero(midpointCoordinate.altitude)
        : midpointCoordinate.altitude,
  };
};

export const RuntimeVisualHost = ({
  scene,
  registry,
  annotationsStore,
  annotationToolDraftStore,
  setElevationReferenceAnnotationId,
  toggleAnnotationElevationDisplayMode,
  onActiveMoveGizmoNodeIdChange,
  onHoveredPointQueryNodeIdChange,
  onPreviewSnapTargetNodeClick,
  activeMoveGizmoNodeId,
  formatOptions,
  previewLineLabelVisualOptions,
}: RuntimeVisualHostProps) => {
  const activeToolType = useAnnotationsSelector(
    (annotationsState) => annotationsState.annotationToolType
  );
  const activePlugin = useMemo(
    () => registry.getPlugin(activeToolType) ?? null,
    [activeToolType, registry]
  );
  const isInteractionToolActive =
    activePlugin?.kind === ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION;
  const isMeasurementToolActive =
    activePlugin?.kind === ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT;
  const pointQueryToolActive =
    activeMoveGizmoNodeId === null && isMeasurementToolActive;
  const previewSnapTargetHoverEnabled = pointQueryToolActive;
  const nodes = useAnnotationsSelector(
    (annotationsState) => annotationsState.nodes
  );
  const linkedNodeGroups = useAnnotationsSelector(
    (annotationsState) => annotationsState.linkedNodeGroups
  );
  const edges = useAnnotationsSelector(
    (annotationsState) => annotationsState.edges
  );
  const annotationEntries = useAnnotationsSelector(
    (annotationsState) => annotationsState.annotationEntries
  );
  const selectedAnnotationId = useAnnotationsSelector(
    selectSelectedAnnotationId
  );
  const selectedAnnotationIds = useAnnotationsSelector(
    (annotationsState) => annotationsState.selectionState.selectedAnnotationIds
  );
  const draftToolTypes = useMemo(
    () => registry.plugins.map((plugin) => plugin.id),
    [registry.plugins]
  );
  const draftStatesByToolType = useAnnotationToolDraftStates({
    draftStore: annotationToolDraftStore,
    toolTypes: draftToolTypes,
  });
  const elevationReferenceAnnotationId = useAnnotationsSelector(
    (annotationsState) =>
      annotationsState.settingsState.elevationReferenceAnnotationId
  );
  const isSelectionAdditiveModifierPressed = useSelectionAdditiveModifierState(
    ANNOTATIONS_HOST_DEFAULTS.additiveSelectionModifierKey
  );
  const {
    draftNodeCoordinateOverrides,
    effectiveLinkedNodeGroups,
    effectiveNodes,
    handleNodeLongPress,
    isMoveGizmoDragging,
    handleReferenceNodeClick,
    handleReferenceNodeHover,
    handleReferenceEdgeClick,
  } = usePointEditingGizmo(scene, nodes, linkedNodeGroups, {
    annotationsStore,
    annotationEntries,
    selectedAnnotationIds,
    onActiveMoveGizmoNodeIdChange,
  });
  const handleDistanceTriangleCornerClick = useCallback(
    (measurementId: string) => {
      const runtimeState = annotationsStore.getState();
      const targetEntry = findAnnotationEntryById(
        runtimeState.annotationEntries,
        measurementId
      );
      if (!targetEntry) {
        return;
      }

      const coordinates = resolveAnnotationEntryCoordinates({
        annotationEntries: runtimeState.annotationEntries,
        nodes: runtimeState.nodes,
        annotationId: measurementId,
      });

      const currentTriangleAnchorCoordinateRole =
        targetEntry.distanceTriangleAnchorCoordinateRole ??
        resolveDistanceTriangleAnchorCoordinateRole(coordinates);

      const nextSelection =
        (targetEntry.distanceAnchorCoordinateSelection ??
          resolveDistanceTriangleAnchorCoordinateSelection(coordinates)) ===
        RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
          ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE
          : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE;

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId: measurementId,
          distanceAnchorCoordinateSelection: nextSelection,
          distanceTriangleAnchorCoordinateRole:
            resolveOppositeDistanceTriangleAnchorCoordinateRole(
              currentTriangleAnchorCoordinateRole
            ),
        })
      );
    },
    [annotationsStore]
  );
  const handleMeasurementSelection = useAnnotationSelection({
    annotationsStore,
    isSelectionAdditiveModifierPressed,
  });
  const selectedAnnotationIdSet = useMemo(
    () => new Set(selectedAnnotationIds),
    [selectedAnnotationIds]
  );
  const insertNodeTargetMeasurementIds = useMemo(
    () =>
      annotationEntries
        .filter(
          (annotationEntry) =>
            selectedAnnotationIdSet.has(annotationEntry.id) &&
            !annotationEntry.locked &&
            isInsertNodeTargetToolType(annotationEntry.toolType)
        )
        .map((annotationEntry) => annotationEntry.id),
    [annotationEntries, selectedAnnotationIdSet]
  );
  const handleInsertNodeTargetClick = useCallback(
    (measurementId: string, startNodeId: string, endNodeId: string) => {
      const runtimeState = annotationsStore.getState();
      const targetEntry = findAnnotationEntryById(
        runtimeState.annotationEntries,
        measurementId
      );
      if (
        !targetEntry ||
        targetEntry.locked ||
        !isInsertNodeTargetToolType(targetEntry.toolType)
      ) {
        return false;
      }

      const startNode = runtimeState.nodes.find((node) => node.id === startNodeId);
      const endNode = runtimeState.nodes.find((node) => node.id === endNodeId);
      if (!startNode || !endNode) {
        return false;
      }

      annotationsStore.dispatch(
        insertNodeIntoMeasurementEdge({
          measurementId,
          startNodeId,
          endNodeId,
          coordinate: resolveInsertedNodeCoordinate({
            toolType: targetEntry.toolType,
            startCoordinate: startNode.coordinate,
            endCoordinate: endNode.coordinate,
          }),
        })
      );
      scene?.requestRender();
      return true;
    },
    [annotationsStore, scene]
  );
  const handlePreviewSnapTargetNodeHover = useCallback(
    (nodeId: string, hovered: boolean) => {
      onHoveredPointQueryNodeIdChange(hovered ? nodeId : null);
    },
    [onHoveredPointQueryNodeIdChange]
  );

  useEffect(() => {
    if (previewSnapTargetHoverEnabled) {
      return;
    }

    onHoveredPointQueryNodeIdChange(null);
  }, [onHoveredPointQueryNodeIdChange, previewSnapTargetHoverEnabled]);

  const runtimeVisualLayers = useVisualLayers({
    plugins: registry.plugins,
    nodes,
    edges,
    linkedNodeGroups,
    annotationEntries,
    draftStatesByToolType,
    elevationReferenceAnnotationId,
    selectedAnnotationId,
    selectedAnnotationIds,
    isSelectionAdditiveModifierPressed,
    onMeasurementSelect: handleMeasurementSelection,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    onNodeLongPress: handleNodeLongPress,
    formatOptions,
    draftNodeCoordinateOverrides,
    effectiveNodes,
    effectiveLinkedNodeGroups,
  });
  const overlayVisualModels = runtimeVisualLayers.overlayVisualModels ?? null;

  const runtimeSceneSelectionEdgeMeasurementIdsById = useMemo(
    () =>
      new Map(
        [
          ...(runtimeVisualLayers.baseVisualModels.edges ?? []),
          ...(overlayVisualModels?.edges ?? []),
        ].map((edge) => [edge.id, edge.measurementId ?? null] as const)
      ),
    [overlayVisualModels?.edges, runtimeVisualLayers.baseVisualModels.edges]
  );
  const runtimeSceneSelectionPolygonFillMeasurementIdsById = useMemo(
    () =>
      new Map(
        [
          ...(runtimeVisualLayers.baseVisualModels.polygonFills ?? []),
          ...(overlayVisualModels?.polygonFills ?? []),
        ].map(
          (polygonFill) =>
            [polygonFill.id, polygonFill.measurementId ?? null] as const
        )
      ),
    [
      overlayVisualModels?.polygonFills,
      runtimeVisualLayers.baseVisualModels.polygonFills,
    ]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !isInteractionToolActive) {
      return;
    }

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      const pickedObject = scene.pick(event.position);
      const runtimeSceneSelectionTarget = resolveSceneSelectionTarget({
        pickedObject,
        edgeMeasurementIdsById: runtimeSceneSelectionEdgeMeasurementIdsById,
        polygonFillMeasurementIdsById:
          runtimeSceneSelectionPolygonFillMeasurementIdsById,
      });
      if (runtimeSceneSelectionTarget.isRuntimeTarget) {
        if (runtimeSceneSelectionTarget.measurementId) {
          handleMeasurementSelection(runtimeSceneSelectionTarget.measurementId);
          scene.requestRender();
        }
        return;
      }

      handleMeasurementSelection(null);
      scene.requestRender();
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [
    annotationsStore,
    handleMeasurementSelection,
    isInteractionToolActive,
    runtimeSceneSelectionEdgeMeasurementIdsById,
    runtimeSceneSelectionPolygonFillMeasurementIdsById,
    scene,
  ]);

  useMeasurementVisualizers(scene, {
    surfaceKey: "committed",
    enableHostInteractionTargets: true,
    points: runtimeVisualLayers.baseVisualModels.points ?? [],
    linkedNodeGroups,
    edges: runtimeVisualLayers.baseVisualModels.edges ?? [],
    polygonFills: runtimeVisualLayers.baseVisualModels.polygonFills ?? [],
    pointLabels: runtimeVisualLayers.baseVisualModels.pointLabels ?? [],
    selectedAnnotationIds,
    formatOptions,
    previewLineLabelVisualOptions,
    activeMoveGizmoNodeId,
    isMoveGizmoDragging,
    blockLabelInteractions:
      activeMoveGizmoNodeId !== null || isMeasurementToolActive,
    previewSnapTargetHoverEnabled,
    onPreviewSnapTargetNodeClick,
    onMeasurementSelect: handleMeasurementSelection,
    onNodeLongPress: handleNodeLongPress,
    onReferenceNodeClick: handleReferenceNodeClick,
    onReferenceNodeHover:
      activeMoveGizmoNodeId !== null
        ? handleReferenceNodeHover
        : handlePreviewSnapTargetNodeHover,
    onReferenceEdgeClick: handleReferenceEdgeClick,
    insertNodeTargetMeasurementIds,
    onInsertNodeTargetClick: handleInsertNodeTargetClick,
    onDistanceTriangleCornerClick: handleDistanceTriangleCornerClick,
  });

  useMeasurementVisualizers(scene, {
    surfaceKey: "preview",
    enableHostInteractionTargets: false,
    points: overlayVisualModels?.points ?? [],
    linkedNodeGroups: effectiveLinkedNodeGroups,
    edges: overlayVisualModels?.edges ?? [],
    polygonFills: overlayVisualModels?.polygonFills ?? [],
    pointLabels: overlayVisualModels?.pointLabels ?? [],
    selectedAnnotationIds,
    formatOptions,
    previewLineLabelVisualOptions,
    activeMoveGizmoNodeId,
    isMoveGizmoDragging,
    blockLabelInteractions: true,
  });

  useCursorOverlay(scene, null, {
    enabled: pointQueryToolActive,
  });
  useCursorOverlay(scene, null, {
    enabled: isInteractionToolActive && isSelectionAdditiveModifierPressed,
    variant: "selection-additive-indicator",
  });

  return null;
};
