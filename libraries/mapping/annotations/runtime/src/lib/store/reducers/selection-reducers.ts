import type { PayloadAction } from "@reduxjs/toolkit";

import { selectSelectedAnnotationId } from "../annotation-selection.helpers";
import type { SetSelectedAnnotationIdsPayload } from "../annotations-store-payloads";
import type { AnnotationsStoreDraft } from "./reducer.types";

/** Replaces the selection; the info box follows the last selected id unless given. */
export const applySelection = (
  state: AnnotationsStoreDraft,
  selectedAnnotationIds: string[],
  activeAnnotationId: string | null = selectedAnnotationIds[
    selectedAnnotationIds.length - 1
  ] ?? null
) => {
  state.selectionState.previousSelectedAnnotationId =
    selectSelectedAnnotationId(state);
  state.selectionState.selectedAnnotationIds = selectedAnnotationIds;
  state.infoBoxState.activeAnnotationId = activeAnnotationId;
};

export const selectSingleAnnotation = (
  state: AnnotationsStoreDraft,
  annotationId: string | null
) => applySelection(state, annotationId ? [annotationId] : [], annotationId);

export const selectionReducers = {
  setSelectedAnnotationId: (
    state: AnnotationsStoreDraft,
    action: PayloadAction<string | null>
  ) => {
    selectSingleAnnotation(state, action.payload);
  },
  setSelectedAnnotationIds: (
    state: AnnotationsStoreDraft,
    action: PayloadAction<SetSelectedAnnotationIdsPayload>
  ) => {
    applySelection(state, Array.from(new Set(action.payload.filter(Boolean))));
  },
};
