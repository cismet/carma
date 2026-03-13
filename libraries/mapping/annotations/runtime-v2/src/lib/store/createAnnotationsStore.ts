import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type {
  AnnotationsStoreState,
  RuntimeCoordinate,
  RuntimeAnnotationEntry,
  RuntimeEdge,
  RuntimeNode,
} from "./annotationsStore.types";
import type { RuntimeToolId } from "../types/runtimeTool.types";

export type CreateInitialAnnotationsStoreStateOptions = {
  initialToolType?: RuntimeToolId;
  initialSelectionModeActive?: boolean;
};

export type AppendAnnotationEntitiesPayload = {
  annotationEntry: RuntimeAnnotationEntry;
  nodes: readonly RuntimeNode[];
  edges: readonly RuntimeEdge[];
  selectAnnotationId?: string | null;
};

export type SetPolylinePreviewCoordinatesPayload = {
  coordinates: readonly RuntimeCoordinate[];
};

export type SetDistancePreviewCoordinatesPayload = {
  coordinates: readonly RuntimeCoordinate[];
};

export type RemoveAnnotationByIdPayload = {
  annotationId: string;
  nextSelectedAnnotationId?: string | null;
};

const UNSET_TOOL_TYPE = "__unset__" as RuntimeToolId;

export const createInitialAnnotationsStoreState = (
  options: CreateInitialAnnotationsStoreStateOptions = {}
): AnnotationsStoreState => {
  const {
    initialToolType = UNSET_TOOL_TYPE,
    initialSelectionModeActive = false,
  } = options;

  return {
    annotationToolType: initialToolType,
    selectionState: {
      selectedAnnotationIds: [],
      previousSelectedAnnotationId: null,
      selectionModeActive: initialSelectionModeActive,
      selectModeAdditive: false,
      selectModeRectangle: false,
    },
    annotationEntries: [],
    nodes: [],
    edges: [],
    infoBoxState: {
      activeAnnotationId: null,
    },
    draftState: {
      polylinePreviewCoordinates: [],
      distancePreviewCoordinates: [],
    },
  };
};

const annotationsSlice = createSlice({
  name: "annotationsV2",
  initialState: createInitialAnnotationsStoreState(),
  reducers: {
    replaceState: (_, action: PayloadAction<AnnotationsStoreState>) =>
      action.payload,
    setAnnotationToolType: (state, action: PayloadAction<RuntimeToolId>) => {
      state.annotationToolType = action.payload;
    },
    setSelectionModeActive: (state, action: PayloadAction<boolean>) => {
      state.selectionState.selectionModeActive = action.payload;
    },
    setSelectedAnnotationId: (state, action: PayloadAction<string | null>) => {
      const nextSelectedAnnotationId = action.payload;
      const previousSelectedAnnotationId =
        state.selectionState.selectedAnnotationIds[
          state.selectionState.selectedAnnotationIds.length - 1
        ] ?? null;

      state.selectionState.previousSelectedAnnotationId =
        previousSelectedAnnotationId;
      state.selectionState.selectedAnnotationIds = nextSelectedAnnotationId
        ? [nextSelectedAnnotationId]
        : [];
      state.infoBoxState.activeAnnotationId = nextSelectedAnnotationId;
    },
    appendAnnotationEntities: (
      state,
      action: PayloadAction<AppendAnnotationEntitiesPayload>
    ) => {
      state.nodes.push(...action.payload.nodes);
      state.edges.push(...action.payload.edges);
      state.annotationEntries.push({
        ...action.payload.annotationEntry,
        nodeIds: [...action.payload.annotationEntry.nodeIds],
        edgeIds: [...action.payload.annotationEntry.edgeIds],
      });

      if (action.payload.selectAnnotationId !== undefined) {
        const previousSelectedAnnotationId =
          state.selectionState.selectedAnnotationIds[
            state.selectionState.selectedAnnotationIds.length - 1
          ] ?? null;
        state.selectionState.previousSelectedAnnotationId =
          previousSelectedAnnotationId;
        state.selectionState.selectedAnnotationIds = action.payload
          .selectAnnotationId
          ? [action.payload.selectAnnotationId]
          : [];
        state.infoBoxState.activeAnnotationId =
          action.payload.selectAnnotationId ?? null;
      }
    },
    removeAnnotationById: (
      state,
      action: PayloadAction<RemoveAnnotationByIdPayload>
    ) => {
      const { annotationId, nextSelectedAnnotationId } = action.payload;
      const previousSelectionId =
        state.selectionState.selectedAnnotationIds[
          state.selectionState.selectedAnnotationIds.length - 1
        ] ?? null;
      const hasTarget = state.annotationEntries.some(
        (annotationEntry) => annotationEntry.id === annotationId
      );
      if (!hasTarget) {
        return;
      }

      state.annotationEntries = state.annotationEntries.filter(
        (annotationEntry) => annotationEntry.id !== annotationId
      );

      const usedNodeIds = new Set(
        state.annotationEntries.flatMap(
          (annotationEntry) => annotationEntry.nodeIds
        )
      );
      const usedEdgeIds = new Set(
        state.annotationEntries.flatMap(
          (annotationEntry) => annotationEntry.edgeIds
        )
      );

      state.nodes = state.nodes.filter((node) => usedNodeIds.has(node.id));
      state.edges = state.edges.filter((edge) => usedEdgeIds.has(edge.id));

      state.selectionState.previousSelectedAnnotationId = previousSelectionId;

      if (nextSelectedAnnotationId !== undefined) {
        state.selectionState.selectedAnnotationIds = nextSelectedAnnotationId
          ? [nextSelectedAnnotationId]
          : [];
        state.infoBoxState.activeAnnotationId =
          nextSelectedAnnotationId ?? null;
        return;
      }

      const nextSelectedAnnotationIds =
        state.selectionState.selectedAnnotationIds.filter(
          (selectedAnnotationId) => selectedAnnotationId !== annotationId
        );
      state.selectionState.selectedAnnotationIds = nextSelectedAnnotationIds;
      state.infoBoxState.activeAnnotationId =
        nextSelectedAnnotationIds[nextSelectedAnnotationIds.length - 1] ?? null;
    },
    setPolylinePreviewCoordinates: (
      state,
      action: PayloadAction<SetPolylinePreviewCoordinatesPayload>
    ) => {
      state.draftState.polylinePreviewCoordinates = [
        ...action.payload.coordinates,
      ];
    },
    clearPolylinePreviewCoordinates: (state) => {
      state.draftState.polylinePreviewCoordinates = [];
    },
    setDistancePreviewCoordinates: (
      state,
      action: PayloadAction<SetDistancePreviewCoordinatesPayload>
    ) => {
      state.draftState.distancePreviewCoordinates = [
        ...action.payload.coordinates,
      ];
    },
    clearDistancePreviewCoordinates: (state) => {
      state.draftState.distancePreviewCoordinates = [];
    },
  },
});

export const {
  appendAnnotationEntities,
  clearDistancePreviewCoordinates,
  clearPolylinePreviewCoordinates,
  removeAnnotationById,
  replaceState,
  setDistancePreviewCoordinates,
  setAnnotationToolType,
  setSelectionModeActive,
  setPolylinePreviewCoordinates,
  setSelectedAnnotationId,
} = annotationsSlice.actions;

export const createAnnotationsStore = (initialState: AnnotationsStoreState) =>
  configureStore({
    reducer: annotationsSlice.reducer,
    preloadedState: initialState,
  });

export type AnnotationsStore = ReturnType<typeof createAnnotationsStore>;
