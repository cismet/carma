import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  kassenzeichenliste: [],
  shapeMode: "default",
};

const slice = createSlice({
  name: "searchMode",
  initialState,
  reducers: {
    storeKassenzeichenliste(state, action) {
      state.kassenzeichenliste = action.payload;
      return state;
    },
    storeShapeMode(state, action) {
      state.shapeMode = action.payload;
      return state;
    },
  },
});

export const { storeKassenzeichenliste, storeShapeMode } = slice.actions;

export const getKassenzeichenliste = (state) =>
  state.searchMode.kassenzeichenliste;

export const getShapeMode = (state) => state.searchMode.shapeMode;

export default slice;
