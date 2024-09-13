import { createSlice } from "@reduxjs/toolkit";
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
    setUIAllowUiChanges(state, action: PayloadAction<boolean>) {
      state.allowChanges = action.payload;
    },
    setUIAllow3d(state, action: PayloadAction<boolean>) {
      state.allow3d = action.payload;
    },
  },
});

export default slice;

export const {
  setUIShowInfo,
  setUIShowInfoText,
  setUIActiveTabKey,
  setUIMode,
  setUIShowLayerButtons,
  setUIShowLayerHideButtons,
  setUIAllowUiChanges,
  setUIAllow3d,
} = slice.actions;

export const getUIShowInfo = (state: RootState) => {
  return state.ui.showInfo;
};

export const getUIShowInfoText = (state: RootState) => {
  return state.ui.showInfoText;
};

export const getUIActiveTabKey = (state: RootState) => {
  return state.ui.activeTabKey;
};

export const getUIMode = (state: RootState) => {
  return state.ui.mode;
};

export const getUIShowLayerButtons = (state: RootState) => {
  return state.ui.showLayerButtons;
};

export const getUIShowLayerHideButtons = (state: RootState) => {
  return state.ui.showLayerHideButtons;
};

export const getUIAllowChanges = (state: RootState) => {
  return state.ui.allowChanges;
};

export const getUIAllow3d = (state: RootState) => {
  return state.ui.allow3d;
};

export const toggleUIModeMeasurement = () => {
  return function (dispatch, getState) {
    const state = getState();
    const mode = state.ui.mode;
    if (mode === UIMode.DEFAULT) {
      dispatch(setUIMode(UIMode.MEASUREMENT));
    } else {
      dispatch(setUIMode(UIMode.DEFAULT));
    }
  };
};

export const toggleUIModeFeatureInfo = () => {
  return function (dispatch, getState) {
    const state = getState();
    const mode = state.ui.mode;
    if (mode === UIMode.DEFAULT) {
      dispatch(setUIMode(UIMode.FEATURE_INFO));
    } else {
      dispatch(setUIMode(UIMode.DEFAULT));
    }
  };
};

export const toggleUIModeTour = () => {
  return function (dispatch, getState) {
    const state = getState();
    const mode = state.ui.mode;
    if (mode === UIMode.DEFAULT) {
      dispatch(setUIMode(UIMode.TOUR));
    } else {
      dispatch(setUIMode(UIMode.DEFAULT));
    }
  };
};
