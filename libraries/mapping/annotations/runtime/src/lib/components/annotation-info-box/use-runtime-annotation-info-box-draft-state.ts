import { useMemo } from "react";

import { useAnnotationToolDraftStates } from "../../context/use-annotation-tool-draft-states";
import type { AnnotationToolDraftState } from "../../registry";
import type { useAnnotationsRuntime } from "../../context/AnnotationsProvider";

const EMPTY_RUNTIME_ANNOTATION_TOOL_DRAFT_STATE: AnnotationToolDraftState =
  Object.freeze({
    coordinates: Object.freeze([]),
    linkedNodeGroupIds: Object.freeze([]),
    feedback: null,
  });

export const useRuntimeAnnotationInfoBoxDraftState = ({
  activeToolType,
  annotationToolDraftStore,
}: Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  "activeToolType" | "annotationToolDraftStore"
>) => {
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

  return {
    activeToolDraftState,
    activeToolDraftFeedback: activeToolType
      ? activeToolDraftState.feedback ?? null
      : null,
  };
};
