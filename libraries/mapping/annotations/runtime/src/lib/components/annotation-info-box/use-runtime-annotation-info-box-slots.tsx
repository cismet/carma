import { useMemo, type ReactNode } from "react";

import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
  ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES,
  ANNOTATION_INFO_BOX_HELP_ITEM_KINDS,
  AnnotationInfoBoxHelpContent,
  AnnotationInfoBoxTextContent,
  type AnnotationInfoBoxActionId,
  type AnnotationInfoBoxHelpLayout,
  type AnnotationInfoBoxHelpItem,
  type AnnotationInfoBoxSlots,
  type AnnotationInfoBoxVisualOptions,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import { useAnnotationsRuntime } from "../../context/AnnotationsProvider";
import { useAnnotationToolDraftStates } from "../../context/use-annotation-tool-draft-states";
import type { StoredAnnotation } from "../../store";
import type {
  AnnotationToolDraftState,
  AnnotationToolPlugin,
} from "../../registry";
import {
  isReadOnlyAnnotationEntry,
  resolveAnnotationToolFallbackPlugin,
} from "../../utils/annotation-tool-collections";

export const RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS = {
  ANNOTATION: "annotation",
  FALLBACK: "fallback",
} as const;

export type RuntimeAnnotationInfoBoxSlotStateKind =
  (typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS)[keyof typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS];

export type RuntimeAnnotationInfoBoxSlotsState =
  | {
      kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION;
      annotation: StoredAnnotation;
      instructionContent?: ReactNode;
      instructionToolId?: AnnotationToolPlugin["id"];
      slots: AnnotationInfoBoxSlots;
      visualOptions: AnnotationInfoBoxVisualOptions;
    }
  | {
      kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.FALLBACK;
      plugin: AnnotationToolPlugin;
      slots: AnnotationInfoBoxSlots;
      visualOptions: AnnotationInfoBoxVisualOptions;
    };

export type RuntimeAnnotationInfoBoxVisualOptionsContext =
  | {
      kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION;
      annotation: StoredAnnotation;
    }
  | {
      kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.FALLBACK;
      plugin: AnnotationToolPlugin;
    };

export type RuntimeAnnotationInfoBoxVisualOptionsInput =
  | Partial<AnnotationInfoBoxVisualOptions>
  | ((
      context: RuntimeAnnotationInfoBoxVisualOptionsContext
    ) => Partial<AnnotationInfoBoxVisualOptions>);

export type UseRuntimeAnnotationInfoBoxSlotsOptions = {
  fallbackHelpLayout?: AnnotationInfoBoxHelpLayout;
  helpLocale?: string;
  includeFallback?: boolean;
  visualOptions?: RuntimeAnnotationInfoBoxVisualOptionsInput;
};

const EMPTY_RUNTIME_ANNOTATION_TOOL_DRAFT_STATE: AnnotationToolDraftState =
  Object.freeze({
    coordinates: Object.freeze([]),
    linkedNodeGroupIds: Object.freeze([]),
    feedback: null,
  });

const MUTATING_ANNOTATION_ACTION_IDS = Object.freeze<
  readonly AnnotationInfoBoxActionId[]
>([ANNOTATION_INFO_BOX_ACTION_IDS.LOCK, ANNOTATION_INFO_BOX_ACTION_IDS.DELETE]);

const appendMutatingActionIds = (
  hiddenActionIds: readonly AnnotationInfoBoxActionId[]
): readonly AnnotationInfoBoxActionId[] =>
  Array.from(new Set([...hiddenActionIds, ...MUTATING_ANNOTATION_ACTION_IDS]));

const resolveRuntimeAnnotationInfoBoxVisualOptions = (
  visualOptions: RuntimeAnnotationInfoBoxVisualOptionsInput | undefined,
  context: RuntimeAnnotationInfoBoxVisualOptionsContext
): AnnotationInfoBoxVisualOptions =>
  resolveAnnotationInfoBoxVisualOptions(
    typeof visualOptions === "function" ? visualOptions(context) : visualOptions
  );

const buildFallbackHelpItems = (
  fallbackHelpText: readonly AnnotationInfoBoxHelpItem[],
  feedback: AnnotationToolDraftState["feedback"]
): readonly AnnotationInfoBoxHelpItem[] =>
  feedback
    ? [
        {
          kind: ANNOTATION_INFO_BOX_HELP_ITEM_KINDS.ALERT,
          severity: ANNOTATION_INFO_BOX_HELP_ALERT_SEVERITIES.WARNING,
          text: feedback.message,
        },
        ...fallbackHelpText,
      ]
    : fallbackHelpText;

export const useRuntimeAnnotationInfoBoxSlots = ({
  fallbackHelpLayout,
  helpLocale,
  includeFallback = false,
  visualOptions,
}: UseRuntimeAnnotationInfoBoxSlotsOptions = {}): RuntimeAnnotationInfoBoxSlotsState | null => {
  const {
    registry,
    activeToolType,
    activePointQueryPickResult,
    annotationToolDraftStore,
    annotationEntries,
    formatOptions,
    nodes,
    selectedAnnotationId,
    setSelectedAnnotationId,
    focusAnnotationId,
    flyToAllAnnotations,
    removeAnnotationById,
    exportAnnotationGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    elevationReferenceAnnotationId,
    setElevationReferenceAnnotationId,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
  } = useAnnotationsRuntime();
  const activeDraftToolTypes = useMemo(
    () => (activeToolType ? [activeToolType] : []),
    [activeToolType]
  );
  const activeDraftStates = useAnnotationToolDraftStates({
    draftStore: annotationToolDraftStore,
    toolTypes: activeDraftToolTypes,
  });
  const activeToolDraftState = activeToolType
    ? activeDraftStates[activeToolType] ??
      EMPTY_RUNTIME_ANNOTATION_TOOL_DRAFT_STATE
    : EMPTY_RUNTIME_ANNOTATION_TOOL_DRAFT_STATE;
  const activeToolDraftFeedback = activeToolType
    ? activeToolDraftState.feedback ?? null
    : null;

  return useMemo(() => {
    const fallbackPlugin = includeFallback
      ? resolveAnnotationToolFallbackPlugin({
          activeToolType,
          registry,
        })
      : null;

    const fallbackHelpText =
      fallbackPlugin !== null
        ? fallbackPlugin.resolveHelpText?.({
            draftState: activeToolDraftState,
            pointQueryPickResult: activePointQueryPickResult,
          }) ??
          fallbackPlugin.helpText ??
          []
        : [];
    const fallbackHelpItems = buildFallbackHelpItems(
      fallbackHelpText,
      activeToolDraftFeedback
    );

    const hasFallbackInstructionContent = Boolean(
      fallbackPlugin !== null && fallbackHelpItems.length > 0
    );
    const fallbackVisualOptions =
      fallbackPlugin !== null && hasFallbackInstructionContent
        ? resolveRuntimeAnnotationInfoBoxVisualOptions(visualOptions, {
            kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.FALLBACK,
            plugin: fallbackPlugin,
          })
        : null;
    const fallbackInstructionContent = fallbackVisualOptions ? (
      <AnnotationInfoBoxTextContent visualOptions={fallbackVisualOptions}>
        <AnnotationInfoBoxHelpContent
          items={fallbackHelpItems}
          layout={fallbackHelpLayout}
          locale={helpLocale}
        />
      </AnnotationInfoBoxTextContent>
    ) : null;
    const shouldRenderFallback =
      fallbackPlugin !== null && !selectedAnnotationId;

    if (shouldRenderFallback) {
      if (!fallbackInstructionContent || !fallbackVisualOptions) {
        return null;
      }

      return {
        kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.FALLBACK,
        plugin: fallbackPlugin,
        slots: {
          content: fallbackInstructionContent,
          collapsible: false,
        },
        visualOptions: fallbackVisualOptions,
      };
    }

    if (!selectedAnnotationId) {
      return null;
    }

    const selectedAnnotation =
      annotationEntries.find(
        (annotationEntry) => annotationEntry.id === selectedAnnotationId
      ) ?? null;

    if (!selectedAnnotation) {
      return null;
    }

    const plugin = registry
      .getPluginsByAnnotationType(selectedAnnotation.toolType)
      .find((candidatePlugin) => candidatePlugin.infoBox?.getSlots);

    if (!plugin?.infoBox?.getSlots) {
      return null;
    }

    const isReadOnly = isReadOnlyAnnotationEntry(selectedAnnotation);

    const baseVisualOptions = resolveRuntimeAnnotationInfoBoxVisualOptions(
      visualOptions,
      {
        kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
        annotation: selectedAnnotation,
      }
    );
    const resolvedVisualOptions = isReadOnly
      ? {
          ...baseVisualOptions,
          hiddenActionIds: appendMutatingActionIds(
            baseVisualOptions.hiddenActionIds
          ),
        }
      : baseVisualOptions;

    const slots = plugin.infoBox.getSlots({
      annotation: selectedAnnotation,
      annotationEntries,
      nodes,
      selectedAnnotationId: selectedAnnotation.id,
      setSelectedAnnotationId,
      focusAnnotationId,
      flyToAllAnnotations,
      removeAnnotationById,
      exportAnnotationGeoJson,
      toggleAnnotationVisibility,
      toggleAnnotationLocked,
      elevationReferenceAnnotationId,
      setElevationReferenceAnnotationId,
      updateAnnotationDisplayName,
      updateAnnotationShortLabel,
      formatOptions,
      infoBoxVisualOptions: resolvedVisualOptions,
    });

    if (!slots) {
      return null;
    }

    const shouldShowActiveDraftInstruction =
      fallbackPlugin?.alwaysShowHelpTextWhileActive === true &&
      (activeToolDraftState.coordinates.length > 0 ||
        activeToolDraftFeedback !== null);

    return {
      kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
      annotation: selectedAnnotation,
      instructionContent: shouldShowActiveDraftInstruction
        ? fallbackInstructionContent ?? undefined
        : undefined,
      instructionToolId: shouldShowActiveDraftInstruction
        ? fallbackPlugin.id
        : undefined,
      slots,
      visualOptions: resolvedVisualOptions,
    };
  }, [
    activeToolDraftFeedback,
    activeToolDraftState,
    activeToolType,
    activePointQueryPickResult,
    annotationEntries,
    elevationReferenceAnnotationId,
    exportAnnotationGeoJson,
    fallbackHelpLayout,
    helpLocale,
    flyToAllAnnotations,
    focusAnnotationId,
    formatOptions,
    includeFallback,
    nodes,
    registry,
    removeAnnotationById,
    selectedAnnotationId,
    setElevationReferenceAnnotationId,
    setSelectedAnnotationId,
    toggleAnnotationLocked,
    toggleAnnotationVisibility,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    visualOptions,
  ]);
};
