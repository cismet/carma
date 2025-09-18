import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isEqual } from "lodash";

import type { FeatureInfo } from "@carma/types";
import type { FeatureInfoState } from "@carma-appframeworks/portals";
import type { RootState } from "..";

// TODO: move to constants/config;
const EMPTY_INFO_TEXT = "";
const NOTHING_FOUND_INFO_TEXT =
  "Auf die Karte klicken um die Sachdatenabfrage zu starten.";

const initialState: FeatureInfoState = {
  features: [],
  infoText: EMPTY_INFO_TEXT,
  nothingFoundIDs: [],
  preferredLayerId: "",
  preferredVectorLayerId: undefined,
  secondaryInfoBoxElements: [],
  selectedFeature: null,
  vectorInfo: undefined,
  vectorInfos: [],
  loading: false,
  completedVectorLayers: [],
};

const slice = createSlice({
  name: "features",
  initialState,
  reducers: {
    addFeature(state, action: PayloadAction<FeatureInfo>) {
      state.features.push(action.payload);
    },

    addCompletedVectorLayer(state, action: PayloadAction<string>) {
      if (!state.completedVectorLayers.includes(action.payload)) {
        state.completedVectorLayers.push(action.payload);
      }
    },

    clearCompletedVectorLayers(state) {
      state.completedVectorLayers = [];
    },
    setFeatures(state, action: PayloadAction<FeatureInfo[]>) {
      state.features = action.payload;
    },
    clearFeatures(state) {
      state.features = [];
    },

    setSelectedFeature(state, action: PayloadAction<FeatureInfo | null>) {
      state.selectedFeature = action.payload;
    },
    updateInfoElementsAfterRemovingFeature(
      state,
      action: PayloadAction<string>
    ) {
      const id = action.payload;
      if (state.selectedFeature?.id === id) {
        state.selectedFeature = null;

        if (state.secondaryInfoBoxElements.length > 0) {
          const selectedFeature = state.secondaryInfoBoxElements[0];
          state.selectedFeature = selectedFeature;
          state.secondaryInfoBoxElements =
            state.secondaryInfoBoxElements.filter(
              (f) => f.id !== selectedFeature.id
            );
        }
      } else {
        state.secondaryInfoBoxElements = state.secondaryInfoBoxElements.filter(
          (f) => f.id !== id
        );
      }
    },
    clearSelectedFeature(state) {
      state.selectedFeature = null;
    },

    addNothingFoundID(state, action: PayloadAction<string>) {
      state.nothingFoundIDs.push(action.payload);
    },
    removeNothingFoundID(state, action: PayloadAction<string>) {
      state.nothingFoundIDs = state.nothingFoundIDs.filter(
        (id) => id !== action.payload
      );
    },
    clearNothingFoundIDs(state) {
      state.nothingFoundIDs = [];
    },

    setVectorInfo(state, action: PayloadAction<FeatureInfo | undefined>) {
      state.vectorInfo = action.payload;
    },

    addVectorInfo(state, action: PayloadAction<FeatureInfo>) {
      state.vectorInfos.push(action.payload);
    },

    removeVectorInfo(state, action: PayloadAction<string>) {
      state.vectorInfos = state.vectorInfos.filter(
        (info) => info.id !== action.payload
      );
    },
    clearVectorInfos(state) {
      state.vectorInfos = [];
    },

    // InfoText
    setInfoText(state, action: PayloadAction<string>) {
      state.infoText = action.payload;
    },
    setInfoTextToNothingFound(state) {
      state.infoText = NOTHING_FOUND_INFO_TEXT;
    },
    clearInfoText(state) {
      state.infoText = EMPTY_INFO_TEXT;
    },

    // PreferredLayerId
    setPreferredLayerId(state, action: PayloadAction<string>) {
      state.preferredLayerId = action.payload;
    },

    setPreferredVectorLayerId(state, action: PayloadAction<number>) {
      state.preferredVectorLayerId = action.payload;
    },

    // SecondaryInfoBoxElements
    setSecondaryInfoBoxElements(state, action: PayloadAction<FeatureInfo[]>) {
      state.secondaryInfoBoxElements = action.payload;
    },
    updateSecondaryInfoBoxElements(state, action: PayloadAction<FeatureInfo>) {
      const feature = action.payload;
      state.secondaryInfoBoxElements = state.features.filter(
        (f) => !isEqual(f, feature)
      );
    },
    removeSecondaryInfoBoxElement(state, action: PayloadAction<FeatureInfo>) {
      const feature = action.payload;
      state.secondaryInfoBoxElements = state.secondaryInfoBoxElements.filter(
        (f) => !isEqual(f, feature)
      );
    },
    moveFeatureToEnd(state, action: PayloadAction<FeatureInfo>) {
      const feature = action.payload;
      state.secondaryInfoBoxElements.push(feature);
    },
    moveFeatureToFront(state, action: PayloadAction<FeatureInfo>) {
      const feature = action.payload;
      state.secondaryInfoBoxElements.unshift(feature);
    },
    clearSecondaryInfoBoxElements(state) {
      state.secondaryInfoBoxElements = [];
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
  },
});

// Export actions grouped by related state properties
export const {
  setFeatures,
  addFeature,
  clearFeatures,

  setSelectedFeature,
  updateInfoElementsAfterRemovingFeature,
  clearSelectedFeature,

  addNothingFoundID,
  removeNothingFoundID,
  clearNothingFoundIDs,

  setVectorInfo,

  addVectorInfo,
  removeVectorInfo,
  clearVectorInfos,

  addCompletedVectorLayer,
  clearCompletedVectorLayers,

  setInfoText,
  setInfoTextToNothingFound,
  clearInfoText,

  setPreferredLayerId,
  setPreferredVectorLayerId,

  setSecondaryInfoBoxElements,
  updateSecondaryInfoBoxElements,
  removeSecondaryInfoBoxElement,
  moveFeatureToEnd,
  moveFeatureToFront,
  clearSecondaryInfoBoxElements,
  setLoading,
} = slice.actions;

export const getFeatures = (state: RootState) => state.features.features;
export const getSelectedFeature = (state: RootState) =>
  state.features.selectedFeature;
export const getInfoText = (state: RootState) => state.features.infoText;
export const getNothingFoundIDs = (state: RootState) =>
  state.features.nothingFoundIDs;
export const getPreferredLayerId = (state: RootState) =>
  state.features.preferredLayerId;
export const getPreferredVectorLayerId = (state: RootState) =>
  state.features.preferredVectorLayerId;
export const getSecondaryInfoBoxElements = (state: RootState) =>
  state.features.secondaryInfoBoxElements;
export const getVectorInfo = (state: RootState) => state.features.vectorInfo;
export const getVectorInfos = (state: RootState) => state.features.vectorInfos;
export const getLoading = (state: RootState) => state.features.loading;
export const getCompletedVectorLayers = (state: RootState) =>
  state.features.completedVectorLayers;

export default slice.reducer;
