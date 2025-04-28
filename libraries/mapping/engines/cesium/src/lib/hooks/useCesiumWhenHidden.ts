import { useEffect } from "react";
import { useCesiumViewer } from "./useCesiumViewer";
import { selectViewerIsMode2d } from "../slices/cesium";
import { useSelector } from "react-redux";
import { Viewer } from "cesium";

const hideLayers = (viewer: Viewer) => {
  if (viewer.isDestroyed()) {
    return;
  }
  for (let i = 0; i < viewer.imageryLayers.length; i++) {
    const layer = viewer.imageryLayers.get(i);
    if (layer) {
      layer.show = false; // Hide the layer
      console.debug("[CESIUM|VIEWER] hide imagery layer", i);
    }
  }
};

const showLayers = (viewer: Viewer) => {
  if (viewer.isDestroyed()) {
    return;
  }
  for (let i = 0; i < viewer.imageryLayers.length; i++) {
    const layer = viewer.imageryLayers.get(i);
    if (layer) {
      layer.show = true; // unHide the layer
      console.debug("[CESIUM|VIEWER] show imagerylayer", i);
    }
  }
};

// reduce resoures use when cesium is not visible
export const useCesiumWhenHidden = (delay = 0) => {
  const viewer = useCesiumViewer();
  const isMode2d = useSelector(selectViewerIsMode2d);
  console.debug("HOOKINIT: [CESIUM] useCesiumWhenHidden");
  useEffect(() => {
    console.debug("HOOK: [CESIUM] useCesiumWhenHidden", viewer, isMode2d);
    if (viewer) {
      if (isMode2d) {
        if (delay > 0) {
          setTimeout(() => {
            console.debug(
              "HOOK: [CESIUM] hiding cesium imagery layer with delay",
              delay
            );
            hideLayers(viewer);
          }, delay);
        } else {
          console.debug("HOOK: [CESIUM] hiding cesium imagery layer undelayed");
          hideLayers(viewer);
        }
      } else {
        console.debug("HOOK: [CESIUM] showing cesium imagery layer");
        showLayers(viewer);
      }
    }
  }, [viewer, isMode2d]);
};

export default useCesiumWhenHidden;
