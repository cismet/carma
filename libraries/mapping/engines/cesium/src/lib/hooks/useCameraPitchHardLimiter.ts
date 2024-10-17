import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Math as CesiumMath, Cartographic } from "cesium";

import { useCesiumContext } from "../CesiumContextProvider";
import {
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectViewerIsMode2d,
} from "../slices/cesium";

const DEFAULT_MIN_PITCH = 12;

const useCameraPitchHardLimiter = (minPitchDeg = DEFAULT_MIN_PITCH) => {
  const { viewer } = useCesiumContext();
  const dispatch = useDispatch();
  const isMode2d = useSelector(selectViewerIsMode2d);
  const collisions = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection,
  );
  const lastPitch = useRef<number | null>(null);
  const lastPosition = useRef<Cartographic | null>(null);
  const minPitchRad = CesiumMath.toRadians(-minPitchDeg);
  const clearLast = () => {
    lastPitch.current = null;
    lastPosition.current = null;
  };
  useEffect(() => {
    if (viewer && collisions && !isMode2d) {
      const { camera, scene } = viewer;
      console.log(
        "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to limit camera pitch",
      );
      clearLast();
      const onUpdate = async () => {
        const isPitchTooLow = camera.pitch > minPitchRad;
        if (isPitchTooLow) {
          console.log(
            "LISTENER HOOK [2D3D|CESIUM|CAMERA]: reset pitch",
            camera.pitch,
            minPitchRad,
          );
          if (lastPitch.current !== null && lastPosition.current !== null) {
            const { latitude, longitude } = camera.positionCartographic;
            const lastHeight = lastPosition.current.height;
            camera.setView({
              destination: Cartographic.toCartesian(
                new Cartographic(longitude, latitude, lastHeight),
              ),
              orientation: {
                heading: camera.heading,
                pitch: minPitchRad,
                roll: camera.roll,
              },
            });
          }
        }
        lastPitch.current = viewer.camera.pitch;
        lastPosition.current = viewer.camera.positionCartographic.clone();
      };
      scene.preUpdate.addEventListener(onUpdate);
      return () => {
        scene.preUpdate.removeEventListener(onUpdate);
      };
    }
  }, [viewer, minPitchRad, collisions, isMode2d, dispatch]);
};

export default useCameraPitchHardLimiter;
