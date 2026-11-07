import type { PayloadAction } from "@reduxjs/toolkit";

import type {
  AppendAnnotationEntitiesPayload,
  RemoveAnnotationByIdPayload,
  RemoveAnnotationsByIdsPayload,
  UpdateAnnotationEntryByIdPayload,
} from "../annotations-store-payloads";
import { reconcileNodeLinks } from "../node-links.helpers";
import { pruneUnusedNodes } from "./node-reducers";
import type { AnnotationsStoreDraft } from "./reducer.types";
import { applySelection, selectSingleAnnotation } from "./selection-reducers";

const removeAnnotationEntries = (
  state: AnnotationsStoreDraft,
  annotationIdSet: ReadonlySet<string>,
  nextSelectedAnnotationId: string | null | undefined
) => {
  if (!state.annotationEntries.some((entry) => annotationIdSet.has(entry.id))) {
    return;
  }

  state.annotationEntries = state.annotationEntries.filter(
    (entry) => !annotationIdSet.has(entry.id)
  );
  const usedEdgeIds = new Set(
    state.annotationEntries.flatMap((entry) => entry.edgeIds)
  );
  pruneUnusedNodes(state);
  state.edges = state.edges.filter((edge) => usedEdgeIds.has(edge.id));

  const { elevationReferenceAnnotationId } = state.settingsState;
  if (
    elevationReferenceAnnotationId &&
    annotationIdSet.has(elevationReferenceAnnotationId)
  ) {
    state.settingsState.elevationReferenceAnnotationId = null;
  }

  if (nextSelectedAnnotationId !== undefined) {
    selectSingleAnnotation(state, nextSelectedAnnotationId);
    return;
  }
  applySelection(
    state,
    state.selectionState.selectedAnnotationIds.filter(
      (annotationId) => !annotationIdSet.has(annotationId)
    )
  );
};

export const annotationEntryReducers = {
  appendAnnotationEntities: (
    state: AnnotationsStoreDraft,
    action: PayloadAction<AppendAnnotationEntitiesPayload>
  ) => {
    const {
      annotationEntry,
      nodes,
      linkedNodeGroups,
      edges,
      selectAnnotationId,
    } = action.payload;
    state.nodes.push(...nodes);
    linkedNodeGroups.forEach((incomingNodeLink) => {
      const existingNodeLink = state.linkedNodeGroups.find(
        (nodeLink) => nodeLink.id === incomingNodeLink.id
      );
      if (!existingNodeLink) {
        state.linkedNodeGroups.push({
          id: incomingNodeLink.id,
          nodeIds: [...incomingNodeLink.nodeIds],
        });
        return;
      }

      existingNodeLink.nodeIds = Array.from(
        new Set([...existingNodeLink.nodeIds, ...incomingNodeLink.nodeIds])
      );
    });
    state.edges.push(...edges);
    state.annotationEntries.push({
      ...annotationEntry,
      nodeIds: [...annotationEntry.nodeIds],
      edgeIds: [...annotationEntry.edgeIds],
    });
    state.linkedNodeGroups = reconcileNodeLinks({
      nodes: state.nodes,
      nodeLinks: state.linkedNodeGroups,
    });

    if (selectAnnotationId !== undefined) {
      selectSingleAnnotation(state, selectAnnotationId);
    }
  },

  removeAnnotationById: (
    state: AnnotationsStoreDraft,
    action: PayloadAction<RemoveAnnotationByIdPayload>
  ) => {
    removeAnnotationEntries(
      state,
      new Set([action.payload.annotationId]),
      action.payload.nextSelectedAnnotationId
    );
  },

  removeAnnotationsByIds: (
    state: AnnotationsStoreDraft,
    action: PayloadAction<RemoveAnnotationsByIdsPayload>
  ) => {
    removeAnnotationEntries(
      state,
      new Set(action.payload.annotationIds),
      action.payload.nextSelectedAnnotationId
    );
  },

  updateAnnotationEntryById: (
    state: AnnotationsStoreDraft,
    action: PayloadAction<UpdateAnnotationEntryByIdPayload>
  ) => {
    const {
      annotationId,
      displayName,
      shortLabel,
      shortLabelSource,
      shortLabelCounter,
      hidden,
      locked,
      annotationRole,
      readOnly,
      labelAppearance,
      elevationDisplayMode,
      distanceAnchorCoordinateSelection,
      distanceTriangleAnchorCoordinateRole,
    } = action.payload;
    const targetEntry = state.annotationEntries.find(
      (entry) => entry.id === annotationId
    );
    if (!targetEntry) {
      return;
    }

    if (displayName !== undefined) targetEntry.displayName = displayName;
    if (shortLabel !== undefined) targetEntry.shortLabel = shortLabel;
    if (shortLabelSource !== undefined) {
      targetEntry.shortLabelSource = shortLabelSource;
    }
    if (shortLabelCounter !== undefined) {
      targetEntry.shortLabelCounter = shortLabelCounter;
    }
    if (hidden !== undefined) targetEntry.hidden = hidden;
    if (locked !== undefined) targetEntry.locked = locked;
    if (annotationRole !== undefined)
      targetEntry.annotationRole = annotationRole;
    if (readOnly !== undefined) targetEntry.readOnly = readOnly;
    if (labelAppearance !== undefined) {
      targetEntry.labelAppearance = {
        ...(targetEntry.labelAppearance ?? {}),
        ...labelAppearance,
      };
    }
    if (elevationDisplayMode !== undefined) {
      targetEntry.elevationDisplayMode = elevationDisplayMode;
    }
    if (distanceAnchorCoordinateSelection !== undefined) {
      targetEntry.distanceAnchorCoordinateSelection =
        distanceAnchorCoordinateSelection;
    }
    if (distanceTriangleAnchorCoordinateRole !== undefined) {
      targetEntry.distanceTriangleAnchorCoordinateRole =
        distanceTriangleAnchorCoordinateRole;
    }
  },
};
