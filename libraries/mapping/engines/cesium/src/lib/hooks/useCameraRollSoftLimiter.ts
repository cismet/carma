import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Math as CesiumMath } from "cesium";

import {
  clearIsAnimating,
  selectViewerIsMode2d,
  setIsAnimating,
} from "../slices/cesium";
import { useCesiumContext } from "./useCesiumContext";

const useCameraRollSoftLimiter = ({
  pitchLimiter = true,
}: { pitchLimiter?: boolean } = {}) => {
  const { viewerRef } = useCesiumContext();
  const dispatch = useDispatch();
  const isMode2d = useSelector(selectViewerIsMode2d);

  const onComplete = useCallback(
    () => dispatch(clearIsAnimating()),
    [dispatch]
  );

  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer && pitchLimiter) {
      console.debug(
        "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to reset rolled camera"
      );
      const moveEndListener = async () => {
        if (viewer.camera.position && !isMode2d) {
          const rollDeviation =
            Math.abs(CesiumMath.TWO_PI - viewer.camera.roll) %
            CesiumMath.TWO_PI;

          if (rollDeviation > 0.02) {
            console.debug(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: flyTo reset roll 2D3D",
              rollDeviation
            );
            const duration = Math.min(rollDeviation, 1);
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
        viewer.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [viewerRef, isMode2d, pitchLimiter, onComplete, dispatch]);
};

export default useCameraRollSoftLimiter;
