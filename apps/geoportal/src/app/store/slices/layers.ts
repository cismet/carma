import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { Item } from "@carma-mapping/layers";
import type { RootState } from "..";

export type LayersState = {
  favorites: Item[];
  thumbnails: any[];
};

const initialState: LayersState = {
  favorites: [],
  thumbnails: [],
};

const slice = createSlice({
  name: "layers",
  initialState,
  reducers: {
    addFavorite(state, action: PayloadAction<Item>) {
      const alreadyExists = state.favorites.some(
        (favorite) =>
          favorite.id === `fav_${action.payload.id}` ||
          favorite.id === action.payload.id,
      );
      if (!alreadyExists) {
        state.favorites = [
          ...state.favorites,
          { ...action.payload, id: `fav_${action.payload.id}` },
        ];
      }
      return state;
    },
    removeFavorite(state, action: PayloadAction<Item>) {
      const newFavorites = state.favorites.filter(
        (favorite) =>
          favorite.id !== `fav_${action.payload.id}` &&
          favorite.id !== action.payload.id,
      );
      state.favorites = newFavorites;
      return state;
    },

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

export const { addFavorite, removeFavorite, setThumbnail } = slice.actions;

export const getFavorites = (state: RootState): Item[] =>
  state.layers.favorites;
export const getThumbnails = (state: RootState): Item[] =>
  state.layers.thumbnails;

export default slice.reducer;
