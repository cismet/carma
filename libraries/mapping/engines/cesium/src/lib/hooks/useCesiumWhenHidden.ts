import { useEffect } from "react";
import { useCesiumViewer } from "./useCesiumViewer";
import { selectViewerIsMode2d } from "../slices/cesium";
import { useSelector } from "react-redux";
import { Viewer } from "cesium";

const hideLayers = (viewer: Viewer) => {
  for (let i = 0; i < viewer.imageryLayers.length; i++) {
    const layer = viewer.imageryLayers.get(i);
    if (layer) {
      layer.show = false; // Hide the layer
      console.debug("[CESIUM|VIEWER] hide imagery layer", i);
    }
  }
};

const showLayers = (viewer: Viewer) => {
  for (let i = 0; i < viewer.imageryLayers.length; i++) {
    const layer = viewer.imageryLayers.get(i);
    if (layer) {
      layer.show = true; // unHide the layer
      console.debug("[CESIUM|VIEWER] show imagerylayer", i);
    }
  }
};

export const useCesiumWhenHidden = ({ delay = 0 }: { delay: number }) => {
  const viewer = useCesiumViewer();
  const isMode2d = useSelector(selectViewerIsMode2d);
  useEffect(() => {
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
  }, [viewer, isMode2d, delay]);
};

export default useCesiumWhenHidden;
