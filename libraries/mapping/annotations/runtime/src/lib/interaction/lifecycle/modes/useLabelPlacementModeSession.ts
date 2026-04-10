import { useCallback } from "react";

import { ANNOTATION_TYPE_LABEL } from "@carma-mapping/annotations/core";
import type { Cartesian3 } from "@carma-cesium";

import type { AnnotationModeSession } from "../annotationModeSession.types";
import { useModeSession } from "./useModeSession";
export const useLabelPlacementModeSession = (
  labelInputPromptPointId: string | null,
  requestStartLabelPlacementMode: () => void,
  requestFinishLabelPlacementDraft: () => void,
  requestCancelLabelPlacementDraft: () => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const hasPromptPoint = Boolean(labelInputPromptPointId);

  const requestStart = useCallback(() => {
    requestStartLabelPlacementMode();
  }, [requestStartLabelPlacementMode]);

  const requestFinish = useCallback(() => {
    if (!hasPromptPoint) {
      return false;
    }

    requestFinishLabelPlacementDraft();
    return true;
  }, [hasPromptPoint, requestFinishLabelPlacementDraft]);

  const discardDraft = useCallback(() => {
    if (!hasPromptPoint) {
      return;
    }

    requestCancelLabelPlacementDraft();
  }, [hasPromptPoint, requestCancelLabelPlacementDraft]);

  return useModeSession({
    toolType: ANNOTATION_TYPE_LABEL,
    start: requestStart,
    finish: requestFinish,
    discard: discardDraft,
    nodeCreated: onNodeCreated,
  });
};
