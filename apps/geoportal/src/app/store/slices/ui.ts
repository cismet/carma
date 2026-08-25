import { createSlice } from "@reduxjs/toolkit";

import type { PayloadAction } from "@reduxjs/toolkit";

import { RootState } from "..";

export enum UIMode {
  DEFAULT = "default",
  FEATURE_INFO = "featureInfo",
  MEASUREMENT = "measurement",
  PRINT = "print",
}

export type UIVisibleControls = {
  allow3d: boolean;
  zoom: boolean;
  fullscreen: boolean;
  home: boolean;
  featureInfo: boolean;
  infoBox: boolean;
  measurement: boolean;
  gazetteer: boolean;
  layerButtons: boolean;
  navbar: boolean;
};

export const defaultVisibleControls: UIVisibleControls = {
  allow3d: true,
  zoom: true,
  fullscreen: true,
  home: true,
  featureInfo: true,
  infoBox: true,
  measurement: true,
  gazetteer: true,
  layerButtons: true,
  navbar: true,
};

/** all-hidden counterpart of {@link defaultVisibleControls} ("map only") */
export const noVisibleControls: UIVisibleControls = Object.fromEntries(
  Object.keys(defaultVisibleControls).map((key) => [key, false])
) as UIVisibleControls;

export interface UIState {
  mode: UIMode;
  activeTabKey: string;
  visibleControls: UIVisibleControls;
  mapInteractionEnabled: boolean;
  hashWriteEnabled: boolean;
  allowChanges: boolean;
  showInfo: boolean;
  showInfoText: boolean;
  showLayerButtons: boolean;
  showLayerHideButtons: boolean;
  showResourceModal: boolean;
  zenMode: boolean;
  showLoginModal: boolean;
  triggerFeatureInfoUpdate: number;
}

export const initialUIState: UIState = {
  mode: UIMode.DEFAULT,
  activeTabKey: "1",
  visibleControls: defaultVisibleControls,
  mapInteractionEnabled: true,
  hashWriteEnabled: true,
  allowChanges: true,
  showInfo: true,
  showInfoText: true,
  showLayerButtons: true,
  showLayerHideButtons: false,
  showResourceModal: false,
  zenMode: false,
  showLoginModal: false,
  triggerFeatureInfoUpdate: 0,
};

const slice = createSlice({
  name: "ui",
  initialState: initialUIState,
  reducers: {
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
    /** omitted keys fall back to visible, so a partial payload is a full reset */
    setUIVisibleControls(
      state,
      action: PayloadAction<Partial<UIVisibleControls>>
    ) {
      state.visibleControls = { ...defaultVisibleControls, ...action.payload };
    },
    setUIMapInteractionEnabled(state, action: PayloadAction<boolean>) {
      state.mapInteractionEnabled = action.payload;
    },
    setUIHashWriteEnabled(state, action: PayloadAction<boolean>) {
      state.hashWriteEnabled = action.payload;
    },
    setUIAllowChanges(state, action: PayloadAction<boolean>) {
      state.allowChanges = action.payload;
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
    setShowResourceModal(state, action: PayloadAction<boolean>) {
      state.showResourceModal = action.payload;
    },
    setZenMode(state, action: PayloadAction<boolean>) {
      state.zenMode = action.payload;
    },
    setShowLoginModal(state, action: PayloadAction<boolean>) {
      state.showLoginModal = action.payload;
    },
    triggerFeatureInfoUpdateAction(state) {
      state.triggerFeatureInfoUpdate = state.triggerFeatureInfoUpdate + 1;
    },
  },
});

export const {
  setUIMode,
  toggleUIMode,
  setUIActiveTabKey,
  setUIVisibleControls,
  setUIMapInteractionEnabled,
  setUIHashWriteEnabled,
  setUIAllowChanges,
  setUIShowInfo,
  setUIShowInfoText,
  setUIShowLayerButtons,
  setUIShowLayerHideButtons,
  setShowResourceModal,
  setZenMode,
  setShowLoginModal,
  triggerFeatureInfoUpdateAction,
} = slice.actions;

export const getUIMode = (state: RootState) => state.ui.mode;

export const getUIVisibleControls = (state: RootState) =>
  state.ui.visibleControls;
export const getUIMapInteractionEnabled = (state: RootState) =>
  state.ui.mapInteractionEnabled;
export const getUIHashWriteEnabled = (state: RootState) =>
  state.ui.hashWriteEnabled;
export const getUIAllowChanges = (state: RootState) => state.ui.allowChanges;
export const getUIActiveTabKey = (state: RootState) => state.ui.activeTabKey;
export const getUIShowInfo = (state: RootState) => state.ui.showInfo;
export const getUIShowInfoText = (state: RootState) => state.ui.showInfoText;
export const getUIShowLayerButtons = (state: RootState) =>
  state.ui.showLayerButtons;
export const getUIShowLayerHideButtons = (state: RootState) =>
  state.ui.showLayerHideButtons;
export const getUIShowResourceModal = (state: RootState) =>
  state.ui.showResourceModal;
export const getZenMode = (state: RootState) => state.ui.zenMode;
export const getShowLoginModal = (state: RootState) => state.ui.showLoginModal;
export const getTriggerFeatureInfoUpdate = (state: RootState) =>
  state.ui.triggerFeatureInfoUpdate;

export default slice.reducer;
