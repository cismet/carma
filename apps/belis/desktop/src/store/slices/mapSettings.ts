import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  activeBackgroundLayer: "stadtplan",
  backgroundLayerOpacities: {},
  inPaleMode: false,
  zoom: -1,
};

const slice = createSlice({
  name: "mapSettings",
  initialState,
  reducers: {
    setActiveBackgroundLayer(state, action) {
      state.activeBackgroundLayer = action.payload;
      return state;
    },
    setBackgroundLayerOpacities(state, action) {
      state.backgroundLayerOpacities = action.payload;
      return state;
    },
    setPaleModeActive: (state, action) => {
      state.inPaleMode = action.payload;
    },
    setZoom(state, action) {
      state.zoom = action.payload;
    },
  },
});

export default slice;

export const {
  setActiveBackgroundLayer,
  setBackgroundLayerOpacities,
  setPaleModeActive,
  setZoom,
} = slice.actions;

export const getActiveBackgroundLayer = (state) => {
  return state.mapSettings.activeBackgroundLayer;
};
export const getBackgroundLayerOpacities = (state) => {
  return state.mapSettings.backgroundLayerOpacities;
};
export const isInPaleMode = (state) => {
  return state.mapSettings.inPaleMode;
};

export const getZoom = (state) => {
  return state.mapSettings.zoom;
};
