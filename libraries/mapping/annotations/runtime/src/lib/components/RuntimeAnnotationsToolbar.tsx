import { useMemo } from "react";

import {
  AnnotationsToolbar as AnnotationsToolbarView,
  type AnnotationsToolbarClassNames,
  type AnnotationsToolbarMetrics,
} from "@carma-mapping/annotations/ui";

import { useAnnotationsRuntime } from "../context/AnnotationsProvider";
import type { AnnotationToolPlugin } from "../registry";
import { resolveAnnotationCountByToolType } from "../utils/annotation-tool-collections";

export type RuntimeAnnotationsToolbarProps = {
  classNames?: Partial<AnnotationsToolbarClassNames>;
  metrics?: Partial<AnnotationsToolbarMetrics>;
  plugins?: readonly AnnotationToolPlugin[];
  showToolTypeIndicators?: boolean;
};

export type { AnnotationsToolbarClassNames, AnnotationsToolbarMetrics };

export const RuntimeAnnotationsToolbar = ({
  classNames,
  metrics,
  plugins,
  showToolTypeIndicators = false,
}: RuntimeAnnotationsToolbarProps) => {
  const { registry, activeToolType, requestModeChange, annotationEntries } =
    useAnnotationsRuntime();
  const toolPlugins = plugins ?? registry.plugins;
  const annotationCountByToolType = useMemo(
    () => resolveAnnotationCountByToolType(annotationEntries),
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

        return {
          id: descriptor.id,
          label: descriptor.label,
          tooltip: descriptor.tooltip,
          icon: descriptor.icon,
          annotationCount,
        };
      }),
    [annotationCountByToolType, annotationEntries.length, toolPlugins]
  );

  return (
    <AnnotationsToolbarView
      activeToolId={activeToolType}
      tools={tools}
      onToolSelect={(toolId) => {
        requestModeChange(toolId as AnnotationToolPlugin["descriptor"]["id"]);
      }}
      classNames={classNames}
      metrics={metrics}
      showToolTypeIndicators={showToolTypeIndicators}
    />
  );
};
