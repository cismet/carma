import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "..";
type PrintOrientation = "landscape" | "portret";
export type PrintState = {
  orientation: PrintOrientation;
};

const initialState: PrintState = {
  orientation: "portret",
};

const slice = createSlice({
  name: "print",
  initialState,
  reducers: {
    changeOrientation(state, action: PayloadAction<PrintOrientation>) {
      state.orientation = action.payload;
    },
  },
});

export const { changeOrientation } = slice.actions;
export const getOrientation = (state: RootState) => state.print.orientation;

export default slice.reducer;
