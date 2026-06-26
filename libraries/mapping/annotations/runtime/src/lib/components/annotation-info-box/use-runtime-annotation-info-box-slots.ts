import { useAnnotationsRuntime } from "../../context/AnnotationsProvider";
import {
  RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS,
  type RuntimeAnnotationInfoBoxSlotsState,
  type UseRuntimeAnnotationInfoBoxSlotsOptions,
} from "./runtime-annotation-info-box-slots.types";
import { useRuntimeAnnotationInfoBoxAuthoringInstruction } from "./use-runtime-annotation-info-box-authoring-instruction";
import { useRuntimeAnnotationInfoBoxEditingInstruction } from "./use-runtime-annotation-info-box-editing-instruction";
import { useRuntimeAnnotationInfoBoxDraftState } from "./use-runtime-annotation-info-box-draft-state";
import { useRuntimeSelectedAnnotationInfoBoxSlots } from "./use-runtime-selected-annotation-info-box-slots";

export const useRuntimeAnnotationInfoBoxSlots = ({
  authoringInstructionHelpLayout,
  helpLocale,
  includeAuthoringInstruction = false,
  visualOptions,
}: UseRuntimeAnnotationInfoBoxSlotsOptions = {}): RuntimeAnnotationInfoBoxSlotsState | null => {
  const runtime = useAnnotationsRuntime();
  const { activeToolDraftFeedback, activeToolDraftState } =
    useRuntimeAnnotationInfoBoxDraftState(runtime);
  const authoringInstruction = useRuntimeAnnotationInfoBoxAuthoringInstruction({
    activePointQueryPickResult: runtime.activePointQueryPickResult,
    activeToolDraftFeedback,
    activeToolDraftState,
    activeToolType: runtime.activeToolType,
    authoringInstructionHelpLayout,
    helpLocale,
    includeAuthoringInstruction,
    registry: runtime.registry,
    visualOptions,
  });
  const editingInstruction = useRuntimeAnnotationInfoBoxEditingInstruction({
    activeEditedNodeId: runtime.activeEditedNodeId,
    annotationEntries: runtime.annotationEntries,
    registry: runtime.registry,
    authoringInstructionHelpLayout,
    helpLocale,
    includeAuthoringInstruction,
    visualOptions,
  });
  const selectedAnnotationSlots = useRuntimeSelectedAnnotationInfoBoxSlots({
    activeToolDraftFeedback,
    activeToolDraftState,
    annotationEntries: runtime.annotationEntries,
    elevationReferenceAnnotationId: runtime.elevationReferenceAnnotationId,
    exportAnnotationGeoJson: runtime.exportAnnotationGeoJson,
    authoringInstruction,
    flyToAllAnnotations: runtime.flyToAllAnnotations,
    focusAnnotationId: runtime.focusAnnotationId,
    formatOptions: runtime.formatOptions,
    nodes: runtime.nodes,
    registry: runtime.registry,
    removeAnnotationById: runtime.removeAnnotationById,
    selectedAnnotationId: runtime.selectedAnnotationId,
    setElevationReferenceAnnotationId:
      runtime.setElevationReferenceAnnotationId,
    setSelectedAnnotationId: runtime.setSelectedAnnotationId,
    toggleAnnotationLocked: runtime.toggleAnnotationLocked,
    toggleAnnotationVisibility: runtime.toggleAnnotationVisibility,
    updateAnnotationDisplayName: runtime.updateAnnotationDisplayName,
    updateAnnotationShortLabel: runtime.updateAnnotationShortLabel,
    visualOptions,
  });

  // While a node is being edited the help describes that interaction; it takes
  // priority over the selected-measurement panel and the creation hint.
  if (editingInstruction) {
    return editingInstruction;
  }

  if (selectedAnnotationSlots || runtime.selectedAnnotationId) {
    return selectedAnnotationSlots;
  }

  if (!authoringInstruction?.content || !authoringInstruction.visualOptions) {
    return null;
  }

  return {
    kind: RUNTIME_ANNOTATION_INFO_BOX_SLOT_STATE_KINDS.AUTHORING_INSTRUCTION,
    plugin: authoringInstruction.plugin,
    slots: {
      content: authoringInstruction.content,
      collapsible: false,
    },
    visualOptions: authoringInstruction.visualOptions,
  };
};
