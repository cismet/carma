import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isEqual } from "lodash";

import type { FeatureInfo, FeatureInfoState } from "@carma-apps/portals";
import type { RootState } from "..";

const initialState: FeatureInfoState = {
  features: [],
  infoText: "",
  nothingFoundIDs: [],
  preferredLayerId: "",
  secondaryInfoBoxElements: [],
  selectedFeature: null,
  vectorInfo: undefined,
  vectorInfos: [],
};

const featuresSlice = createSlice({
  name: "features",
  initialState,
  reducers: {
    addFeature(state, action: PayloadAction<FeatureInfo>) {
      state.features.push(action.payload);
    },
    setFeatures(state, action: PayloadAction<FeatureInfo[]>) {
      state.features = action.payload;
    },

    setSelectedFeature(state, action: PayloadAction<FeatureInfo | null>) {
      state.selectedFeature = action.payload;
    },
    updateInfoElementsAfterRemovingFeature(
      state,
      action: PayloadAction<string>,
    ) {
      const id = action.payload;
      if (state.selectedFeature?.id === id) {
        state.selectedFeature = null;

        if (state.secondaryInfoBoxElements.length > 0) {
          const selectedFeature = state.secondaryInfoBoxElements[0];
          state.selectedFeature = selectedFeature;
          state.secondaryInfoBoxElements =
            state.secondaryInfoBoxElements.filter(
              (f) => f.id !== selectedFeature.id,
            );
        }
      } else {
        state.secondaryInfoBoxElements = state.secondaryInfoBoxElements.filter(
          (f) => f.id !== id,
        );
      }
    },

    addNothingFoundID(state, action: PayloadAction<string>) {
      state.nothingFoundIDs.push(action.payload);
    },
    removeNothingFoundID(state, action: PayloadAction<string>) {
      state.nothingFoundIDs = state.nothingFoundIDs.filter(
        (id) => id !== action.payload,
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
        (info) => info.id !== action.payload,
      );
    },
    clearVectorInfos(state) {
      state.vectorInfos = [];
    },

    // InfoText
    setInfoText(state, action: PayloadAction<string>) {
      state.infoText = action.payload;
    },

    // PreferredLayerId
    setPreferredLayerId(state, action: PayloadAction<string>) {
      state.preferredLayerId = action.payload;
    },

    // SecondaryInfoBoxElements
    setSecondaryInfoBoxElements(state, action: PayloadAction<FeatureInfo[]>) {
      state.secondaryInfoBoxElements = action.payload;
    },
    updateSecondaryInfoBoxElements(state, action: PayloadAction<FeatureInfo>) {
      const feature = action.payload;
      state.secondaryInfoBoxElements = state.features.filter(
        (f) => !isEqual(f, feature),
      );
    },
  },
});

// Export actions grouped by related state properties
export const {
  addFeature,
  setFeatures,

  setSelectedFeature,
  updateInfoElementsAfterRemovingFeature,

  addNothingFoundID,
  removeNothingFoundID,
  clearNothingFoundIDs,

  setVectorInfo,

  addVectorInfo,
  removeVectorInfo,
  clearVectorInfos,

  setInfoText,

  setPreferredLayerId,

  setSecondaryInfoBoxElements,
  updateSecondaryInfoBoxElements,
} = featuresSlice.actions;

// Selectors with 'getFeatures' prefix, ordered alphabetically
export const getFeaturesFeatures = (state: RootState) => state.features.features;
export const getFeaturesSelectedFeature = (state: RootState) =>
  state.features.selectedFeature;
export const getFeaturesInfoText = (state: RootState) =>
  state.features.infoText;
export const getFeaturesNothingFoundIDs = (state: RootState) =>
  state.features.nothingFoundIDs;
export const getFeaturesPreferredLayerId = (state: RootState) =>
  state.features.preferredLayerId;
export const getFeaturesSecondaryInfoBoxElements = (state: RootState) =>
  state.features.secondaryInfoBoxElements;
export const getFeaturesVectorInfo = (state: RootState) =>
  state.features.vectorInfo;
export const getFeaturesVectorInfos = (state: RootState) =>
  state.features.vectorInfos;

export default featuresSlice.reducer;
