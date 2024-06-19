import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import defaultState from '../../config';
import { Cartesian3, Color } from 'cesium';
import { ColorRgbaArray } from '../../..';
import { colorToArray } from '../../utils/cesiumHelpers';
import { useSelector } from 'react-redux';
import { RootState } from '..';

type PlainCartesian3 = {
  x: number;
  y: number;
  z: number;
};

export type TilesetConfig = {
  url: string;
  name?: string;
  translation?: PlainCartesian3;
  idProperty?: string;
};

export type GeoJsonConfig = {
  url: string;
  name?: string;
  idProperty?: string;
};

export type SceneStyleDescription = {
  globe: {
    baseColor: ColorRgbaArray;
  };
};

export type SceneStyles = {
  default: SceneStyleDescription;
  primary?: Partial<SceneStyleDescription>;
  secondary?: Partial<SceneStyleDescription>;
};

export interface ViewerState {
  isAnimating: boolean;
  isMode2d: boolean;
  homePosition: PlainCartesian3;
  homeOffset: PlainCartesian3;
  showPrimaryTileset: boolean; // tileset is the base 3D model equivalent to a basemap
  showSecondaryTileset: boolean; // tileset is the base 3D model equivalent to a basemap

  /*
  quality: {
    msaaSamples: number;
    useBrowserRecommendedResolution: boolean;

  }
  */
  // TODO move to per tileset styling
  styling: {
    tileset: {
      opacity: number;
    };
  };
  sceneStyles: SceneStyles;
  dataSources: {
    footprintGeoJson: GeoJsonConfig;
    tilesets: {
      primary: TilesetConfig;
      secondary: TilesetConfig;
    };
  };
  terrainProvider: {
    url: string;
  };
}

type ColorInput = ColorRgbaArray | Color;

const slice = createSlice({
  name: 'viewer',
  initialState: defaultState.viewer,
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

      state.sceneStyles[style] = {
        ...state.sceneStyles[style],
        globe: {
          baseColor: Array.isArray(color) ? color : colorToArray(color),
        },
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
const selectViewerIsMode2d = (state: RootState) => state.viewer.isMode2d;
const selectViewerDataSources = (state: RootState) => state.viewer.dataSources;

const selectViewerHome = createSelector(
  (state: RootState) => state.viewer.homePosition,
  ({ x, y, z }) => new Cartesian3(x, y, z)
);

const selectViewerHomeOffset = createSelector(
  (state: RootState) => state.viewer.homeOffset,
  ({ x, y, z }) => new Cartesian3(x, y, z)
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
