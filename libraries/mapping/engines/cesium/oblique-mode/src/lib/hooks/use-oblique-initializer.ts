import { useEffect, useMemo, useRef } from "react";
import type { Degrees } from "@carma/units/types";
import { type Scene } from "@carma/cesium";

import {
  useCesiumContext,
  useFovWheelZoom,
  useCesiumCameraForceOblique,
  isValidScene,
} from "@carma-mapping/engines/cesium/core";
import { degToRad } from "@carma/units/helpers";

import { useOblique } from "../context/use-oblique";
import { enterObliqueMode, leaveObliqueMode } from "../utils/camera-utils";

const preUpdateHandlers = new WeakMap<Scene, (scene: Scene) => void>();

export function useObliqueInitializer(debug = false) {
  const {
    shouldSuspendPitchLimiterRef,
    requestRender,
    animationMapRef,
    sceneRef,
  } = useCesiumContext();
  const {
    isObliqueMode,
    fixedHeight,
    fixedPitch,
    minFov,
    maxFov,
    headingOffset,
  } = useOblique();
  const originalFovRef = useRef<number | null>(null);

  const wheelZoomOptions = useMemo(
    () => ({
      minFov,
      maxFov,
    }),
    [minFov, maxFov]
  );

  const { setEnabled: setWheelZoomEnabled } = useFovWheelZoom(
    isObliqueMode,
    wheelZoomOptions
  );

  const { enableCameraForceOblique, disableCameraForceOblique } =
    useCesiumCameraForceOblique(
      sceneRef,
      fixedPitch,
      fixedHeight,
      shouldSuspendPitchLimiterRef
    );

  useEffect(() => {
    // Always set the zoom handler state based on oblique mode; the hook will defer attaching until a viewer exists
    setWheelZoomEnabled(isObliqueMode);

    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    const { camera } = scene;

    const cameraController = scene.screenSpaceCameraController;

    cameraController.enableRotate = true;
    cameraController.enableTilt = true;
    cameraController.enableTranslate = true;

    if (isObliqueMode) {
      debug && console.debug("entering Oblique Mode");
      // If camera already has an oblique-like pitch (e.g., restored from hash), don't override it
      let isAlreadyOblique = false;
      const p = camera.pitch;
      const minOblique = -degToRad(80 as Degrees);
      const maxOblique = -degToRad(5 as Degrees);
      isAlreadyOblique = p > minOblique && p < maxOblique;

      if (isAlreadyOblique) {
        enableCameraForceOblique();
        requestRender({ delay: 50, repeat: 2 });
      } else {
        enterObliqueMode(scene, originalFovRef, fixedPitch, fixedHeight, () => {
          enableCameraForceOblique();
          requestRender({ delay: 50, repeat: 2 });
        });
      }
    } else {
      debug && console.debug("leaving Oblique Mode", originalFovRef.current);
      leaveObliqueMode(scene, animationMapRef.current, originalFovRef, () => {
        disableCameraForceOblique();
        requestRender();
      });
    }

    return () => {
      if (isValidScene(scene) && preUpdateHandlers.has(scene)) {
        const handlerToRemove = preUpdateHandlers.get(scene);
        scene.preUpdate.removeEventListener(handlerToRemove!);
        preUpdateHandlers.delete(scene);
      }
    };
  }, [
    debug,
    animationMapRef,
    isObliqueMode,
    sceneRef,
    fixedPitch,
    fixedHeight,
    minFov,
    maxFov,
    headingOffset,
    setWheelZoomEnabled,
    enableCameraForceOblique,
    disableCameraForceOblique,
    requestRender,
  ]);

  return {
    isObliqueMode,
  };
}

export default useObliqueInitializer;
