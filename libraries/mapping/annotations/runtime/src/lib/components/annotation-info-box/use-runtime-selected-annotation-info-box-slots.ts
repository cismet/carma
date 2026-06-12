import { useMemo } from "react";
import {
  ANNOTATION_INFO_BOX_ACTION_IDS,
  type AnnotationInfoBoxActionId,
  type AnnotationInfoBoxVisualOptions,
  resolveAnnotationInfoBoxVisualOptions,
} from "@carma-mapping/annotations/ui";

import type { StoredAnnotation } from "../../store";
import type { AnnotationToolDraftState } from "../../registry";
import type { useAnnotationsRuntime } from "../../context/AnnotationsProvider";
import { isReadOnlyAnnotationEntry } from "../../utils/annotation-tool-collections";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxSlotsState,
  type RuntimeAnnotationInfoBoxVisualOptionsContext,
  type RuntimeAnnotationInfoBoxVisualOptionsInput,
} from "./runtime-annotation-info-box-slots.types";
import type { RuntimeAnnotationInfoBoxAuthoringInstruction } from "./use-runtime-annotation-info-box-authoring-instruction";

const MUTATING_ANNOTATION_ACTION_IDS = Object.freeze<
  readonly AnnotationInfoBoxActionId[]
>([ANNOTATION_INFO_BOX_ACTION_IDS.LOCK, ANNOTATION_INFO_BOX_ACTION_IDS.DELETE]);

const resolveAnnotationVisualOptions = ({
  annotation,
  visualOptions,
}: {
  annotation: StoredAnnotation;
  visualOptions: RuntimeAnnotationInfoBoxVisualOptionsInput | undefined;
}): AnnotationInfoBoxVisualOptions => {
  const isReadOnly = isReadOnlyAnnotationEntry(annotation);
  const context = {
    kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
    annotation,
  } satisfies RuntimeAnnotationInfoBoxVisualOptionsContext;
  const baseVisualOptions = resolveAnnotationInfoBoxVisualOptions(
    typeof visualOptions === "function" ? visualOptions(context) : visualOptions
  );

  return {
    ...baseVisualOptions,
    readOnly: Boolean(annotation.locked) || isReadOnly,
    hiddenActionIds: isReadOnly
      ? Array.from(
          new Set([
            ...baseVisualOptions.hiddenActionIds,
            ...MUTATING_ANNOTATION_ACTION_IDS,
          ])
        )
      : baseVisualOptions.hiddenActionIds,
  };
};

export const useRuntimeSelectedAnnotationInfoBoxSlots = ({
  activeToolDraftFeedback,
  activeToolDraftState,
  annotationEntries,
  elevationReferenceAnnotationId,
  exportAnnotationGeoJson,
  authoringInstruction,
  flyToAllAnnotations,
  focusAnnotationId,
  formatOptions,
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
}: Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  | "annotationEntries"
  | "elevationReferenceAnnotationId"
  | "exportAnnotationGeoJson"
  | "flyToAllAnnotations"
  | "focusAnnotationId"
  | "formatOptions"
  | "nodes"
  | "registry"
  | "removeAnnotationById"
  | "selectedAnnotationId"
  | "setElevationReferenceAnnotationId"
  | "setSelectedAnnotationId"
  | "toggleAnnotationLocked"
  | "toggleAnnotationVisibility"
  | "updateAnnotationDisplayName"
  | "updateAnnotationShortLabel"
> & {
  activeToolDraftFeedback: AnnotationToolDraftState["feedback"];
  activeToolDraftState: AnnotationToolDraftState;
  authoringInstruction: RuntimeAnnotationInfoBoxAuthoringInstruction | null;
  visualOptions: RuntimeAnnotationInfoBoxVisualOptionsInput | undefined;
}): Extract<
  RuntimeAnnotationInfoBoxSlotsState,
  { kind: typeof RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION }
> | null =>
  useMemo(() => {
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

    const plugin =
      registry
        .getPluginsByAnnotationType(selectedAnnotation.toolType)
        .find((candidatePlugin) => candidatePlugin.infoBox?.getSlots) ?? null;
    if (!plugin?.infoBox?.getSlots) {
      return null;
    }

    const isReadOnly = isReadOnlyAnnotationEntry(selectedAnnotation);
    const resolvedVisualOptions = resolveAnnotationVisualOptions({
      annotation: selectedAnnotation,
      visualOptions,
    });

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
      updateAnnotationDisplayName: isReadOnly
        ? () => undefined
        : updateAnnotationDisplayName,
      updateAnnotationShortLabel: isReadOnly
        ? () => undefined
        : updateAnnotationShortLabel,
      formatOptions,
      infoBoxVisualOptions: resolvedVisualOptions,
    });
    if (!slots) {
      return null;
    }

    const shouldShowActiveDraftInstruction =
      authoringInstruction?.plugin.alwaysShowHelpTextWhileActive === true &&
      (activeToolDraftState.coordinates.length > 0 ||
        activeToolDraftFeedback !== null);

    return {
      kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.ANNOTATION,
      annotation: selectedAnnotation,
      instructionContent: shouldShowActiveDraftInstruction
        ? authoringInstruction.content ?? undefined
        : undefined,
      instructionToolId: shouldShowActiveDraftInstruction
        ? authoringInstruction.plugin.id
        : undefined,
      slots,
      visualOptions: resolvedVisualOptions,
    };
  }, [
    activeToolDraftFeedback,
    activeToolDraftState,
    annotationEntries,
    elevationReferenceAnnotationId,
    exportAnnotationGeoJson,
    authoringInstruction,
    flyToAllAnnotations,
    focusAnnotationId,
    formatOptions,
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
