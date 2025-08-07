import localForage from "localforage";
import { createSlice } from "@reduxjs/toolkit";
import { Item } from "@carma-commons/types";

export type ExtendedItem = Item & { replaceId: string };

interface MapLayersState {
  replaceLayers: ExtendedItem[];
}

type RootState = {
  mapLayers: MapLayersState;
};

const initialState: MapLayersState = {
  replaceLayers: [],
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
    clearReplaceLayers: (state) => {
      state.replaceLayers = [];
    },
  },
});

export const { addReplaceLayers, clearReplaceLayers } = sliceMapLayers.actions;

export const getReplaceLayers = ({ mapLayers }: RootState) =>
  mapLayers.replaceLayers;

export const mapLayersReducer = sliceMapLayers.reducer;

export default sliceMapLayers.reducer;
