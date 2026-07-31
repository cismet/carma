import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "..";

export type PrintOrientation = "landscape" | "portrait";
export type DPI = "72" | "100" | "200" | "300";

export type PrintState = {
  /** Whether the print preview rectangle is currently shown on the map. */
  active: boolean;
  orientation: PrintOrientation;
  dpi: DPI;
  name: string;
  isLoading: boolean;
  scale: string;
  printError: null | string;
  redrawPreview: boolean;
  ifMapPrinted: boolean;
  ifPopupOpend: boolean;
};

const initialState: PrintState = {
  active: false,
  orientation: "portrait",
  dpi: "72",
  name: "Druck_BelIS",
  isLoading: false,
  scale: "250",
  printError: null,
  redrawPreview: true,
  ifMapPrinted: false,
  ifPopupOpend: false,
};

const slice = createSlice({
  name: "print",
  initialState,
  reducers: {
    changePrintActive(state, action: PayloadAction<boolean>) {
      state.active = action.payload;
    },
    changeOrientation(state, action: PayloadAction<PrintOrientation>) {
      state.orientation = action.payload;
    },
    changeDPI(state, action: PayloadAction<DPI>) {
      state.dpi = action.payload;
    },
    changePrintName(state, action: PayloadAction<string>) {
      state.name = action.payload;
    },
    changeIsLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    changeScale(state, action: PayloadAction<string>) {
      state.scale = action.payload;
    },
    changePrintError(state, action: PayloadAction<string>) {
      state.printError = action.payload;
    },
    changeRedrawPreview(state, action: PayloadAction<boolean>) {
      state.redrawPreview = action.payload;
    },
    changeIfMapPrinted(state, action: PayloadAction<boolean>) {
      state.ifMapPrinted = action.payload;
    },
    changeIfPopupOpend(state, action: PayloadAction<boolean>) {
      state.ifPopupOpend = action.payload;
    },
  },
});

export const {
  changePrintActive,
  changeOrientation,
  changeDPI,
  changePrintName,
  changeIsLoading,
  changeScale,
  changePrintError,
  changeRedrawPreview,
  changeIfMapPrinted,
  changeIfPopupOpend,
} = slice.actions;

export const getPrintActive = (state: RootState) => state.print.active;
export const getOrientation = (state: RootState) => state.print.orientation;
export const getDPI = (state: RootState) => state.print.dpi;
export const getPrintName = (state: RootState) => state.print.name;
export const getIsLoading = (state: RootState) => state.print.isLoading;
export const getScale = (state: RootState) => state.print.scale;
export const getPrintError = (state: RootState) => state.print.printError;
export const getRedrawPreview = (state: RootState) => state.print.redrawPreview;
export const getIfMapPrinted = (state: RootState) => state.print.ifMapPrinted;
export const getIfPopupOpend = (state: RootState) => state.print.ifPopupOpend;

export default slice;
