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
  type AnnotationEntryRole,
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
  annotationEntry.annotationRole ??
  (annotationEntry.externalCollection
    ? ANNOTATION_ENTRY_ROLES.EXTERNAL
    : ANNOTATION_ENTRY_ROLES.AUTHORING);

export type AppendAnnotationsRuntimePersistenceStateOptions = {
  idPrefix?: string;
  annotationRole?: StoredAnnotation["annotationRole"];
  readOnly?: boolean;
  externalCollection?: StoredAnnotation["externalCollection"];
  selectAnnotationId?: string | null;
  skipExisting?: boolean;
  /**
   * An entry the local set already holds (same uuid, else same id) replaces
   * that local entry instead of being skipped; the local id is kept.
   */
  replaceExisting?: boolean;
};

/** Append options for externally owned collections: read-only, external role, id-prefixed, idempotent. */
export const buildExternalAnnotationsAppendOptions = (
  externalCollection: NonNullable<StoredAnnotation["externalCollection"]>
): AppendAnnotationsRuntimePersistenceStateOptions => ({
  idPrefix: externalCollection.id,
  annotationRole: ANNOTATION_ENTRY_ROLES.EXTERNAL,
  readOnly: true,
  externalCollection,
  selectAnnotationId: null,
  skipExisting: true,
});

export const selectAuthoringAnnotationEntries = (
  state: Pick<AnnotationsStoreState, "annotationEntries">
): readonly StoredAnnotation[] =>
  state.annotationEntries.filter(
    (annotationEntry) =>
      resolveAnnotationEntryRole(annotationEntry) ===
      ANNOTATION_ENTRY_ROLES.AUTHORING
  );

export type SelectRenderableAnnotationEntriesOptions = {
  roles?: readonly AnnotationEntryRole[];
};

export const selectRenderableAnnotationEntries = (
  state: Pick<AnnotationsStoreState, "annotationEntries">,
  options: SelectRenderableAnnotationEntriesOptions = {}
): readonly StoredAnnotation[] => {
  if (options.roles === undefined) {
    return state.annotationEntries;
  }

  const roleSet = new Set(options.roles);
  return state.annotationEntries.filter((annotationEntry) =>
    roleSet.has(resolveAnnotationEntryRole(annotationEntry))
  );
};

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

export const resolveAnnotationToolAuthoringInstructionPlugin = ({
  activeToolType,
  registry,
  defaultToolId = ANNOTATION_SELECT_TOOL_ID,
}: {
  activeToolType: AnnotationToolId | null;
  registry: AnnotationToolRegistry;
  defaultToolId?: AnnotationToolId;
}): AnnotationToolPlugin | null => {
  if (activeToolType) {
    const activePlugin = registry.getPlugin(activeToolType);
    if (activePlugin) {
      return activePlugin;
    }
  }

  return registry.getPlugin(defaultToolId) ?? null;
};
