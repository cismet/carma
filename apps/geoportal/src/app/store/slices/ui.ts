import { createSlice } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";

import type { PayloadAction } from "@reduxjs/toolkit";

import { RootState } from "..";

export enum UIMode {
  DEFAULT = "default",
  FEATURE_INFO = "featureInfo",
  MEASUREMENT = "measurement",
  TOUR = "tour",
}

export interface UIState {
  showInfo: boolean;
  showInfoText: boolean;
  activeTabKey: string;
  mode: UIMode;
  showLayerButtons: boolean;
  showLayerHideButtons: boolean;
  allowChanges: boolean;
  allow3d: boolean;
}

const initialState: UIState = {
  showInfo: true,
  showInfoText: true,
  activeTabKey: "1",
  mode: UIMode.DEFAULT,
  showLayerButtons: true,
  showLayerHideButtons: false,
  allowChanges: true,
  allow3d: true,
};

const slice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setUIShowInfo(state, action) {
      state.showInfo = action.payload;
    },
    setUIShowInfoText(state, action) {
      state.showInfoText = action.payload;
    },
    setUIActiveTabKey(state, action) {
      state.activeTabKey = action.payload;
    },
    setUIMode(state, action) {
      state.mode = action.payload;
    },
    setUIShowLayerButtons(state, action: PayloadAction<boolean>) {
      state.showLayerButtons = action.payload;
    },
    setUIShowLayerHideButtons(state, action: PayloadAction<boolean>) {
      state.showLayerHideButtons = action.payload;
    },
    setUIAllowChanges(state, action: PayloadAction<boolean>) {
      state.allowChanges = action.payload;
    },
    setUIAllow3d(state, action: PayloadAction<boolean>) {
      state.allow3d = action.payload;
    },
    toggleUIMode(state, action: PayloadAction<UIMode>) {
      if (state.mode === action.payload) {
        state.mode = UIMode.DEFAULT;
      } else {
        state.mode = action.payload;
      }
    },
  },
});

export const {
  setUIActiveTabKey,
  setUIAllowChanges,
  setUIAllow3d,
  setUIMode,
  setUIShowInfo,
  setUIShowInfoText,
  setUIShowLayerButtons,
  setUIShowLayerHideButtons,
  toggleUIMode,
} = slice.actions;

const getUIAllow3d = (state: RootState) => state.ui.allow3d;
const getUIAllowChanges = (state: RootState) => state.ui.allowChanges;
const getUIActiveTabKey = (state: RootState) => state.ui.activeTabKey;
const getUIShowInfo = (state: RootState) => state.ui.showInfo;
const getUIShowInfoText = (state: RootState) => state.ui.showInfoText;
const getUIShowLayerButtons = (state: RootState) => state.ui.showLayerButtons;
const getUIShowLayerHideButtons = (state: RootState) =>
  state.ui.showLayerHideButtons;
const getUIMode = (state: RootState) => state.ui.mode;

// Hook Selectors (Exported with `useUI` Prefix)
export const useUIAllow3d = () => useSelector(getUIAllow3d);
export const useUIAllowChanges = () => useSelector(getUIAllowChanges);
export const useUIActiveTabKey = () => useSelector(getUIActiveTabKey);
export const useUIShowInfo = () => useSelector(getUIShowInfo);
export const useUIShowInfoText = () => useSelector(getUIShowInfoText);
export const useUIShowLayerButtons = () => useSelector(getUIShowLayerButtons);
export const useUIShowLayerHideButtons = () =>
  useSelector(getUIShowLayerHideButtons);
export const useUIMode = () => useSelector(getUIMode);

export default slice;
