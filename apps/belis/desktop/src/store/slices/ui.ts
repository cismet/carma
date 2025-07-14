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
    setMenuWidth(state, action) {
      state.overviewMapSizes = action.payload;
      return state;
    },
  },
});

export default slice;

export const { setIsMenuCollapsed, setMenuWidth } = slice.actions;

export const getIsMenuCollapsed = (state) => {
  return state.ui.isMenuCollapsed;
};

export const getMenuWidth = (state) => {
  return state.ui.overviewMapSizes;
};
