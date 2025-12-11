import { useEffect } from "react";
import { BoundingSphere, Cartesian3, Math as CesiumMath } from "cesium";

import { useCesiumViewer } from "./useCesiumViewer";
import { useCesiumContext } from "./useCesiumContext";
import { pickScenePositions } from "../utils/pick-position/pick-scene-positions";

const CENTER_TEST_POSITION: [number, number] = [0.5, 0.5];

const useCameraPitchSoftLimiter = (
  options: {
    minPitchDeg?: number;
    resetPitchOffsetDeg?: number;
    pitchLimiter?: boolean;
    collisions?: boolean;
    debug?: boolean;
  } = {}
) => {
  const debug = options.debug ?? false;
  const pitchLimiter =
    options.pitchLimiter === undefined ? true : options.pitchLimiter;
  const collisions = options.collisions ?? true;
  const minPitchDeg = options.minPitchDeg || 22;
  const resetPitchOffsetDeg = options.resetPitchOffsetDeg || 8;

  const viewer = useCesiumViewer();
  const { getScene, shouldSuspendCameraLimitersRef, sceneAnimationMapRef } =
    useCesiumContext();

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

        // Skip if animation is already running
        if (sceneAnimationMapRef.current?.has(scene)) return;

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
          const centerPos = pickScenePositions(
            scene,
            [CENTER_TEST_POSITION],
            "test for pitch limiter"
          )[0].scenePosition;
          if (centerPos) {
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
    minPitchDeg,
    resetPitchOffsetDeg,
    debug,
    shouldSuspendCameraLimitersRef,
    getScene,
    sceneAnimationMapRef,
  ]);
};

export default useCameraPitchSoftLimiter;
