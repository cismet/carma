import { createSelector, createSlice} from '@reduxjs/toolkit';
import type { PayloadAction } from "@reduxjs/toolkit";
import { Cartesian3, Color } from 'cesium';
import { useSelector } from 'react-redux';
import { ColorInput, RootState, ViewerState } from '../../..';
import { colorToArray, isColorRgbaArray } from '../../utils';

const defaultState: ViewerState = {
  isAnimating: false,
  isMode2d: false,
  homeOffset: null,
  homePosition: null,
  showPrimaryTileset: true,
  showSecondaryTileset: false,
  styling: {
    tileset: {
      opacity: 1.0,
    },
  },
  sceneStyles: {
    default: {
      globe: {
        baseColor: colorToArray(Color.TEAL),
      },
    },
  },
  dataSources: {
    footprintGeoJson: null,
    tilesets: {
      primary: null,
      secondary: null,
    },
  },
  terrainProvider: null,
};

const slice = createSlice({
  name: 'viewer',
  initialState: defaultState,
  reducers: {
    setIsAnimating: (state: ViewerState, action: PayloadAction<boolean>) => {
      state.isAnimating = action.payload;
    },

    toggleIsAnimating: (state: ViewerState) => {
      state.isAnimating = !state.isAnimating;
    },
    setIsMode2d: (state: ViewerState, action: PayloadAction<boolean>) => {
      state.isMode2d = action.payload;
    },
    setShowPrimaryTileset: (
      state: ViewerState,
      action: PayloadAction<boolean>
    ) => {
      state.showPrimaryTileset = action.payload;
    },
    setShowSecondaryTileset: (
      state: ViewerState,
      action: PayloadAction<boolean>
    ) => {
      state.showSecondaryTileset = action.payload;
    },
    setTilesetOpacity: (state: ViewerState, action: PayloadAction<number>) => {
      // console.log(action.payload);
      state.styling.tileset.opacity = action.payload;
    },
    setGlobeBaseColor: (
      state: ViewerState,
      action: PayloadAction<{
        style: keyof ViewerState['sceneStyles'];
        color: ColorInput;
      }>
    ) => {
      const { style, color } = action.payload;

      const baseColor = isColorRgbaArray(color) ? color : colorToArray(color);

      state.sceneStyles[style] = {
        ...state.sceneStyles[style],
        globe: { baseColor },
      };
    },
    setHomePosition: (
      state: ViewerState,
      action: PayloadAction<Cartesian3>
    ) => {
      const { x, y, z } = action.payload;
      state.homePosition = { x, y, z };
    },
  },
});

export const {
  setIsAnimating,
  setIsMode2d,
  toggleIsAnimating,
  setShowPrimaryTileset,
  setShowSecondaryTileset,
  setTilesetOpacity,
} = slice.actions;

// selectors

const selectViewerIsAnimating = (state: RootState) => state.viewer.isAnimating;
const selectViewerIsMode2d = (state: RootState) => state.viewer?.isMode2d;
const selectViewerDataSources = (state: RootState) => state.viewer.dataSources;

const selectViewerHome = createSelector(
  (state: RootState) => state.viewer.homePosition,
  (xyz) => (xyz ? new Cartesian3(xyz.x, xyz.y, xyz.z) : null)
);

const selectViewerHomeOffset = createSelector(
  (state: RootState) => state.viewer.homeOffset,
  (xyz) => (xyz ? new Cartesian3(xyz.x, xyz.y, xyz.z) : null)
);

const selectViewerSceneGlobalBaseColor = createSelector(
  (state: RootState) => state.viewer.sceneStyles.default.globe.baseColor,
  (baseColor) => new Color(...baseColor)
);

export const useViewerIsAnimating = () => useSelector(selectViewerIsAnimating);
export const useViewerIsMode2d = () => useSelector(selectViewerIsMode2d);
export const useViewerDataSources = () => useSelector(selectViewerDataSources);
export const useViewerHome = () => useSelector(selectViewerHome);
export const useViewerHomeOffset = () => useSelector(selectViewerHomeOffset);
export const useGlobeBaseColor = () =>
  useSelector(selectViewerSceneGlobalBaseColor);

export const useShowPrimaryTileset = () =>
  useSelector(({ viewer }: RootState) => viewer.showPrimaryTileset);
export const useShowSecondaryTileset = () =>
  useSelector(({ viewer }: RootState) => viewer.showSecondaryTileset);
export const useTilesetOpacity = () =>
  useSelector(({ viewer }: RootState) => viewer.styling.tileset.opacity);

export default slice;
