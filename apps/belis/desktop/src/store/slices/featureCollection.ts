import { createSlice } from "@reduxjs/toolkit";

const focusedSearchMinimumZoomThreshhold = 18;
const searchMinimumZoomThreshhold = 19;
export const MODES = {
  OBJECTS: "OBJECTS",
  TASKLISTS: "TASKLISTS",
  PROTOCOLS: "PROTOCOLS",
};

export const initialFilter = {
  tdta_leuchten: { title: "Leuchten", enabled: true },
  tdta_standort_mast: { title: "Masten (ohne Leuchten)", enabled: true },
  mauerlasche: { title: "Mauerlaschen", enabled: true },
  leitung: { title: "Leitungen", enabled: true },
  schaltstelle: { title: "Schaltstellen", enabled: true },
  abzweigdose: { title: "Abzweigdosen", enabled: true },
};
const initialInFocusMode = false;

const initForModes = (initionalizationValue) => {
  const ret = {};
  for (const mode of Object.values(MODES)) {
    ret[mode] = initionalizationValue;
  }
  return ret;
};

const featureCollectionSlice = createSlice({
  name: "featureCollection",
  initialState: {
    features: [],
    selectedFeature: null,
    mode: MODES.OBJECTS,
  },
  reducers: {
    setFeatureCollection: (state, action) => {
      state.features = action.payload;
    },
    setSelectedFeature: (state, action) => {
      state.selectedFeature = action.payload;
    },
  },
});

export const { setFeatureCollection, setSelectedFeature } =
  featureCollectionSlice.actions;

export const getFeatureCollection = (state) => {
  return state.featureCollection.features;
};

export const getSelectedFeature = (state) => {
  return state.featureCollection.selectedFeature;
};
