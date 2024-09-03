import { createSlice } from "@reduxjs/toolkit";
import type { RootState } from "..";

export type LayersState = {
  thumbnails: any[];
}

const initialState: LayersState = {
  thumbnails: [],
};

const slice = createSlice({
  name: "layers",
  initialState,
  reducers: {
    setThumbnail(state, action) {
      let alreadyExists = state.thumbnails.some(
        (thumbnail) => thumbnail.name === action.payload.name,
      );
      if (!alreadyExists) {
        state.thumbnails = [...state.thumbnails, action.payload];
      }
      return state;
    },
  },
});

export default slice;

export const { setThumbnail } = slice.actions;

export const getThumbnails = (state : RootState) => {
  return state.layers.thumbnails;
};
