import { createSlice } from "@reduxjs/toolkit";

/**
 * State of the map print preview (@carma-mapping/print-core). A redraw seeds a
 * fresh rectangle, `ifMapPrinted` keeps the one that was just printed.
 */
const initialState = {
  active: false,
  orientation: "portrait",
  dpi: "72",
  name: "Druck_LagIS",
  isLoading: false,
  scale: "1000",
  printError: null,
  redrawPreview: true,
  ifMapPrinted: false,
};

const slice = createSlice({
  name: "print",
  initialState,
  reducers: {
    setPrintActive(state, action) {
      state.active = action.payload;
      return state;
    },
    setOrientation(state, action) {
      state.orientation = action.payload;
      return state;
    },
    setDPI(state, action) {
      state.dpi = action.payload;
      return state;
    },
    setPrintName(state, action) {
      state.name = action.payload;
      return state;
    },
    setIsLoading(state, action) {
      state.isLoading = action.payload;
      return state;
    },
    setScale(state, action) {
      state.scale = action.payload;
      return state;
    },
    setPrintError(state, action) {
      state.printError = action.payload;
      return state;
    },
    setRedrawPreview(state, action) {
      state.redrawPreview = action.payload;
      return state;
    },
    setIfMapPrinted(state, action) {
      state.ifMapPrinted = action.payload;
      return state;
    },
  },
});

export const {
  setPrintActive,
  setOrientation,
  setDPI,
  setPrintName,
  setIsLoading,
  setScale,
  setPrintError,
  setRedrawPreview,
  setIfMapPrinted,
} = slice.actions;

export const getPrintActive = (state) => state.print.active;
export const getOrientation = (state) => state.print.orientation;
export const getDPI = (state) => state.print.dpi;
export const getPrintName = (state) => state.print.name;
export const getIsLoading = (state) => state.print.isLoading;
export const getScale = (state) => state.print.scale;
export const getPrintError = (state) => state.print.printError;
export const getRedrawPreview = (state) => state.print.redrawPreview;
export const getIfMapPrinted = (state) => state.print.ifMapPrinted;

export default slice;
