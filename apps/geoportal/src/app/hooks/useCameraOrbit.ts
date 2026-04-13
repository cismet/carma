import { useCallback, useEffect, useRef, useState } from "react";
import { type Scene } from "@carma-cesium";
import {
  createCesiumSceneOrbitController,
  type CesiumSceneOrbitController,
  type CesiumSceneOrbitControllerStopOptions,
} from "@carma-mapping/engines/cesium/core";
import type { Seconds } from "@carma-units";

interface UseCameraOrbitOptions {
  scene: Scene | null;
  enabled: boolean;
  revolutionDurationSec?: Seconds;
  direction?: "cw" | "ccw";
  minPitchDeg?: number;
  restartDelayMs?: number;
}

export const useCameraOrbit = ({
  scene,
  enabled,
  revolutionDurationSec = 30 as Seconds,
  direction = "cw",
  minPitchDeg = 30,
  restartDelayMs = 300,
}: UseCameraOrbitOptions) => {
  const [isOrbiting, setIsOrbiting] = useState(false);
  const controllerRef = useRef<CesiumSceneOrbitController | null>(null);

  useEffect(() => {
    if (!scene) {
      controllerRef.current?.destroy();
      controllerRef.current = null;
      setIsOrbiting(false);
      return;
    }

    const controller = createCesiumSceneOrbitController(scene, {
      revolutionDurationSec,
      direction,
      minPitchDeg,
      restartDelayMs,
    });

    controllerRef.current = controller;
    setIsOrbiting(controller.isOrbiting);

    const unsubscribe = controller.subscribeIsOrbiting((nextIsOrbiting) => {
      setIsOrbiting(nextIsOrbiting);
    });

    return () => {
      unsubscribe();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      controller.destroy();
    };
  }, [scene, revolutionDurationSec, direction, minPitchDeg, restartDelayMs]);

  useEffect(() => {
    controllerRef.current?.setEnabled(enabled);
  }, [enabled]);

  const startOrbit = useCallback(() => {
    controllerRef.current?.startOrbit();
  }, []);

  const stopOrbit = useCallback(
    (options?: CesiumSceneOrbitControllerStopOptions) => {
      controllerRef.current?.stopOrbit(options);
    },
    []
  );

  const toggleOrbit = useCallback(() => {
    controllerRef.current?.toggleOrbit();
  }, []);

  return {
    isOrbiting,
    startOrbit,
    stopOrbit,
    toggleOrbit,
  };
};
