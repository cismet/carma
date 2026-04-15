import { useCallback, type Dispatch, type SetStateAction } from "react";

type UseLabelPlacementDraftActionsParams = {
  labelInputPromptPointId: string | null;
  setLabelInputPromptPointId: Dispatch<SetStateAction<string | null>>;
  clearAnnotationsByIds: (ids: string[]) => void;
};

export const useLabelPlacementDraftActions = ({
  labelInputPromptPointId,
  setLabelInputPromptPointId,
  clearAnnotationsByIds,
}: UseLabelPlacementDraftActionsParams) => {
  const requestFinishLabelPlacementDraft = useCallback(() => {
    if (!labelInputPromptPointId) {
      return;
    }

    setLabelInputPromptPointId((previousPromptPointId) =>
      previousPromptPointId === labelInputPromptPointId
        ? null
        : previousPromptPointId
    );
  }, [labelInputPromptPointId, setLabelInputPromptPointId]);

  const requestCancelLabelPlacementDraft = useCallback(() => {
    if (!labelInputPromptPointId) {
      return;
    }

    clearAnnotationsByIds([labelInputPromptPointId]);
  }, [clearAnnotationsByIds, labelInputPromptPointId]);

  return {
    requestFinishLabelPlacementDraft,
    requestCancelLabelPlacementDraft,
  };
};
