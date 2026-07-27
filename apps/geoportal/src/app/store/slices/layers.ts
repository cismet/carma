import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { Item } from "@carma-mapping/layers";
import { type FeatureFlagConfig } from "@carma-providers/feature-flag";

import type { RootState } from "..";

// Favorites moved into the LayerCatalogProvider of @carma-mapping/layers
// (persisted there via localforage). `favorites` stays here as DORMANT data
// with no actions: it must remain in the persisted record so redux-persist
// does not erase it before the provider's one-time import (legacyFavoritesKey
// in App.tsx) has run on every device.
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
    setThumbnail(state, action) {
      let alreadyExists = state.thumbnails.some(
        (thumbnail) => thumbnail.name === action.payload.name
      );
      if (!alreadyExists) {
        state.thumbnails = [...state.thumbnails, action.payload];
      }
      return state;
    },
    addCustomFeatureFlags(state, action: PayloadAction<FeatureFlagConfig>) {
      state.customFeatureFlags = {
        ...state.customFeatureFlags,
        ...action.payload,
      };
      return state;
    },
  },
});

export const { setThumbnail, addCustomFeatureFlags } = slice.actions;

export const getThumbnails = (state: RootState): Item[] =>
  state.layers.thumbnails;
export const getCustomFeatureFlags = (state: RootState): FeatureFlagConfig =>
  state.layers.customFeatureFlags;

export default slice.reducer;
