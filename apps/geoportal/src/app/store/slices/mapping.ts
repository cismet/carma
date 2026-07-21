import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type {
  BackgroundLayer,
  Layer,
  LayerFilterInfo,
  LayerGroup,
  LayerStackEntry,
  SavedLayerConfig,
} from "@carma-mapping/layers";
import {
  findStackEntryByLayerId,
  flattenLayerStack,
  isLayerGroup,
} from "@carma-mapping/layers";
import {
  SELECTED_LAYER_INDEX,
  SelectionItem,
  type MappingState,
} from "@carma-appframeworks/portals";

import { extractCarmaConfig } from "@carma-commons/utils";

import { RootState } from "..";
import { shouldShowAdhocLayerInLayerList } from "../../helper/adhoc-feature-utils";
import { backgroundLayerCatalog, layerMap } from "../../config";

type MapLibreMapEntry = {
  id: string;
  map: any;
};

const defaultOpacity = 0.2;

type GeoportalMappingState = Omit<MappingState, "layers"> & {
  layers: LayerStackEntry[];
};

const getPinning = (entry: LayerStackEntry) =>
  isLayerGroup(entry) ? undefined : entry.pinned;

const resolveStackTarget = (
  state: GeoportalMappingState,
  id: string
): LayerStackEntry | undefined => {
  const found = findStackEntryByLayerId(state.layers, id);
  return found?.member ?? found?.entry;
};

const resolveLayer = (
  state: GeoportalMappingState,
  id: string
): Layer | undefined => {
  const target = resolveStackTarget(state, id);
  return target && !isLayerGroup(target) ? target : undefined;
};

const shouldSkipEntryForSelection = (
  entry: LayerStackEntry | undefined,
  isLeaflet: boolean
): boolean => {
  if (!entry) {
    return false;
  }
  if (isLayerGroup(entry)) {
    return true;
  }
  if (entry.skipSelection) {
    return true;
  }
  if (!isLeaflet && entry.type !== "object") {
    return true;
  }
  if (!shouldShowAdhocLayerInLayerList(entry, !isLeaflet)) {
    return true;
  }
  return false;
};

const initialState: GeoportalMappingState = {
  layers: [],
  savedLayerConfigs: [],
  selectedLayerIndex: SELECTED_LAYER_INDEX.NO_SELECTION,
  activeInteractionLayerID: null,
  activeInteractionButtonID: null,
  paleOpacityValue: defaultOpacity,
  libreMapRef: null,
  maplibreMaps: [],
  layersIdle: false,
  backgroundLayers: backgroundLayerCatalog,

  selectedMapLayer: {
    title: "Stadtplan",
    id: "stadtplan",
    opacity: 1.0,
    description: layerMap["stadtplan"].description,
    inhalt: layerMap["stadtplan"].inhalt,
    eignung: layerMap["stadtplan"].eignung,
    visible: true,
    layerType: "wmts",
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
      const incoming = action.payload as LayerStackEntry[];
      const pinnedFirst = incoming.filter((l) => getPinning(l) === "first");
      const unpinned = incoming.filter((l) => !getPinning(l));
      const pinnedLast = incoming.filter((l) => getPinning(l) === "last");
      state.layers = [...pinnedFirst, ...unpinned, ...pinnedLast];
    },
    appendLayer(state, action: PayloadAction<LayerStackEntry>) {
      const entry = action.payload;
      const pinning = getPinning(entry);
      if (pinning === "first") {
        const firstUnpinnedIndex = state.layers.findIndex(
          (l) => getPinning(l) !== "first"
        );
        state.layers.splice(
          firstUnpinnedIndex === -1 ? 0 : firstUnpinnedIndex,
          0,
          entry
        );
      } else if (pinning === "last") {
        state.layers.push(entry);
      } else {
        let lastPinnedIndex = -1;
        for (let i = state.layers.length - 1; i >= 0; i--) {
          if (getPinning(state.layers[i]) === "last") {
            lastPinnedIndex = i;
            break;
          }
        }
        if (lastPinnedIndex === -1) {
          state.layers.push(entry);
        } else {
          state.layers.splice(lastPinnedIndex, 0, entry);
        }
      }
    },
    updateLayer(state, action: PayloadAction<Layer>) {
      const layer = resolveLayer(state, action.payload.id);
      if (layer) {
        Object.assign(layer, action.payload);
      }
    },
    removeLayer(state, action: PayloadAction<string>) {
      const id = action.payload;
      const found = findStackEntryByLayerId(state.layers, id);
      let newLayers = state.layers;
      if (found?.member) {
        const group = found.entry as LayerGroup;
        const remainingMembers = group.layers.filter(
          (member) => member.id !== id
        );
        newLayers =
          remainingMembers.length > 0
            ? state.layers.map((entry, index) =>
                index === found.index
                  ? { ...group, layers: remainingMembers }
                  : entry
              )
            : state.layers.filter((_, index) => index !== found.index);
      } else {
        // a group id removes the whole group, taking its members with it
        newLayers = state.layers.filter((entry) => entry.id !== id);
      }
      if (state.selectedLayerIndex > newLayers.length - 1) {
        state.selectedLayerIndex = newLayers.length - 1;
      }
      const selectedEntry =
        state.selectedLayerIndex >= 0
          ? newLayers[state.selectedLayerIndex]
          : undefined;
      if (
        selectedEntry &&
        (isLayerGroup(selectedEntry) || selectedEntry.skipSelection)
      ) {
        state.selectedLayerIndex = SELECTED_LAYER_INDEX.NO_SELECTION;
      }
      state.layers = newLayers;
      state.maplibreMaps = state.maplibreMaps.filter(
        (entry) => entry.id !== action.payload
      );
      if (state.activeInteractionLayerID === action.payload) {
        state.activeInteractionLayerID = null;
        state.activeInteractionButtonID = null;
      }
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
      if (state.backgroundLayer.id === "karte") {
        state.selectedMapLayer.opacity = action.payload.opacity;
      } else {
        state.selectedLuftbildLayer.opacity = action.payload.opacity;
      }
      state.backgroundLayer.opacity = action.payload.opacity;
      if (action.payload.opacity === 1) {
        state.focusMode = false;
      }
    },

    changePaleOpacity(state, action) {
      state.paleOpacityValue = action.payload.paleOpacityValue;
    },

    changeOpacity(state, action) {
      const target = resolveStackTarget(state, action.payload.id);
      if (target) {
        target.opacity = action.payload.opacity;
      }
    },
    changeBackgroundVisibility(state, action: PayloadAction<boolean>) {
      if (!action.payload) {
        state.focusMode = true;
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
      // a group id hides the whole group, a member id only that member
      const target = resolveStackTarget(state, action.payload.id);
      if (target) {
        target.visible = action.payload.visible;
      }
    },

    toggleUseInFeatureInfo(state, action) {
      const layer = resolveLayer(state, action.payload.id);
      if (layer) {
        layer.useInFeatureInfo = !layer.useInFeatureInfo;
      }
    },

    setLayerFilterInfo(
      state,
      action: PayloadAction<{ id: string; filterInfo: LayerFilterInfo }>
    ) {
      const { id, filterInfo } = action.payload;
      const layer = resolveLayer(state, id);
      if (layer) {
        layer.filterInfo = filterInfo;
      }
    },

    setLayerFilterState(
      state,
      action: PayloadAction<{
        id: string;
        filterState: Record<string, boolean>;
      }>
    ) {
      const { id, filterState } = action.payload;
      const layer = resolveLayer(state, id);
      if (layer) {
        layer.filterState = filterState;
      }
    },

    setLayerDynamicStylingSelection(
      state,
      action: PayloadAction<{
        id: string;
        configIndex: number;
        selection: string;
      }>
    ) {
      const { id, configIndex, selection } = action.payload;
      const layer = resolveLayer(state, id);
      if (layer) {
        const prev =
          typeof layer.dynamicStylingSelection === "object" &&
          layer.dynamicStylingSelection !== null
            ? layer.dynamicStylingSelection
            : {};
        layer.dynamicStylingSelection = { ...prev, [configIndex]: selection };
      }
    },

    updateLayerFromLayerInfo(
      state,
      action: PayloadAction<{
        id: string;
        layerInfo: Record<string, unknown>;
        carmaConf?: Record<string, unknown>;
      }>
    ) {
      const { id, layerInfo, carmaConf } = action.payload;
      const layer = resolveLayer(state, id);
      if (!layer) {
        return;
      }

      layer.layerInfo = { ...layer.layerInfo, ...layerInfo };

      const directKeys = ["title", "description"] as const;
      for (const key of directKeys) {
        if (typeof layerInfo[key] === "string") {
          layer[key] = layerInfo[key] as string;
        }
      }

      if (Array.isArray(layerInfo.keywords)) {
        const conf = extractCarmaConfig(layerInfo.keywords as string[]);
        if (conf) {
          layer.conf = { ...layer.conf, ...conf };
        }
      }

      if (carmaConf && typeof carmaConf === "object") {
        layer.conf = {
          ...layer.conf,
          ...(carmaConf as Record<
            string,
            string | string[] | boolean | Record<string, { layers: string[] }>
          >),
        };
      }
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
    setNextSelectedLayerIndex(
      state,
      action: PayloadAction<{ isLeaflet: boolean } | undefined>
    ) {
      const isLeaflet = action.payload?.isLeaflet ?? true;
      let newIndex = state.selectedLayerIndex + 1;
      while (
        newIndex < state.layers.length &&
        shouldSkipEntryForSelection(state.layers[newIndex], isLeaflet)
      ) {
        newIndex += 1;
      }
      if (newIndex >= state.layers.length) {
        state.selectedLayerIndex = SELECTED_LAYER_INDEX.BACKGROUND_LAYER;
      } else {
        state.selectedLayerIndex = newIndex;
      }
    },
    setPreviousSelectedLayerIndex(
      state,
      action: PayloadAction<{ isLeaflet: boolean } | undefined>
    ) {
      const isLeaflet = action.payload?.isLeaflet ?? true;
      let newIndex = state.selectedLayerIndex - 1;
      while (
        newIndex >= 0 &&
        shouldSkipEntryForSelection(state.layers[newIndex], isLeaflet)
      ) {
        newIndex -= 1;
      }
      if (newIndex < SELECTED_LAYER_INDEX.BACKGROUND_LAYER) {
        let wrapIndex = state.layers.length - 1;
        while (
          wrapIndex >= 0 &&
          shouldSkipEntryForSelection(state.layers[wrapIndex], isLeaflet)
        ) {
          wrapIndex -= 1;
        }
        state.selectedLayerIndex =
          wrapIndex >= 0 ? wrapIndex : SELECTED_LAYER_INDEX.BACKGROUND_LAYER;
      } else {
        state.selectedLayerIndex = newIndex;
      }
    },

    setActiveInteractionLayerID(state, action) {
      if (state.activeInteractionLayerID !== action.payload) {
        state.activeInteractionButtonID = null;
      }
      state.activeInteractionLayerID = action.payload;
    },
    setActiveInteractionButtonID(state, action: PayloadAction<string | null>) {
      state.activeInteractionButtonID = action.payload;
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
    setMaplibreMaps(state, action: PayloadAction<MapLibreMapEntry>) {
      const entry = action.payload;
      const current = state.maplibreMaps;
      const idx = current.findIndex((e) => e.id === entry.id);
      if (idx === -1) {
        state.maplibreMaps = [...current, entry];
      } else {
        const next = [...current];
        next[idx] = entry;
        state.maplibreMaps = next;
      }
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
  setActiveInteractionLayerID,
  setActiveInteractionButtonID,
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
  setLayerFilterInfo,
  setLayerFilterState,
  setLayerDynamicStylingSelection,
  updateLayerFromLayerInfo,
  setLibreMapRef,
  setMaplibreMaps,
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

export const getLayerStack = (state: RootState): LayerStackEntry[] =>
  state.mapping.layers;

/**
 * The layers the map actually draws, with groups flattened into their members.
 * This is what renderers, feature info, print and share consume, so grouping
 * stays invisible to them.
 */
export const getLayers = createSelector([getLayerStack], flattenLayerStack);
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
export const getActiveInteractionLayerID = (state: RootState) =>
  state.mapping.activeInteractionLayerID;
export const getActiveInteractionButtonID = (state: RootState) =>
  state.mapping.activeInteractionButtonID;
export const getStartDrawing = (state: RootState) => state.mapping.startDrawing;
export const getLibreMapRef = (state: RootState) => state.mapping.libreMapRef;
export const getMaplibreMaps = (state: RootState) => state.mapping.maplibreMaps;
export const getConfigSelection = (state: RootState) =>
  state.mapping.configSelection;
export const getLayersIdle = (state: RootState) => state.mapping.layersIdle;

export const getSelectedStackEntry = createSelector(
  [getLayerStack, getSelectedLayerIndex],
  (stack, index): LayerStackEntry | undefined =>
    index >= 0 ? stack[index] : undefined
);

export const getSelectedLayer = createSelector(
  [getSelectedStackEntry],
  (entry): Layer | undefined =>
    entry && !isLayerGroup(entry) ? entry : undefined
);

export const getSelectionShowsNoInfoView = createSelector(
  [getSelectedLayerIndex, getSelectedStackEntry],
  (index, entry): boolean =>
    index === SELECTED_LAYER_INDEX.NO_SELECTION ||
    (!!entry && (isLayerGroup(entry) || !!entry.skipSelection))
);

export const getLayerState = createSelector(
  [
    getLayerStack,
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
