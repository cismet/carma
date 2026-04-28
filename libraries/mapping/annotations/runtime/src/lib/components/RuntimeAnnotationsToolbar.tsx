import { useMemo } from "react";

import {
  AnnotationsToolbar as AnnotationsToolbarView,
  type AnnotationsToolbarActionLabels,
  type AnnotationsToolbarClassNames,
  type AnnotationsToolbarMetrics,
} from "@carma-mapping/annotations/ui";

import { useAnnotationsRuntime } from "../context/AnnotationsProvider";
import type { AnnotationToolPlugin } from "../registry";
import {
  resolveAnnotationCountByToolType,
  resolveAnnotationIdsByToolType,
} from "../utils/annotation-tool-collections";

export type RuntimeAnnotationsToolbarProps = {
  classNames?: Partial<AnnotationsToolbarClassNames>;
  metrics?: Partial<AnnotationsToolbarMetrics>;
  actionLabels?: Partial<AnnotationsToolbarActionLabels>;
  plugins?: readonly AnnotationToolPlugin[];
  showToolTypeIndicators?: boolean;
};

export type {
  AnnotationsToolbarActionLabels,
  AnnotationsToolbarClassNames,
  AnnotationsToolbarMetrics,
};

export const RuntimeAnnotationsToolbar = ({
  classNames,
  metrics,
  actionLabels,
  plugins,
  showToolTypeIndicators = false,
}: RuntimeAnnotationsToolbarProps) => {
  const {
    registry,
    activeToolType,
    requestModeChange,
    annotationEntries,
    flyToAllAnnotations,
    setSelectedAnnotationIds,
    removeAnnotationById,
  } = useAnnotationsRuntime();
  const toolPlugins = plugins ?? registry.plugins;
  const annotationCountByToolType = useMemo(
    () => resolveAnnotationCountByToolType(annotationEntries),
    [annotationEntries]
  );
  const annotationIdsByToolType = useMemo(
    () => resolveAnnotationIdsByToolType(annotationEntries),
    [annotationEntries]
  );
  const tools = useMemo(
    () =>
      toolPlugins.map((plugin) => {
        const descriptor = plugin.descriptor;
        const isSelectionTool = descriptor.id === "select";
        const annotationCount = isSelectionTool
          ? annotationEntries.length
          : plugin.annotationType
          ? annotationCountByToolType.get(plugin.annotationType) ?? 0
          : 0;
        const annotationIds = isSelectionTool
          ? annotationEntries.map((annotationEntry) => annotationEntry.id)
          : plugin.annotationType
          ? annotationIdsByToolType.get(plugin.annotationType) ?? []
          : [];

        return {
          id: descriptor.id,
          label: descriptor.label,
          tooltip: descriptor.tooltip,
          icon: descriptor.icon,
          annotationCount,
          annotationIds,
          isSelectionTool,
        };
      }),
    [
      annotationCountByToolType,
      annotationEntries,
      annotationIdsByToolType,
      toolPlugins,
    ]
  );

  return (
    <AnnotationsToolbarView
      activeToolId={activeToolType}
      tools={tools}
      onToolSelect={(toolId) => {
        requestModeChange(toolId as AnnotationToolPlugin["descriptor"]["id"]);
      }}
      onSelectAnnotations={setSelectedAnnotationIds}
      onFocusAllAnnotations={flyToAllAnnotations}
      onRemoveAnnotations={(annotationIds) => {
        annotationIds.forEach((annotationId) => {
          removeAnnotationById(annotationId);
        });
      }}
      classNames={classNames}
      metrics={metrics}
      actionLabels={actionLabels}
      showToolTypeIndicators={showToolTypeIndicators}
    />
  );
};
