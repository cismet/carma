import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BoundingSphere, Cartesian3, Math as CesiumMath } from "cesium";

import { useCesiumViewer } from "./useCesiumViewer";
import { useCesiumContext } from "./useCesiumContext";
import {
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectViewerIsMode2d,
  setIsAnimating,
  clearIsAnimating,
} from "../slices/cesium";
import { pickSceneCenter } from "../utils/pickers";
import { isValidScene, tryWithValidCamera } from "../utils/instanceGates";

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

  const { sceneRef, shouldSuspendCameraLimitersRef } = useCesiumContext();

  const dispatch = useDispatch();
  const isMode2d = useSelector(selectViewerIsMode2d);
  const collisions = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );

  const onComplete = useCallback(
    () => dispatch(clearIsAnimating()),
    [dispatch]
  );

  useEffect(() => {
    const scene = sceneRef.current;
    if (!isValidScene(scene)) return;
    if (!isMode2d && collisions && pitchLimiter) {
      debug &&
        console.debug(
          "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to correct camera pitch"
        );

      const resetPitchRad = CesiumMath.toRadians(
        -(minPitchDeg + resetPitchOffsetDeg)
      );
      const minPitchRad = CesiumMath.toRadians(-minPitchDeg);

      const moveEndListener = async () => {
        if (shouldSuspendCameraLimitersRef?.current || !isValidScene(scene))
          return;
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
            dispatch(setIsAnimating());
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
    isMode2d,
    pitchLimiter,
    onComplete,
    dispatch,
    minPitchDeg,
    resetPitchOffsetDeg,
    debug,
    shouldSuspendCameraLimitersRef,
  ]);
};

export default useCameraPitchSoftLimiter;
