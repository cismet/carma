import { Cartesian3 } from "cesium";
import localForage from "localforage";
import { createSelector, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import type { PlainCartesian3 } from "@carma-commons/types";

import { type RootState, type CesiumState, SceneStyles } from "../..";
import { fromPlainCartesian3 } from "../utils/cesiumSerializer";

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
    setIsAnimating: (state: CesiumState) => {
      state.isAnimating = true;
    },
    clearIsAnimating: (state: CesiumState) => {
      state.isAnimating = false;
    },
    toggleIsAnimating: (state: CesiumState) => {
      state.isAnimating = !state.isAnimating;
    },

    setIsMode2d: (state: CesiumState, action: PayloadAction<boolean>) => {
      state.isMode2d = action.payload;
    },

    setTransitionTo2d: (state: CesiumState) => {
      console.debug("REDUCER [STATE|CESIUM] transition to 2D");
      state.currentTransition = VIEWER_TRANSITION_STATE.TO2D;
    },
    setTransitionTo3d: (state: CesiumState) => {
      console.debug("REDUCER [STATE|CESIUM] transition to 3D");
      state.currentTransition = VIEWER_TRANSITION_STATE.TO3D;
    },
    clearTransition: (state: CesiumState) => {
      console.debug("REDUCER [STATE|CESIUM] transition cleared");
      state.currentTransition = VIEWER_TRANSITION_STATE.NONE;
    },

    setShowPrimaryTileset: (
      state: CesiumState,
      action: PayloadAction<boolean>
    ) => {
      state.showPrimaryTileset = action.payload;
    },
    setShowSecondaryTileset: (
      state: CesiumState,
      action: PayloadAction<boolean>
    ) => {
      state.showSecondaryTileset = action.payload;
    },

    setCurrentSceneStyle: (
      state: CesiumState,
      action: PayloadAction<keyof SceneStyles>
    ) => {
      state.currentSceneStyle = action.payload;
    },
    toggleCurrentSceneStyle: (state: CesiumState) => {
      const currentStyle = state.currentSceneStyle;
      const newStyle = currentStyle === "primary" ? "secondary" : "primary";
      state.currentSceneStyle = newStyle;
    },

    setScreenSpaceCameraControllerMaximumZoomDistance: (
      state: CesiumState,
      action: PayloadAction<number>
    ) => {
      state.sceneSpaceCameraController.maximumZoomDistance = action.payload;
    },
    setScreenSpaceCameraControllerMinimumZoomDistance: (
      state: CesiumState,
      action: PayloadAction<number>
    ) => {
      state.sceneSpaceCameraController.minimumZoomDistance = action.payload;
    },
    setScreenSpaceCameraControllerEnableCollisionDetection: (
      state: CesiumState,
      action: PayloadAction<boolean>
    ) => {
      state.sceneSpaceCameraController.enableCollisionDetection =
        action.payload;
    },
    setTilesetOpacity: (state: CesiumState, action: PayloadAction<number>) => {
      state.styling.tileset.opacity = action.payload;
    },
    setHomePosition: (
      state: CesiumState,
      action: PayloadAction<PlainCartesian3>
    ) => {
      state.homePosition = action.payload;
    },
    setHomeOffset: (
      state: CesiumState,
      action: PayloadAction<PlainCartesian3>
    ) => {
      state.homeOffset = action.payload;
    },
  },
});

export const {
  setIsMode2d,

  setHomePosition,
  setHomeOffset,

  setIsAnimating,
  clearIsAnimating,
  toggleIsAnimating,

  setTransitionTo2d,
  setTransitionTo3d,
  clearTransition,

  setCurrentSceneStyle,
  toggleCurrentSceneStyle,

  setShowPrimaryTileset,
  setShowSecondaryTileset,

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
  cesium.currentTransition !== undefined &&
  cesium.currentTransition !== VIEWER_TRANSITION_STATE.NONE;

export const selectViewerIsMode2d = ({ cesium }: RootState) => cesium.isMode2d;
export const selectViewerDataSources = ({ cesium }: RootState) =>
  cesium.dataSources;
export const selectViewerModels = ({ cesium }: RootState) => cesium.models;

export const selectViewerHomePlain = ({ cesium }: RootState) =>
  cesium.homePosition;
export const selectViewerHomeOffsetPlain = ({ cesium }: RootState) =>
  cesium.homeOffset;

// memoized selectors
export const selectViewerHome: (state: RootState) => Cartesian3 | null =
  createSelector(selectViewerHomePlain, (homePosition) => {
    return homePosition ? fromPlainCartesian3(homePosition) : null;
  });

export const selectViewerHomeOffset: (state: RootState) => Cartesian3 | null =
  createSelector(selectViewerHomeOffsetPlain, (homeOffset) => {
    return homeOffset ? fromPlainCartesian3(homeOffset) : null;
  });

export const selectSceneStyles = ({ cesium }: RootState) => cesium.sceneStyles;
export const selectSceneStylePrimary = ({ cesium }: RootState) =>
  cesium?.sceneStyles?.primary;
export const selectSceneStyleSecondary = ({ cesium }: RootState) =>
  cesium?.sceneStyles?.secondary;
export const selectCurrentSceneStyle = ({ cesium }: RootState) =>
  cesium.currentSceneStyle;

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
