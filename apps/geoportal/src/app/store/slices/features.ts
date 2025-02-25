import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isEqual } from "lodash";

import type { FeatureInfo, FeatureInfoState } from "@carma-apps/portals";
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
  secondaryInfoBoxElements: [],
  selectedFeature: null,
  vectorInfo: undefined,
  vectorInfos: [],
  loading: false,
};

const slice = createSlice({
  name: "features",
  initialState,
  reducers: {
    addFeature(state, action: PayloadAction<FeatureInfo>) {
      state.features.push(action.payload);
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

  setInfoText,
  setInfoTextToNothingFound,
  clearInfoText,

  setPreferredLayerId,

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
export const getSecondaryInfoBoxElements = (state: RootState) =>
  state.features.secondaryInfoBoxElements;
export const getVectorInfo = (state: RootState) => state.features.vectorInfo;
export const getVectorInfos = (state: RootState) => state.features.vectorInfos;
export const getLoading = (state: RootState) => state.features.loading;

export default slice.reducer;
