import { useCallback, useEffect } from "react";
import { BoundingSphere, Cartesian3, Math as CesiumMath } from "cesium";

import { useCesiumContext } from "../../../hooks/useCesiumContext";
import { CtxEvent } from "../../../cesiumContextEventMap";

import { pickSceneCenter } from "../../../utils/pickers";
import { isValidScene, tryWithValidCamera } from "../../../utils/instanceGates";

const useCameraPitchSoftLimiter = (
  options: {
    minPitchDeg?: number;
    resetPitchOffsetDeg?: number;
    pitchLimiter?: boolean;
    debug?: boolean;
  } = {}
) => {
  const debug = options.debug ?? false;
  const pitchLimiter =
    options.pitchLimiter === undefined ? true : options.pitchLimiter;
  const minPitchDeg = options.minPitchDeg || 22;
  const resetPitchOffsetDeg = options.resetPitchOffsetDeg || 8;

  const { sceneRef, isSuspendedRef, emit, enableCollisionDetectionRef } =
    useCesiumContext();
  const collisions = enableCollisionDetectionRef.current;

  const onComplete = useCallback(
    () => emit(CtxEvent.AnimationEnd, undefined),
    [emit]
  );

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    if (!isSuspendedRef.current && collisions && pitchLimiter) {
      debug &&
        console.debug(
          "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to correct camera pitch"
        );

      const resetPitchRad = CesiumMath.toRadians(
        -(minPitchDeg + resetPitchOffsetDeg)
      );
      const minPitchRad = CesiumMath.toRadians(-minPitchDeg);

      const moveEndListener = async () => {
        if (!isValidScene(scene)) return;
        debug &&
          console.debug(
            "HOOK [2D3D|CESIUM] Soft Pitch Limiter",
            scene.camera.pitch,
            minPitchRad,
            resetPitchRad
          );
        const isPitchTooLow = collisions && scene.camera.pitch > minPitchRad;
        if (isPitchTooLow) {
          debug &&
            console.debug(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: reset pitch soft",
              scene.camera.pitch,
              resetPitchRad
            );
          // TODO Get CenterPos Lower from screen if distance is muliple of elevation. prevent pitch around distant point on horizon
          const centerPos = pickSceneCenter(scene).scenePosition;
          if (centerPos) {
            emit(CtxEvent.AnimationStart, undefined);
            const distance = Cartesian3.distance(
              centerPos,
              scene.camera.position
            );
            tryWithValidCamera(scene.camera, (camera) => {
              camera.flyToBoundingSphere(
                new BoundingSphere(centerPos, distance),
                {
                  offset: {
                    heading: camera.heading,
                    pitch: resetPitchRad,
                    range: distance,
                  },
                  duration: 1.5,
                  complete: onComplete,
                }
              );
            });
          }
        }
      };
      scene.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        isValidScene(scene) &&
          scene.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [
    sceneRef,
    collisions,
    isSuspendedRef,
    pitchLimiter,
    onComplete,
    emit,
    minPitchDeg,
    resetPitchOffsetDeg,
    debug,
  ]);
};

export default useCameraPitchSoftLimiter;
