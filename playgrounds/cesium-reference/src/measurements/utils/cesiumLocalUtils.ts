import { Viewer } from "cesium";
import { handleDelayedRender } from "@carma-commons/utils/window";
import { withValidViewer } from "@carma-mapping/engines/cesium";

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

  const withViewer = (cb: (viewer: Viewer) => void) => {
    withValidViewer(viewer, cb);
  };

  const withScene = (cb: (scene: Viewer["scene"]) => void) => {
    withValidViewer(viewer, (viewer) => cb(viewer.scene));
  };

  const withEntities = (cb: (entities: Viewer["entities"]) => void) => {
    withValidViewer(viewer, (viewer) => {
      if (viewer.entities) cb(viewer.entities);
    });
  };

  return {
    requestRender,
    withViewer,
    withScene,
    withEntities,
  };
};
