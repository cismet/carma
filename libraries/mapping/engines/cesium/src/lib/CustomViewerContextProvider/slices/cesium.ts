import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { Cartesian3, Color } from "cesium";
import { useSelector } from "react-redux";
import { ColorInput, RootState, CesiumState } from "../../..";
import { colorToArray, isColorRgbaArray } from "../../utils";
import localForage from "localforage";

const initialState: CesiumState = {
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
  imageryProvider: null,
};

export const getCesiumConfig = ({
  appKey,
  storagePrefix = "defaultStorage",
}: {
  appKey: string;
  storagePrefix?: string;
}) => {
  return {
    key: `@${appKey}.${storagePrefix}.app.cesium`,
    storage: localForage,
    whitelist: ["isMode2d", "showPrimaryTileset", "showSecondaryTileset"],
  };
};

export const sliceCesium = createSlice({
  name: "cesium",
  initialState,
  reducers: {
    setIsAnimating: (state: CesiumState, action: PayloadAction<boolean>) => {
      state.isAnimating = action.payload;
    },

    toggleIsAnimating: (state: CesiumState) => {
      state.isAnimating = !state.isAnimating;
    },
    setIsMode2d: (state: CesiumState, action: PayloadAction<boolean>) => {
      state.isMode2d = action.payload;
    },
    setShowPrimaryTileset: (
      state: CesiumState,
      action: PayloadAction<boolean>,
    ) => {
      state.showPrimaryTileset = action.payload;
    },
    setShowSecondaryTileset: (
      state: CesiumState,
      action: PayloadAction<boolean>,
    ) => {
      state.showSecondaryTileset = action.payload;
    },
    setTilesetOpacity: (state: CesiumState, action: PayloadAction<number>) => {
      // console.log(action.payload);
      state.styling.tileset.opacity = action.payload;
    },
    setGlobeBaseColor: (
      state: CesiumState,
      action: PayloadAction<{
        style: keyof CesiumState["sceneStyles"];
        color: ColorInput;
      }>,
    ) => {
      const { style, color } = action.payload;

      const baseColor = isColorRgbaArray(color) ? color : colorToArray(color);

      state.sceneStyles[style] = {
        ...state.sceneStyles[style],
        globe: { baseColor },
      };
    },
    setHomePosition: (
      state: CesiumState,
      action: PayloadAction<Cartesian3>,
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
} = sliceCesium.actions;

// selectors

const selectViewerIsAnimating = ({ cesium }: RootState) => cesium.isAnimating;
const selectViewerIsMode2d = ({ cesium }: RootState) => cesium.isMode2d;
const selectViewerDataSources = ({ cesium }: RootState) => cesium.dataSources;

const selectViewerHome = createSelector(
  ({ cesium }: RootState) => cesium.homePosition,
  (xyz) => (xyz ? new Cartesian3(xyz.x, xyz.y, xyz.z) : null),
);

const selectViewerHomeOffset = createSelector(
  ({ cesium }: RootState) => cesium.homeOffset,
  (xyz) => (xyz ? new Cartesian3(xyz.x, xyz.y, xyz.z) : null),
);

const selectViewerSceneGlobalBaseColor = createSelector(
  (state: RootState) => state.cesium.sceneStyles.default.globe.baseColor,
  (baseColor) => new Color(...baseColor),
);

export const useViewerIsAnimating = () => useSelector(selectViewerIsAnimating);
export const useViewerIsMode2d = () => useSelector(selectViewerIsMode2d);
export const useViewerDataSources = () => useSelector(selectViewerDataSources);
export const useViewerHome = () => useSelector(selectViewerHome);
export const useViewerHomeOffset = () => useSelector(selectViewerHomeOffset);
export const useGlobeBaseColor = () =>
  useSelector(selectViewerSceneGlobalBaseColor);

export const useShowPrimaryTileset = () =>
  useSelector(({ cesium }: RootState) => cesium.showPrimaryTileset);
export const useShowSecondaryTileset = () =>
  useSelector(({ cesium }: RootState) => cesium.showSecondaryTileset);
export const useTilesetOpacity = () =>
  useSelector(({ cesium }: RootState) => cesium.styling.tileset.opacity);

export default sliceCesium;
