import type { Scene, HeadingPitchRange } from '@carma/cesium';
import type { Map as LeafletMap } from 'leaflet';
import { isValidScene } from '@carma/cesium';
import { TransitionStage } from './types';
import type { TransitionToCesiumOptions } from './types';
import { prepareLeafletForTransition } from './leaflet-preparation';
import { restoreCesiumCameraView } from './utils/camera-restore';
import { promiseWithTimeout } from '@carma-commons/utils/promise';

type TransitionToCesiumParams = {
  scene: Scene;
  leaflet: LeafletMap;
  cesiumContainer: HTMLElement;
  resolutionScale?: number;
  targetHPR?: HeadingPitchRange | null;
  onTransitionStage: (stage: TransitionStage, message: string) => void;
  onTransitionComplete?: () => void;
  onTransitionError?: (error: Error) => void;
  updateMode2dState?: (is2d: boolean) => void;
  options?: TransitionToCesiumOptions;
};

/**
 * Pure function: Orchestrates transition from Leaflet (2D) to Cesium (3D)
 * No React or context dependencies - just Cesium Scene and Leaflet Map
 */
export const transitionToCesium = async ({
  scene,
  leaflet,
  cesiumContainer,
  resolutionScale = 1.0,
  targetHPR = null,
  onTransitionStage,
  onTransitionComplete,
  onTransitionError,
  updateMode2dState,
  options = {},
}: TransitionToCesiumParams): Promise<void> => {
  // Extract options with defaults
  const {
    step1_prepare2dViewMaxZoom = 18,
    step1_zoomOutDurationMs = 1000,
    step1_zoomOutEaseLinearity = 0.5,
    step2_initialRenderTimeoutMs = 100,
    step3_resourceWaitTimeoutMs = 500,
    step6_cameraAnimationDurationMs = 1500,
  } = options;

  console.debug('[CESIUM] [CESIUM|2D3D|TO3D] Starting transition to 3D mode', {
    hasLeaflet: !!leaflet,
    hasScene: isValidScene(scene),
    targetHPR,
  });

  try {
    // Stage 1: Prepare 2D view - zoom out if needed
    onTransitionStage(TransitionStage.PREPARE_2D, 'Preparing 2D view for transition');
    console.debug('[CESIUM] [CESIUM|2D3D|TO3D] Step 1: Preparing Leaflet map');
    
    await prepareLeafletForTransition(leaflet, {
      maxZoom: step1_prepare2dViewMaxZoom,
      zoomOutDuration: step1_zoomOutDurationMs,
      zoomOutEaseLinearity: step1_zoomOutEaseLinearity,
      zoomOutTimeoutBuffer: step2_initialRenderTimeoutMs + step3_resourceWaitTimeoutMs,
    });

    onTransitionStage(TransitionStage.ZOOM_OUT, 'Leaflet zoom completed');

    // Stage 2: Position Cesium camera to match Leaflet view
    onTransitionStage(TransitionStage.POSITION_3D_CAMERA, 'Positioning 3D camera');
    console.debug('[CESIUM] [CESIUM|2D3D|TO3D] Step 2: Positioning Cesium camera');

    if (!isValidScene(scene)) {
      throw new Error('Scene became invalid during transition');
    }

    // Cancel any ongoing camera flights
    scene.camera.cancelFlight();

    // Get Leaflet center and zoom for camera positioning
    const center = leaflet.getCenter();
    const zoom = leaflet.getZoom();

    console.debug('[CESIUM] [CESIUM|2D3D|TO3D] Leaflet center/zoom:', {
      lat: center.lat,
      lng: center.lng,
      zoom,
    });

    // Stage 3: Wait for initial render and resources
    onTransitionStage(TransitionStage.WAIT_RESOURCES, 'Waiting for resources to load');
    console.debug('[CESIUM] [CESIUM|2D3D|TO3D] Step 3: Waiting for initial render');

    const initialWaitMs = step2_initialRenderTimeoutMs;
    await promiseWithTimeout(
      new Promise((resolve) => requestAnimationFrame(resolve)),
      initialWaitMs
    );

    // Additional resource wait
    console.debug('[CESIUM] [CESIUM|2D3D|TO3D] Waiting for resources');
    await promiseWithTimeout(
      new Promise((resolve) => setTimeout(resolve, step3_resourceWaitTimeoutMs)),
      step3_resourceWaitTimeoutMs + 100
    );

    // Stage 4: Fade in Cesium container
    onTransitionStage(TransitionStage.FADE_IN_3D, 'Fading in 3D view');
    console.debug('[CESIUM] [CSS] [CESIUM|2D3D|TO3D] Step 4: Making Cesium container visible');

    // Directly manipulate container CSS
    cesiumContainer.style.opacity = '1';
    cesiumContainer.style.pointerEvents = 'auto';

    // Update mode state
    if (updateMode2dState) {
      updateMode2dState(false);
    }

    // Stage 5: Animate camera to final position (if previous HPR exists)
    onTransitionStage(TransitionStage.ANIMATE_CAMERA, 'Animating camera');
    console.debug('[CESIUM] [CESIUM|2D3D|TO3D] Step 5: Attempting camera animation');

    const handleComplete = () => {
      onTransitionStage(TransitionStage.COMPLETE, 'Transition to 3D complete');
      console.debug('[CESIUM] [CESIUM|2D3D|TO3D] Transition complete');
      if (onTransitionComplete) {
        onTransitionComplete();
      }
    };

    // Try to restore camera to target view
    const animationStarted = restoreCesiumCameraView(
      scene,
      targetHPR,
      step6_cameraAnimationDurationMs,
      handleComplete
    );

    if (!animationStarted) {
      // No animation, complete immediately
      handleComplete();
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onTransitionStage(TransitionStage.ERROR, `Transition failed: ${err.message}`);
    console.error('[CESIUM] [CESIUM|2D3D|TO3D] Transition error:', error);
    
    if (onTransitionError) {
      onTransitionError(err);
    }
    
    throw error;
  }
};
