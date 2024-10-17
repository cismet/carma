import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Math as CesiumMath } from "cesium";

import { useCesiumContext } from "../CesiumContextProvider";
import {
  selectViewerIsMode2d,
  setIsAnimating,
} from "../slices/cesium";

const useCameraRollSoftLimiter = () => {
  const { viewer } = useCesiumContext();
  const dispatch = useDispatch();
  const isMode2d = useSelector(selectViewerIsMode2d);
  useEffect(() => {
    if (viewer) {
      console.log(
        "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to reset rolled camera",
      );
      const moveEndListener = async () => {
        //console.log("HOOK [2D3D|CESIUM]", viewer.camera.pitch, isMode2d);
        if (viewer.camera.position && !isMode2d) {
          //console.log("HOOK [2D3D|CESIUM]", viewer.camera.pitch);
          const rollDeviation =
            Math.abs(CesiumMath.TWO_PI - viewer.camera.roll) %
            CesiumMath.TWO_PI;

          if (rollDeviation > 0.02) {
            console.log(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: flyTo reset roll 2D3D",
              rollDeviation,
            );
            const duration = Math.min(rollDeviation, 1);
            dispatch(setIsAnimating(true));
            viewer.camera.flyTo({
              destination: viewer.camera.position,
              orientation: {
                heading: viewer.camera.heading,
                pitch: viewer.camera.pitch,
                roll: 0,
              },
              duration,
              complete: () => dispatch(setIsAnimating(false)),
            });
          }
        }
      };
      viewer.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        viewer.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [viewer, isMode2d, dispatch]);
};

export default useCameraRollSoftLimiter;
