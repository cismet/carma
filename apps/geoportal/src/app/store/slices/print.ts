import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "..";
type PrintOrientation = "landscape" | "portrait";
type DPI = "72" | "100" | "200" | "300";
export type PrintState = {
  orientation: PrintOrientation;
  dpi: DPI;
  name: string;
  isLoading: boolean;
  scale: string;
};

const initialState: PrintState = {
  orientation: "portrait",
  dpi: "72",
  name: "Druck_Geoportal",
  isLoading: false,
  scale: "250",
};

const slice = createSlice({
  name: "print",
  initialState,
  reducers: {
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
  },
});

export const {
  changeOrientation,
  changeDPI,
  changePrintName,
  changeIsLoading,
  changeScale,
} = slice.actions;
export const getOrientation = (state: RootState) => state.print.orientation;
export const getDPI = (state: RootState) => state.print.dpi;
export const getPrintName = (state: RootState) => state.print.name;
export const getIsLoading = (state: RootState) => state.print.isLoading;
export const getScale = (state: RootState) => state.print.scale;

export default slice.reducer;
