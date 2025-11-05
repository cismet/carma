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
import { degToRad } from "@carma/units/helpers";
import type { Degrees } from "@carma/units/types";
import type { TargetHeadingPitch } from "../transition-to-leaflet";

/**
 * Restores camera heading/pitch to saved 3D view.
 * Range (distance) is preserved from current camera position (set by zoom level).
 * Returns true if animation started, false if completed immediately.
 *
 * If targetHeadingPitch is null, uses default heading/pitch values instead.
 *
 * NOTE: Could restore previous range if still in same zoom bracket, but currently
 * always uses range from zoom-based camera position for consistency.
 */
export const restoreCesiumCameraView = (
  scene: Scene,
  targetHeadingPitch: TargetHeadingPitch | null,
  duration: number,
  onComplete: () => void,
  defaultHeadingDeg = 0,
  defaultPitchDeg = -45
): boolean => {
  // Use provided target or create default from options
  const effectiveHeadingPitch: TargetHeadingPitch = targetHeadingPitch || {
    heading: degToRad(defaultHeadingDeg as Degrees),
    pitch: degToRad(defaultPitchDeg as Degrees),
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

  if (pos) {
    // Get current camera range (set by zoom level in tiledMapToCesium)
    const currentRange = Cartesian3.distance(pos, scene.camera.position);
    const cameraHeight = scene.camera.positionCartographic.height;
    const cameraHeading = scene.camera.heading;
    const cameraPitch = scene.camera.pitch;

    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO3D] BEFORE animation - camera state",
      {
        cameraHeight,
        currentRange,
        cameraHeading: ((cameraHeading * 180) / Math.PI).toFixed(2) + "°",
        cameraPitch: ((cameraPitch * 180) / Math.PI).toFixed(2) + "°",
        targetHeading:
          ((effectiveHeadingPitch.heading * 180) / Math.PI).toFixed(2) + "°",
        targetPitch:
          ((effectiveHeadingPitch.pitch * 180) / Math.PI).toFixed(2) + "°",
      }
    );

    console.debug(
      "[CESIUM] [CESIUM|2D3D|TO3D] starting camera animation to restore 3D view",
      {
        pos,
        effectiveHeadingPitch,
        usingDefaults: !targetHeadingPitch,
        currentRange,
        duration,
      }
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
    animateInterpolateHeadingPitchRange(scene, pos, targetHPR, {
      duration,
      useCurrentDistance: true, // CRITICAL: Keep zoom-based range, don't interpolate
      cancelable: true, // Allow user to cancel animation by interacting with canvas
      onComplete: () => {
        // Log final camera state after animation
        const finalHeight = scene.camera.positionCartographic.height;
        const finalRange = Cartesian3.distance(pos, scene.camera.position);
        const finalHeading = scene.camera.heading;
        const finalPitch = scene.camera.pitch;

        console.debug(
          "[CESIUM] [CESIUM|2D3D|TO3D] AFTER animation - camera state",
          {
            finalHeight,
            finalRange,
            finalHeading: ((finalHeading * 180) / Math.PI).toFixed(2) + "°",
            finalPitch: ((finalPitch * 180) / Math.PI).toFixed(2) + "°",
            rangeChanged: (finalRange - currentRange).toFixed(2) + "m",
          }
        );

        onComplete();
      },
      onCancel: onComplete, // Complete transition even if user cancels animation
    });

    return true;
  } else {
    console.warn(
      "[CESIUM] [CESIUM|2D3D|TO3D] no valid position, completing transition without animation",
      { hasPos: !!pos }
    );
    onComplete();
    return false;
  }
};
