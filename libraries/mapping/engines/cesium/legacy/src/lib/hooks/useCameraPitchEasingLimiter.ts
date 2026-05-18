import { useEffect, useRef } from "react";
import { useSelector } from "react-redux";

import {
  CESIUM_LOCAL_NORTH_HEADING_RAD,
  CESIUM_UP_ROLL_RAD,
} from "@carma-commons/camera/model";
import { Easing, type Easing as EasingFunction } from "@carma-commons/math";
import { Cartesian3, Cartographic } from "cesium";
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

const writeCartographicScratch = (
  scratch: Cartographic,
  source: Cartographic
): Cartographic => {
  scratch.longitude = source.longitude;
  scratch.latitude = source.latitude;
  scratch.height = source.height;

  return scratch;
};

const computePitchDelta = (
  lastPitch: Radians,
  currentPitch: Radians
): Radians => (lastPitch - currentPitch) as Radians;

const computePitchDistanceToMinimum = (
  currentPitch: Radians,
  minCesiumPitch: Radians
): Radians => Math.abs(currentPitch - minCesiumPitch) as Radians;

const computePitchEasingInput = (
  currentPitch: Radians,
  minCesiumPitch: Radians,
  range: Radians
): number =>
  computePitchDistanceToMinimum(currentPitch, minCesiumPitch) / range;

const computeEasedPitchDelta = (
  pitchDelta: Radians,
  unitEased: number
): Radians => (pitchDelta * unitEased) as Radians;

const computeBoundedPitch = (
  lastPitch: Radians,
  newDelta: Radians,
  minCesiumPitch: Radians
): Radians => Math.min(lastPitch - newDelta, minCesiumPitch) as Radians;

const computeCorrectionStartPitch = (
  minCesiumPitch: Radians,
  pitchCorrectionRange: Radians
): Radians => (minCesiumPitch - pitchCorrectionRange) as Radians;

const computeInterpolatedHeight = (
  unitEased: number,
  height: number,
  lastHeight: number
): number => unitEased * height + (1 - unitEased) * lastHeight;

type ScratchPitchCorrection = {
  unitEased: number;
  newPitch: Radians;
};

const createScratchPitchCorrection = (
  newPitch: Radians
): ScratchPitchCorrection => ({
  unitEased: 0,
  newPitch,
});

const writeEasedPitchCorrectionScratch = (
  scratch: ScratchPitchCorrection,
  currentPitch: Radians,
  lastPitch: Radians,
  minCesiumPitch: Radians,
  range: Radians,
  easing: EasingFunction
): ScratchPitchCorrection | null => {
  if (range <= 0) {
    return null;
  }

  const pitchDelta = computePitchDelta(lastPitch, currentPitch);
  if (pitchDelta === 0) {
    return null;
  }

  const unitIn = computePitchEasingInput(currentPitch, minCesiumPitch, range);
  scratch.unitEased = easing(unitIn);
  const newDelta = computeEasedPitchDelta(pitchDelta, scratch.unitEased);
  scratch.newPitch = computeBoundedPitch(lastPitch, newDelta, minCesiumPitch);

  return scratch;
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
    heading: CESIUM_LOCAL_NORTH_HEADING_RAD,
    pitch,
    roll: CESIUM_UP_ROLL_RAD,
  },
});

const writeEasedPitchSetViewScratch = (
  scratchPosition: Cartographic,
  scratchView: ScratchSetView,
  currentPosition: Cartographic,
  lastPosition: Cartographic,
  unitEased: number,
  heading: Radians,
  pitch: Radians,
  roll: Radians
): ScratchSetView => {
  const { latitude, longitude, height } = currentPosition;
  const lastHeight = lastPosition.height;
  scratchPosition.longitude = longitude;
  scratchPosition.latitude = latitude;
  scratchPosition.height = computeInterpolatedHeight(
    unitEased,
    height,
    lastHeight
  );

  Cartographic.toCartesian(scratchPosition, undefined, scratchView.destination);

  scratchView.orientation.heading = heading;
  scratchView.orientation.pitch = pitch;
  scratchView.orientation.roll = roll;

  return scratchView;
};

type CameraPitchEasingLimiterOptions = CameraLimiterOptions & {
  easing?: EasingFunction;
  enabled?: boolean;
};

const resolvePitchEasingLimiterConfig = (
  options: CameraPitchEasingLimiterOptions = {}
): {
  enabled: boolean;
  pitchLimiterEnabled: boolean;
  easing: EasingFunction;
  minCesiumPitch: Radians;
  range: Radians;
  correctionStartPitch: Radians;
} => {
  const { limiter } = resolveCameraLimiterOptions(options);
  const {
    enabled: pitchLimiterEnabled,
    minCesiumPitch,
    correctionRange: pitchCorrectionRange,
  } = limiter.pitch;
  const enabled = options.enabled ?? true;
  const resolvedEasing = options.easing ?? Easing.CIRCULAR_IN;
  const range = pitchCorrectionRange;
  const correctionStartPitch = computeCorrectionStartPitch(
    minCesiumPitch,
    pitchCorrectionRange
  );

  return {
    enabled,
    pitchLimiterEnabled,
    easing: resolvedEasing,
    minCesiumPitch,
    range,
    correctionStartPitch,
  };
};

const useCameraPitchEasingLimiter = (
  options: CameraPitchEasingLimiterOptions = {}
) => {
  const {
    enabled,
    pitchLimiterEnabled,
    easing,
    minCesiumPitch,
    range,
    correctionStartPitch,
  } = resolvePitchEasingLimiterConfig(options);
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
  const scratchPitchCorrectionRef = useRef(
    createScratchPitchCorrection(minCesiumPitch)
  );
  const scratchSetViewPositionRef = useRef(new Cartographic());
  const scratchSetViewRef = useRef(createScratchSetView(minCesiumPitch));

  useEffect(() => {
    isAnimatingRef.current = isAnimating;
  }, [isAnimating]);

  useEffect(() => {
    isTransitioningRef.current = isTransitioning;
  }, [isTransitioning]);

  useEffect(() => {
    if (viewer && enabled && collisions && pitchLimiterEnabled) {
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
        const isPitchInRange = currentPitch > correctionStartPitch;

        if (
          isPitchInRange &&
          lastPitch.current !== null &&
          hasLastPosition.current
        ) {
          const pitchCorrection = writeEasedPitchCorrectionScratch(
            scratchPitchCorrectionRef.current,
            currentPitch,
            lastPitch.current,
            minCesiumPitch,
            range,
            easing
          );
          if (pitchCorrection) {
            const currentView = writeEasedPitchSetViewScratch(
              scratchSetViewPositionRef.current,
              scratchSetViewRef.current,
              camera.positionCartographic,
              lastPosition.current,
              pitchCorrection.unitEased,
              camera.heading as Radians,
              pitchCorrection.newPitch,
              camera.roll as Radians
            );
            camera.setView(currentView);
          }
        }
        lastPitch.current = camera.pitch as Radians;
        writeCartographicScratch(
          lastPosition.current,
          camera.positionCartographic
        );
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
    pitchLimiterEnabled,
    easing,
    range,
    minCesiumPitch,
    correctionStartPitch,
    initialViewApplied,
    shouldSuspendCameraLimitersRef,
  ]);
};

export default useCameraPitchEasingLimiter;
