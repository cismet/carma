import {
  type Scene,
  PerspectiveFrustum,
  isValidScene,
  sampleTerrainMostDetailedGuardedAsync,
  isValidCesiumTerrainProvider,
  Cartographic,
  HeadingPitchRoll,
  captureCurrentCameraState,
  setViewFromCameraState,
} from "@carma/cesium";

import {
  getFrustumPixelDimensionsForDistance,
  getScenePixelSize,
} from "@carma/cesium/core";
import type { Zoom, SurfaceModelType } from "@carma/types";
import type { LatLng } from "@carma/geo/types";
import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma/geo/utils";
import type { Radians, Degrees } from "@carma/units/types";

import { isZoom, degToRad } from "@carma-commons/units/helpers";
import { normalizeOptions, Logger } from "@carma-commons/utils";

const logger = new Logger("L2C");

// TODO: move to config or formalize the starting distance value
const START_DISTANCE = 1000;

type TransitionOptions = {
  epsilon?: number;
  limit?: number;
  cause?: string;
  onComplete?: Function;
  onError?: (error: Error) => void;
  fallbackElevationM?: number;
  /** Preferred surface model type: 'dem' (terrain only), 'dsm' (terrain + objects), 'water' */
  preferredSurfaceType?: SurfaceModelType;
  terrainSafetyBufferM?: number;
  /** Enable micro-adjustment stage (default: false) */
  enableMicroAdjustments?: boolean;
  /** Maximum allowed range deviation from initial position (default: 0.1 = 10%) */
  maxRangeDeviationRatio?: number;
};

const noop = () => {};

const defaultTransitionOptions: Required<TransitionOptions> = {
  epsilon: 0.1,
  limit: 20,
  cause: "not specified",
  onComplete: noop,
  onError: noop,
  fallbackElevationM: 350,
  preferredSurfaceType: "dem", // Prefer DEM (Digital Elevation Model - terrain only)
  terrainSafetyBufferM: 300,
  enableMicroAdjustments: false,
  maxRangeDeviationRatio: 0.1, // 10% max deviation
};

export const tiledMapToCesium = async (
  scene: Scene | null,
  { latitude, longitude }: LatLng.deg,
  zoom: Zoom,
  resolutionScale: number,
  options: TransitionOptions
): Promise<boolean> => {
  logger.debug(
    "[2D3D|CESIUM|CAMERA] tiledMapToCesium called, starting dynamic imports..."
  );

  if (!isValidScene(scene)) {
    logger.error("Invalid scene provided");
    return false;
  }

  const { camera, globe } = scene;
  const terrainProvider = globe?.terrainProvider;

  let result = false;

  if (!isZoom(zoom)) {
    logger.warn("No zoom level available for transition");
    return false;
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    logger.warn(
      "No valid coordinates available for transition",
      latitude,
      longitude
    );
    return false;
  }

  const lngRad = degToRad(longitude as Degrees);
  const latRad = degToRad(latitude as Degrees);

  // Calculate target pixel resolution from Leaflet zoom level
  const baseTargetPixelResolution = getPixelResolutionFromZoomAtLatitudeRad(
    zoom,
    latRad as Radians
  );

  // Adjust for device pixel ratio (Leaflet uses retina tiles on high-DPI displays)
  const actualDPR = window.devicePixelRatio || 1;
  const LEAFLET_DPR_FACTOR = 1 / actualDPR;
  const targetPixelResolution = baseTargetPixelResolution * LEAFLET_DPR_FACTOR;

  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Cesium resolution scale: ${resolutionScale.toFixed(
      2
    )}`
  );
  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Window DPR: ${actualDPR} (Leaflet DPR factor: ${LEAFLET_DPR_FACTOR})`
  );
  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Base pixel resolution from zoom ${zoom}: ${baseTargetPixelResolution.toFixed(
      4
    )}m/px`
  );
  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Target pixel resolution (DPR-adjusted): ${targetPixelResolution.toFixed(
      4
    )}m/px`
  );

  const {
    epsilon,
    onComplete,
    fallbackElevationM,
    enableMicroAdjustments,
    maxRangeDeviationRatio,
  } = normalizeOptions(options, defaultTransitionOptions);

  const baseComputedPixelResolution = getFrustumPixelDimensionsForDistance(
    scene.camera.frustum as PerspectiveFrustum,
    scene.drawingBufferWidth,
    scene.drawingBufferHeight,
    START_DISTANCE,
    resolutionScale
  )?.average;

  if (
    baseComputedPixelResolution === null ||
    baseComputedPixelResolution === undefined
  ) {
    logger.warn(
      "No base computed pixel resolution found for distance",
      START_DISTANCE
    );
    return false;
  }

  const resolutionRatio = targetPixelResolution / baseComputedPixelResolution;
  const computedDistance = START_DISTANCE * resolutionRatio;

  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Computed distance: ${computedDistance.toFixed(
      2
    )}m`
  );

  // STEP 1: Position camera at fallback elevation + computed distance
  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Initial positioning: target ground=${fallbackElevationM.toFixed(
      2
    )}m (fallback), range=${computedDistance.toFixed(2)}m from target`
  );
  const initialCameraHeight = fallbackElevationM + computedDistance;
  const initialCameraCartographic = Cartographic.fromRadians(
    lngRad,
    latRad,
    initialCameraHeight
  );
  const initialDestination = Cartographic.toCartesian(
    initialCameraCartographic
  );

  camera.setView({
    destination: initialDestination,
    orientation: new HeadingPitchRoll(0, -Math.PI / 2, 0), // Nadir view
  });

  // STEP 2: Wait one frame for scene to update
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

  // STEP 3: Sample terrain elevation
  const queryPosition = Cartographic.fromRadians(lngRad, latRad, 0);
  let terrainElevation = fallbackElevationM;

  if (isValidCesiumTerrainProvider(terrainProvider)) {
    try {
      logger.debug(
        `L2C [2D3D|CESIUM|CAMERA] Sampling terrain at (${latitude.toFixed(
          6
        )}, ${longitude.toFixed(6)})...`
      );
      const sampledPositions = await sampleTerrainMostDetailedGuardedAsync(
        terrainProvider,
        [queryPosition],
        false // Don't reject on tile fail
      );

      if (sampledPositions && sampledPositions[0]?.height !== undefined) {
        terrainElevation = sampledPositions[0].height;
        logger.debug(
          `L2C [2D3D|CESIUM|CAMERA] ✓ Terrain elevation: ${terrainElevation.toFixed(
            2
          )}m`
        );
      } else {
        logger.debug(
          `L2C [2D3D|CESIUM|CAMERA] ⚠ No terrain elevation available, using fallback: ${fallbackElevationM}m`
        );
      }
    } catch (error) {
      logger.warn(
        `L2C [2D3D|CESIUM|CAMERA] ⚠ Terrain sampling failed: ${error}. Using fallback: ${fallbackElevationM}m`
      );
    }
  } else {
    logger.warn(
      `[2D3D|CESIUM|CAMERA] ⚠ No terrain provider available, using fallback: ${fallbackElevationM}m`
    );
  }

  // STEP 4: Set final camera position with accurate terrain
  const finalCameraHeight = terrainElevation + computedDistance;

  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Position: lat=${latitude.toFixed(
      6
    )} lng=${longitude.toFixed(6)} zoom=${zoom}`
  );
  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Ground elevation (sampled): ${terrainElevation.toFixed(
      2
    )}m`
  );
  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Range from ground: ${computedDistance.toFixed(
      2
    )}m (pure, from zoom)`
  );
  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Camera height above sea level: ${finalCameraHeight.toFixed(
      2
    )}m (${terrainElevation.toFixed(2)}m + ${computedDistance.toFixed(2)}m)`
  );
  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Target pixel resolution: ${targetPixelResolution.toFixed(
      4
    )}m/px`
  );

  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Setting refined camera position: height=${finalCameraHeight.toFixed(
      2
    )}m`
  );

  const finalCameraCartographic = Cartographic.fromRadians(
    lngRad,
    latRad,
    finalCameraHeight
  );
  const finalDestination = Cartographic.toCartesian(finalCameraCartographic);

  camera.setView({
    destination: finalDestination,
    orientation: new HeadingPitchRoll(0, -Math.PI / 2, 0), // Nadir view
  });

  // Store camera state after initial positioning with terrain elevation
  const savedCameraState = captureCurrentCameraState(camera, true);
  const initialRange = computedDistance;

  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] ✓ Saved camera state after terrain positioning (range: ${initialRange.toFixed(
      2
    )}m)`
  );

  // CRITICAL: Wait for scene to render with new camera position
  // Scene needs multiple frames to:
  // 1. Apply camera position
  // 2. Update frustum
  // 3. Stabilize rendering state
  // Wait for 4+ frames to ensure pixel size is read from correct view
  scene.requestRender();
  await new Promise<void>((resolve) => {
    let frameCount = 0;
    const waitFrames = () => {
      frameCount++;
      if (frameCount < 4) {
        window.requestAnimationFrame(waitFrames);
      } else {
        resolve();
      }
    };
    window.requestAnimationFrame(waitFrames);
  });

  // STEP 5: Micro-corrections if needed (OPTIONAL)
  let isQualifiedResult = true;
  let iterations = 0;
  let shouldRestoreSavedState = false;

  // Read pixel resolution AFTER positioning and waiting for scene update
  let currentPixelResolution = getScenePixelSize(scene).value;

  if (currentPixelResolution === null) {
    logger.warn("No pixel size found for camera position");
    return false;
  }

  let currentError = Math.abs(currentPixelResolution - targetPixelResolution);

  // Log initial pixel resolution
  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Initial actual pixel resolution: ${currentPixelResolution.toFixed(
      4
    )}m/px (error: ${currentError.toFixed(4)})`
  );

  // Micro-correction loop (OPTIONAL - disabled by default)
  const maxMicroCorrections = enableMicroAdjustments ? 3 : 0;

  if (!enableMicroAdjustments) {
    logger.debug(
      `L2C [2D3D|CESIUM|CAMERA] Micro-adjustments disabled, using initial positioning`
    );
  }

  while (
    isQualifiedResult &&
    currentError > epsilon &&
    iterations < maxMicroCorrections
  ) {
    // Get CURRENT camera height from its actual position (don't reuse mutated values)
    const currentCameraHeight = Cartographic.fromCartesian(
      camera.position
    ).height;

    // Newton-Raphson: newHeight = currentHeight * (target / current)
    const adjustmentFactor = targetPixelResolution / currentPixelResolution;
    const newCameraHeight = currentCameraHeight * adjustmentFactor;

    if (!Number.isFinite(newCameraHeight)) {
      logger.error("Invalid camera height calculated:", newCameraHeight);
      throw new Error("Invalid camera height - NaN or Infinity");
    }

    // Update camera height in micro-correction
    const updatedCameraCartographic = Cartographic.fromRadians(
      lngRad,
      latRad,
      newCameraHeight
    );
    const updatedDestination = Cartographic.toCartesian(
      updatedCameraCartographic
    );

    camera.setView({
      destination: updatedDestination,
      orientation: new HeadingPitchRoll(0, -Math.PI / 2, 0),
    });

    // Wait for scene to update before reading pixel resolution
    scene.requestRender();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    currentPixelResolution = getScenePixelSize(scene).value;
    if (currentPixelResolution === null) {
      logger.warn("[2D3D|CESIUM|CAMERA] No pixel resolution during iteration");
      isQualifiedResult = false;
      break;
    }

    currentError = Math.abs(currentPixelResolution - targetPixelResolution);
    iterations++;

    // Calculate current range from ground (reuse newCameraHeight from above)
    const currentRange = newCameraHeight - terrainElevation;
    const rangeDifference = Math.abs(currentRange - initialRange);
    const rangeDeviationRatio = rangeDifference / initialRange;

    logger.debug(
      `L2C [2D3D|CESIUM|CAMERA] Micro-correction ${iterations}: actual=${currentPixelResolution.toFixed(
        4
      )}m/px error=${currentError.toFixed(4)} height=${newCameraHeight.toFixed(
        2
      )}m`
    );
    logger.debug(
      `L2C [2D3D|CESIUM|CAMERA] Range: initial=${initialRange.toFixed(
        2
      )}m, current=${currentRange.toFixed(2)}m, diff=${rangeDifference.toFixed(
        2
      )}m (${(rangeDeviationRatio * 100).toFixed(1)}%)`
    );

    // Check if correction is too far off (>10% deviation)
    if (rangeDeviationRatio > maxRangeDeviationRatio) {
      logger.warn(
        `L2C [2D3D|CESIUM|CAMERA] ⚠ Range deviation ${(
          rangeDeviationRatio * 100
        ).toFixed(1)}% exceeds threshold ${(
          maxRangeDeviationRatio * 100
        ).toFixed(1)}% - will restore saved state`
      );
      shouldRestoreSavedState = true;
      break;
    }

    if (currentError <= epsilon) {
      logger.debug(
        `L2C [2D3D|CESIUM|CAMERA] ✓ Converged after ${iterations} iteration(s)`
      );
      break;
    }
  }

  // Restore saved state if corrections went too far off
  if (shouldRestoreSavedState) {
    logger.debug(
      `L2C [2D3D|CESIUM|CAMERA] Restoring saved camera state from initial positioning`
    );
    setViewFromCameraState(camera, savedCameraState);
    scene.requestRender();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  // Always log final range comparison
  const actualFinalCameraHeight = Cartographic.fromCartesian(
    camera.position
  ).height;
  const finalRange = actualFinalCameraHeight - terrainElevation;
  const finalRangeDifference = Math.abs(finalRange - initialRange);
  const finalRangeDeviationRatio = finalRangeDifference / initialRange;

  logger.debug(
    `L2C [2D3D|CESIUM|CAMERA] Final range comparison: initial=${initialRange.toFixed(
      2
    )}m, final=${finalRange.toFixed(2)}m, diff=${finalRangeDifference.toFixed(
      2
    )}m (${(finalRangeDeviationRatio * 100).toFixed(1)}%)`
  );

  if (iterations >= maxMicroCorrections && currentError > epsilon) {
    logger.warn(
      `[2D3D|CESIUM|CAMERA] ⚠ Stopped after ${maxMicroCorrections} micro-corrections, error=${currentError.toFixed(
        4
      )}`
    );
  }

  // Wait one more frame to stabilize before completing
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      scene.requestRender();
      resolve();
    });
  });

  onComplete?.();
  result = true;
  return result;
};
