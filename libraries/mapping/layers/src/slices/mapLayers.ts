import localForage from "localforage";
import { createSlice, current } from "@reduxjs/toolkit";
import { isEqual } from "lodash";
import { Config, ExtendedItem, Item } from "../lib/contracts/carma-layers.d";

export type { ExtendedItem };

interface MapLayersState {
  replaceLayers: ExtendedItem[];
  loadingCapabilitiesIDs: string[];
  loadingCapabilities: boolean;
  selectedLayer: Item | null;
  allLayers: { Title: string; id: string; layers: Item[] }[];
  customLayerConfig: Config[];
}

type RootState = {
  mapLayers: MapLayersState;
};

const initialState: MapLayersState = {
  replaceLayers: [],
  loadingCapabilitiesIDs: [],
  loadingCapabilities: true,
  selectedLayer: null,
  allLayers: [],
  customLayerConfig: [],
};

export const getMapLayersConfig = ({
  appKey,
  storagePrefix = "defaultStorage",
}: {
  appKey: string;
  storagePrefix?: string;
}) => {
  return {
    key: `@${appKey}.${storagePrefix}.app.mapLayers`,
    storage: localForage,
    whitelist: [],
  };
};

const sliceMapLayers = createSlice({
  name: "mapLayers",
  initialState,
  reducers: {
    // All reducers here must be idempotent: re-dispatching unchanged data may
    // not produce new state, otherwise derivation effects depending on it
    // (useLoadCapabilities) loop with host re-renders.
    addReplaceLayers: (state, action) => {
      const existingIndex = state.replaceLayers.findIndex(
        (layer) => layer.id === action.payload.id
      );
      if (existingIndex === -1) {
        state.replaceLayers.push(action.payload);
      } else if (
        !isEqual(current(state.replaceLayers[existingIndex]), action.payload)
      ) {
        state.replaceLayers[existingIndex] = action.payload;
      }
    },
    addloadingCapabilitiesIDs: (state, action) => {
      if (!state.loadingCapabilitiesIDs.includes(action.payload)) {
        state.loadingCapabilitiesIDs.push(action.payload);
      }
    },
    removeloadingCapabilitiesIDs: (state, action) => {
      if (state.loadingCapabilitiesIDs.includes(action.payload)) {
        state.loadingCapabilitiesIDs = state.loadingCapabilitiesIDs.filter(
          (item) => item !== action.payload
        );
      }
    },
    clearReplaceLayers: (state) => {
      state.replaceLayers = [];
    },
    setLoadingCapabilities: (state, action) => {
      state.loadingCapabilities = action.payload;
    },
    setSelectedLayer: (state, action) => {
      state.selectedLayer = action.payload;
    },
    setAllLayers: (state, action) => {
      const payloadArray = action.payload;

      if (state.allLayers.length === 0) {
        state.allLayers = payloadArray;
      } else {
        payloadArray.forEach((payloadItem, index) => {
          // Only process if layers array has more than one element
          if (payloadItem.layers && payloadItem.layers.length > 0) {
            const existingIndex = state.allLayers.findIndex(
              (item) => item.id === payloadItem.id
            );

            if (existingIndex !== -1) {
              // Replace the existing item only when its content changed
              if (
                !isEqual(current(state.allLayers[existingIndex]), payloadItem)
              ) {
                state.allLayers[existingIndex] = payloadItem;
              }
            } else {
              // Create new item at the same position as in payload
              // If the position doesn't exist yet, push to end
              if (index < state.allLayers.length) {
                state.allLayers.splice(index, 0, payloadItem);
              } else {
                state.allLayers.push(payloadItem);
              }
            }
          }
        });
      }
    },
    setCustomLayerConfig: (state, action) => {
      state.customLayerConfig = action.payload;
    },
  },
});

export const {
  addReplaceLayers,
  clearReplaceLayers,
  addloadingCapabilitiesIDs,
  removeloadingCapabilitiesIDs,
  setLoadingCapabilities,
  setSelectedLayer,
  setAllLayers,
  setCustomLayerConfig,
} = sliceMapLayers.actions;

export const getReplaceLayers = ({ mapLayers }: RootState) =>
  mapLayers.replaceLayers;

export const getloadingCapabilitiesIDs = ({ mapLayers }: RootState) =>
  mapLayers.loadingCapabilitiesIDs;

export const getLoadingCapabilities = ({ mapLayers }: RootState) =>
  mapLayers.loadingCapabilities;

export const getSelectedLayer = ({ mapLayers }: RootState) =>
  mapLayers.selectedLayer;

export const getAllLayers = ({ mapLayers }: RootState) => mapLayers.allLayers;

export const getCustomLayerConfig = ({ mapLayers }: RootState) =>
  mapLayers.customLayerConfig;

export const mapLayersReducer = sliceMapLayers.reducer;

export default sliceMapLayers.reducer;
