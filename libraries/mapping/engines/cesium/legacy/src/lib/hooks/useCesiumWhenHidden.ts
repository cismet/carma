import { useEffect } from "react";
import { CesiumContextType } from "../CesiumContext";
import { isValidImageryLayer } from "../utils/instanceGates";
import { useCesiumContext } from "./useCesiumContext";

const hideLayers = (ctx: CesiumContextType) => {
  ctx.withScene((scene) => {
    const hideOnce = () => {
      ctx.withScene((scene, viewer) => {
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

const showLayers = (ctx: CesiumContextType) => {
  ctx.withScene((scene) => {
    const showOnce = () => {
      ctx.withScene((scene, viewer) => {
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
// NOTE: Currently disabled - Cesium is always active using requestRender mode
export const useCesiumWhenHidden = (delay = 0) => {
  const ctx = useCesiumContext();
  console.debug("HOOKINIT: [CESIUM] useCesiumWhenHidden");
  useEffect(() => {
    console.debug("HOOK: [CESIUM] useCesiumWhenHidden - DISABLED");
    // Cesium is always active, no need to hide/show layers
    return;

    // OLD CODE (kept for reference if we need to re-enable):
    /*
    if (isLeaflet) {
      if (delay > 0) {
        setTimeout(() => {
          console.debug(
            "HOOK: [CESIUM] hiding cesium imagery layer with delay",
            delay
          );
          hideLayers(ctx);
        }, delay);
      } else {
        console.debug("HOOK: [CESIUM] hiding cesium imagery layer undelayed");
        hideLayers(ctx);
      }
    } else {
      console.debug("HOOK: [CESIUM] showing cesium imagery layer");
      showLayers(ctx);
    }
    */
  }, [delay, ctx]);
};

export default useCesiumWhenHidden;
