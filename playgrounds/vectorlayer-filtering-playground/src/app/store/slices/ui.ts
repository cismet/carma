import { createSlice } from "@reduxjs/toolkit";

import type { PayloadAction } from "@reduxjs/toolkit";

import { RootState } from "..";

export enum UIMode {
  DEFAULT = "default",
  FEATURE_INFO = "featureInfo",
  PRINT = "print",
}

export interface UIState {
  mode: UIMode;
}

const initialState: UIState = {
  mode: UIMode.DEFAULT,
};

const slice = createSlice({
  name: "ui",
  initialState,
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
  },
});

export const { setUIMode, toggleUIMode } = slice.actions;

export const getUIMode = (state: RootState) => state.ui.mode;

export default slice.reducer;
