import { Viewer } from "cesium";
import { handleDelayedRender } from "@carma-commons/dom/window";

/**
 * Local Cesium context utilities (can be replaced by context later)
 */
export const createLocalCesiumUtils = (viewer: Viewer | null) => {
  const requestRender = (opts?: {
    delay?: number;
    repeat?: number;
    repeatInterval?: number;
  }) => {
    const renderOnce = () => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    };
    handleDelayedRender(renderOnce, opts);
  };

  return {
    requestRender,
  };
};
