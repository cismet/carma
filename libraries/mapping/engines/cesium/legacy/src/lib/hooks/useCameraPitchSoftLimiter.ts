import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BoundingSphere, Cartesian3, Math as CesiumMath } from "cesium";

import { useCesiumViewer } from "./useCesiumViewer";
import { useCesiumContext } from "./useCesiumContext";
import {
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  setIsAnimating,
  clearIsAnimating,
} from "../slices/cesium";
import { pickScenePositions } from "../utils/pick-position/pick-scene-positions";

const CENTER_TEST_POSITION: [number, number] = [0.5, 0.5];

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

  const viewer = useCesiumViewer();
  const dispatch = useDispatch();
  const collisions = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );
  const { getScene, shouldSuspendCameraLimitersRef } = useCesiumContext();

  const onComplete = useCallback(
    () => dispatch(clearIsAnimating()),
    [dispatch]
  );

  useEffect(() => {
    // Note: This hook always runs when viewer exists - Cesium is always active
    if (viewer && collisions && pitchLimiter) {
      debug &&
        console.debug(
          "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to correct camera pitch"
        );

      const resetPitchRad = CesiumMath.toRadians(
        -(minPitchDeg + resetPitchOffsetDeg)
      );
      const minPitchRad = CesiumMath.toRadians(-minPitchDeg);

      const moveEndListener = async () => {
        if (shouldSuspendCameraLimitersRef?.current) return;
        const scene = getScene();
        if (!scene) {
          console.warn(
            "HOOK [2D3D|CESIUM|CAMERA] moveEndListener: no cesium scene available for pitch limiter"
          );
          return;
        }

        debug &&
          console.debug(
            "HOOK [2D3D|CESIUM] Soft Pitch Limiter",
            viewer.camera.pitch,
            minPitchRad,
            resetPitchRad
          );
        const isPitchTooLow = collisions && viewer.camera.pitch > minPitchRad;
        if (isPitchTooLow) {
          debug &&
            console.debug(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: reset pitch soft",
              viewer.camera.pitch,
              resetPitchRad
            );
          // TODO have centralized picker for screen positions in render loop and context to avoid multiple pick calls per frame
          // TODO Get CenterPos Lower from screen if distance is multiple of elevation. prevent pitch around distant point on horizon
          const centerPos = pickScenePositions(
            scene,
            [CENTER_TEST_POSITION],
            "test for pitch limiter"
          )[0].scenePosition;
          if (centerPos) {
            dispatch(setIsAnimating());
            const distance = Cartesian3.distance(
              centerPos,
              viewer.camera.position
            );
            viewer.camera.flyToBoundingSphere(
              new BoundingSphere(centerPos, distance),
              {
                offset: {
                  heading: viewer.camera.heading,
                  pitch: resetPitchRad,
                  range: distance,
                },
                duration: 1.5,
                complete: onComplete,
              }
            );
          }
        }
      };
      viewer.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        !viewer.isDestroyed() &&
          viewer.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [
    viewer,
    collisions,
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
