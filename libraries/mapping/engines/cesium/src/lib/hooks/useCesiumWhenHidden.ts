import { useEffect } from "react";
import { selectViewerIsMode2d } from "../slices/cesium";
import { useSelector } from "react-redux";
import { isValidImageryLayer } from "../utils/instanceGates";
import { useCesiumContext } from "./useCesiumContext";

const hideLayers = (withScene: (scene: Scene) => void) => {
  withScene((scene) => {
    const hideOnce = () => {
      withScene((scene, viewer) => {
        for (let i = 0; i < viewer.imageryLayers.length; i++) {
          const layer = viewer.imageryLayers.get(i);
          if (isValidImageryLayer(layer)) {
            layer.show = false; // Hide the layer
          } else {
            console.debug("[CESIUM|VIEWER] skip invalid imagery layer");
          }
        }
        scene.postRender.removeEventListener(hideOnce);
      });
    };
    scene.postRender.addEventListener(hideOnce);
  });
};

const showLayers = (withScene: (scene: Scene) => void) => {
  withScene((scene) => {
    const showOnce = () => {
      withScene((scene, viewer) => {
        for (let i = 0; i < viewer.imageryLayers.length; i++) {
          const layer = viewer.imageryLayers.get(i);
          if (isValidImageryLayer(layer)) {
            layer.show = true; // unHide the layer
          } else {
            console.debug("[CESIUM|VIEWER] skip invalid imagery layer");
          }
        }
        scene.postRender.removeEventListener(showOnce);
      });
    };
    scene.postRender.addEventListener(showOnce);
  });
};

// reduce resources use when cesium is not visible
export const useCesiumWhenHidden = (delay = 0) => {
  const { withScene } = useCesiumContext();
  const isMode2d = useSelector(selectViewerIsMode2d);
  useEffect(() => {
    console.debug("HOOK: [CESIUM] useCesiumWhenHidden", isMode2d);
    if (isMode2d) {
      if (delay > 0) {
        setTimeout(() => {
          console.debug(
            "HOOK: [CESIUM] hiding cesium imagery layer with delay",
            delay
          );
          hideLayers(withScene);
        }, delay);
      } else {
        console.debug("HOOK: [CESIUM] hiding cesium imagery layer undelayed");
        hideLayers(withScene);
      }
    } else {
      console.debug("HOOK: [CESIUM] showing cesium imagery layer");
      showLayers(withScene);
    }
  }, [delay, withScene, isMode2d]);
};

export default useCesiumWhenHidden;
