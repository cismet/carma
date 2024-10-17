import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import { Math as CesiumMath, Cartographic, EasingFunction } from "cesium";

import { useCesiumContext } from "../CesiumContextProvider";
import {
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectViewerIsAnimating,
  selectViewerIsMode2d,
  selectViewerIsTransitioning,
} from "../slices/cesium";

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
  const { viewer } = useCesiumContext();

  const isMode2d = useSelector(selectViewerIsMode2d);
  const isAnimating = useSelector(selectViewerIsAnimating);
  const isTransitioning = useSelector(selectViewerIsTransitioning);
  const collisions = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection,
  );

  const lastPitch = useRef<number | null>(null);
  const lastPosition = useRef<Cartographic | null>(null);
  const minPitchRad = CesiumMath.toRadians(-minPitchDeg);
  const rangeRad = CesiumMath.toRadians(Math.min(easingRangeDeg, 90 - minPitchDeg)); // Limit wasing range to remainder of right angle
  const minRangePitchRad = CesiumMath.toRadians(-minPitchDeg) - rangeRad;

  const clearLast = () => {
    lastPitch.current = null;
    lastPosition.current = null;
  };

  useEffect(() => {
    if (viewer && !isMode2d && collisions && !isTransitioning && !isAnimating) {
      const { camera, scene } = viewer;
      console.info("HOOK [CESIUM|CAMERA] EASING Pitch Limiter added");
      clearLast();
      const onUpdate = async () => {
        const isPitchInRange = camera.pitch > minRangePitchRad;

        //const isPitchTooLow = camera.pitch > minPitchRad;
        if (isPitchInRange && lastPitch.current) {
          const pitchDelta = lastPitch.current - camera.pitch;
          if (pitchDelta) {
            // only apply in both directions for consistent behavior
            // if only applied when pitch down it would results in some ratchet-like behavior - moving the camera up
            const unitIn = Math.abs(camera.pitch - minPitchRad) / rangeRad;
            const unitEased = easing(unitIn);
            const newDelta = pitchDelta * unitEased;
            const newPitch = Math.min(
              lastPitch.current - newDelta,
              minPitchRad,
            );

            console.info(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: apply easing pitch limiter",
              Math.round(unitIn * 100),
              Math.round(unitEased * 100),
              Math.round(CesiumMath.toDegrees(-newPitch)),
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
        console.info("HOOK [CESIUM|CAMERA] Easing Pitch Limiter removed");
        scene.preUpdate.removeEventListener(onUpdate);
      };
    }
  }, [viewer, minPitchRad, collisions, isTransitioning, isAnimating, isMode2d]);
};

export default useCameraPitchEasingLimiter;
