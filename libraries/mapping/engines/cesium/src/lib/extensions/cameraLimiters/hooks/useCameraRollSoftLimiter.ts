import { useCallback, useEffect } from "react";
import { Math as CesiumMath } from "cesium";

import { useCesiumContext } from "../../../hooks/useCesiumContext";
import { CtxEvent } from "../../../cesiumContextEventMap";

import {
  isValidCamera,
  tryWithValidCamera,
  isValidScene,
} from "../../../utils/instanceGates";

const NADIR_THRESHOLD = 0.2;

const useCameraRollSoftLimiter = (
  options: {
    rollThreshold?: number;
    nadirThreshold?: number;
    debug?: boolean;
  } = {}
) => {
  const rollThreshold = options.rollThreshold || 0.15;
  const nadirThreshold = options.nadirThreshold || NADIR_THRESHOLD;
  const debug = options.debug ?? false;

  const { isSuspendedRef, emit, sceneRef } = useCesiumContext();

  const onComplete = useCallback(
    () => emit(CtxEvent.AnimationEnd, undefined),
    [emit]
  );

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    console.debug(
      "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to reset rolled camera"
    );
    const camera = scene.camera;
    const moveEndListener = async () => {
      if (!isValidCamera(camera)) return;
      if (camera.position && !isSuspendedRef.current) {
        const rollDeviation = CesiumMath.equalsEpsilon(
          camera.roll,
          0,
          0,
          rollThreshold
        );

        const isCloseToNadir = CesiumMath.equalsEpsilon(
          camera.pitch,
          -Math.PI / 2,
          0,
          nadirThreshold
        );

        debug &&
          console.debug(
            "LISTENER HOOK [2D3D|CESIUM|CAMERA]: nadir",
            isCloseToNadir,
            camera.pitch,
            Math.abs(camera.pitch + Math.PI / 2)
          );

        if (!rollDeviation && !isCloseToNadir) {
          debug &&
            console.debug(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: flyTo reset roll 2D3D",
              rollDeviation
            );
          const rollDelta = Math.abs(camera.roll);
          const duration = Math.min(rollDelta, 1);
          console.debug(
            "Roll delta animation duration mapping",
            rollDelta,
            duration
          );
          emit(CtxEvent.AnimationStart, undefined);
          tryWithValidCamera(camera, () => {
            camera.flyTo({
              destination: camera.position,
              orientation: {
                heading: camera.heading,
                pitch: camera.pitch,
                roll: 0,
              },
              duration,
              complete: onComplete,
            });
          });
        }
      }
    };
    camera.moveEnd.addEventListener(moveEndListener);
    return () => {
      tryWithValidCamera(camera, () => {
        camera.moveEnd.removeEventListener(moveEndListener);
      });
    };
  }, [
    isSuspendedRef,
    sceneRef,
    onComplete,
    emit,
    debug,
    nadirThreshold,
    rollThreshold,
  ]);
};

export default useCameraRollSoftLimiter;
