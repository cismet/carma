import { useCallback, useMemo } from "react";
import type { Cartesian3 } from "@carma/cesium";

import { ANNOTATION_TYPE_LABEL } from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";

export const useLabelPlacementModeSession = (
  labelInputPromptPointId: string | null,
  requestStartLabelPlacementMode: () => void,
  requestFinishLabelPlacementDraft: () => void,
  requestCancelLabelPlacementDraft: () => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const hasActiveDraft = Boolean(labelInputPromptPointId);

  const requestStart = useCallback(() => {
    requestStartLabelPlacementMode();
  }, [requestStartLabelPlacementMode]);

  const requestClose = useCallback(() => {
    requestFinishLabelPlacementDraft();
  }, [requestFinishLabelPlacementDraft]);

  const discardDraft = useCallback(() => {
    requestCancelLabelPlacementDraft();
  }, [requestCancelLabelPlacementDraft]);

  return useMemo(
    () => ({
      toolType: ANNOTATION_TYPE_LABEL,
      hasActiveDraft: () => hasActiveDraft,
      requestStart,
      requestClose,
      discardDraft,
      onNodeCreated,
    }),
    [discardDraft, hasActiveDraft, onNodeCreated, requestClose, requestStart]
  );
};
