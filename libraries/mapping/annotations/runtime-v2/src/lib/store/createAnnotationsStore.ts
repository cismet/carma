import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { RuntimeToolId } from "../types/runtimeTool.types";
import type {
  AnnotationsStoreState,
  RuntimeCoordinate,
  RuntimeAnnotationEntry,
  RuntimeEdge,
  RuntimeLabelAppearance,
  RuntimeNode,
} from "./annotationsStore.types";
export type CreateInitialAnnotationsStoreStateOptions = {
  initialToolType?: RuntimeToolId;
  initialSelectionModeActive?: boolean;
  initialPointTemporaryMode?: boolean;
};

export type AppendAnnotationEntitiesPayload = {
  annotationEntry: RuntimeAnnotationEntry;
  nodes: readonly RuntimeNode[];
  edges: readonly RuntimeEdge[];
  selectAnnotationId?: string | null;
};

export type SetDraftCoordinatesByToolTypePayload = {
  toolType: RuntimeToolId;
  coordinates: readonly RuntimeCoordinate[];
};

export type SetPendingAnnotationIdByToolTypePayload = {
  toolType: RuntimeToolId;
  annotationId: string | null;
};

export type RemoveAnnotationByIdPayload = {
  annotationId: string;
  nextSelectedAnnotationId?: string | null;
};

export type UpdateNodeCoordinateByIdPayload = {
  nodeId: string;
  coordinate: RuntimeCoordinate;
};

export type SetAnnotationTemporaryByIdPayload = {
  annotationId: string;
  temporary: boolean;
};

export type UpdateAnnotationEntryByIdPayload = {
  annotationId: string;
  displayName?: string;
  labelAppearance?: RuntimeLabelAppearance;
};

const UNSET_TOOL_TYPE = "__unset__" as RuntimeToolId;

export const createInitialAnnotationsStoreState = (
  options: CreateInitialAnnotationsStoreStateOptions = {}
): AnnotationsStoreState => {
  const {
    initialToolType = UNSET_TOOL_TYPE,
    initialSelectionModeActive = false,
    initialPointTemporaryMode = false,
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
    settingsState: {
      pointTemporaryMode: initialPointTemporaryMode,
    },
    draftState: {
      draftCoordinatesByToolType: {},
      pendingAnnotationIdByToolType: {},
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
    setPointTemporaryMode: (state, action: PayloadAction<boolean>) => {
      state.settingsState.pointTemporaryMode = action.payload;
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
      Object.keys(state.draftState.pendingAnnotationIdByToolType).forEach(
        (toolType) => {
          if (
            state.draftState.pendingAnnotationIdByToolType[
              toolType as RuntimeToolId
            ] === annotationId
          ) {
            delete state.draftState.pendingAnnotationIdByToolType[
              toolType as RuntimeToolId
            ];
          }
        }
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
    updateNodeCoordinateById: (
      state,
      action: PayloadAction<UpdateNodeCoordinateByIdPayload>
    ) => {
      const { nodeId, coordinate } = action.payload;
      const targetNode = state.nodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        return;
      }
      targetNode.coordinate = coordinate;
    },
    setAnnotationTemporaryById: (
      state,
      action: PayloadAction<SetAnnotationTemporaryByIdPayload>
    ) => {
      const { annotationId, temporary } = action.payload;
      const targetEntry = state.annotationEntries.find(
        (entry) => entry.id === annotationId
      );
      if (!targetEntry) {
        return;
      }
      targetEntry.temporary = temporary;
    },
    updateAnnotationEntryById: (
      state,
      action: PayloadAction<UpdateAnnotationEntryByIdPayload>
    ) => {
      const { annotationId, displayName, labelAppearance } = action.payload;
      const targetEntry = state.annotationEntries.find(
        (entry) => entry.id === annotationId
      );
      if (!targetEntry) {
        return;
      }

      if (displayName !== undefined) {
        targetEntry.displayName = displayName;
      }

      if (labelAppearance !== undefined) {
        targetEntry.labelAppearance = {
          ...(targetEntry.labelAppearance ?? {}),
          ...labelAppearance,
        };
      }
    },
    finalizeTemporaryAnnotationsByToolType: (
      state,
      action: PayloadAction<RuntimeAnnotationEntry["toolType"]>
    ) => {
      const toolType = action.payload;
      state.annotationEntries.forEach((entry) => {
        if (entry.toolType === toolType && entry.temporary) {
          entry.temporary = false;
        }
      });
    },
    clearTemporaryAnnotationsByToolType: (
      state,
      action: PayloadAction<RuntimeAnnotationEntry["toolType"]>
    ) => {
      const toolType = action.payload;
      const temporaryEntryIdSet = new Set(
        state.annotationEntries
          .filter((entry) => entry.toolType === toolType && entry.temporary)
          .map((entry) => entry.id)
      );
      if (temporaryEntryIdSet.size === 0) {
        return;
      }

      state.annotationEntries = state.annotationEntries.filter(
        (entry) => !temporaryEntryIdSet.has(entry.id)
      );

      const usedNodeIds = new Set(
        state.annotationEntries.flatMap((entry) => entry.nodeIds)
      );
      const usedEdgeIds = new Set(
        state.annotationEntries.flatMap((entry) => entry.edgeIds)
      );
      state.nodes = state.nodes.filter((node) => usedNodeIds.has(node.id));
      state.edges = state.edges.filter((edge) => usedEdgeIds.has(edge.id));

      const nextSelectedAnnotationIds =
        state.selectionState.selectedAnnotationIds.filter(
          (annotationId) => !temporaryEntryIdSet.has(annotationId)
        );
      state.selectionState.selectedAnnotationIds = nextSelectedAnnotationIds;
      state.infoBoxState.activeAnnotationId =
        nextSelectedAnnotationIds[nextSelectedAnnotationIds.length - 1] ?? null;
    },
    setDraftCoordinatesByToolType: (
      state,
      action: PayloadAction<SetDraftCoordinatesByToolTypePayload>
    ) => {
      state.draftState.draftCoordinatesByToolType[action.payload.toolType] = [
        ...action.payload.coordinates,
      ];
    },
    clearDraftCoordinatesByToolType: (
      state,
      action: PayloadAction<RuntimeToolId>
    ) => {
      delete state.draftState.draftCoordinatesByToolType[action.payload];
    },
    setPendingAnnotationIdByToolType: (
      state,
      action: PayloadAction<SetPendingAnnotationIdByToolTypePayload>
    ) => {
      state.draftState.pendingAnnotationIdByToolType[action.payload.toolType] =
        action.payload.annotationId;
    },
  },
});

export const {
  appendAnnotationEntities,
  clearTemporaryAnnotationsByToolType,
  clearDraftCoordinatesByToolType,
  finalizeTemporaryAnnotationsByToolType,
  removeAnnotationById,
  setAnnotationTemporaryById,
  setPointTemporaryMode,
  updateNodeCoordinateById,
  updateAnnotationEntryById,
  replaceState,
  setAnnotationToolType,
  setSelectionModeActive,
  setDraftCoordinatesByToolType,
  setPendingAnnotationIdByToolType,
  setSelectedAnnotationId,
} = annotationsSlice.actions;

export const createAnnotationsStore = (initialState: AnnotationsStoreState) =>
  configureStore({
    reducer: annotationsSlice.reducer,
    preloadedState: initialState,
  });

export type AnnotationsStore = ReturnType<typeof createAnnotationsStore>;
