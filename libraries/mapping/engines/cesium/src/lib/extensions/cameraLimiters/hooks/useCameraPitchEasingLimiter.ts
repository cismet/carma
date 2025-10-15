import { useEffect, useRef } from "react";

import { Math as CesiumMath, Cartographic, EasingFunction } from "cesium";

import { useCesiumContext } from "../../../hooks/useCesiumContext";

// Helper function to check if user input should be blocked
const shouldBlockUserInput = (state: unknown): boolean => {
  const transitionStates = [
    "preTransitionTo2d",
    "transitionTo2d",
    "preTransitionTo3d",
    "transitionTo3d",
  ];
  return transitionStates.includes(String(state));
};

const DEFAULT_MIN_PITCH = 12;

const useCameraPitchEasingLimiter = (
  options: {
    minPitchDeg?: number;
    easingRangeDeg?: number;
    easing?: (x: number) => number;
    pitchLimiter?: boolean;
  } = {}
) => {
  const minPitchDeg = options.minPitchDeg ?? DEFAULT_MIN_PITCH;
  const easingRangeDeg = options.easingRangeDeg ?? 30;
  const easing = options.easing ?? EasingFunction.QUADRATIC_IN_OUT;
  const pitchLimiter =
    options.pitchLimiter === undefined ? true : options.pitchLimiter;
  const {
    sceneRef,
    isSuspendedRef,
    isAnimatingRef,
    enableCollisionDetectionRef,
    transitionStateRef,
  } = useCesiumContext();

  const collisions = enableCollisionDetectionRef.current;
  console.debug("HOOKINIT [CESIUM|CAMERA] useCameraPitchEasingLimiter");
  const lastPitch = useRef<number | null>(null);
  const lastPosition = useRef<Cartographic | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (!isSuspendedRef.current && collisions && pitchLimiter) {
      console.debug("HOOK [CESIUM|CAMERA] EASING Pitch Limiter added");
      lastPitch.current = null;

      const onUpdate = async () => {
        const camera = scene.camera;
        if (!camera) return;

        if (
          shouldBlockUserInput(transitionStateRef.current) ||
          isAnimatingRef.current
        ) {
          console.debug(
            "HOOK [CESIUM|CAMERA] EASING Pitch Limiter skipped while transitioning or animating",
            "transitionState:",
            transitionStateRef.current,
            "shouldBlock:",
            shouldBlockUserInput(transitionStateRef.current),
            "isAnimating:",
            isAnimatingRef.current
          );
          return;
        }

        const minPitchRad = CesiumMath.toRadians(-minPitchDeg);
        const rangeRad = CesiumMath.toRadians(
          Math.min(easingRangeDeg, 90 - minPitchDeg)
        ); // Limit easing range to remainder of right angle
        const minRangePitchRad = CesiumMath.toRadians(-minPitchDeg) - rangeRad;

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
              minPitchRad
            );

            /*
          console.debug(
            "LISTENER HOOK [2D3D|CESIUM|CAMERA]: apply easing pitch limiter",
            Math.round(unitIn * 100),
            Math.round(unitEased * 100),
            Math.round(CesiumMath.toDegrees(-newPitch))
          );
          */

            if (lastPitch.current !== null && lastPosition.current !== null) {
              const { latitude, longitude, height } =
                camera.positionCartographic;
              const lastHeight = lastPosition.current.height;
              camera.setView({
                destination: Cartographic.toCartesian(
                  new Cartographic(
                    longitude,
                    latitude,
                    unitEased * height + (1 - unitEased) * lastHeight
                  )
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
        lastPitch.current = camera.pitch;
        lastPosition.current = camera.positionCartographic.clone();
      };

      scene.preUpdate.addEventListener(onUpdate);
      return () => {
        console.debug("HOOK [CESIUM|CAMERA] Easing Pitch Limiter removed");
        scene.preUpdate.removeEventListener(onUpdate);
      };
    }
  }, [
    sceneRef,
    collisions,
    easing,
    easingRangeDeg,
    isAnimatingRef,
    isSuspendedRef,
    pitchLimiter,
    minPitchDeg,
    transitionStateRef,
  ]);
};

export default useCameraPitchEasingLimiter;
