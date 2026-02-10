import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  activeBackgroundLayer: "rvrLight",
  backgroundLayerOpacities: {} as Record<string, number>,
  activeAdditionalLayers: [] as string[],
  additionalLayerOpacities: {} as Record<string, number>,
  inPaleMode: false,
  inSearchMode: true,
  inSearchWishedMode: true,
  zoom: -1,
};
export const searchMinimumZoomThreshhold = 18;

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
    setActiveAdditionalLayers(state, action) {
      state.activeAdditionalLayers = action.payload;
      return state;
    },
    setAdditionalLayerOpacities(state, action) {
      state.additionalLayerOpacities = action.payload;
      return state;
    },
    setPaleModeActive: (state, action) => {
      state.inPaleMode = action.payload;
    },
    setZoom(state, action) {
      state.zoom = action.payload;
    },
    setSearchMode(state, action) {
      state.inSearchMode = action.payload;
    },
    setWishedSearchMode(state, action) {
      state.inSearchWishedMode = action.payload;
    },
  },
});

export default slice;

export const {
  setActiveBackgroundLayer,
  setBackgroundLayerOpacities,
  setActiveAdditionalLayers,
  setAdditionalLayerOpacities,
  setPaleModeActive,
  setZoom,
  setSearchMode,
  setWishedSearchMode,
} = slice.actions;

export const getActiveBackgroundLayer = (state) => {
  return state.mapSettings.activeBackgroundLayer;
};
export const getBackgroundLayerOpacities = (state) => {
  return state.mapSettings.backgroundLayerOpacities;
};
export const getActiveAdditionalLayers = (state) => {
  return state.mapSettings.activeAdditionalLayers;
};
export const getAdditionalLayerOpacities = (state) => {
  return state.mapSettings.additionalLayerOpacities;
};
export const isInPaleMode = (state) => {
  return state.mapSettings.inPaleMode;
};

export const getZoom = (state) => {
  return state.mapSettings.zoom;
};

export const isInSearchMode = (state) => {
  return state.mapSettings.inSearchMode;
};

export const isInWishedSearchMode = (state) => {
  return state.mapSettings.inSearchWishedMode;
};

export const isSearchForbidden = (state) => {
  let zoom = state.mapSettings.zoom;
  const isInSearchMode = state.mapSettings.inSearchMode;
  if (zoom === -1) {
    zoom = new URLSearchParams(window.location.search).get("zoom");
  }

  return zoom >= searchMinimumZoomThreshhold && isInSearchMode;
};
