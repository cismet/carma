import { Cartesian3, Color } from "cesium";
import localForage from "localforage";
import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import { type ColorInput, type RootState, type CesiumState } from "../..";
import { colorToArray, isColorRgbaArray } from "../utils/cesiumHelpers";

export enum VIEWER_TRANSITION_STATE {
  NONE,
  TO3D,
  TO2D,
}

const initialState: CesiumState = {
  isMode2d: false,
  isAnimating: false,
  currentTransition: VIEWER_TRANSITION_STATE.NONE,
  homeOffset: null,
  homePosition: null,
  showPrimaryTileset: true,
  showSecondaryTileset: false,
  styling: {
    tileset: {
      opacity: 1.0,
    },
  },
  sceneSpaceCameraController: {
    enableCollisionDetection: false,
    minimumZoomDistance: 1,
    maximumZoomDistance: Infinity,
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
  models: null,
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

const sliceCesium = createSlice({
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

    setTransitionTo2d: (state: CesiumState) => {
      console.log("REDUCER [STATE|CESIUM] transition to 2D");
      state.currentTransition = VIEWER_TRANSITION_STATE.TO2D;
    },
    setTransitionTo3d: (state: CesiumState) => {
      console.log("REDUCER [STATE|CESIUM] transition to 3D");
      state.currentTransition = VIEWER_TRANSITION_STATE.TO3D;
    },
    clearTransition: (state: CesiumState) => {
      console.log("REDUCER [STATE|CESIUM] transition cleared");
      state.currentTransition = VIEWER_TRANSITION_STATE.NONE;
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
    setScreenSpaceCameraControllerMaximumZoomDistance: (
      state: CesiumState,
      action: PayloadAction<number>,
    ) => {
      state.sceneSpaceCameraController.maximumZoomDistance = action.payload;
    },
    setScreenSpaceCameraControllerMinimumZoomDistance: (
      state: CesiumState,
      action: PayloadAction<number>,
    ) => {
      state.sceneSpaceCameraController.minimumZoomDistance = action.payload;
    },
    setScreenSpaceCameraControllerEnableCollisionDetection: (
      state: CesiumState,
      action: PayloadAction<boolean>,
    ) => {
      state.sceneSpaceCameraController.enableCollisionDetection =
        action.payload;
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
  setIsMode2d,
  setHomePosition,

  setIsAnimating,
  toggleIsAnimating,

  setTransitionTo2d,
  setTransitionTo3d,
  clearTransition,

  setShowPrimaryTileset,
  setShowSecondaryTileset,

  setGlobeBaseColor,
  setTilesetOpacity,

  setScreenSpaceCameraControllerMaximumZoomDistance,
  setScreenSpaceCameraControllerMinimumZoomDistance,
  setScreenSpaceCameraControllerEnableCollisionDetection,
} = sliceCesium.actions;

// selectors

export const selectViewerIsAnimating = ({ cesium }: RootState) =>
  cesium.isAnimating;
export const selectViewerCurrentTransition = ({ cesium }: RootState) =>
  cesium.currentTransition;
export const selectViewerIsTransitioning = ({ cesium }: RootState) =>
  cesium.currentTransition !== VIEWER_TRANSITION_STATE.NONE;

export const selectViewerIsMode2d = ({ cesium }: RootState) => cesium.isMode2d;
export const selectViewerDataSources = ({ cesium }: RootState) =>
  cesium.dataSources;
export const selectViewerModels = ({ cesium }: RootState) => cesium.models;

export const selectViewerHome = createSelector(
  ({ cesium }: RootState) => cesium.homePosition,
  (xyz) => (xyz ? new Cartesian3(xyz.x, xyz.y, xyz.z) : null),
);
export const selectViewerHomeOffset = createSelector(
  ({ cesium }: RootState) => cesium.homeOffset,
  (xyz) => (xyz ? new Cartesian3(xyz.x, xyz.y, xyz.z) : null),
);

export const selectViewerSceneGlobalBaseColor = createSelector(
  (state: RootState) => state.cesium.sceneStyles.default.globe.baseColor,
  (baseColor) => new Color(...baseColor),
);

export const selectScreenSpaceCameraControllerMinimumZoomDistance = ({
  cesium,
}: RootState) => cesium.sceneSpaceCameraController.minimumZoomDistance;

export const selectScreenSpaceCameraControllerMaximumZoomDistance = ({
  cesium,
}: RootState) => cesium.sceneSpaceCameraController.maximumZoomDistance;

export const selectScreenSpaceCameraControllerEnableCollisionDetection = ({
  cesium,
}: RootState) => cesium.sceneSpaceCameraController.enableCollisionDetection;

export const selectShowPrimaryTileset = ({ cesium }: RootState) =>
  cesium.showPrimaryTileset;
export const selectShowSecondaryTileset = ({ cesium }: RootState) =>
  cesium.showSecondaryTileset;
export const selectTilesetOpacity = ({ cesium }: RootState) =>
  cesium.styling.tileset.opacity;

export const cesiumReducer = sliceCesium.reducer;

export default sliceCesium.reducer;
