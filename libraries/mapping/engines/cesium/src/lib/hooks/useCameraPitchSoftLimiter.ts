import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BoundingSphere, Cartesian3, Math as CesiumMath } from "cesium";

import { useCesiumViewer } from "./useCesiumViewer";
import {
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectViewerIsMode2d,
  setIsAnimating,
  clearIsAnimating,
} from "../slices/cesium";
import { pickViewerCanvasCenter } from "../utils/cesiumHelpers";

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
  const isMode2d = useSelector(selectViewerIsMode2d);
  const collisions = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );

  const onComplete = useCallback(
    () => dispatch(clearIsAnimating()),
    [dispatch]
  );

  useEffect(() => {
    if (viewer && !isMode2d && collisions && pitchLimiter) {
      debug &&
        console.debug(
          "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to correct camera pitch"
        );

      const resetPitchRad = CesiumMath.toRadians(
        -(minPitchDeg + resetPitchOffsetDeg)
      );
      const minPitchRad = CesiumMath.toRadians(-minPitchDeg);

      const moveEndListener = async () => {
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
          // TODO Get CenterPos Lower from screen if distance is muliple of elevation. prevent pitch around distant point on horizon
          const centerPos = pickViewerCanvasCenter(viewer).scenePosition;
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
    isMode2d,
    pitchLimiter,
    onComplete,
    dispatch,
    minPitchDeg,
    resetPitchOffsetDeg,
    debug,
  ]);
};

export default useCameraPitchSoftLimiter;
