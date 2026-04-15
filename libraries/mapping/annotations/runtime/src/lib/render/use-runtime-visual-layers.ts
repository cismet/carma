import { useMemo } from "react";

import type { AnnotationsRuntimeFormatOptions } from "../config/annotations-runtime-format-options";
import type {
  RuntimeAnnotationEntry,
  RuntimeEdge,
  RuntimeNodeLink,
  RuntimeNode,
} from "../store";
import type { AnnotationToolPlugin } from "../tools/annotation-tool-plugin.types";
import {
  hasRuntimeCoordinateOverrides,
  splitRuntimeVisualModelsForCoordinateOverlay,
  type RuntimeNodeCoordinateOverrides,
} from "../utils/runtime-coordinate-overrides";
import { buildAggregatedRuntimeVisualModels } from "./build-aggregated-runtime-visual-models";
import type { RuntimeVisualModels } from "./runtime-visual-models";

type BuildRuntimeVisualModelsArgs = {
  plugins: readonly AnnotationToolPlugin[];
  nodes: readonly RuntimeNode[];
  edges: readonly RuntimeEdge[];
  linkedNodeGroups: readonly RuntimeNodeLink[];
  annotationEntries: readonly RuntimeAnnotationEntry[];
  elevationReferenceAnnotationId: string | null;
  selectedAnnotationId: string | null;
  selectedAnnotationIds: readonly string[];
  isSelectionAdditiveModifierPressed: boolean;
  onMeasurementSelect: (annotationId: string | null) => void;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (annotationId: string) => void;
  onNodeLongPress: (nodeId: string, measurementId?: string) => void;
  formatOptions: AnnotationsRuntimeFormatOptions;
};

type UseRuntimeVisualLayersOptions = BuildRuntimeVisualModelsArgs & {
  draftNodeCoordinateOverrides: RuntimeNodeCoordinateOverrides;
  effectiveNodes: readonly RuntimeNode[];
  effectiveLinkedNodeGroups: readonly RuntimeNodeLink[];
};

const buildRuntimeVisualModels = ({
  plugins,
  nodes,
  edges,
  linkedNodeGroups,
  annotationEntries,
  elevationReferenceAnnotationId,
  selectedAnnotationId,
  selectedAnnotationIds,
  isSelectionAdditiveModifierPressed,
  onMeasurementSelect,
  setElevationReferenceAnnotationId,
  toggleAnnotationElevationDisplayMode,
  onNodeLongPress,
  formatOptions,
}: BuildRuntimeVisualModelsArgs): RuntimeVisualModels =>
  buildAggregatedRuntimeVisualModels({
    plugins,
    nodes,
    edges,
    linkedNodeGroups,
    annotationEntries,
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

export const useRuntimeVisualLayers = ({
  plugins,
  nodes,
  edges,
  linkedNodeGroups,
  annotationEntries,
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
}: UseRuntimeVisualLayersOptions) => {
  const baseVisualModels = useMemo(
    () =>
      buildRuntimeVisualModels({
        plugins,
        nodes,
        edges,
        linkedNodeGroups,
        annotationEntries,
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
    if (!hasRuntimeCoordinateOverrides(draftNodeCoordinateOverrides)) {
      return null;
    }

    return buildRuntimeVisualModels({
      plugins,
      nodes: effectiveNodes,
      edges,
      linkedNodeGroups: effectiveLinkedNodeGroups,
      annotationEntries,
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
