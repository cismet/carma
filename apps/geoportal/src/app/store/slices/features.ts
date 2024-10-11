import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { useSelector } from "react-redux";
import { isEqual } from "lodash";

import type { FeatureInfo, FeatureInfoState } from "@carma-apps/portals";
import { RootState } from "..";

const initialState: FeatureInfoState = {
  features: [],
  selectedFeature: null,
  secondaryInfoBoxElements: [],
  infoText: "",
  preferredLayerId: "",
  vectorInfo: undefined,
  nothingFoundIDs: [],
  vectorInfos: [],
};

const slice = createSlice({
  name: "features",
  initialState,
  reducers: {
    setFeatures(state, action) {
      state.features = action.payload;
    },
    addFeature(state, action) {
      state.features.push(action.payload);
    },
    setSelectedFeature(state, action) {
      state.selectedFeature = action.payload;
    },
    setSecondaryInfoBoxElements(state, action) {
      state.secondaryInfoBoxElements = action.payload;
    },
    updateSecondaryInfoBoxElements(state, action) {
      const feature = action.payload;
      const tmp = state.features.map((f) => {
        if (isEqual(f, feature)) {
          return null;
        } else {
          return f;
        }
      });
      state.secondaryInfoBoxElements = tmp.filter((f) => f !== null);
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
    setInfoText(state, action) {
      state.infoText = action.payload;
    },
    setPreferredLayerId(state, action) {
      state.preferredLayerId = action.payload;
    },
    setVectorInfo(state, action) {
      state.vectorInfo = action.payload;
    },
    addNothingFoundID(state, action) {
      state.nothingFoundIDs.push(action.payload);
    },
    removeNothingFoundID(state, action) {
      state.nothingFoundIDs = state.nothingFoundIDs.filter(
        (id) => id !== action.payload,
      );
    },
    clearNothingFoundIDs(state) {
      state.nothingFoundIDs = [];
    },
    addVectorInfo(state, action: PayloadAction<FeatureInfo>) {
      state.vectorInfos.push(action.payload);
    },
    removeVectorInfo(state, action) {
      state.vectorInfos = state.vectorInfos.filter(
        (id) => id !== action.payload,
      );
    },
    clearVectorInfos(state) {
      state.vectorInfos = [];
    },
  },
});

export const {
  setFeatures,
  addFeature,
  setSelectedFeature,
  setSecondaryInfoBoxElements,
  updateSecondaryInfoBoxElements,
  updateInfoElementsAfterRemovingFeature,
  setInfoText,
  setPreferredLayerId,
  setVectorInfo,
  addNothingFoundID,
  removeNothingFoundID,
  clearNothingFoundIDs,
  addVectorInfo,
  removeVectorInfo,
  clearVectorInfos,
} = slice.actions;

// Selectors

const getFeatures = (state: RootState) => state.features.features;
const getInfoText = (state: RootState) => state.features.infoText;
const getNothingFoundIDs = (state: RootState) => state.features.nothingFoundIDs;
const getPreferredLayerId = (state: RootState) =>
  state.features.preferredLayerId;
const getSecondaryInfoBoxElements = (state: RootState) =>
  state.features.secondaryInfoBoxElements;
const getSelectedFeature = (state: RootState) => state.features.selectedFeature;
const getVectorInfo = (state: RootState) => state.features.vectorInfo;
const getVectorInfos = (state: RootState) => state.features.vectorInfos;

// Hook Selectors with `Features` Prefix

export const useFeatures = () => useSelector(getFeatures);
export const useFeaturesInfoText = () => useSelector(getInfoText);
export const useFeaturesNothingFoundIDs = () => useSelector(getNothingFoundIDs);
export const useFeaturesPreferredLayerId = () =>
  useSelector(getPreferredLayerId);
export const useFeaturesSecondaryInfoBoxElements = () =>
  useSelector(getSecondaryInfoBoxElements);
export const useFeaturesSelectedFeature = () => useSelector(getSelectedFeature);
export const useFeaturesVectorInfo = () => useSelector(getVectorInfo);
export const useFeaturesVectorInfos = () => useSelector(getVectorInfos);

export default slice;
