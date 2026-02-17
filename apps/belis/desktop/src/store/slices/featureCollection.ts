import { createSlice } from "@reduxjs/toolkit";

export const MODES = {
  OBJECTS: "OBJECTS",
  TASKLISTS: "TASKLISTS",
  PROTOCOLS: "PROTOCOLS",
};

const featureCollectionSlice = createSlice({
  name: "featureCollection",
  initialState: {
    features: [] as any,
    selectedFeature: null as any,
    mode: MODES.OBJECTS,
    done: true,
    inFocusMode: false,
    featureLoading: false,
  },
  reducers: {
    setFeatureCollection: (state, action) => {
      state.features = action.payload;
    },
    setSelectedFeature: (state, action) => {
      const pickedId = action.payload.id;
      state.features = state.features.map((f) => ({
        ...f,
        selected: f.id === pickedId,
      }));
      state.selectedFeature = action.payload;
    },
    setDone: (state, action) => {
      state.done = action.payload;
    },
    setFocusModeActive: (state, action) => {
      state.inFocusMode = action.payload;
    },
    setFeatureLoading: (state, action) => {
      state.featureLoading = action.payload;
    },
  },
});

export default featureCollectionSlice;

export const {
  setFeatureCollection,
  setSelectedFeature,
  setDone,
  setFocusModeActive,
  setFeatureLoading,
} = featureCollectionSlice.actions;

export const getFeatureCollection = (state) => {
  return state.featureCollection.features;
};

export const getSelectedFeature = (state) => {
  return state.featureCollection.selectedFeature;
};

export const getDone = (state) => state.featureCollection.done;
export const isInFocusMode = (state) => state.featureCollection.inFocusMode;
export const getFeatureLoading = (state) =>
  state.featureCollection.featureLoading;
