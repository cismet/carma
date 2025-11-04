import type { HeadingPitchRange, Scene } from '@carma/cesium';
import { isValidScene } from '@carma/cesium';
import type { Map as LeafletMap } from 'leaflet';
import { TransitionStage } from './types';
import { animateCesiumToTopDownLeafletLikeView as animateCameraTo2d } from './utils/animateCesiumToTopDownLeafletLikeView';

type TransitionToLeafletParams = {
  scene: Scene;
  leaflet: LeafletMap;
  cesiumContainer: HTMLElement;
  resolutionScale?: number;
  onTransitionStage: (stage: TransitionStage, message: string) => void;
  onTransitionComplete?: () => void;
  onTransitionError?: (error: Error) => void;
  onTargetHPR?: (hpr: HeadingPitchRange, duration: number) => void;
  updateMode2dState?: (is2d: boolean) => void;
  options?: { step1_cameraAnimationDurationMs?: number };
};

/**
 * Pure function: Orchestrates transition from Cesium (3D) to Leaflet (2D)
 * No React or context dependencies - just Cesium Scene and Leaflet Map
 */
export const transitionToLeaflet = async ({
  scene,
  leaflet,
  cesiumContainer,
  resolutionScale = 1.0,
  onTransitionStage,
  onTransitionComplete,
  onTransitionError,
  onTargetHPR,
  updateMode2dState,
  options = {},
}: TransitionToLeafletParams): Promise<void> => {
  const { step1_cameraAnimationDurationMs = 1000 } = options;

  console.debug('[CESIUM] [CESIUM|2D3D|TO2D] Starting transition to 2D mode', {
    hasLeaflet: !!leaflet,
    hasScene: isValidScene(scene),
  });

  try {
    onTransitionStage(TransitionStage.PREPARE_2D, 'Preparing for 2D transition');

    // Wait a frame to ensure scene is fully ready after previous operations
    console.debug('[CESIUM] [CESIUM|2D3D|TO2D] Waiting for next frame to ensure scene readiness');
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Verify scene is still valid after waiting
    if (!isValidScene(scene)) {
      throw new Error('Scene became invalid during transition');
    }

    console.debug('[CESIUM] [CESIUM|2D3D|TO2D] Scene ready, proceeding with transition');

    // Start transition visuals
    onTransitionStage(TransitionStage.ANIMATE_CAMERA, 'Animating camera to top-down view');
    console.debug('[CESIUM] [CSS] [CESIUM|2D3D|TO2D] Starting transition visuals');

    const handleAnimationComplete = () => {
      // Fade out Cesium container
      onTransitionStage(TransitionStage.FADE_IN_3D, 'Fading out 3D view');
      console.debug('[CSS|2D3D|TO2D] Fading out Cesium container');
      
      cesiumContainer.style.opacity = '0';
      cesiumContainer.style.pointerEvents = 'none';

      // Trigger the visual transition
      console.debug('[CESIUM] [CSS] [CESIUM|2D3D|TO2D] Completing transition - setting isMode2d=true');
      if (updateMode2dState) {
        updateMode2dState(true);
      }

      onTransitionStage(TransitionStage.COMPLETE, 'Transition to 2D complete');
      
      if (onTransitionComplete) {
        onTransitionComplete();
      }
    };

    const handleTargetHPR = (hpr: HeadingPitchRange) => {
      if (onTargetHPR) {
        onTargetHPR(hpr, step1_cameraAnimationDurationMs);
      }
    };

    animateCameraTo2d(scene, leaflet, {
      scene,
      leaflet,
      onAnimationComplete: handleAnimationComplete,
      setPrevHPR: handleTargetHPR,
      setPrevDuration: () => {}, // Duration is handled via onTargetHPR
      onTransitionCancel: () => {
        onTransitionStage(TransitionStage.ERROR, 'Transition cancelled');
        if (onTransitionError) {
          onTransitionError(new Error('Transition cancelled'));
        }
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onTransitionStage(TransitionStage.ERROR, `Transition failed: ${err.message}`);
    console.error('[CESIUM] [CESIUM|2D3D|TO2D] Transition error:', error);
    
    if (onTransitionError) {
      onTransitionError(err);
    }
    
    throw error;
  }
};
