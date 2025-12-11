import { useEffect } from "react";
import { Math as CesiumMath } from "cesium";

import { useCesiumViewer } from "./useCesiumViewer";
import { useCesiumContext } from "./useCesiumContext";

const NADIR_THRESHOLD = 0.2;

const useCameraRollSoftLimiter = ({
  pitchLimiter = true,
  debug = false,
  nadirThreshold = NADIR_THRESHOLD,
  rollThreshold = CesiumMath.toRadians(5),
}: {
  pitchLimiter?: boolean;
  debug?: boolean;
  nadirThreshold?: number;
  rollThreshold?: number;
} = {}) => {
  const viewer = useCesiumViewer();
  const { shouldSuspendCameraLimitersRef, getScene, sceneAnimationMapRef } =
    useCesiumContext();

  useEffect(() => {
    if (viewer && pitchLimiter) {
      debug &&
        console.debug(
          "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to reset rolled camera"
        );
      const moveEndListener = async () => {
        if (shouldSuspendCameraLimitersRef?.current) return;

        const scene = getScene();
        // Skip if animation is already running
        if (scene && sceneAnimationMapRef.current?.has(scene)) return;

        if (viewer.camera.position) {
          const rollDeviation = CesiumMath.equalsEpsilon(
            viewer.camera.roll,
            0,
            0,
            rollThreshold
          );

          const isCloseToNadir = CesiumMath.equalsEpsilon(
            viewer.camera.pitch,
            -Math.PI / 2,
            0,
            nadirThreshold
          );

          debug &&
            console.debug(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: nadir",
              isCloseToNadir,
              viewer.camera.pitch,
              Math.abs(viewer.camera.pitch + Math.PI / 2)
            );

          if (!rollDeviation && !isCloseToNadir) {
            debug &&
              console.debug(
                "LISTENER HOOK [2D3D|CESIUM|CAMERA]: flyTo reset roll 2D3D",
                rollDeviation
              );
            const rollDelta = Math.abs(viewer.camera.roll);
            const duration = Math.min(rollDelta, 1);
            debug &&
              console.debug(
                "Roll delta animation duration mapping",
                rollDelta,
                duration
              );
            viewer.camera.flyTo({
              destination: viewer.camera.position,
              orientation: {
                heading: viewer.camera.heading,
                pitch: viewer.camera.pitch,
                roll: 0,
              },
              duration,
            });
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
    pitchLimiter,
    debug,
    nadirThreshold,
    rollThreshold,
    shouldSuspendCameraLimitersRef,
    getScene,
    sceneAnimationMapRef,
  ]);
};

export default useCameraRollSoftLimiter;
