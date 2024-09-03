import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "..";
import { layerMap } from "../../config";
import type { Layer, SavedLayerConfig } from "@carma-mapping/layers";
import type {
  BackgroundLayer,
  LayerState,
  MappingState,
} from "@carma-apps/portals";

const initialState: MappingState = {
  layers: [],
  savedLayerConfigs: [],
  selectedLayerIndex: -2,
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
  showLocatorButton: true,
  showMeasurementButton: true,
  showHamburgerMenu: false,
  focusMode: false,
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
    removeLayer(state, action: PayloadAction<string>) {
      const newLayers = state.layers.filter((obj) => obj.id !== action.payload);
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
    setSelectedLayerIndex(state, action) {
      state.selectedLayerIndex = action.payload;
    },
    setNextSelectedLayerIndex(state) {
      const newIndex = state.selectedLayerIndex + 1;
      if (newIndex >= state.layers.length) {
        state.selectedLayerIndex = -1;
      } else {
        state.selectedLayerIndex = newIndex;
      }
    },
    setPreviousSelectedLayerIndex(state) {
      const newIndex = state.selectedLayerIndex - 1;
      if (newIndex < -1) {
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
    setShowLocatorButton(state, action: PayloadAction<boolean>) {
      state.showLocatorButton = action.payload;
    },
    setShowMeasurementButton(state, action: PayloadAction<boolean>) {
      state.showMeasurementButton = action.payload;
    },
    setShowHamburgerMenu(state, action: PayloadAction<boolean>) {
      state.showHamburgerMenu = action.payload;
    },
    setFocusMode(state, action: PayloadAction<boolean>) {
      state.focusMode = action.payload;
    },
    setStartDrawing(state, action: PayloadAction<boolean>) {
      state.startDrawing = action.payload;
    },
  },
});

export default slice;

export const {
  setLayers,
  appendLayer,
  removeLayer,
  appendSavedLayerConfig,
  deleteSavedLayerConfig,
  changeOpacity,
  changeVisibility,
  setSelectedLayerIndex,
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
  setStartDrawing,
} = slice.actions;

export const getLayers = (state: RootState) => {
  return state.mapping.layers;
};

export const getSavedLayerConfigs = (state: RootState) => {
  return state.mapping.savedLayerConfigs;
};

export const getSelectedLayerIndex = (state: RootState) => {
  return state.mapping.selectedLayerIndex;
};

export const getSelectedMapLayer = (state: RootState) => {
  return state.mapping.selectedMapLayer;
};

export const getBackgroundLayer = (state: RootState) => {
  return state.mapping.backgroundLayer;
};

export const getLayerState = (state: RootState): LayerState => {
  return {
    layers: state.mapping.layers,
    backgroundLayer: state.mapping.backgroundLayer,
    selectedMapLayer: state.mapping.selectedMapLayer,
    selectedLayerIndex: state.mapping.selectedLayerIndex,
  };
};

export const getShowLeftScrollButton = (state: RootState) => {
  return state.mapping.showLeftScrollButton;
};

export const getShowRightScrollButton = (state: RootState) => {
  return state.mapping.showRightScrollButton;
};

export const getShowFullscreenButton = (state: RootState) => {
  return state.mapping.showFullscreenButton;
};

export const getShowLocatorButton = (state: RootState) => {
  return state.mapping.showLocatorButton;
};

export const getShowMeasurementButton = (state: RootState) => {
  return state.mapping.showMeasurementButton;
};

export const getShowHamburgerMenu = (state: RootState) => {
  return state.mapping.showHamburgerMenu;
};

export const getFocusMode = (state: RootState) => {
  return state.mapping.focusMode;
};

export const getStartDrawing = (state: RootState) => {
  return state.mapping.startDrawing;
};
