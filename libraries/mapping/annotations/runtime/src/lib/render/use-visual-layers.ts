import { useMemo } from "react";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type {
  StoredAnnotation,
  AnnotationElevationDisplayMode,
  AnnotationEdge,
  AnnotationNodeLink,
  AnnotationNode,
} from "../store";
import type {
  AnnotationToolDraftState,
  AnnotationToolPlugin,
} from "../registry";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";
import {
  hasNodeCoordinateOverrides,
  splitRuntimeVisualModelsForCoordinateOverlay,
  type NodeCoordinateOverrides,
} from "../utils/node-coordinate-overrides";
import { buildAggregatedVisualModels } from "./build-aggregated-visual-models";
import type { RuntimeVisualModels } from "./visual-models";

type BuildVisualModelsArgs = {
  plugins: readonly AnnotationToolPlugin[];
  nodes: readonly AnnotationNode[];
  edges: readonly AnnotationEdge[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotationEntries: readonly StoredAnnotation[];
  draftStatesByToolType: Readonly<
    Partial<Record<AnnotationToolId, AnnotationToolDraftState>>
  >;
  elevationReferenceAnnotationId: string | null;
  selectedAnnotationId: string | null;
  selectedAnnotationIds: readonly string[];
  isSelectionAdditiveModifierPressed: boolean;
  onMeasurementSelect: (annotationId: string | null) => void;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (
    annotationId: string,
    currentElevationDisplayMode?: AnnotationElevationDisplayMode
  ) => void;
  onNodeLongPress: (nodeId: string, measurementId?: string) => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
};

type UseVisualLayersOptions = BuildVisualModelsArgs & {
  draftNodeCoordinateOverrides: NodeCoordinateOverrides;
  effectiveNodes: readonly AnnotationNode[];
  effectiveLinkedNodeGroups: readonly AnnotationNodeLink[];
};

const buildRuntimeVisualModels = ({
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
  onMeasurementSelect,
  setElevationReferenceAnnotationId,
  toggleAnnotationElevationDisplayMode,
  onNodeLongPress,
  formatOptions,
}: BuildVisualModelsArgs): RuntimeVisualModels =>
  buildAggregatedVisualModels({
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
    setSelectedAnnotationId: onMeasurementSelect,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    onNodeLongPress,
    formatOptions,
  });

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
  onMeasurementSelect,
  setElevationReferenceAnnotationId,
  toggleAnnotationElevationDisplayMode,
  onNodeLongPress,
  formatOptions,
  draftNodeCoordinateOverrides,
  effectiveNodes,
  effectiveLinkedNodeGroups,
}: UseVisualLayersOptions) => {
  const baseVisualModels = useMemo(
    () =>
      buildRuntimeVisualModels({
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
        onMeasurementSelect,
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
      linkedNodeGroups,
      nodes,
      onMeasurementSelect,
      onNodeLongPress,
      plugins,
      selectedAnnotationId,
      selectedAnnotationIds,
      setElevationReferenceAnnotationId,
      toggleAnnotationElevationDisplayMode,
    ]
  );

  const fullOverlayVisualModels = useMemo(() => {
    if (!hasNodeCoordinateOverrides(draftNodeCoordinateOverrides)) {
      return null;
    }

    return buildRuntimeVisualModels({
      plugins,
      nodes: effectiveNodes,
      edges,
      linkedNodeGroups: effectiveLinkedNodeGroups,
      annotationEntries,
      draftStatesByToolType,
      elevationReferenceAnnotationId,
      selectedAnnotationId,
      selectedAnnotationIds,
      isSelectionAdditiveModifierPressed,
      onMeasurementSelect,
      setElevationReferenceAnnotationId,
      toggleAnnotationElevationDisplayMode,
      onNodeLongPress,
      formatOptions,
    });
  }, [
    annotationEntries,
    draftStatesByToolType,
    draftNodeCoordinateOverrides,
    edges,
    effectiveLinkedNodeGroups,
    effectiveNodes,
    elevationReferenceAnnotationId,
    formatOptions,
    isSelectionAdditiveModifierPressed,
    onMeasurementSelect,
    onNodeLongPress,
    plugins,
    selectedAnnotationId,
    selectedAnnotationIds,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
  ]);

  return useMemo(() => {
    if (!fullOverlayVisualModels) {
      return {
        baseVisualModels,
        overlayVisualModels: null,
      } as const;
    }

    const splitVisualLayers = splitRuntimeVisualModelsForCoordinateOverlay({
      baseVisualModels,
      overlayVisualModels: fullOverlayVisualModels,
      annotationEntries,
      coordinateOverrides: draftNodeCoordinateOverrides,
    });

    return {
      baseVisualModels: splitVisualLayers.baseVisualModels,
      overlayVisualModels: splitVisualLayers.overlayVisualModels,
    } as const;
  }, [
    annotationEntries,
    baseVisualModels,
    draftNodeCoordinateOverrides,
    fullOverlayVisualModels,
  ]);
};
