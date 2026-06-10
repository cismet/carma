import {
  ANNOTATION_SELECT_TOOL_ID,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";
import {
  ANNOTATION_TOOL_PLUGIN_KINDS,
  type AnnotationToolPlugin,
  type AnnotationToolRegistry,
} from "../registry";
import {
  ANNOTATION_ENTRY_ROLES,
  type AnnotationsStoreState,
  type StoredAnnotation,
} from "../store";

export type ResolveVisibleMeasurementAnnotationToolPluginsOptions = {
  toolIds?: readonly AnnotationToolId[];
};

export const resolveVisibleMeasurementAnnotationToolPlugins = (
  plugins: readonly AnnotationToolPlugin[],
  options: ResolveVisibleMeasurementAnnotationToolPluginsOptions = {}
): readonly AnnotationToolPlugin[] => {
  const visibleToolIds =
    options.toolIds !== undefined ? new Set(options.toolIds) : null;

  return plugins
    .filter((plugin) => {
      if (visibleToolIds && !visibleToolIds.has(plugin.id)) {
        return false;
      }

      return (
        plugin.id === ANNOTATION_SELECT_TOOL_ID ||
        (plugin.kind === ANNOTATION_TOOL_PLUGIN_KINDS.MEASUREMENT &&
          plugin.annotationType)
      );
    })
    .sort((left, right) => left.descriptor.order - right.descriptor.order);
};

export const resolvePrimaryAnnotationInteractionToolId = (
  plugins: readonly AnnotationToolPlugin[]
): AnnotationToolId | null => {
  const selectPlugin = plugins.find(
    (plugin) =>
      plugin.id === ANNOTATION_SELECT_TOOL_ID &&
      plugin.kind === ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION
  );
  if (selectPlugin) {
    return selectPlugin.id;
  }

  return (
    plugins.find(
      (plugin) => plugin.kind === ANNOTATION_TOOL_PLUGIN_KINDS.INTERACTION
    )?.id ?? null
  );
};

export const resolveAnnotationCancelToolId = (
  registry: Pick<AnnotationToolRegistry, "getPlugin" | "plugins">
): AnnotationToolId | null =>
  registry.getPlugin(ANNOTATION_SELECT_TOOL_ID)?.id ??
  resolvePrimaryAnnotationInteractionToolId(registry.plugins);

export const isReadOnlyAnnotationEntry = (
  annotationEntry: StoredAnnotation
): boolean => Boolean(annotationEntry.readOnly);

export const resolveAnnotationEntryRole = (annotationEntry: StoredAnnotation) =>
  annotationEntry.annotationRole ?? ANNOTATION_ENTRY_ROLES.AUTHORING;

export const isExternalAnnotationEntry = (
  annotationEntry: StoredAnnotation
): boolean =>
  resolveAnnotationEntryRole(annotationEntry) ===
  ANNOTATION_ENTRY_ROLES.EXTERNAL;

export const selectAuthoringAnnotationEntries = (
  state: Pick<AnnotationsStoreState, "annotationEntries">
): readonly StoredAnnotation[] =>
  state.annotationEntries.filter(
    (annotationEntry) =>
      resolveAnnotationEntryRole(annotationEntry) ===
      ANNOTATION_ENTRY_ROLES.AUTHORING
  );

export const selectRenderableAnnotationEntries = (
  state: Pick<AnnotationsStoreState, "annotationEntries">
): readonly StoredAnnotation[] => state.annotationEntries;

export const resolveAnnotationCountByToolType = (
  annotationEntries: readonly StoredAnnotation[]
): ReadonlyMap<string, number> =>
  selectAuthoringAnnotationEntries({ annotationEntries }).reduce(
    (countByToolType, annotationEntry) => {
      countByToolType.set(
        annotationEntry.toolType,
        (countByToolType.get(annotationEntry.toolType) ?? 0) + 1
      );
      return countByToolType;
    },
    new Map<string, number>()
  );

export const resolveAnnotationIdsByToolType = (
  annotationEntries: readonly StoredAnnotation[]
): ReadonlyMap<string, readonly string[]> =>
  selectAuthoringAnnotationEntries({ annotationEntries }).reduce(
    (idsByToolType, annotationEntry) => {
      idsByToolType.set(annotationEntry.toolType, [
        ...(idsByToolType.get(annotationEntry.toolType) ?? []),
        annotationEntry.id,
      ]);
      return idsByToolType;
    },
    new Map<string, readonly string[]>()
  );

export const resolveAnnotationEntriesByToolType = (
  annotationEntries: readonly StoredAnnotation[]
): ReadonlyMap<string, readonly StoredAnnotation[]> =>
  selectAuthoringAnnotationEntries({ annotationEntries }).reduce(
    (entriesByToolType, annotationEntry) => {
      entriesByToolType.set(annotationEntry.toolType, [
        ...(entriesByToolType.get(annotationEntry.toolType) ?? []),
        annotationEntry,
      ]);
      return entriesByToolType;
    },
    new Map<string, readonly StoredAnnotation[]>()
  );

export const areAnnotationEntriesHidden = (
  annotationEntries: readonly StoredAnnotation[]
): boolean =>
  annotationEntries.length > 0 &&
  annotationEntries.every((annotationEntry) => annotationEntry.hidden);

export const resolveAnnotationToolFallbackPlugin = ({
  activeToolType,
  registry,
  fallbackToolId = ANNOTATION_SELECT_TOOL_ID,
}: {
  activeToolType: AnnotationToolId | null;
  registry: AnnotationToolRegistry;
  fallbackToolId?: AnnotationToolId;
}): AnnotationToolPlugin | null => {
  if (activeToolType) {
    const activePlugin = registry.getPlugin(activeToolType);
    if (activePlugin) {
      return activePlugin;
    }
  }

  return (
    registry.getPlugin(fallbackToolId) ??
    [...registry.plugins].sort(
      (left, right) => left.descriptor.order - right.descriptor.order
    )[0] ??
    null
  );
};
