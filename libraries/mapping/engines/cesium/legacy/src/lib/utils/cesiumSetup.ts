import { Viewer } from "cesium";

export {
  setupCesiumEnvironment,
  type CesiumBaseUrlInput,
} from "@carma-mapping/engines/cesium/core";

export const getIsViewerReadyAsync = async (
  viewer: Viewer,
  setIsViewerReady: (value: boolean) => void
) => {
  await new Promise<void>((resolve) => {
    const removeEvent = viewer.scene.postRender.addEventListener(() => {
      if (viewer.clockViewModel.canAnimate) {
        console.log("Viewer is ready");
        removeEvent();
        setIsViewerReady(true);
        resolve();
      }
    });
  });
};
