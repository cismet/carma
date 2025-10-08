import { useEffect } from "react";
import { useSelector } from "react-redux";

import { selectViewerIsAnimating } from "../slices/cesium";
import { useCesiumContext } from "./useCesiumContext";
import { shouldBlockUserInput } from "../hooks/useMapTransition";
import {
  isValidScene,
  isValidScreenSpaceCameraController,
} from "../utils/instanceGates";

const useDisableSSCC = () => {
  const isAnimating = useSelector(selectViewerIsAnimating);
  console.debug("HOOKINIT [CESIUM|SCENE] useDisableSSCC");
  const { transitionStateRef, sceneRef } = useCesiumContext();

  const isEnabled =
    !isAnimating && !shouldBlockUserInput(transitionStateRef.current);

  useEffect(() => {
    console.info("HOOK [CESIUM|SCENE|SSCC] map is enabled", isEnabled);

    const scene = sceneRef.current;

    if (!isValidScene(scene)) return;

    const sccc = scene.screenSpaceCameraController;

    if (!isValidScreenSpaceCameraController(sccc)) return;

    try {
      sccc.enableRotate = isEnabled;
      sccc.enableZoom = isEnabled;
      sccc.enableTilt = isEnabled;
    } catch (e) {
      console.error(
        "HOOK [CESIUM|SCENE|SSCC] error setting map interaction",
        e
      );
    }
    return () => {
      console.debug("HOOK [CESIUM|SCENE|SSCC] map interaction reset");
      const scene = sceneRef.current;

      if (!isValidScene(scene)) return;

      const sccc = scene.screenSpaceCameraController;

      if (!isValidScreenSpaceCameraController(sccc)) return;
      sccc.enableRotate = true;
      sccc.enableZoom = true;
      sccc.enableTilt = true;
    };
  }, [isEnabled, sceneRef]);
};

export default useDisableSSCC;
