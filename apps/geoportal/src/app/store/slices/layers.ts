import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { shallowEqual, useSelector } from "react-redux";

import { Item } from "@carma-mapping/layers";
import type { RootState } from "..";

export type LayersState = {
  thumbnails: any[];
  favorites: Item[];
};

const initialState: LayersState = {
  thumbnails: [],
  favorites: [],
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
  },
});

export const { setThumbnail, addFavorite, removeFavorite } = slice.actions;

const getThumbnails = (state: RootState): Item[] => state.layers.thumbnails ?? [];
const getFavorites = (state: RootState): Item[] => state.layers.favorites ?? [];

export const useLayersThumbnails = () => useSelector(getThumbnails);
export const useLayersFavorites = () => useSelector(getFavorites);

export default slice;
