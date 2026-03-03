import { createSlice } from "@reduxjs/toolkit";
import { RootState } from "..";

export interface BelisStreet {
  s: string;
  g: string;
  x: number;
  y: number;
  m: {
    s: string;
    bounds: [number, number, number, number];
  };
}

const initialState = {
  streets: [] as BelisStreet[],
  streetsFetched: false,
  streetsLoading: false,
  streetsMd5: null as string | null,
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
    setStreetsMd5(state, action) {
      state.streetsMd5 = action.payload;
    },
  },
});

export default slice;

export const { setStreets, setStreetsLoading, setStreetsMd5 } = slice.actions;

export const getStreets = (state: RootState) => state.highlight.streets;
export const getStreetsFetched = (state: RootState) =>
  state.highlight.streetsFetched;
export const getStreetsLoading = (state: RootState) =>
  state.highlight.streetsLoading;
export const getStreetsMd5 = (state: RootState) => state.highlight.streetsMd5;
