import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "..";

interface UIState {
  showInfo: boolean;
  showInfoText: boolean;
  activeTabKey: string;
  mode: string;
  showLayerButtons: boolean;
  showLayerHideButtons: boolean;
  allowUiChanges: boolean;
  allow3d: boolean;
}

const initialState: UIState = {
  showInfo: true,
  showInfoText: true,
  activeTabKey: "1",
  mode: "default",
  showLayerButtons: true,
  showLayerHideButtons: false,
  allowUiChanges: true,
  allow3d: false,
};

const slice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setShowInfo(state, action) {
      state.showInfo = action.payload;
    },
    setShowInfoText(state, action) {
      state.showInfoText = action.payload;
    },
    setActiveTabKey(state, action) {
      state.activeTabKey = action.payload;
    },
    setMode(state, action) {
      state.mode = action.payload;
    },
    setShowLayerButtons(state, action: PayloadAction<boolean>) {
      state.showLayerButtons = action.payload;
    },
    setShowLayerHideButtons(state, action: PayloadAction<boolean>) {
      state.showLayerHideButtons = action.payload;
    },
    setAllowUiChanges(state, action: PayloadAction<boolean>) {
      state.allowUiChanges = action.payload;
    },
    setAllow3d(state, action: PayloadAction<boolean>) {
      state.allow3d = action.payload;
    },
  },
});

export default slice;

export const {
  setShowInfo,
  setShowInfoText,
  setActiveTabKey,
  setMode,
  setShowLayerButtons,
  setShowLayerHideButtons,
  setAllowUiChanges,
  setAllow3d,
} = slice.actions;

export const getShowInfo = (state: RootState) => {
  return state.ui.showInfo;
};

export const getShowInfoText = (state: RootState) => {
  return state.ui.showInfoText;
};

export const getActiveTabKey = (state: RootState) => {
  return state.ui.activeTabKey;
};

export const getMode = (state: RootState) => {
  return state.ui.mode;
};

export const getShowLayerButtons = (state: RootState) => {
  return state.ui.showLayerButtons;
};

export const getShowLayerHideButtons = (state: RootState) => {
  return state.ui.showLayerHideButtons;
};

export const getAllowUiChanges = (state: RootState) => {
  return state.ui.allowUiChanges;
};

export const getAllow3d = (state: RootState) => {
  return state.ui.allow3d;
};

export const toggletModeMeasuremen = () => {
  return function (dispatch, getState) {
    const state = getState();
    const mode = state.ui.mode;
    if (mode === "default") {
      dispatch(setMode("measurement"));
    } else {
      dispatch(setMode("default"));
    }
  };
};
