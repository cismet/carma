import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { Layer, SavedLayerConfig } from "@carma-mapping/layers";
import {
  SELECTED_LAYER_INDEX,
  type BackgroundLayer,
  type LayerState,
  type MappingState,
} from "@carma-apps/portals";

import { RootState } from "..";
import { layerMap } from "../../config";

const initialState: MappingState = {
  layers: [],
  savedLayerConfigs: [],
  selectedLayerIndex: SELECTED_LAYER_INDEX.NO_SELECTION,

  selectedMapLayer: {
    title: "Stadtplan",
    id: "stadtplan",
    opacity: 1.0,
    description: ``,
    inhalt: layerMap["stadtplan"].inhalt,
    eignung: layerMap["stadtplan"].eignung,
    visible: true,
    layerType: "wmts",
    props: {
      name: "",
      url: layerMap["stadtplan"].url,
    },
    layers: layerMap["stadtplan"].layers,
  },

  backgroundLayer: {
    title: "Stadtplan",
    id: "karte",
    opacity: 1.0,
    description: ``,
    inhalt: layerMap["stadtplan"].inhalt,
    eignung: layerMap["stadtplan"].eignung,
    visible: true,
    layerType: "wmts",
    props: {
      name: "",
      url: layerMap["stadtplan"].url,
    },
    layers: layerMap["stadtplan"].layers,
  },

  showLeftScrollButton: false,
  showRightScrollButton: false,
  showFullscreenButton: true,
  showHamburgerMenu: false,
  showLocatorButton: true,
  showMeasurementButton: true,

  focusMode: false,

  clickFromInfoView: false,
  startDrawing: false,
};

const slice = createSlice({
  name: "mapping",
  initialState,
  reducers: {
    setLayers(state, action) {
      state.layers = action.payload;
    },
    appendLayer(state, action: PayloadAction<Layer>) {
      let newLayers = state.layers;
      newLayers.push(action.payload);
      state.layers = newLayers;
    },
    updateLayer(state, action: PayloadAction<Layer>) {
      const newLayers = state.layers.map((obj) => {
        if (obj.id === action.payload.id) {
          return action.payload;
        } else {
          return obj;
        }
      });
      state.layers = newLayers;
    },
    removeLayer(state, action: PayloadAction<string>) {
      const newLayers = state.layers.filter((obj) => obj.id !== action.payload);
      state.layers = newLayers;
    },
    removeLastLayer(state) {
      const newLayers = state.layers.slice(0, -1);
      state.layers = newLayers;
    },

    appendSavedLayerConfig(state, action: PayloadAction<SavedLayerConfig>) {
      let newLayers = state.savedLayerConfigs;
      newLayers.push(action.payload);
      state.savedLayerConfigs = newLayers;
    },
    deleteSavedLayerConfig(state, action: PayloadAction<string>) {
      let newLayers = state.savedLayerConfigs;
      newLayers = newLayers.filter((obj) => {
        return obj.id !== action.payload;
      });
      state.savedLayerConfigs = newLayers;
    },

    changeOpacity(state, action) {
      const newLayers = state.layers.map((obj) => {
        if (obj.id === action.payload.id) {
          return {
            ...obj,
            opacity: action.payload.opacity,
          };
        } else {
          return obj;
        }
      });
      state.layers = newLayers;
    },

    changeVisibility(
      state,
      action: PayloadAction<{ id: string; visible: boolean }>,
    ) {
      if (action.payload.id === state.backgroundLayer.id) {
        state.backgroundLayer.visible = action.payload.visible;
      }
      const newLayers = state.layers.map((obj) => {
        if (obj.id === action.payload.id) {
          return {
            ...obj,
            visible: action.payload.visible,
          };
        } else {
          return obj;
        }
      });
      state.layers = newLayers;
    },

    toggleUseInFeatureInfo(state, action) {
      const { id } = action.payload;
      const newLayers = state.layers.map((obj) => {
        if (obj.id === id) {
          return {
            ...obj,
            useInFeatureInfo: !obj.useInFeatureInfo,
          };
        } else {
          return obj;
        }
      });
      state.layers = newLayers;
    },

    setSelectedLayerIndex(state, action) {
      state.selectedLayerIndex = action.payload;
    },
    setSelectedLayerIndexBackgroundLayer(state) {
      state.selectedLayerIndex = SELECTED_LAYER_INDEX.BACKGROUND_LAYER;
    },
    setSelectedLayerIndexNoSelection(state) {
      state.selectedLayerIndex = SELECTED_LAYER_INDEX.NO_SELECTION;
    },
    setNextSelectedLayerIndex(state) {
      const newIndex = state.selectedLayerIndex + 1;
      if (newIndex >= state.layers.length) {
        state.selectedLayerIndex = SELECTED_LAYER_INDEX.BACKGROUND_LAYER;
      } else {
        state.selectedLayerIndex = newIndex;
      }
    },
    setPreviousSelectedLayerIndex(state) {
      const newIndex = state.selectedLayerIndex - 1;
      if (newIndex < SELECTED_LAYER_INDEX.BACKGROUND_LAYER) {
        state.selectedLayerIndex = state.layers.length - 1;
      } else {
        state.selectedLayerIndex = newIndex;
      }
    },

    setSelectedMapLayer(state, action: PayloadAction<BackgroundLayer>) {
      state.selectedMapLayer = action.payload;
    },
    setBackgroundLayer(state, action: PayloadAction<BackgroundLayer>) {
      state.backgroundLayer = action.payload;
    },

    setShowLeftScrollButton(state, action) {
      state.showLeftScrollButton = action.payload;
    },
    setShowRightScrollButton(state, action) {
      state.showRightScrollButton = action.payload;
    },
    setShowFullscreenButton(state, action: PayloadAction<boolean>) {
      state.showFullscreenButton = action.payload;
    },
    setShowHamburgerMenu(state, action: PayloadAction<boolean>) {
      state.showHamburgerMenu = action.payload;
    },
    setShowLocatorButton(state, action: PayloadAction<boolean>) {
      state.showLocatorButton = action.payload;
    },
    setShowMeasurementButton(state, action: PayloadAction<boolean>) {
      state.showMeasurementButton = action.payload;
    },

    setFocusMode(state, action: PayloadAction<boolean>) {
      state.focusMode = action.payload;
    },

    setStartDrawing(state, action: PayloadAction<boolean>) {
      state.startDrawing = action.payload;
    },
    setClickFromInfoView(state, action: PayloadAction<boolean>) {
      state.clickFromInfoView = action.payload;
    },
  },
});

export const {
  setLayers,
  appendLayer,
  updateLayer,
  removeLayer,
  removeLastLayer,

  appendSavedLayerConfig,
  deleteSavedLayerConfig,
  changeOpacity,
  changeVisibility,

  setSelectedLayerIndex,
  setSelectedLayerIndexBackgroundLayer,
  setSelectedLayerIndexNoSelection,
  setNextSelectedLayerIndex,
  setPreviousSelectedLayerIndex,
  setSelectedMapLayer,
  setBackgroundLayer,
  setShowLeftScrollButton,
  setShowRightScrollButton,
  setShowFullscreenButton,
  setShowLocatorButton,
  setShowMeasurementButton,
  setShowHamburgerMenu,

  setFocusMode,
  setClickFromInfoView,
  setStartDrawing,

  toggleUseInFeatureInfo,
} = slice.actions;

export const getBackgroundLayer = (state: RootState) =>
  state.mapping.backgroundLayer;
export const getClickFromInfoView = (state: RootState) =>
  state.mapping.clickFromInfoView;
export const getFocusMode = (state: RootState) => state.mapping.focusMode;

export const getLayers = (state: RootState) => state.mapping.layers;
export const getSavedLayerConfigs = (state: RootState) =>
  state.mapping.savedLayerConfigs;
export const getSelectedLayerIndex = (state: RootState) =>
  state.mapping.selectedLayerIndex;

// derived selectors for selectedLayerIndex;
export const getSelectedLayerIndexIsNoSelection = (state: RootState): boolean =>
  state.mapping.selectedLayerIndex === SELECTED_LAYER_INDEX.NO_SELECTION;
export const getSelectedLayerIndexIsBackground = (state: RootState): boolean =>
  state.mapping.selectedLayerIndex === SELECTED_LAYER_INDEX.BACKGROUND_LAYER;
export const getSelectedLayerIndexIsAddedLayer = (state: RootState): boolean =>
  state.mapping.selectedLayerIndex > SELECTED_LAYER_INDEX.NO_SELECTION;

export const getSelectedMapLayer = (state: RootState) =>
  state.mapping.selectedMapLayer;
export const getShowFullscreenButton = (state: RootState) =>
  state.mapping.showFullscreenButton;
export const getShowHamburgerMenu = (state: RootState) =>
  state.mapping.showHamburgerMenu;
export const getShowLeftScrollButton = (state: RootState) =>
  state.mapping.showLeftScrollButton;
export const getShowLocatorButton = (state: RootState) =>
  state.mapping.showLocatorButton;
export const getShowMeasurementButton = (state: RootState) =>
  state.mapping.showMeasurementButton;
export const getShowRightScrollButton = (state: RootState) =>
  state.mapping.showRightScrollButton;
export const getStartDrawing = (state: RootState) => state.mapping.startDrawing;

export const getLayerState = createSelector(
  [getLayers, getBackgroundLayer, getSelectedMapLayer, getSelectedLayerIndex],
  (layers, backgroundLayer, selectedMapLayer, selectedLayerIndex) => ({
    layers,
    backgroundLayer,
    selectedMapLayer,
    selectedLayerIndex,
  }),
);

export default slice.reducer;
