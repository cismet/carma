import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  CesiumTerrainProvider,
  EasingFunction,
  Scene,
  defined,
  type Model,
} from "cesium";

import {
  addCesiumMarker,
  distanceFromZoomLevel,
  getElevationAsync,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
  removeCesiumMarker,
  type MarkerPrimitiveData,
} from "@carma-mapping/engines/cesium";

import type { HitTriggerOptions } from "./cesium-selection-types";
import { DerivedGeometries } from "./getDerivedGeometries";

const DEFAULT_CESIUM_MARKER_ANCHOR_HEIGHT = 10; // in METERS
const DEFAULT_CESIUM_PITCH_ADJUST_HEIGHT = 1500; // meters
const MAX_FLYTO_DURATION = 10; // seconds
const MIN_GROUND_HEIGHT = -200; // meters
const MAX_GROUND_HEIGHT = 10000; // meters

const updateMarkerPosition = async (
  scene: Scene,
  groundPosition: Cartographic,
  markerData: MarkerPrimitiveData | null,
  setMarkerData: (data: MarkerPrimitiveData | null) => void | null,
  { markerAsset, markerAnchorHeight }
) => {
  try {
    const anchorHeightOffset =
      markerAnchorHeight ?? DEFAULT_CESIUM_MARKER_ANCHOR_HEIGHT;
    const anchorPosition = groundPosition.clone();
    anchorPosition.height = anchorPosition.height + anchorHeightOffset;
    console.debug(
      "GAZETTEER: [2D3D|CESIUM|CAMERA] adding marker at Marker (Surface/Terrain Elevation)",
      anchorPosition.height,
      groundPosition.height,
      anchorHeightOffset,
      anchorPosition,
      groundPosition,
      scene.terrainProvider
    );
    // Only reuse an existing model if it is not destroyed. The caller already
    // performed cleanup of previous marker primitives; avoid double-removal here.
    const existing = markerData?.model;
    const canReuseModel = Boolean(
      existing &&
        typeof (existing as unknown as Model).isDestroyed === "function" &&
        !existing.isDestroyed()
    );
    const model = canReuseModel ? existing : undefined;

    if (markerAsset) {
      const data = await addCesiumMarker(
        scene,
        anchorPosition,
        groundPosition,
        markerAsset,
        { model }
      );
      if (data) {
        setMarkerData?.(data);
      }
    }
  } catch (e) {
    console.error("[CESIUM|MARKER] error adding marker", e);
  }
};

const cesiumLookAtPoint = async (
  scene: Scene,
  targetPosition: Cartographic,
  zoom: number,
  cesiumConfig: { pitchAdjustHeight?: number } = {},
  options: {
    onComplete?: Function;
    maxDuration?: number;
    durationFactor?: number;
    useCameraHeight?: boolean;
  } = {}
) => {
  // Use camera position directly instead of picking from scene
  // This avoids framebuffer operations that can fail for whatever reason
  const currentCenterPos = scene.camera.positionWC;
  const center = Cartographic.toCartesian(targetPosition);

  const maxDuration = options.maxDuration ?? MAX_FLYTO_DURATION;

  let duration = maxDuration;

  const distanceTargets = Cartesian3.distance(currentCenterPos, center);

  // Calculate current range from camera to its look-at point
  // Use camera height above ground as approximation for range
  const cameraCartographic = scene.camera.positionCartographic;
  const currentRange = cameraCartographic.height;

  const hpr = getHeadingPitchRangeFromZoom(zoom - 1, scene.camera);
  const range = distanceFromZoomLevel(zoom - 2);

  // TODO ADD TEST FOR DURATION FACTOR
  duration =
    Math.pow(
      distanceTargets + Math.abs(currentRange - range) / currentRange,
      1 / 3
    ) * (options.durationFactor ?? 1);

  console.info(
    "[CESIUM|SEARCH|CAMERA] move duration",
    duration,
    distanceTargets
  );

  if (duration > maxDuration) {
    console.info(
      "[CESIUM|ANIMATION] FlyToBoundingSphere duration too long, clamped to",
      duration,
      maxDuration
    );
    duration = maxDuration;
  }

  //TODO optional add responsive duration based on distance of target

  scene.camera.flyToBoundingSphere(new BoundingSphere(center, range), {
    offset: hpr,
    duration,
    pitchAdjustHeight:
      cesiumConfig.pitchAdjustHeight ?? DEFAULT_CESIUM_PITCH_ADJUST_HEIGHT,
    easingFunction: EasingFunction.QUADRATIC_IN_OUT,
    complete: () => {
      console.info("[CESIUM|ANIMATION] FlytoBoundingSphere Complete", center);
      options.onComplete && options.onComplete();
    },
  });
};

export const cesiumHandlePointSelection = async (
  scene: Scene,
  terrainProvider: CesiumTerrainProvider,
  surfaceProvider: CesiumTerrainProvider,
  markerData: null | MarkerPrimitiveData,
  setMarkerData: (data: MarkerPrimitiveData | null) => void,
  { pos, zoom }: DerivedGeometries,
  options: HitTriggerOptions
) => {
  const { mapOptions, duration, durationFactor = 0.2 } = options;

  const { markerAsset, markerAnchorHeight } = mapOptions;

  const skipMarkerUpdate = Boolean(options.skipMarkerUpdate);

  // cleanup previous marker
  if (!skipMarkerUpdate) {
    if (markerData) removeCesiumMarker(scene, markerData);
    scene.requestRender();
  }

  const posCarto = Cartographic.fromDegrees(pos.lon, pos.lat, 0);

  const [posResult] = await getElevationAsync(
    terrainProvider,
    surfaceProvider,
    [posCarto]
  );

  if (!posResult) {
    console.warn("no ground position found for marker");
    return;
  }

  const { terrain, surface: surfacePosition } = posResult;

  if (
    !surfacePosition ||
    surfacePosition.height < MIN_GROUND_HEIGHT ||
    surfacePosition.height > MAX_GROUND_HEIGHT
  ) {
    console.warn("invalid ground position found for marker", surfacePosition);
    return;
  }

  console.debug(
    "GAZETTEER: [2D3D|CESIUM|MARKER] ground position",
    terrain,
    surfacePosition
  );

  const skipFlyTo = Boolean(options.skipFlyTo);

  if (!defined(posResult)) {
    console.warn("no ground position found");
    return;
  }

  if (markerData?.model?.isDestroyed()) {
    console.debug(
      "marker model destroyed (likely scene transition), will reinitialize"
    );
  }

  if (markerAsset && !skipMarkerUpdate) {
    updateMarkerPosition(scene, surfacePosition, markerData, setMarkerData, {
      markerAsset,
      markerAnchorHeight,
    });
  }

  if (!skipFlyTo) {
    cesiumLookAtPoint(scene, surfacePosition, zoom, mapOptions, {
      onComplete: () => {
        console.debug("GAZETTEER: [2D3D|CESIUM|CAMERA] flyTo Point complete");
      },
      durationFactor,
      maxDuration: duration,
    });
    console.debug(
      "GAZETTEER: [2D3D|CESIUM|CAMERA] look at Marker (Terrain Elevation)"
    );
  }
};
