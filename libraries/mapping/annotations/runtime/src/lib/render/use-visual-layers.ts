import { useCallback, useMemo } from "react";

import type {
  AnnotationToolPlugin,
  AnnotationToolVisualModelContext,
} from "../registry";
import type { AnnotationNode, AnnotationNodeLink } from "../store";
import {
  hasNodeCoordinateOverrides,
  splitRuntimeVisualModelsForCoordinateOverlay,
  type NodeCoordinateOverrides,
} from "../utils/node-coordinate-overrides";
import { buildAggregatedVisualModels } from "./build-aggregated-visual-models";

type UseVisualLayersOptions = Omit<
  AnnotationToolVisualModelContext,
  "setSelectedAnnotationId" | "onNodeLongPress"
> & {
  plugins: readonly AnnotationToolPlugin[];
  onAnnotationSelect: (annotationId: string | null) => void;
  onNodeLongPress: (nodeId: string, annotationId?: string) => void;
  draftNodeCoordinateOverrides: NodeCoordinateOverrides;
  effectiveNodes: readonly AnnotationNode[];
  effectiveLinkedNodeGroups: readonly AnnotationNodeLink[];
};

/** The committed visual models, plus the overlay models of the nodes currently moved by draft coordinate overrides. */
export const useVisualLayers = ({
  plugins,
  nodes,
  edges,
  linkedNodeGroups,
  annotationEntries,
  draftStatesByToolType,
  elevationReferenceAnnotationId,
  selectedAnnotationId,
  selectedAnnotationIds,
  isSelectionAdditiveModifierPressed,
  onAnnotationSelect,
  setElevationReferenceAnnotationId,
  toggleAnnotationElevationDisplayMode,
  onNodeLongPress,
  formatOptions,
  draftNodeCoordinateOverrides,
  effectiveNodes,
  effectiveLinkedNodeGroups,
}: UseVisualLayersOptions) => {
  const buildVisualModels = useCallback(
    (
      modelNodes: readonly AnnotationNode[],
      modelLinkedNodeGroups: readonly AnnotationNodeLink[]
    ) =>
      buildAggregatedVisualModels({
        plugins,
        nodes: modelNodes,
        edges,
        linkedNodeGroups: modelLinkedNodeGroups,
        annotationEntries,
        draftStatesByToolType,
        elevationReferenceAnnotationId,
        selectedAnnotationId,
        selectedAnnotationIds,
        isSelectionAdditiveModifierPressed,
        setSelectedAnnotationId: onAnnotationSelect,
        setElevationReferenceAnnotationId,
        toggleAnnotationElevationDisplayMode,
        onNodeLongPress,
        formatOptions,
      }),
    [
      annotationEntries,
      draftStatesByToolType,
      edges,
      elevationReferenceAnnotationId,
      formatOptions,
      isSelectionAdditiveModifierPressed,
      onAnnotationSelect,
      onNodeLongPress,
      plugins,
      selectedAnnotationId,
      selectedAnnotationIds,
      setElevationReferenceAnnotationId,
      toggleAnnotationElevationDisplayMode,
    ]
  );

  const baseVisualModels = useMemo(
    () => buildVisualModels(nodes, linkedNodeGroups),
    [buildVisualModels, linkedNodeGroups, nodes]
  );

  const fullOverlayVisualModels = useMemo(
    () =>
      hasNodeCoordinateOverrides(draftNodeCoordinateOverrides)
        ? buildVisualModels(effectiveNodes, effectiveLinkedNodeGroups)
        : null,
    [
      buildVisualModels,
      draftNodeCoordinateOverrides,
      effectiveLinkedNodeGroups,
      effectiveNodes,
    ]
  );

  return useMemo(() => {
    if (!fullOverlayVisualModels) {
      return { baseVisualModels, overlayVisualModels: null } as const;
    }

    const split = splitRuntimeVisualModelsForCoordinateOverlay({
      baseVisualModels,
      overlayVisualModels: fullOverlayVisualModels,
      annotationEntries,
      coordinateOverrides: draftNodeCoordinateOverrides,
    });

    return {
      baseVisualModels: split.baseVisualModels,
      overlayVisualModels: split.overlayVisualModels,
    } as const;
  }, [
    annotationEntries,
    baseVisualModels,
    draftNodeCoordinateOverrides,
    fullOverlayVisualModels,
  ]);
};
