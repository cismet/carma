import { createSlice } from "@reduxjs/toolkit";

const initialState = {
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

export const getThumbnails = (state) => {
  return state.layers.thumbnails;
};
