import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  syncLandparcel: false,
  activeBackgroundLayer: "stadtplan",
  backgroundLayerOpacities: {},
  activeAdditionalLayers: [],
  additionalLayerOpacities: {},
  fetchLandParcelError: false,
  fetchDocumentsError: false,
  hoveredLandparcel: undefined,
  mapLoading: false,
  selectedTrueOrthoYear: 2024,
};

const slice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setSyncLandparcel(state, action) {
      state.syncLandparcel = action.payload;
      return state;
    },
    setActiveBackgroundLayer(state, action) {
      state.activeBackgroundLayer = action.payload;
      return state;
    },
    setBackgroundLayerOpacities(state, action) {
      state.backgroundLayerOpacities = action.payload;
      return state;
    },

    setActiveAdditionaLayers(state, action) {
      state.activeAdditionalLayers = action.payload;
      return state;
    },
    setAdditionalLayerOpacities(state, action) {
      state.additionalLayerOpacities = action.payload;
      return state;
    },
    setHoveredLandparcel(state, action) {
      state.hoveredLandparcel = action.payload;
      return state;
    },
    setMapLoading(state, action) {
      state.mapLoading = action.payload;
      return state;
    },
    setSelectedTrueOrthoYear(state, action) {
      state.selectedTrueOrthoYear = action.payload;
      return state;
    },
    setFetchLandParcelError(state, action) {
      state.fetchLandParcelError = action.payload;
      return state;
    },
    setFetchDocumentsError(state, action) {
      state.fetchDocumentsError = action.payload;
      return state;
    },
  },
});

export default slice;

export const {
  setSyncLandparcel,
  setActiveBackgroundLayer,
  setBackgroundLayerOpacities,
  setActiveAdditionaLayers,
  setAdditionalLayerOpacities,
  setHoveredLandparcel,
  setMapLoading,
  setSelectedTrueOrthoYear,
  setFetchLandParcelError,
  setFetchDocumentsError,
} = slice.actions;

export const getSyncLandparcel = (state) => {
  return state.ui.syncLandparcel;
};

export const getActiveBackgroundLayer = (state) => {
  return state.ui.activeBackgroundLayer;
};
export const getBackgroundLayerOpacities = (state) => {
  return state.ui.backgroundLayerOpacities;
};
export const getActiveAdditionalLayers = (state) => {
  return state.ui.activeAdditionalLayers;
};
export const getAdditionalLayerOpacities = (state) => {
  return state.ui.additionalLayerOpacities;
};
export const isMapLoading = (state) => {
  return state.ui.mapLoading;
};
export const getHoveredLandparcel = (state) => {
  return state.ui.hoveredLandparcel;
};
export const getSelectedTrueOrthoYear = (state) => {
  return state.ui.selectedTrueOrthoYear;
};
export const getFetchLandParcelError = (state) => {
  return state.ui.fetchLandParcelError;
};
export const getFetchDocumentsError = (state) => {
  return state.ui.fetchDocumentsError;
};
