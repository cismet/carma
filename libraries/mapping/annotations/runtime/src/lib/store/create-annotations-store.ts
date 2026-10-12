import {
  configureStore,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  ANNOTATION_SELECT_TOOL_ID,
  type AnnotationToolId,
} from "@carma-mapping/annotations/core";

import type { AnnotationsStoreState } from "./annotations-store.types";
import { annotationEntryReducers } from "./reducers/annotation-entry-reducers";
import { nodeReducers } from "./reducers/node-reducers";
import { selectionReducers } from "./reducers/selection-reducers";
import type { SetElevationReferenceAnnotationIdPayload } from "./annotations-store-payloads";

export type {
  AppendAnnotationEntitiesPayload,
  InsertNodeIntoMeasurementEdgePayload,
  RemoveAnnotationByIdPayload,
  RemoveAnnotationsByIdsPayload,
  RemoveNodeFromAnnotationPayload,
  SetElevationReferenceAnnotationIdPayload,
  SetSelectedAnnotationIdsPayload,
  UpdateAnnotationEntryByIdPayload,
  UpdateNodeCoordinateByIdPayload,
} from "./annotations-store-payloads";

export type CreateInitialAnnotationsStoreStateOptions = {
  initialToolType?: AnnotationToolId;
  initialPointTemporaryMode?: boolean;
};

export const createInitialAnnotationsStoreState = (
  options: CreateInitialAnnotationsStoreStateOptions = {}
): AnnotationsStoreState => {
  const {
    initialToolType = ANNOTATION_SELECT_TOOL_ID,
    initialPointTemporaryMode = false,
  } = options;

  return {
    annotationToolType: initialToolType,
    selectionState: {
      selectedAnnotationIds: [],
      previousSelectedAnnotationId: null,
    },
    annotationEntries: [],
    nodes: [],
    linkedNodeGroups: [],
    edges: [],
    infoBoxState: {
      activeAnnotationId: null,
    },
    settingsState: {
      pointTemporaryMode: initialPointTemporaryMode,
      elevationReferenceAnnotationId: null,
      nextShortLabelCounterByToolType: {},
    },
  };
};

const annotationsSlice = createSlice({
  name: "annotationsRuntime",
  initialState: createInitialAnnotationsStoreState(),
  reducers: {
    setAnnotationToolType: (state, action: PayloadAction<AnnotationToolId>) => {
      state.annotationToolType = action.payload;
    },
    setPointTemporaryMode: (state, action: PayloadAction<boolean>) => {
      state.settingsState.pointTemporaryMode = action.payload;
    },
    setElevationReferenceAnnotationId: (
      state,
      action: PayloadAction<SetElevationReferenceAnnotationIdPayload>
    ) => {
      state.settingsState.elevationReferenceAnnotationId = action.payload;
    },
    ...selectionReducers,
    ...annotationEntryReducers,
    ...nodeReducers,
  },
});

export const {
  appendAnnotationEntities,
  removeAnnotationById,
  removeAnnotationsByIds,
  removeNodeFromAnnotation,
  setElevationReferenceAnnotationId,
  setPointTemporaryMode,
  insertNodeIntoMeasurementEdge,
  updateNodeCoordinateById,
  updateAnnotationEntryById,
  setAnnotationToolType,
  setSelectedAnnotationId,
  setSelectedAnnotationIds,
} = annotationsSlice.actions;

export const createAnnotationsStore = (initialState: AnnotationsStoreState) =>
  configureStore({
    reducer: annotationsSlice.reducer,
    preloadedState: initialState,
  });

export type AnnotationsStore = ReturnType<typeof createAnnotationsStore>;
