import localForage from "localforage";
import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

import { type RootState, type CesiumState, SceneStyles } from "../..";

export enum VIEWER_TRANSITION_STATE {
  NONE,
  TO3D,
  TO2D,
}

const initialState: CesiumState = {
  isAnimating: false,
  currentTransition: VIEWER_TRANSITION_STATE.NONE,
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
    whitelist: ["showPrimaryTileset", "showSecondaryTileset"],
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
  },
});

export const {
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
const selectCesiumState = (state: RootState | undefined) => state?.cesium;

export const selectViewerIsAnimating = (state: RootState | undefined) =>
  selectCesiumState(state)?.isAnimating ?? initialState.isAnimating;
export const selectViewerCurrentTransition = (state: RootState | undefined) =>
  selectCesiumState(state)?.currentTransition ?? initialState.currentTransition;
export const selectViewerIsTransitioning = (state: RootState | undefined) =>
  selectViewerCurrentTransition(state) !== VIEWER_TRANSITION_STATE.NONE;

export const selectViewerDataSources = (state: RootState | undefined) =>
  selectCesiumState(state)?.dataSources;
export const selectViewerModels = (state: RootState | undefined) =>
  selectCesiumState(state)?.models;

export const selectSceneStyles = (state: RootState | undefined) =>
  selectCesiumState(state)?.sceneStyles;
export const selectSceneStylePrimary = (state: RootState | undefined) =>
  selectSceneStyles(state)?.primary;
export const selectSceneStyleSecondary = (state: RootState | undefined) =>
  selectSceneStyles(state)?.secondary;
export const selectCurrentSceneStyle = (state: RootState | undefined) =>
  selectCesiumState(state)?.currentSceneStyle ?? initialState.currentSceneStyle;

export const selectScreenSpaceCameraControllerMinimumZoomDistance = (
  state: RootState | undefined
) =>
  selectCesiumState(state)?.sceneSpaceCameraController?.minimumZoomDistance ??
  initialState.sceneSpaceCameraController.minimumZoomDistance;

export const selectScreenSpaceCameraControllerMaximumZoomDistance = (
  state: RootState | undefined
) =>
  selectCesiumState(state)?.sceneSpaceCameraController?.maximumZoomDistance ??
  initialState.sceneSpaceCameraController.maximumZoomDistance;

export const selectScreenSpaceCameraControllerEnableCollisionDetection = (
  state: RootState | undefined
) =>
  selectCesiumState(state)?.sceneSpaceCameraController
    ?.enableCollisionDetection ??
  initialState.sceneSpaceCameraController.enableCollisionDetection;

export const selectShowPrimaryTileset = (state: RootState | undefined) =>
  selectCesiumState(state)?.showPrimaryTileset ??
  initialState.showPrimaryTileset;
export const selectShowSecondaryTileset = (state: RootState | undefined) =>
  selectCesiumState(state)?.showSecondaryTileset ??
  initialState.showSecondaryTileset;
export const selectTilesetOpacity = (state: RootState | undefined) =>
  selectCesiumState(state)?.styling?.tileset?.opacity ??
  initialState.styling.tileset.opacity;

export const cesiumReducer = sliceCesium.reducer;

export default sliceCesium.reducer;
