import { createSlice } from "@reduxjs/toolkit";

const initialState = {
  isMenuCollapsed: false,
  overviewMapSizes: 280,
};

const slice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setIsMenuCollapsed(state, action) {
      state.isMenuCollapsed = action.payload;
      return state;
    },
  },
});

export default slice;

export const { setIsMenuCollapsed } = slice.actions;

export const getIsMenuCollapsed = (state) => {
  return state.ui.isMenuCollapsed;
};
