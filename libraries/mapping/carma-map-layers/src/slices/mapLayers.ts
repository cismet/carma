import localForage from "localforage";
import { createSlice } from "@reduxjs/toolkit";
import { Item } from "@carma-commons/types";

export type ExtendedItem = Item & { replaceId: string };

interface MapLayersState {
  replaceLayers: ExtendedItem[];
  // IDs to show loading state for the specific capabilities
  loadingCapabilitiesIDs: string[];
  // Global loading state for capabilities. Turns to false when one capability finished loading
  loadingCapabilities: boolean;
  selectedLayer: Item | null;
}

type RootState = {
  mapLayers: MapLayersState;
};

const initialState: MapLayersState = {
  replaceLayers: [],
  loadingCapabilitiesIDs: [],
  loadingCapabilities: true,
  selectedLayer: null,
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
    addReplaceLayers: (state, action) => {
      state.replaceLayers.push(action.payload);
    },
    addloadingCapabilitiesIDs: (state, action) => {
      state.loadingCapabilitiesIDs.push(action.payload);
    },
    removeloadingCapabilitiesIDs: (state, action) => {
      state.loadingCapabilitiesIDs = state.loadingCapabilitiesIDs.filter(
        (item) => item !== action.payload
      );
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
  },
});

export const {
  addReplaceLayers,
  clearReplaceLayers,
  addloadingCapabilitiesIDs,
  removeloadingCapabilitiesIDs,
  setLoadingCapabilities,
  setSelectedLayer,
} = sliceMapLayers.actions;

export const getReplaceLayers = ({ mapLayers }: RootState) =>
  mapLayers.replaceLayers;

export const getloadingCapabilitiesIDs = ({ mapLayers }: RootState) =>
  mapLayers.loadingCapabilitiesIDs;

export const getLoadingCapabilities = ({ mapLayers }: RootState) =>
  mapLayers.loadingCapabilities;

export const getSelectedLayer = ({ mapLayers }: RootState) =>
  mapLayers.selectedLayer;

export const mapLayersReducer = sliceMapLayers.reducer;

export default sliceMapLayers.reducer;
