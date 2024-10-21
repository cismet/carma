import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { Map as LeafletMap } from "leaflet";

import { ForwaredTopicMapContextState } from "@carma-apps/portals";

import { RootState } from "..";

const initialState: ForwaredTopicMapContextState = {
  leafletElement: null,
  referenceSystem: null,
  referenceSystemDefinition: null,
  maskingPolygon: null,
};

const slice = createSlice({
  name: "topicmap",
  initialState,
  reducers: {
    setLeafletElement(state, action: PayloadAction<LeafletMap>) {
      state.leafletElement = action.payload;
    },
    clearLeafletElement(state) {
      state.leafletElement = null;
    },
    setReferenceSystem(state, action: PayloadAction<unknown>) {
      state.referenceSystem = action.payload;
    },
    setReferenceSystemDefinition(state, action: PayloadAction<unknown>) {
      state.referenceSystemDefinition = action.payload;
    },
    setMaskingPolygon(state, action: PayloadAction<unknown>) {
      state.maskingPolygon = action.payload;
    },
  },
});

export const {
  setLeafletElement,
  clearLeafletElement,
  setReferenceSystem,
  setReferenceSystemDefinition,
  setMaskingPolygon,
} = slice.actions;

export const getLeafletElement = (state: RootState) =>
  state.topicmap.leafletElement;
export const getReferenceSystem = (state: RootState) =>
  state.topicmap.referenceSystem;
export const getReferenceSystemDefinition = (state: RootState) =>
  state.topicmap.referenceSystemDefinition;
export const getMaskingPolygon = (state: RootState) =>
  state.topicmap.maskingPolygon;

export default slice.reducer;
