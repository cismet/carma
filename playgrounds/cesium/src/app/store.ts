import { configureStore } from "@reduxjs/toolkit";
import { CesiumState, sliceCesium } from "@carma-mapping/cesium-engine";

export const setupStore = (preloadViewerState: CesiumState) => {
  const store = configureStore({
    reducer: {
      cesium: sliceCesium.reducer,
    },
    preloadedState: {
      cesium: preloadViewerState,
    },
  });

  return store;
};
