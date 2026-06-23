import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { BoundingSphere, Cartesian3, HeadingPitchRange } from "@carma-cesium";
import type { Meters, Radians } from "@carma-units";

import {
  selectScreenSpaceCameraControllerEnableCollisionDetection,
  setIsAnimating,
  clearIsAnimating,
} from "../slices/cesium";
import {
  resolveCameraLimiterOptions,
  type CameraLimiterOptions,
} from "../camera-limiter-options";
import { pickScenePositions } from "../utils/pick-position/pick-scene-positions";
import { useCesiumContext } from "./useCesiumContext";
import { useCesiumRuntime } from "./useCesiumRuntime";

const CENTER_TEST_POSITION: [number, number] = [0.5, 0.5];
const DEFAULT_RESET_DURATION_S = 1.5;

type ScratchPitchResetFlight = {
  sphere: BoundingSphere;
  options: {
    offset: HeadingPitchRange;
    duration: number;
    complete: () => void;
    cancel: () => void;
  };
};

const createScratchPitchResetFlight = (
  onComplete: () => void
): ScratchPitchResetFlight => {
  const offset = new HeadingPitchRange();

  return {
    sphere: new BoundingSphere(),
    options: {
      offset,
      duration: DEFAULT_RESET_DURATION_S,
      complete: onComplete,
      cancel: onComplete,
    },
  };
};

const readPitchResetCenter = (
  scene: Parameters<typeof pickScenePositions>[0]
): Cartesian3 | null =>
  pickScenePositions(scene, [CENTER_TEST_POSITION], "test for pitch limiter")[0]
    ?.scenePosition ?? null;

const computeResetPitch = (
  minCesiumPitch: Radians,
  pitchCorrectionRange: Radians
): Radians => (minCesiumPitch - pitchCorrectionRange) as Radians;

const writePitchResetFlightScratch = ({
  scratchFlight,
  center,
  distance,
  heading,
  pitch,
  onComplete,
}: {
  scratchFlight: ScratchPitchResetFlight;
  center: Cartesian3;
  distance: Meters;
  heading: Radians;
  pitch: Radians;
  onComplete: () => void;
}): ScratchPitchResetFlight => {
  scratchFlight.sphere.center = center;
  scratchFlight.sphere.radius = distance;
  scratchFlight.options.offset.heading = heading;
  scratchFlight.options.offset.pitch = pitch;
  scratchFlight.options.offset.range = distance;
  scratchFlight.options.complete = onComplete;
  scratchFlight.options.cancel = onComplete;

  return scratchFlight;
};

type CameraPitchSoftLimiterOptions = CameraLimiterOptions & {
  debug?: boolean;
};

const resolvePitchSoftLimiterConfig = (
  options: CameraPitchSoftLimiterOptions = {}
): {
  debug: boolean;
  pitchLimiterEnabled: boolean;
  minCesiumPitch: Radians;
  resetPitch: Radians;
} => {
  const { limiter } = resolveCameraLimiterOptions(options);
  const {
    enabled: pitchLimiterEnabled,
    minCesiumPitch,
    correctionRange: pitchCorrectionRange,
  } = limiter.pitch;
  const debug = options.debug ?? false;
  const resetPitch = computeResetPitch(minCesiumPitch, pitchCorrectionRange);

  return {
    debug,
    pitchLimiterEnabled,
    minCesiumPitch,
    resetPitch,
  };
};

const useCameraPitchSoftLimiter = (
  options: CameraPitchSoftLimiterOptions = {}
) => {
  const { debug, pitchLimiterEnabled, minCesiumPitch, resetPitch } =
    resolvePitchSoftLimiterConfig(options);

  const runtime = useCesiumRuntime();
  const dispatch = useDispatch();
  const collisions = useSelector(
    selectScreenSpaceCameraControllerEnableCollisionDetection
  );
  const { getScene, shouldSuspendCameraLimitersRef, initialViewApplied } =
    useCesiumContext();

  const onComplete = useCallback(
    () => dispatch(clearIsAnimating()),
    [dispatch]
  );
  const pitchResetFlightRef = useRef(createScratchPitchResetFlight(onComplete));

  useEffect(() => {
    // Note: This hook always runs when runtime exists - Cesium is always active
    if (runtime && collisions && pitchLimiterEnabled) {
      debug &&
        console.debug(
          "HOOK [2D3D|CESIUM] runtime changed add new Cesium MoveEnd Listener to correct camera pitch"
        );

      const moveEndListener = async () => {
        if (shouldSuspendCameraLimitersRef?.current) return;
        if (!initialViewApplied) return;
        const scene = getScene();
        if (!scene) {
          console.warn(
            "HOOK [2D3D|CESIUM|CAMERA] moveEndListener: no cesium scene available for pitch limiter"
          );
          return;
        }

        debug &&
          console.debug(
            "HOOK [2D3D|CESIUM] Soft Pitch Limiter",
            runtime.camera.pitch,
            minCesiumPitch,
            resetPitch
          );
        const isPitchTooLow =
          collisions && runtime.camera.pitch > minCesiumPitch;
        if (isPitchTooLow) {
          debug &&
            console.debug(
              "LISTENER HOOK [2D3D|CESIUM|CAMERA]: reset pitch soft",
              runtime.camera.pitch,
              resetPitch
            );
          // TODO have centralized picker for screen positions in render loop and context to avoid multiple pick calls per frame
          // TODO Get CenterPos Lower from screen if distance is multiple of elevation. prevent pitch around distant point on horizon
          const centerPos = readPitchResetCenter(scene);
          if (centerPos) {
            dispatch(setIsAnimating());
            const distance = Cartesian3.distance(
              centerPos,
              runtime.camera.position
            ) as Meters;
            const pitchResetFlight = writePitchResetFlightScratch({
              scratchFlight: pitchResetFlightRef.current,
              center: centerPos,
              distance,
              heading: runtime.camera.heading as Radians,
              pitch: resetPitch,
              onComplete,
            });
            runtime.camera.flyToBoundingSphere(
              pitchResetFlight.sphere,
              pitchResetFlight.options
            );
          }
        }
      };
      runtime.camera.moveEnd.addEventListener(moveEndListener);
      return () => {
        !runtime.isDestroyed() &&
          runtime.camera.moveEnd.removeEventListener(moveEndListener);
      };
    }
  }, [
    runtime,
    collisions,
    pitchLimiterEnabled,
    onComplete,
    dispatch,
    getScene,
    minCesiumPitch,
    resetPitch,
    debug,
    initialViewApplied,
    shouldSuspendCameraLimitersRef,
  ]);
};

export default useCameraPitchSoftLimiter;
