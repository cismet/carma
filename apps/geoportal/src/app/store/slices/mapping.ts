import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type {
  BackgroundLayer,
  Layer,
  SavedLayerConfig,
} from "@carma-commons/types";
import {
  SELECTED_LAYER_INDEX,
  SelectionItem,
  type MappingState,
} from "@carma-apps/portals";

import { RootState } from "..";
import { layerMap } from "../../config";

const defaultOpacity = 0.2;

const initialState: MappingState = {
  layers: [],
  savedLayerConfigs: [],
  selectedLayerIndex: SELECTED_LAYER_INDEX.NO_SELECTION,
  paleOpacityValue: defaultOpacity,
  libreMapRef: null,
  layersIdle: false,

  selectedMapLayer: {
    title: "Stadtplan",
    id: "stadtplan",
    opacity: 1.0,
    description: layerMap["stadtplan"].description,
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

  selectedLuftbildLayer: {
    title: "Luftbildkarte 03/24",
    id: "luftbild",
    opacity: 1.0,
    description: layerMap["luftbild"].description,
    inhalt: layerMap["luftbild"].inhalt,
    eignung: layerMap["luftbild"].eignung,
    visible: true,
    layerType: "wmts",
    props: {
      name: "",
      url: layerMap["luftbild"].url,
    },
    layers: layerMap["luftbild"].layers,
  },

  backgroundLayer: {
    title: "Stadtplan",
    id: "karte",
    opacity: 1.0,
    description: layerMap["stadtplan"].description,
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
  configSelection: undefined,
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
      if (state.selectedLayerIndex > newLayers.length - 1) {
        state.selectedLayerIndex = newLayers.length - 1;
      }
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

    changeBackgroundOpacity(state, action) {
      state.backgroundLayer.opacity = action.payload.opacity;
      if (action.payload.opacity === 1) {
        state.focusMode = false;
      }
    },

    changePaleOpacity(state, action) {
      state.paleOpacityValue = action.payload.paleOpacityValue;
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
    changeBackgroundVisibility(state, action: PayloadAction<boolean>) {
      if (!action.payload) {
        state.backgroundLayer.opacity = 0;
        state.focusMode = true;
        state.paleOpacityValue = defaultOpacity;
      }
      state.backgroundLayer.visible = action.payload;
    },

    changeVisibility(
      state,
      action: PayloadAction<{ id: string; visible: boolean }>
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
    setSelectedLuftbildLayer(state, action: PayloadAction<BackgroundLayer>) {
      state.selectedLuftbildLayer = action.payload;
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
    setLibreMapRef(state, action: PayloadAction<any>) {
      state.libreMapRef = action.payload;
    },
    setConfigSelection(state, action: PayloadAction<SelectionItem>) {
      state.configSelection = action.payload;
    },
    setLayersIdle(state, action: PayloadAction<boolean>) {
      state.layersIdle = action.payload;
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
  changePaleOpacity,
  changeBackgroundOpacity,
  changeOpacity,
  changeBackgroundVisibility,
  changeVisibility,

  setSelectedLayerIndex,
  setSelectedLayerIndexBackgroundLayer,
  setSelectedLayerIndexNoSelection,
  setNextSelectedLayerIndex,
  setPreviousSelectedLayerIndex,
  setSelectedMapLayer,
  setBackgroundLayer,
  setSelectedLuftbildLayer,
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
  setLibreMapRef,
  setConfigSelection,
  setLayersIdle,
} = slice.actions;

export const getBackgroundLayer = (state: RootState) =>
  state.mapping.backgroundLayer;
export const getClickFromInfoView = (state: RootState) =>
  state.mapping.clickFromInfoView;
export const getFocusMode = (state: RootState) => state.mapping.focusMode;
export const getPaleOpacityValue = (state: RootState) =>
  state.mapping.paleOpacityValue;

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
export const getSelectedLuftbildLayer = (state: RootState) =>
  state.mapping.selectedLuftbildLayer;
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
export const getLibreMapRef = (state: RootState) => state.mapping.libreMapRef;
export const getConfigSelection = (state: RootState) =>
  state.mapping.configSelection;
export const getLayersIdle = (state: RootState) => state.mapping.layersIdle;

export const getLayerState = createSelector(
  [
    getLayers,
    getBackgroundLayer,
    getSelectedMapLayer,
    getSelectedLuftbildLayer,
    getSelectedLayerIndex,
  ],
  (
    layers,
    backgroundLayer,
    selectedMapLayer,
    selectedLuftbildLayer,
    selectedLayerIndex
  ) => ({
    layers,
    backgroundLayer,
    selectedMapLayer,
    selectedLuftbildLayer,
    selectedLayerIndex,
  })
);

export default slice.reducer;
