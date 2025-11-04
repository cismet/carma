import { type Scene, Cartesian3, type HeadingPitchRange, isValidScene } from '@carma/cesium';
import { pickSceneCanvasCenter } from '@carma-mapping/engines/cesium/legacy';

/**
 * Restores camera to target 3D view using saved HPR
 * Returns true if animation started, false if completed immediately
 */
export const restoreCesiumCameraView = (
  scene: Scene,
  targetHPR: HeadingPitchRange | null,
  duration: number,
  onComplete: () => void
): boolean => {
  // Only attempt to pick position if we need to restore a target view
  if (!targetHPR) {
    console.debug(
      '[CESIUM] [CESIUM|2D3D|TO3D] no target HPR to restore, completing transition without animation'
    );
    onComplete();
    return false;
  }

  console.debug('[CESIUM] [CESIUM|2D3D|TO3D] attempting to pick center and restore camera', {
    targetHPR,
    duration,
  });

  // Guard against scene not being ready
  if (!isValidScene(scene)) {
    console.warn(
      '[CESIUM] [CESIUM|2D3D|TO3D] viewer not valid, completing transition without animation'
    );
    onComplete();
    return false;
  }

  // Try to pick center position, but don't fail if it doesn't work
  let pos: Cartesian3 | null = null;
  try {
    const pickResult = pickSceneCanvasCenter(scene);
    pos = pickResult.scenePosition;
    console.debug('[CESIUM] [CESIUM|2D3D|TO3D] picked center position', {
      pos,
      hasPosition: !!pos,
    });
  } catch (error) {
    console.warn(
      '[CESIUM] [CESIUM|2D3D|TO3D] failed to pick center position, completing transition without animation',
      error
    );
    onComplete();
    return false;
  }

  if (pos && targetHPR) {
    console.debug('[CESIUM] [CESIUM|2D3D|TO3D] starting camera animation to restore 3D view', {
      pos,
      targetHPR,
      duration,
    });
    
    // Use lookAt which properly handles HeadingPitchRange with distance (range)
    scene.camera.flyTo({
      destination: pos,
      orientation: targetHPR, // HeadingPitchRange object with heading, pitch, range
      duration: duration / 1000, // Convert ms to seconds for Cesium
      complete: onComplete,
    });
    
    return true;
  } else {
    console.warn(
      '[CESIUM] [CESIUM|2D3D|TO3D] no valid position or HPR, completing transition without animation',
      { hasPos: !!pos, hasTargetHPR: !!targetHPR }
    );
    onComplete();
    return false;
  }
};
