import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { Math as CeMath, Cartographic, EasingFunction } from "cesium";

import {
  useCesiumCustomViewer,
  useScreenSpaceCameraControllerEnableCollisionDetection,
  useViewerIsMode2d,
} from "../../CustomViewerContextProvider";

const DEFAULT_MIN_PITCH = 12;

type LimiterOptions = {
  easingRangeDeg?: number;
  easing?: (v: number) => number;
};

const useCameraPitchHardLimiter = (
  minPitchDeg = DEFAULT_MIN_PITCH,
  {
    easingRangeDeg = 20,
    easing = EasingFunction.CIRCULAR_IN
  }: LimiterOptions = {},
) => {
  const { viewer } = useCesiumCustomViewer();
  const dispatch = useDispatch();
  const isMode2d = useViewerIsMode2d();
  const collisions = useScreenSpaceCameraControllerEnableCollisionDetection();
  const lastPitch = useRef<number | null>(null);
  const lastPosition = useRef<Cartographic | null>(null);
  const minPitchRad = CeMath.toRadians(-minPitchDeg);
  const rangeRad = CeMath.toRadians(easingRangeDeg);
  const minRangePitchRad = CeMath.toRadians(-minPitchDeg) - rangeRad;

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
        const isPitchInRange = camera.pitch > minRangePitchRad;

        const isPitchTooLow = camera.pitch > minPitchRad;
        if (isPitchInRange && lastPitch.current) {
          const pitchDelta = lastPitch.current - camera.pitch;
          let newPitch = camera.pitch;
          if (pitchDelta < 0) {
            // only apply in downward direction
            const unitIn = Math.abs(camera.pitch - minPitchRad) / rangeRad;
            const unitEased = easing(unitIn);
            const newDelta = pitchDelta * unitEased;
            newPitch = Math.min(lastPitch.current - newDelta, minPitchRad);

            console.log(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: reset pitch",
              pitchDelta,
              newDelta,
              unitIn,
              unitEased,
              newPitch,
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
                  pitch: newPitch,
                  roll: camera.roll,
                },
              });
            }
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
