import { useCallback } from "react";

import type { AnnotationToolDraftStore } from "../registry";
import {
  removeAnnotationsByIds,
  resolveRemovableSelectedAnnotationIds,
  type AnnotationsStore,
  type StoredAnnotation,
} from "../store";
import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  requestDefaultAnnotationDeleteConfirmation,
  type AnnotationDeleteConfirmationRequester,
  type AnnotationDeleteRequestOptions,
} from "./annotation-delete-confirmation";
import {
  findAnnotationEntryInStore,
  isAnnotationEntryEditable,
  resolveEditableAnnotationEntries,
} from "./annotation-entry-lookup";

export type RequestAnnotationDeleteConfirmation = (
  annotations: readonly StoredAnnotation[],
  options?: AnnotationDeleteRequestOptions
) => Promise<boolean>;

type UseAnnotationRemovalOptions = {
  annotationsStore: AnnotationsStore;
  annotationToolDraftStore: AnnotationToolDraftStore;
  confirmAnnotationDelete?: AnnotationDeleteConfirmationRequester;
};

/** Confirmed deletion of annotations; locked, read-only and mid-draft states block it. */
export const useAnnotationRemoval = ({
  annotationsStore,
  annotationToolDraftStore,
  confirmAnnotationDelete,
}: UseAnnotationRemovalOptions) => {
  const requestAnnotationDeleteConfirmation =
    useCallback<RequestAnnotationDeleteConfirmation>(
      (annotations, options) => {
        if (annotations.length === 0) {
          return Promise.resolve(false);
        }

        if (options?.skipConfirmation) {
          return Promise.resolve(true);
        }

        const requester =
          confirmAnnotationDelete ?? requestDefaultAnnotationDeleteConfirmation;

        return Promise.resolve(
          requester({
            annotations,
            source:
              options?.source ??
              ANNOTATION_DELETE_CONFIRMATION_SOURCES.PROGRAMMATIC,
          })
        ).catch((error) => {
          console.error("[Annotations] Delete confirmation failed", error);
          return false;
        });
      },
      [confirmAnnotationDelete]
    );

  const hasOpenActiveToolDraft = useCallback(() => {
    const activeToolType = annotationsStore.getState().annotationToolType;
    return annotationToolDraftStore.get(activeToolType).coordinates.length > 0;
  }, [annotationToolDraftStore, annotationsStore]);

  const removeAnnotationEntriesByIds = useCallback(
    (
      annotationIds: readonly string[],
      options?: AnnotationDeleteRequestOptions
    ) => {
      const requestedAnnotationIds = Array.from(new Set(annotationIds));
      if (requestedAnnotationIds.length === 0 || hasOpenActiveToolDraft()) {
        return;
      }

      const targetAnnotations = resolveEditableAnnotationEntries(
        annotationsStore.getState().annotationEntries,
        requestedAnnotationIds
      );
      if (targetAnnotations.length === 0) {
        return;
      }

      void requestAnnotationDeleteConfirmation(targetAnnotations, options).then(
        (confirmed) => {
          if (!confirmed) {
            return;
          }

          // The confirmation is asynchronous: re-check against the current state.
          const removableAnnotationIds = resolveEditableAnnotationEntries(
            annotationsStore.getState().annotationEntries,
            targetAnnotations.map(({ id }) => id)
          ).map(({ id }) => id);
          if (removableAnnotationIds.length === 0) {
            return;
          }

          annotationsStore.dispatch(
            removeAnnotationsByIds({ annotationIds: removableAnnotationIds })
          );
        }
      );
    },
    [
      annotationsStore,
      hasOpenActiveToolDraft,
      requestAnnotationDeleteConfirmation,
    ]
  );

  const removeAnnotationEntryById = useCallback(
    (annotationId: string, options?: AnnotationDeleteRequestOptions) => {
      if (
        !isAnnotationEntryEditable(
          findAnnotationEntryInStore(annotationsStore, annotationId)
        )
      ) {
        return;
      }

      removeAnnotationEntriesByIds([annotationId], options);
    },
    [annotationsStore, removeAnnotationEntriesByIds]
  );

  const removeSelectedAnnotationEntries = useCallback(
    (options?: AnnotationDeleteRequestOptions) => {
      const removableAnnotationIds = resolveRemovableSelectedAnnotationIds(
        annotationsStore.getState()
      );
      if (removableAnnotationIds.length === 0) {
        return;
      }

      removeAnnotationEntriesByIds(removableAnnotationIds, options);
    },
    [annotationsStore, removeAnnotationEntriesByIds]
  );

  return {
    requestAnnotationDeleteConfirmation,
    removeAnnotationEntriesByIds,
    removeAnnotationEntryById,
    removeSelectedAnnotationEntries,
  };
};
