import { useMemo } from "react";

import {
  AnnotationsToolbar as AnnotationsToolbarView,
  type AnnotationsToolbarClassNames,
  type AnnotationsToolbarMetrics,
  type AnnotationsToolbarProps,
} from "@carma-mapping/annotations/ui";
import { ANNOTATION_SELECT_TOOL_ID } from "@carma-mapping/annotations/core";

import { useAnnotationsRuntime } from "../context/AnnotationsProvider";
import type { AnnotationToolPlugin } from "../registry";
import { resolveAnnotationCountByToolType } from "../utils/annotation-tool-collections";

export type RuntimeAnnotationsToolbarProps = {
  classNames?: Partial<AnnotationsToolbarClassNames>;
  metrics?: Partial<AnnotationsToolbarMetrics>;
  plugins?: readonly AnnotationToolPlugin[];
  disableSelectWithoutAnnotations?: boolean;
  showToolTypeIndicators?: boolean;
  tooltipPlacement?: AnnotationsToolbarProps["tooltipPlacement"];
  getTooltipPopupContainer?: AnnotationsToolbarProps["getTooltipPopupContainer"];
  renderToolButtonBackdrop?: AnnotationsToolbarProps["renderToolButtonBackdrop"];
};

export type { AnnotationsToolbarClassNames, AnnotationsToolbarMetrics };

export const RuntimeAnnotationsToolbar = ({
  classNames,
  metrics,
  plugins,
  disableSelectWithoutAnnotations = false,
  showToolTypeIndicators = false,
  tooltipPlacement,
  getTooltipPopupContainer,
  renderToolButtonBackdrop,
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
        const isSelectionTool = descriptor.id === ANNOTATION_SELECT_TOOL_ID;
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
          disabled:
            disableSelectWithoutAnnotations &&
            isSelectionTool &&
            annotationEntries.length === 0,
        };
      }),
    [
      annotationCountByToolType,
      annotationEntries.length,
      disableSelectWithoutAnnotations,
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
      classNames={classNames}
      metrics={metrics}
      showToolTypeIndicators={showToolTypeIndicators}
      tooltipPlacement={tooltipPlacement}
      getTooltipPopupContainer={getTooltipPopupContainer}
      renderToolButtonBackdrop={renderToolButtonBackdrop}
    />
  );
};
