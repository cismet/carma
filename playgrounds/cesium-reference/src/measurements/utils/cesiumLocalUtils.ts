import { Viewer } from "cesium";
import { handleDelayedRender } from "@carma-commons/dom/window";
import { withValidViewer } from "@carma-mapping/engines/cesium/core";

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
      withValidViewer(viewer, (viewer) => {
        viewer.scene.requestRender();
      });
    };
    handleDelayedRender(renderOnce, opts);
  };

  return {
    requestRender,
  };
};
