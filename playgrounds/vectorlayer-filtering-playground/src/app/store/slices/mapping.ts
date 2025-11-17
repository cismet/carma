import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import { RootState } from "..";

const initialState = {
  startDrawing: false,
};

const slice = createSlice({
  name: "mapping",
  initialState,
  reducers: {
    setStartDrawing(state, action: PayloadAction<boolean>) {
      state.startDrawing = action.payload;
    },
  },
});

export const { setStartDrawing } = slice.actions;
export const getStartDrawing = (state: RootState) => state.mapping.startDrawing;

export default slice.reducer;
