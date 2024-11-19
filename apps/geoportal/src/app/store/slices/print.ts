import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "..";
type PrintOrientation = "landscape" | "portrait";
type DPI = "100" | "200" | "300";
export type PrintState = {
  orientation: PrintOrientation;
  dpi: DPI;
  scale: string;
};

const initialState: PrintState = {
  orientation: "portrait",
  dpi: "100",
  scale: "4000",
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
    changeScale(state, action: PayloadAction<string>) {
      state.scale = action.payload;
    },
  },
});

export const { changeOrientation } = slice.actions;
export const getOrientation = (state: RootState) => state.print.orientation;
export const getDPI = (state: RootState) => state.print.dpi;
export const getScale = (state: RootState) => state.print.scale;

export default slice.reducer;
