import {
  type Scene,
  Cartesian3,
  HeadingPitchRange,
  type HeadingPitchJson,
  isValidScene,
} from "@carma/cesium";
import { animateInterpolateHeadingPitchRange } from "@carma-mapping/engines/cesium/legacy";
import { degToRad } from "@carma/units/helpers";
import type { Degrees } from "@carma/units/types";

/**
 * Restores camera heading/pitch to saved 3D view.
 * Range (distance) is preserved from current camera position (set by zoom level).
 * Returns true if animation started, false if completed immediately.
 *
 * If targetHeadingPitch is null, uses default heading/pitch values instead.
 * If groundPosition is null, skip animation and complete immediately.
 *
 * NOTE: Could restore previous range if still in same zoom bracket, but currently
 * always uses range from zoom-based camera position for consistency.
 */
export const restoreCesiumCameraView = (
  scene: Scene,
  groundPosition: Cartesian3 | null,
  targetHeadingPitch: HeadingPitchJson | null,
  duration: number,
  onComplete: () => void,
  defaultPitch: Degrees = -45 as Degrees,
  defaultHeading: Degrees = 0 as Degrees
): boolean => {
  // Use provided target or create default from options
  const effectiveHeadingPitch: HeadingPitchJson = targetHeadingPitch || {
    heading: degToRad(defaultHeading),
    pitch: degToRad(defaultPitch),
  };

  console.debug("[CESIUM] [CESIUM|2D3D|TO3D] restoring camera view", {
    hasTargetHeadingPitch: !!targetHeadingPitch,
    effectiveHeadingPitch,
    usingDefaults: !targetHeadingPitch,
    duration,
  });

  // Guard against scene not being ready
  if (!isValidScene(scene)) {
    console.warn(
      "[CESIUM] [CESIUM|2D3D|TO3D] viewer not valid, completing transition without animation"
    );
    onComplete();
    return false;
  }

  // If no ground position provided, complete without animation
  if (!groundPosition) {
    console.warn(
      "[CESIUM] [CESIUM|2D3D|TO3D] no ground position available, completing transition without animation"
    );
    onComplete();
    return false;
  }

  // Get current camera range (set by zoom level in tiledMapToCesium)
  const currentRange = Cartesian3.distance(
    groundPosition,
    scene.camera.position
  );

  // Create target HeadingPitchRange with heading/pitch from save (or defaults) + current range
  // The range will NOT be interpolated (useCurrentDistance: true keeps zoom-based distance)
  const targetHPR = new HeadingPitchRange(
    effectiveHeadingPitch.heading,
    effectiveHeadingPitch.pitch,
    currentRange // This value is ignored when useCurrentDistance: true
  );

  // Use the proper animation function that rotates around a point
  // useCurrentDistance: true ensures range stays at zoom-based value (no interpolation)
  animateInterpolateHeadingPitchRange(scene, groundPosition, targetHPR, {
    duration,
    useCurrentDistance: true, // CRITICAL: Keep zoom-based range, don't interpolate
    cancelable: true, // Allow user to cancel animation by interacting with canvas
    onComplete,
    onCancel: onComplete, // Complete transition even if user cancels animation
  });

  return true;
};
