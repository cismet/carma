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
  mode: UIMode;

  activeTabKey: string;
  allow3d: boolean;
  allowChanges: boolean;
  published: boolean;
  showInfo: boolean;
  showInfoText: boolean;
  showLayerButtons: boolean;
  showLayerHideButtons: boolean;
  showOverlayTour: boolean;
  syncToken: string | null;
  setTopicMapAppMenuVisible: ((visible: boolean) => void) | null;
}

const initialState: UIState = {
  mode: UIMode.DEFAULT,
  showOverlayTour: false,
  activeTabKey: "1",
  allow3d: true,
  allowChanges: true,
  published: false,
  showInfo: true,
  showInfoText: true,
  showLayerButtons: true,
  showLayerHideButtons: false,
  syncToken: null,
  setTopicMapAppMenuVisible: null,
};

const slice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setTopicMapAppMenuVisible(
      state,
      action: PayloadAction<(visible: boolean) => void>,
    ) {
      state.setTopicMapAppMenuVisible = action.payload;
    },
    setUIMode(state, action) {
      state.mode = action.payload;
    },
    toggleUIMode(state, action: PayloadAction<UIMode>) {
      if (state.mode === action.payload) {
        state.mode = UIMode.DEFAULT;
      } else {
        state.mode = action.payload;
      }
    },

    setUIActiveTabKey(state, action) {
      state.activeTabKey = action.payload;
    },
    setUIAllow3d(state, action: PayloadAction<boolean>) {
      state.allow3d = action.payload;
    },
    setUIAllowChanges(state, action: PayloadAction<boolean>) {
      state.allowChanges = action.payload;
    },
    setUIPublished(state, action: PayloadAction<boolean>) {
      state.published = action.payload;
    },
    setUIShowInfo(state, action) {
      state.showInfo = action.payload;
    },
    setUIShowInfoText(state, action) {
      state.showInfoText = action.payload;
    },
    setUIShowLayerButtons(state, action: PayloadAction<boolean>) {
      state.showLayerButtons = action.payload;
    },
    setUIShowLayerHideButtons(state, action: PayloadAction<boolean>) {
      state.showLayerHideButtons = action.payload;
    },
    toggleShowOverlayTour(state, action: PayloadAction<boolean>) {
      state.showOverlayTour = action.payload;
    },
    setSyncToken(state, action: PayloadAction<string | null>) {
      state.syncToken = action.payload;
    },
  },
});

export const {
  setTopicMapAppMenuVisible,
  setUIMode,
  setSyncToken,
  toggleUIMode,

  setUIActiveTabKey,
  setUIAllow3d,
  setUIAllowChanges,
  setUIPublished,
  setUIShowInfo,
  setUIShowInfoText,
  setUIShowLayerButtons,
  setUIShowLayerHideButtons,
  toggleShowOverlayTour,
} = slice.actions;

export const getTopicMapAppMenuVisible = (state: RootState) =>
  state.ui.setTopicMapAppMenuVisible;

export const getSyncToken = (state: RootState) => state.ui.syncToken;

export const getUIMode = (state: RootState) => state.ui.mode;

export const getUIAllow3d = (state: RootState) => state.ui.allow3d;
export const getUIAllowChanges = (state: RootState) => state.ui.allowChanges;
export const getUIPublished = (state: RootState) => state.ui.published;
export const getUIActiveTabKey = (state: RootState) => state.ui.activeTabKey;
export const getUIShowInfo = (state: RootState) => state.ui.showInfo;
export const getUIShowInfoText = (state: RootState) => state.ui.showInfoText;
export const getUIShowLayerButtons = (state: RootState) =>
  state.ui.showLayerButtons;
export const getUIShowLayerHideButtons = (state: RootState) =>
  state.ui.showLayerHideButtons;
export const getUIOverlayTourMode = (state: RootState) =>
  state.ui.showOverlayTour;

export default slice.reducer;
