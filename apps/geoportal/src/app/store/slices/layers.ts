import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { Item } from "@carma-commons/types";
import type { RootState } from "..";
import { FeatureFlagConfig } from "@carma-apps/portals";

export type LayersState = {
  favorites: Item[];
  thumbnails: any[];
  customFeatureFlags: FeatureFlagConfig;
};

const initialState: LayersState = {
  favorites: [],
  thumbnails: [],
  customFeatureFlags: {},
};

const slice = createSlice({
  name: "layers",
  initialState,
  reducers: {
    addFavorite(state, action: PayloadAction<Item>) {
      const alreadyExists = state.favorites.some(
        (favorite) =>
          favorite.id === `fav_${action.payload.id}` ||
          favorite.id === action.payload.id
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
          favorite.id !== action.payload.id
      );
      state.favorites = newFavorites;
      return state;
    },
    updateFavorite(state, action: PayloadAction<Item>) {
      const newFavorites = state.favorites.map((favorite) => {
        if (favorite.id === `fav_${action.payload.id}`) {
          return {
            ...action.payload,
            id: `fav_${action.payload.id}`,
          };
        }
        return favorite;
      });
      state.favorites = newFavorites;
      return state;
    },

    setThumbnail(state, action) {
      let alreadyExists = state.thumbnails.some(
        (thumbnail) => thumbnail.name === action.payload.name
      );
      if (!alreadyExists) {
        state.thumbnails = [...state.thumbnails, action.payload];
      }
      return state;
    },
    setCustomFeatureFlags(state, action: PayloadAction<FeatureFlagConfig>) {
      state.customFeatureFlags = action.payload;
      return state;
    },
  },
});

export const {
  addFavorite,
  removeFavorite,
  updateFavorite,
  setThumbnail,
  setCustomFeatureFlags,
} = slice.actions;

export const getFavorites = (state: RootState): Item[] =>
  state.layers.favorites;
export const getThumbnails = (state: RootState): Item[] =>
  state.layers.thumbnails;
export const getCustomFeatureFlags = (state: RootState): FeatureFlagConfig =>
  state.layers.customFeatureFlags;

export default slice.reducer;
