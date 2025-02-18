import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  shapeMode: "default",
};

const slice = createSlice({
  name: "searchMode",
  initialState,
  reducers: {
    storeShapeMode(state, action) {
      state.shapeMode = action.payload;
      return state;
    },
  },
});

export const { storeShapeMode } = slice.actions;

export const getShapeMode = (state) => state.searchMode.shapeMode;

export default slice;
