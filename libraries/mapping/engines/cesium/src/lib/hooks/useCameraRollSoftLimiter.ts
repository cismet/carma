import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Math as CesiumMath } from "cesium";

import {
  clearIsAnimating,
  selectViewerIsMode2d,
  setIsAnimating,
} from "../slices/cesium";
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
  const isMode2d = useSelector(selectViewerIsMode2d);

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
        if (viewer.camera.position && !isMode2d) {
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
            console.debug(
              "Roll delta animation duration mapping",
              rollDelta,
              duration
            );
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
    isMode2d,
    pitchLimiter,
    onComplete,
    dispatch,
    debug,
    nadirThreshold,
    rollThreshold,
  ]);
};

export default useCameraRollSoftLimiter;
