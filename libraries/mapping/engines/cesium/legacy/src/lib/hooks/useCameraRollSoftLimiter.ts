import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";
import { CesiumMath } from "@carma-cesium";

import { clearIsAnimating, setIsAnimating } from "../slices/cesium";
import { useCesiumContext } from "./useCesiumContext";
import { useCesiumViewer } from "./useCesiumViewer";
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
  const dispatch = useDispatch();
  const { shouldSuspendCameraLimitersRef, initialViewApplied } =
    useCesiumContext();

  const onComplete = useCallback(
    () => dispatch(clearIsAnimating()),
    [dispatch]
  );

  useEffect(() => {
    if (viewer && pitchLimiter) {
      debug &&
        console.debug(
          "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to reset rolled camera"
        );
      const moveEndListener = async () => {
        if (shouldSuspendCameraLimitersRef?.current) return;
        if (!initialViewApplied) return;
        if (viewer.camera.position) {
          const normalizedRoll = CesiumMath.negativePiToPi(viewer.camera.roll);
          const rollDeviation = CesiumMath.equalsEpsilon(
            normalizedRoll,
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
            const rollDelta = Math.abs(normalizedRoll);
            const duration = Math.min(rollDelta, 1);
            dispatch(setIsAnimating());
            viewer.camera.flyTo({
              destination: viewer.camera.position,
              orientation: {
                heading: viewer.camera.heading,
                pitch: viewer.camera.pitch,
                roll: 0,
              },
              duration,
              complete: onComplete,
              cancel: onComplete,
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
    onComplete,
    dispatch,
    debug,
    nadirThreshold,
    rollThreshold,
    initialViewApplied,
    shouldSuspendCameraLimitersRef,
  ]);
};

export default useCameraRollSoftLimiter;
