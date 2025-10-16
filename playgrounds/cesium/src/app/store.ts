import { configureStore } from "@reduxjs/toolkit";
import { CesiumState, cesiumReducer } from "../lib/cesium-engine-snapshot/src";

export const setupStore = (preloadViewerState: CesiumState) => {
  const store = configureStore({
    reducer: {
      cesium: cesiumReducer,
    },
    preloadedState: {
      cesium: preloadViewerState,
    },
  });

  return store;
};
