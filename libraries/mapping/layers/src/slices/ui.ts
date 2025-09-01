import localForage from "localforage";
import { createSlice } from "@reduxjs/toolkit";

interface UIState {
  triggerRefetch: boolean;
}

type RootState = {
  mapLayersUI: UIState;
};

const initialState: UIState = {
  triggerRefetch: false,
};

export const getUIConfig = ({
  appKey,
  storagePrefix = "defaultStorage",
}: {
  appKey: string;
  storagePrefix?: string;
}) => {
  return {
    key: `@${appKey}.${storagePrefix}.app.mapLayersUI`,
    storage: localForage,
    whitelist: [],
  };
};

const sliceUi = createSlice({
  name: "mapLayersUI",
  initialState,
  reducers: {
    setTriggerRefetch: (state, action) => {
      state.triggerRefetch = action.payload;
    },
  },
});

export const { setTriggerRefetch } = sliceUi.actions;

export const getTriggerRefetch = ({ mapLayersUI }: RootState) =>
  mapLayersUI.triggerRefetch;

export const mapLayersUIReducer = sliceUi.reducer;

export default sliceUi.reducer;
