import { formatMeasurementShortLabelToken } from "@carma-mapping/annotations/core";
import type { AnnotationToolId } from "@carma-mapping/annotations/core";

import type { AnnotationEngine } from "../engine";
import type { AnnotationToolRegistry } from "../registry";
import {
  ANNOTATION_SHORT_LABEL_SOURCES,
  type AddAnnotationOptions,
  type AnnotationGeographicCoordinate,
  type AnnotationNodeLinkId,
  type StoredAnnotation,
} from "../store";
import {
  isShortLabelKind,
  resolveNextShortLabelCounterForToolType,
} from "../utils/short-label-sequence";

/** The plugin that authors an added annotation: the source tool, else one registered for the type. */
const resolvePluginForAnnotationAdd = (
  registry: AnnotationToolRegistry,
  annotationType: StoredAnnotation["toolType"],
  sourceToolId?: AnnotationToolId
) => {
  if (sourceToolId) {
    const sourcePlugin = registry.getPlugin(sourceToolId);
    if (sourcePlugin) {
      return sourcePlugin;
    }
  }

  const matchingPlugins = registry.getPluginsByAnnotationType(annotationType);
  return (
    matchingPlugins.find((plugin) => plugin.addAnnotation) ??
    matchingPlugins[0] ??
    null
  );
};

/** Plugin-resolved options, with a default short label for measurement kinds that carry one. */
export const resolveAnnotationAddOptions = ({
  registry,
  engine,
  annotationEntries,
  toolType,
  coordinates,
  options,
  linkedNodeGroupIds,
  sourceToolId,
}: {
  registry: AnnotationToolRegistry;
  engine: AnnotationEngine | null;
  annotationEntries: readonly StoredAnnotation[];
  toolType: StoredAnnotation["toolType"];
  coordinates: readonly AnnotationGeographicCoordinate[];
  options?: AddAnnotationOptions;
  linkedNodeGroupIds?: readonly (AnnotationNodeLinkId | null | undefined)[];
  sourceToolId?: AnnotationToolId;
}): AddAnnotationOptions | undefined => {
  const plugin = resolvePluginForAnnotationAdd(
    registry,
    toolType,
    sourceToolId
  );
  const resolvedOptions =
    plugin?.addAnnotation?.resolveOptions({
      annotationType: toolType,
      toolId: sourceToolId ?? plugin?.id ?? null,
      engine,
      coordinates,
      options,
      linkedNodeGroupIds,
    }) ?? options;

  if (!isShortLabelKind(toolType)) {
    return resolvedOptions;
  }

  const nextShortLabelCounter = resolveNextShortLabelCounterForToolType({
    annotationEntries,
    toolType,
  });
  const resolvedShortLabel = resolvedOptions?.shortLabel?.trim();
  return {
    ...resolvedOptions,
    shortLabel:
      resolvedShortLabel ||
      formatMeasurementShortLabelToken(toolType, nextShortLabelCounter),
    shortLabelSource: resolvedShortLabel
      ? resolvedOptions?.shortLabelSource ??
        ANNOTATION_SHORT_LABEL_SOURCES.CUSTOM
      : ANNOTATION_SHORT_LABEL_SOURCES.DEFAULT,
    shortLabelCounter: resolvedShortLabel
      ? resolvedOptions?.shortLabelCounter
      : nextShortLabelCounter,
  };
};
