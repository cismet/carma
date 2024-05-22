import {
  configureStore,
  createSelector,
  createSlice,
  PayloadAction,
} from '@reduxjs/toolkit';
import defaultState from '../config';
import { Cartesian3 } from 'cesium';
import { useSelector } from 'react-redux';
import { LocationState } from './slices/location';

import locationSlice from './slices/location';
import viewerSlice, { ViewerState } from './slices/viewer';

export type RootState = {
  location: LocationState;
  viewer: ViewerState;
  selectionTransparency: number;
};

// Transparency

export const selectionTransparencySlice = createSlice({
  name: 'selectionTransparency',
  initialState: defaultState.selectionTransparency,
  reducers: {
    setSelectionTransparency: (_, action: PayloadAction<number>) =>
      action.payload,
  },
});

// EXPORTS

const store = configureStore({
  reducer: {
    location: locationSlice.reducer,
    viewer: viewerSlice.reducer,
    selectionTransparency: selectionTransparencySlice.reducer,
  },
});

// setters

export const { setSelectionTransparency } = selectionTransparencySlice.actions;

export const { setLocation } = locationSlice.actions;

export const { setIsAnimating, toggleIsAnimating } = viewerSlice.actions;
export const selectViewerDataSources = createSelector(
  (state: RootState) => state.viewer.dataSources,
  (dataSources = {}) => {
    const { footprintGeoJson, tileset } = dataSources;
    return { footprintGeoJson, tileset };
  }
);

const selectViewerHome = createSelector(
  (state: RootState) => state.viewer.homePosition,
  (homePosition = { x: 0, y: 0, z: 0 }) => {
    const { x, y, z } = homePosition;
    return new Cartesian3(x, y, z);
  }
);

const selectViewerHomeOffset = createSelector(
  (state: RootState) => state.viewer.homeOffset,
  (offset = { x: 0, y: 0, z: 0 }) => {
    const { x, y, z } = offset;
    return new Cartesian3(x, y, z);
  }
);

// helper hooks reduce imports on use
export const useViewerDataSources = () => useSelector(selectViewerDataSources);
export const useViewerHome = () => useSelector(selectViewerHome);
export const useViewerHomeOffset = () => useSelector(selectViewerHomeOffset);

export const useSelectionTransparency = () =>
  useSelector((state: RootState) => state.selectionTransparency);

export default store;
