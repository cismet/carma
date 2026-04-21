import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import { Cartesian3, Cartographic, EasingFunction } from "cesium";
import type { Radians } from "@carma-units";

import {
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  selectViewerIsAnimating,
  selectViewerIsTransitioning,
} from "../slices/cesium";
import {
  resolveCameraLimiterOptions,
  type CameraLimiterOptions,
} from "../camera-limiter-options";
import { useCesiumContext } from "./useCesiumContext";
import { useCesiumViewer } from "./useCesiumViewer";

const writeCartographicScratch = ({
  scratch,
  source,
}: {
  scratch: Cartographic;
  source: Cartographic;
}): Cartographic => {
  scratch.longitude = source.longitude;
  scratch.latitude = source.latitude;
  scratch.height = source.height;

  return scratch;
};

const computeEasedPitchCorrection = ({
  currentPitch,
  lastPitch,
  minPitch,
  range,
  easing,
}: {
  currentPitch: Radians;
  lastPitch: Radians;
  minPitch: Radians;
  range: Radians;
  easing: (x: number) => number;
}): { unitEased: number; newPitch: Radians } | null => {
  const pitchDelta = (lastPitch - currentPitch) as Radians;
  if (pitchDelta === 0) {
    return null;
  }

  const unitIn = Math.abs(currentPitch - minPitch) / range;
  const unitEased = easing(unitIn);
  const newDelta = pitchDelta * unitEased;
  const newPitch = Math.min(lastPitch - newDelta, minPitch) as Radians;

  return {
    unitEased,
    newPitch,
  };
};

type ScratchSetView = {
  destination: Cartesian3;
  orientation: {
    heading: Radians;
    pitch: Radians;
    roll: Radians;
  };
};

const createScratchSetView = (pitch: Radians): ScratchSetView => ({
  destination: new Cartesian3(),
  orientation: {
    heading: 0 as Radians,
    pitch,
    roll: 0 as Radians,
  },
});

const writeEasedPitchSetViewScratch = ({
  scratchPosition,
  scratchView,
  currentPosition,
  lastPosition,
  unitEased,
  heading,
  pitch,
  roll,
}: {
  scratchPosition: Cartographic;
  scratchView: ScratchSetView;
  currentPosition: Cartographic;
  lastPosition: Cartographic;
  unitEased: number;
  heading: Radians;
  pitch: Radians;
  roll: Radians;
}): ScratchSetView => {
  const { latitude, longitude, height } = currentPosition;
  const lastHeight = lastPosition.height;
  scratchPosition.longitude = longitude;
  scratchPosition.latitude = latitude;
  scratchPosition.height = unitEased * height + (1 - unitEased) * lastHeight;

  Cartographic.toCartesian(scratchPosition, undefined, scratchView.destination);

  scratchView.orientation.heading = heading;
  scratchView.orientation.pitch = pitch;
  scratchView.orientation.roll = roll;

  return scratchView;
};

type CameraPitchEasingLimiterOptions = CameraLimiterOptions & {
  easing?: (x: number) => number;
  enabled?: boolean;
};

const resolvePitchEasingLimiterConfig = (
  options: CameraPitchEasingLimiterOptions = {}
): {
  enabled: boolean;
  pitchLimiter: boolean;
  easing: (x: number) => number;
  minPitch: Radians;
  range: Radians;
  minRangePitch: Radians;
} => {
  const { pitchLimiter, minPitch, minPitchRange } =
    resolveCameraLimiterOptions(options);

  return {
    enabled: options.enabled ?? true,
    pitchLimiter,
    easing: options.easing ?? EasingFunction.CIRCULAR_IN,
    minPitch,
    range: minPitchRange,
    minRangePitch: (minPitch - minPitchRange) as Radians,
  };
};

const useCameraPitchEasingLimiter = (
  options: CameraPitchEasingLimiterOptions = {}
) => {
  const { enabled, pitchLimiter, easing, minPitch, range, minRangePitch } =
    resolvePitchEasingLimiterConfig(options);
  const viewer = useCesiumViewer();
  const { shouldSuspendCameraLimitersRef, initialViewApplied } =
    useCesiumContext();

  const isAnimating = useSelector(selectViewerIsAnimating);

  const isTransitioning = useSelector(selectViewerIsTransitioning);
  const collisions = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );

  const isAnimatingRef = useRef(isAnimating);
  const isTransitioningRef = useRef(isTransitioning);
  const lastPitch = useRef<Radians | null>(null);
  const hasLastPosition = useRef(false);
  const lastPosition = useRef(new Cartographic());
  const scratchSetViewPositionRef = useRef(new Cartographic());
  const scratchSetViewRef = useRef(createScratchSetView(minPitch));

  useEffect(() => {
    isAnimatingRef.current = isAnimating;
  }, [isAnimating]);

  useEffect(() => {
    isTransitioningRef.current = isTransitioning;
  }, [isTransitioning]);

  useEffect(() => {
    if (viewer && enabled && collisions && pitchLimiter) {
      const { camera, scene } = viewer;
      console.debug("HOOK [CESIUM|CAMERA] EASING Pitch Limiter added");
      lastPitch.current = null;
      hasLastPosition.current = false;

      const onUpdate = async () => {
        if (shouldSuspendCameraLimitersRef?.current) return;
        if (!initialViewApplied) return;
        if (isTransitioningRef.current || isAnimatingRef.current) {
          console.debug(
            "HOOK [CESIUM|CAMERA] EASING Pitch Limiter skipped while transitioning or animating"
          );
          return;
        }

        const currentPitch = camera.pitch as Radians;
        const isPitchInRange = currentPitch > minRangePitch;

        //const isPitchTooLow = camera.pitch > minPitchRad;
        if (
          isPitchInRange &&
          lastPitch.current !== null &&
          hasLastPosition.current
        ) {
          const pitchCorrection = computeEasedPitchCorrection({
            currentPitch,
            lastPitch: lastPitch.current,
            minPitch,
            range,
            easing,
          });
          if (pitchCorrection) {
            const { unitEased, newPitch } = pitchCorrection;

            /*
            console.debug(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: apply easing pitch limiter",
              Math.round(unitIn * 100),
              Math.round(unitEased * 100),
              Math.round(CesiumMath.toDegrees(-newPitch))
            );
            */

            camera.setView(
              writeEasedPitchSetViewScratch({
                scratchPosition: scratchSetViewPositionRef.current,
                scratchView: scratchSetViewRef.current,
                currentPosition: camera.positionCartographic,
                lastPosition: lastPosition.current,
                unitEased,
                heading: camera.heading as Radians,
                pitch: newPitch,
                roll: camera.roll as Radians,
              })
            );
          }
        }
        lastPitch.current = camera.pitch as Radians;
        writeCartographicScratch({
          scratch: lastPosition.current,
          source: camera.positionCartographic,
        });
        hasLastPosition.current = true;
      };
      scene.preUpdate.addEventListener(onUpdate);
      return () => {
        console.debug("HOOK [CESIUM|CAMERA] Easing Pitch Limiter removed");
        scene.preUpdate.removeEventListener(onUpdate);
      };
    }
  }, [
    viewer,
    collisions,
    enabled,
    pitchLimiter,
    easing,
    range,
    minPitch,
    minRangePitch,
    initialViewApplied,
    shouldSuspendCameraLimitersRef,
  ]);
};

export default useCameraPitchEasingLimiter;
