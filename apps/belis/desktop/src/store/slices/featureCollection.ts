import { featuresFilter } from "@carma-apps/belis-library";
import { createSlice } from "@reduxjs/toolkit";

export const MODES = {
  OBJECTS: "OBJECTS",
  TASKLISTS: "TASKLISTS",
  PROTOCOLS: "PROTOCOLS",
};

const featureCollectionSlice = createSlice({
  name: "featureCollection",
  initialState: {
    features: [],
    selectedFeature: null,
    mode: MODES.OBJECTS,
    filter: featuresFilter,
  },
  reducers: {
    setFeatureCollection: (state, action) => {
      state.features = action.payload;
    },
    setSelectedFeature: (state, action) => {
      state.selectedFeature = action.payload;
    },
    setFilter: (state, action) => {
      state.filter = action.payload;
    },
  },
});

export default featureCollectionSlice;

export const { setFeatureCollection, setSelectedFeature, setFilter } =
  featureCollectionSlice.actions;

export const getFeatureCollection = (state) => {
  return state.featureCollection.features;
};

export const getSelectedFeature = (state) => {
  return state.featureCollection.selectedFeature;
};

export const getFilter = (state) => state.featureCollection.filter;
