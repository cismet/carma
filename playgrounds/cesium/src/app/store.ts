import { configureStore } from "@reduxjs/toolkit";
import { CesiumState, cesiumReducer } from "@carma-mapping/engines/cesium";

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
