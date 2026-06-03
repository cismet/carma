import { useMemo } from "react";

import {
  AnnotationInfoBoxTextContent,
  type AnnotationInfoBoxSlots,
  type AnnotationInfoBoxVisualOptions,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import { useAnnotationsRuntime } from "../../context/AnnotationsProvider";
import { useAnnotationToolDraftStates } from "../../context/use-annotation-tool-draft-states";
import type { StoredAnnotation } from "../../store";
import type { AnnotationToolPlugin } from "../../registry";
import { resolveAnnotationToolFallbackPlugin } from "../../utils/annotation-tool-collections";

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
  includeFallback?: boolean;
  visualOptions?: RuntimeAnnotationInfoBoxVisualOptionsInput;
};

const resolveRuntimeAnnotationInfoBoxVisualOptions = (
  visualOptions: RuntimeAnnotationInfoBoxVisualOptionsInput | undefined,
  context: RuntimeAnnotationInfoBoxVisualOptionsContext
): AnnotationInfoBoxVisualOptions =>
  resolveAnnotationInfoBoxVisualOptions(
    typeof visualOptions === "function" ? visualOptions(context) : visualOptions
  );

export const useRuntimeAnnotationInfoBoxSlots = ({
  includeFallback = false,
  visualOptions,
}: UseRuntimeAnnotationInfoBoxSlotsOptions = {}): RuntimeAnnotationInfoBoxSlotsState | null => {
  const {
    registry,
    activeToolType,
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
  const activeToolDraftFeedback = activeToolType
    ? activeDraftStates[activeToolType]?.feedback
    : null;

  return useMemo(() => {
    if (!selectedAnnotationId) {
      if (!includeFallback) {
        return null;
      }

      const fallbackPlugin = resolveAnnotationToolFallbackPlugin({
        activeToolType,
        registry,
      });

      if (!fallbackPlugin?.helpText?.length) {
        return null;
      }

      const resolvedVisualOptions =
        resolveRuntimeAnnotationInfoBoxVisualOptions(visualOptions, {
          kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.FALLBACK,
          plugin: fallbackPlugin,
        });

      return {
        kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.FALLBACK,
        plugin: fallbackPlugin,
        slots: {
          headingTitle: fallbackPlugin.descriptor.label,
          content: (
            <AnnotationInfoBoxTextContent visualOptions={resolvedVisualOptions}>
              {activeToolDraftFeedback ? (
                <p
                  key="active-tool-draft-feedback"
                  style={{
                    color:
                      activeToolDraftFeedback.kind === "warning"
                        ? "#b45309"
                        : undefined,
                    fontWeight: 600,
                  }}
                >
                  {activeToolDraftFeedback.message}
                </p>
              ) : null}
              {fallbackPlugin.helpText.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </AnnotationInfoBoxTextContent>
          ),
          collapsible: true,
        },
        visualOptions: resolvedVisualOptions,
      };
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

    const resolvedVisualOptions = resolveRuntimeAnnotationInfoBoxVisualOptions(
      visualOptions,
      {
        kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
        annotation: selectedAnnotation,
      }
    );

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

    return {
      kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
      annotation: selectedAnnotation,
      slots,
      visualOptions: resolvedVisualOptions,
    };
  }, [
    activeToolDraftFeedback,
    activeToolType,
    annotationEntries,
    elevationReferenceAnnotationId,
    exportAnnotationGeoJson,
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
