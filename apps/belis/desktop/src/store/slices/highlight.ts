import { createSlice } from "@reduxjs/toolkit";
import { RootState } from "..";

export type StreetWithCode = [number, string];

const initialState = {
  streets: [] as StreetWithCode[],
  streetsFetched: false,
  streetsLoading: false,
};

const slice = createSlice({
  name: "highlight",
  initialState,
  reducers: {
    setStreets(state, action) {
      state.streets = action.payload;
      state.streetsFetched = true;
    },
    setStreetsLoading(state, action) {
      state.streetsLoading = action.payload;
    },
  },
});

export default slice;

export const { setStreets, setStreetsLoading } = slice.actions;

export const getStreets = (state: RootState) => state.highlight.streets;
export const getStreetsFetched = (state: RootState) =>
  state.highlight.streetsFetched;
export const getStreetsLoading = (state: RootState) =>
  state.highlight.streetsLoading;
