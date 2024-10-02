import { useEffect, useRef } from "react";
import { Math as CeMath, Cartographic, EasingFunction } from "cesium";

import {
  useCesiumCustomViewer,
  useScreenSpaceCameraControllerEnableCollisionDetection,
  useViewerIsAnimating,
  useViewerIsMode2d,
  useViewerIsTransitioning,
} from "../../CustomViewerContextProvider";

const DEFAULT_MIN_PITCH = 12;

type LimiterOptions = {
  easingRangeDeg?: number;
  easing?: (v: number) => number;
};

const useCameraPitchEasingLimiter = (
  minPitchDeg = DEFAULT_MIN_PITCH,
  {
    easingRangeDeg = 20,
    easing = EasingFunction.CIRCULAR_IN,
  }: LimiterOptions = {},
) => {
  const { viewer } = useCesiumCustomViewer();
  const isMode2d = useViewerIsMode2d();
  const isAnimating = useViewerIsAnimating();
  const isTransitioning = useViewerIsTransitioning();
  const collisions = useScreenSpaceCameraControllerEnableCollisionDetection();
  const lastPitch = useRef<number | null>(null);
  const lastPosition = useRef<Cartographic | null>(null);
  const minPitchRad = CeMath.toRadians(-minPitchDeg);
  const rangeRad = CeMath.toRadians(Math.min(easingRangeDeg, 90 - minPitchDeg)); // Limit wasing range to remainder of right angle
  const minRangePitchRad = CeMath.toRadians(-minPitchDeg) - rangeRad;

  const clearLast = () => {
    lastPitch.current = null;
    lastPosition.current = null;
  };

  useEffect(() => {
    if (viewer && !isMode2d && collisions && !isTransitioning && !isAnimating) {
      const { camera, scene } = viewer;
      console.log("HOOK [CESIUM|CAMERA] EASING Pitch Limiter added");
      clearLast();
      const onUpdate = async () => {
        const isPitchInRange = camera.pitch > minRangePitchRad;

        const isPitchTooLow = camera.pitch > minPitchRad;
        if (isPitchInRange && lastPitch.current) {
          const pitchDelta = lastPitch.current - camera.pitch;
          if (pitchDelta) {
            // only apply in both directions for consistent behavior
            // if only applied when pitch down it would results in some ratchet-like behavior - moving the camera up
            const unitIn = Math.abs(camera.pitch - minPitchRad) / rangeRad;
            const unitEased = easing(unitIn);
            const newDelta = pitchDelta * unitEased;
            const newPitch = Math.min(lastPitch.current - newDelta, minPitchRad);

            console.log(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: apply easing pitch limiter",
              Math.round(unitIn * 100),
              Math.round(unitEased * 100),
              Math.round(CeMath.toDegrees(-newPitch)),
            );

            if (lastPitch.current !== null && lastPosition.current !== null) {
              const { latitude, longitude, height } =
                camera.positionCartographic;
              const lastHeight = lastPosition.current.height;
              camera.setView({
                destination: Cartographic.toCartesian(
                  new Cartographic(
                    longitude,
                    latitude,
                    unitEased * height + (1 - unitEased) * lastHeight,
                  ),
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
        console.log("HOOK [CESIUM|CAMERA] Easing Pitch Limiter removed");
        scene.preUpdate.removeEventListener(onUpdate);
      };
    }
  }, [viewer, minPitchRad, collisions, isTransitioning, isAnimating, isMode2d]);
};

export default useCameraPitchEasingLimiter;
