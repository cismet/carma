import { useEffect, useRef } from "react";

import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

import type { AnnotationToolDraftStore } from "../registry";
import type { AddAnnotation } from "./use-annotation-add";

const { POINT: ANNOTATION_TYPE_POINT } = ANNOTATION_TYPES;

/** Leaving the temporary point mode turns the points drafted so far into annotations. */
export const usePointTemporaryModeCommit = ({
  pointTemporaryMode,
  annotationToolDraftStore,
  addAnnotation,
}: {
  pointTemporaryMode: boolean;
  annotationToolDraftStore: AnnotationToolDraftStore;
  addAnnotation: AddAnnotation;
}) => {
  const previousPointTemporaryModeRef = useRef(pointTemporaryMode);
  useEffect(() => {
    if (previousPointTemporaryModeRef.current && !pointTemporaryMode) {
      const pointDraft = annotationToolDraftStore.get(ANNOTATION_TYPE_POINT);
      if (pointDraft.coordinates.length > 0) {
        pointDraft.coordinates.forEach((coordinate, index) => {
          addAnnotation(
            ANNOTATION_TYPE_POINT,
            [coordinate],
            undefined,
            [pointDraft.linkedNodeGroupIds[index] ?? null],
            ANNOTATION_TYPE_POINT
          );
        });
        annotationToolDraftStore.clear(ANNOTATION_TYPE_POINT);
      }
    }
    previousPointTemporaryModeRef.current = pointTemporaryMode;
  }, [addAnnotation, annotationToolDraftStore, pointTemporaryMode]);
};
