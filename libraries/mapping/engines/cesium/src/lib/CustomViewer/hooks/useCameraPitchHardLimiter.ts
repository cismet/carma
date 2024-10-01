import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { Math as CeMath, Cartographic } from "cesium";

import {
  useCesiumContext,
  useScreenSpaceCameraControllerEnableCollisionDetection,
  useViewerIsMode2d,
} from "../../CesiumContextProvider";

const DEFAULT_MIN_PITCH = 12;

const useCameraPitchHardLimiter = (minPitchDeg = DEFAULT_MIN_PITCH) => {
  const { viewer } = useCesiumContext();
  const dispatch = useDispatch();
  const isMode2d = useViewerIsMode2d();
  const collisions = useScreenSpaceCameraControllerEnableCollisionDetection();
  const lastPitch = useRef<number | null>(null);
  const lastPosition = useRef<Cartographic | null>(null);
  const minPitchRad = CeMath.toRadians(-minPitchDeg);
  const clearLast = () => {
    lastPitch.current = null;
    lastPosition.current = null;
  };
  useEffect(() => {
    if (viewer && collisions && !isMode2d) {
      const { camera, scene } = viewer;
      console.log(
        "HOOK [2D3D|CESIUM] viewer changed add new Cesium MoveEnd Listener to limit camera pitch",
        minPitchDeg,
        minPitchRad,
      );
      clearLast();
      const onUpdate = async () => {
        const isPitchTooLow = camera.pitch > minPitchRad;
        if (isPitchTooLow) {
          console.log(
            "LISTENER HOOK [2D3D|CESIUM|CAMERA]: reset pitch",
            camera.pitch,
            -CeMath.toDegrees(camera.pitch)
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
                pitch: minPitchRad - 0.001, // minimal offset to prevent retriggers on move
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
