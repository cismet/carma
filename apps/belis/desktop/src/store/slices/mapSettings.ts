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
  enabledLeitungstypen: {} as Record<number, boolean>,
  enabledCategoryFilters: {} as Record<string, boolean>,
  snappingEnabled: false,
  // "Gefährlicher Löschmodus": when on, an existing Fachobjekt's form exposes a
  // GitHub-style "Gefahrenzone" delete action at the bottom. Off by default so
  // the destructive UI stays hidden until a user opts in via Einstellungen.
  dangerousDeleteMode: false,
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
    setLeitungstypEnabled(
      state,
      action: { payload: { id: number; enabled: boolean } }
    ) {
      state.enabledLeitungstypen[action.payload.id] = action.payload.enabled;
    },
    setAllLeitungstypen(state, action: { payload: Record<number, boolean> }) {
      state.enabledLeitungstypen = action.payload;
    },
    setCategoryFilterEnabled(
      state,
      action: { payload: { key: string; enabled: boolean } }
    ) {
      state.enabledCategoryFilters[action.payload.key] =
        action.payload.enabled;
    },
    setAllCategoryFilters(
      state,
      action: { payload: Record<string, boolean> }
    ) {
      state.enabledCategoryFilters = action.payload;
    },
    setSnappingEnabled(state, action: { payload: boolean }) {
      state.snappingEnabled = action.payload;
    },
    setDangerousDeleteMode(state, action: { payload: boolean }) {
      state.dangerousDeleteMode = action.payload;
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
  setLeitungstypEnabled,
  setAllLeitungstypen,
  setCategoryFilterEnabled,
  setAllCategoryFilters,
  setSnappingEnabled,
  setDangerousDeleteMode,
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

export const getEnabledLeitungstypen = (state) => {
  return state.mapSettings.enabledLeitungstypen;
};

export const getEnabledCategoryFilters = (state) => {
  return state.mapSettings.enabledCategoryFilters;
};

export const isSnappingEnabled = (state) => {
  return state.mapSettings.snappingEnabled;
};

export const isDangerousDeleteModeActive = (state) => {
  return state.mapSettings.dangerousDeleteMode;
};
