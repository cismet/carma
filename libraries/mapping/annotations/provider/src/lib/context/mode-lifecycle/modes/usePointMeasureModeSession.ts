import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  ANNOTATION_TYPE_POINT,
  isPointMeasurementEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";

export const usePointMeasureModeSession = (
  annotations: AnnotationCollection,
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>,
  clearAnnotationsByIds: (ids: string[]) => void,
  requestStartPointMeasureMode: () => void
): AnnotationModeSession => {
  const temporaryPointMeasureIds = useMemo(
    () =>
      annotations
        .filter(
          (annotation) =>
            isPointMeasurementEntry(annotation) &&
            !annotation.auxiliaryLabelAnchor &&
            Boolean(annotation.temporary)
        )
        .map((annotation) => annotation.id),
    [annotations]
  );

  const hasActiveDraft = temporaryPointMeasureIds.length > 0;

  const requestClose = useCallback(() => {
    if (!hasActiveDraft) {
      return;
    }

    setAnnotations((previousAnnotations) =>
      previousAnnotations.map((annotation) =>
        isPointMeasurementEntry(annotation) && annotation.temporary
          ? { ...annotation, temporary: false }
          : annotation
      )
    );
  }, [hasActiveDraft, setAnnotations]);

  const discardDraft = useCallback(() => {
    if (!hasActiveDraft) {
      return;
    }

    clearAnnotationsByIds(temporaryPointMeasureIds);
  }, [clearAnnotationsByIds, hasActiveDraft, temporaryPointMeasureIds]);

  const requestStart = useCallback(() => {
    requestStartPointMeasureMode();
  }, [requestStartPointMeasureMode]);

  return useMemo(
    () => ({
      toolType: ANNOTATION_TYPE_POINT,
      hasActiveDraft: () => hasActiveDraft,
      requestStart,
      requestClose,
      discardDraft,
    }),
    [discardDraft, hasActiveDraft, requestClose, requestStart]
  );
};
