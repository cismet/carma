import {
  type Scene,
  Cartesian3,
  HeadingPitchRange,
  isValidScene,
} from "@carma/cesium";
import {
  pickSceneCanvasCenter,
  animateInterpolateHeadingPitchRange,
} from "@carma-mapping/engines/cesium/legacy";
import type { TargetHeadingPitch } from "../transition-to-leaflet";

/**
 * Restores camera heading/pitch to saved 3D view.
 * Range (distance) is preserved from current camera position (set by zoom level).
 * Returns true if animation started, false if completed immediately.
 *
 * NOTE: Could restore previous range if still in same zoom bracket, but currently
 * always uses range from zoom-based camera position for consistency.
 */
export const restoreCesiumCameraView = (
  scene: Scene,
  targetHeadingPitch: TargetHeadingPitch | null,
  duration: number,
  onComplete: () => void
): boolean => {
  // Only attempt to pick position if we need to restore a target view
  if (!targetHeadingPitch) {
    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO3D] no target heading/pitch to restore, completing transition without animation"
    );
    onComplete();
    return false;
  }

  console.debug(
    "[CESIUM] [CESIUM|2D3D|TO3D] attempting to pick center and restore camera",
    {
      targetHeadingPitch,
      duration,
    }
  );

  // Guard against scene not being ready
  if (!isValidScene(scene)) {
    console.warn(
      "[CESIUM] [CESIUM|2D3D|TO3D] viewer not valid, completing transition without animation"
    );
    onComplete();
    return false;
  }

  // Try to pick center position, but don't fail if it doesn't work
  let pos: Cartesian3 | null = null;
  try {
    const pickResult = pickSceneCanvasCenter(scene);
    pos = pickResult.scenePosition;
    console.debug("[CESIUM] [CESIUM|2D3D|TO3D] picked center position", {
      pos,
      hasPosition: !!pos,
    });
  } catch (error) {
    console.warn(
      "[CESIUM] [CESIUM|2D3D|TO3D] failed to pick center position, completing transition without animation",
      error
    );
    onComplete();
    return false;
  }

  if (pos && targetHeadingPitch) {
    // Get current camera range (set by zoom level in tiledMapToCesium)
    const currentRange = Cartesian3.distance(pos, scene.camera.position);

    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO3D] starting camera animation to restore 3D view",
      {
        pos,
        targetHeadingPitch,
        currentRange,
        duration,
      }
    );

    // Create target HeadingPitchRange with heading/pitch from save + current range
    // The range will NOT be interpolated (useCurrentDistance: true keeps zoom-based distance)
    const targetHPR = new HeadingPitchRange(
      targetHeadingPitch.heading,
      targetHeadingPitch.pitch,
      currentRange // This value is ignored when useCurrentDistance: true
    );

    // Use the proper animation function that rotates around a point
    // useCurrentDistance: true ensures range stays at zoom-based value (no interpolation)
    animateInterpolateHeadingPitchRange(scene, pos, targetHPR, {
      duration,
      useCurrentDistance: true, // CRITICAL: Keep zoom-based range, don't interpolate
      cancelable: false,
      onComplete,
    });

    return true;
  } else {
    console.warn(
      "[CESIUM] [CESIUM|2D3D|TO3D] no valid position or heading/pitch, completing transition without animation",
      { hasPos: !!pos, hasTargetHeadingPitch: !!targetHeadingPitch }
    );
    onComplete();
    return false;
  }
};
