import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  syncKassenzeichen: false,

  overviewFeatureTypes: ['flaeche', 'front'],
  activeBackgroundLayer: 'stadtplan',
  backgroundLayerOpacities: {},
  activeAdditionalLayers: [],
  additionalLayerOpacities: {},
  hoveredObject: undefined,
  mapLoading: false,
};

const slice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setSyncKassenzeichen(state, action) {
      state.syncKassenzeichen = action.payload;
      return state;
    },
    setOverviewFeatureTypes(state, action) {
      state.overviewFeatureTypes = action.payload;
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
    setHoveredObject(state, action) {
      state.hoveredObject = action.payload;
      return state;
    },
    setMapLoading(state, action) {
      state.mapLoading = action.payload;
      return state;
    },
  },
});

export default slice;

export const {
  setSyncKassenzeichen,
  setOverviewFeatureTypes,
  setActiveBackgroundLayer,
  setBackgroundLayerOpacities,
  setActiveAdditionaLayers,
  setAdditionalLayerOpacities,
  setHoveredObject,
  setMapLoading,
} = slice.actions;

export const getSyncKassenzeichen = (state) => {
  return state.ui.syncKassenzeichen;
};

export const getOverviewFeatureTypes = (state) => {
  return state.ui.overviewFeatureTypes;
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
export const getHoveredObject = (state) => {
  return state.ui.hoveredObject;
};
