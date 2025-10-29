/**
 * cesiumHandleSelection - PARTIALLY RESTORED
 *
 * This file handles Cesium selection logic including:
 * - Camera flyTo operations for selection
 * - Terrain elevation calculations
 * - Ground primitive creation/removal
 *
 * MARKER FUNCTIONALITY STILL DISABLED:
 * - addCesiumMarker, removeCesiumMarker
 * - MarkerPrimitiveData, MarkerModelAsset
 *
 * TODO: Restore marker functionality when asset system is properly configured
 */

import type { SearchResultItem } from "@carma/types";
import type { Scene } from "@carma/cesium";

export interface DerivedGeometries {
  pos: { lon: number; lat: number };
  zoom: number;
  polygon?: number[][][];
}

export type HitTriggerOptions = {
  classificationType?: ClassificationType;
  markerAsset?: any; // TODO: MarkerModelAsset when marker imports are fixed
  markerAnchorHeight?: number;
  useCameraHeight?: boolean;
  duration: number; // duration for flyTo
  durationFactor?: number; // dynamic flyTo duration factor,
  selectedPolygonId?: string;
  invertedSelectedPolygonId?: string;
  skipFlyTo?: boolean;
  skipMarkerUpdate?: boolean;
};

import {
  distanceFromZoomLevel,
  getElevationAsync,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
  invertedPolygonHierarchy,
  pickSceneCenter,
  polygonHierarchyFromPolygonCoords,
  removeGroundPrimitiveById,
  tryWithValidScene,
  sceneRequestRender,
  isValidScene,
} from "@carma/cesium";

import {
  BoundingSphere,
  Cartesian3,
  GroundPrimitive,
  HeadingPitchRange,
  PerspectiveFrustum,
  PolygonGeometry,
  type Model,
  Cartographic,
  ClassificationType,
  defined,
} from "@carma/cesium";
import { Easing } from "@carma-commons/math";

// =============================================================================
// MARKER-RELATED IMPORTS - STILL COMMENTED OUT
// =============================================================================
/*
import {
  addCesiumMarker,
  removeCesiumMarker,
  type MarkerPrimitiveData,
  type MarkerModelAsset,
} from "./markers";
*/

// =============================================================================
// CONSTANTS - KEEP THESE FOR LATER USE
// =============================================================================
const DEFAULT_BOUNDING_SPHERE_ELEVATION = 200; // meters, default elevation for bounding sphere in GeoJSON Polygon
const DEFAULT_BOUNDING_SPHERE_VIEW_MARGIN = 0.2; // 20% margin
const DEFAULT_CESIUM_MARKER_ANCHOR_HEIGHT = 10; // in METERS
const DEFAULT_CESIUM_PITCH_ADJUST_HEIGHT = 1500; // meters
const MAX_FLYTO_DURATION = 10; // seconds
const MIN_GROUND_HEIGHT = -200; // meters
const MAX_GROUND_HEIGHT = 10000; // meters

// =============================================================================
// GEOMETRY CREATION UTILITIES - KEEP THESE WORKING
// =============================================================================
const getFullViewDistance = (
  scene: Scene,
  boundingSphere: BoundingSphere,
  margin: number = DEFAULT_BOUNDING_SPHERE_VIEW_MARGIN
): number => {
  let distance = 0;
  if (!isValidScene(scene)) {
    console.error("[CESIUM|ANIMATION] Invalid scene");
    return distance;
  }
  const { camera, canvas } = scene;

  const fovY =
    camera.frustum instanceof PerspectiveFrustum ? camera.frustum.fov ?? 1 : 1;

  const aspectRatio = canvas.clientWidth / canvas.clientHeight;

  const tanHalfFovY = Math.tan(fovY / 2.0);
  const tanHalfFovX = tanHalfFovY / aspectRatio;

  // The narrowest dimension corresponds to the smaller FOV angle.
  // the smaller angle will have the smaller tangent.
  const tanHalfNarrowestFov = Math.min(tanHalfFovX, tanHalfFovY);

  // To add a margin, make the sphere larger.
  const effectiveRadius = boundingSphere.radius * (1 + margin);

  distance = effectiveRadius / tanHalfNarrowestFov;

  return distance;
};

const getBoundingSphereFromCoordinatesAndHeight = (
  coordinates: number[][],
  height: number = DEFAULT_BOUNDING_SPHERE_ELEVATION
): BoundingSphere => {
  const points = coordinates.map((coord) =>
    Cartesian3.fromDegrees(coord[0], coord[1], coord[2] ?? height)
  );
  return BoundingSphere.fromPoints(points);
};

const updateMarkerPosition = async (
  scene: Scene,
  groundPosition: Cartographic,
  markerData: any, // TODO: MarkerPrimitiveData when marker imports are fixed
  setMarkerData: any, // TODO: proper type when marker imports are fixed
  { markerAsset, markerAnchorHeight }: any
) => {
  tryWithValidScene(scene, async () => {
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
    // TODO: Restore Model when imports are fixed
    // const existing = markerData?.model;
    // const canReuseModel = Boolean(
    //   existing &&
    //     typeof (existing as unknown as Model).isDestroyed === "function" &&
    //     !existing.isDestroyed()
    // );
    // const model = canReuseModel ? existing : undefined;

    // MARKER FUNCTIONALITY DISABLED - restore when asset system is ready
    // if (markerAsset) {
    //   const data = await addCesiumMarker(
    //     scene,
    //     anchorPosition,
    //     groundPosition,
    //     markerAsset,
    //     { model }
    //   );
    //   if (data) {
    //     setMarkerData?.(data);
    //   }
    // }
  });

  console.warn(
    "[updateMarkerPosition] Marker functionality disabled - only positioning logic active"
  );
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
  const currentCenterPos = pickSceneCenter(scene).scenePosition;
  const center = Cartographic.toCartesian(targetPosition);

  const maxDuration = options.maxDuration ?? MAX_FLYTO_DURATION;

  let duration = maxDuration;

  if (!currentCenterPos) {
    return;
  }

  const distanceTargets = Cartesian3.distance(currentCenterPos, center);
  const currentRange = Cartesian3.distance(
    currentCenterPos,
    scene.camera.position
  );

  const hpr = options.useCameraHeight
    ? getHeadingPitchRangeFromHeight(scene.camera, targetPosition)
    : getHeadingPitchRangeFromZoom(zoom - 1, scene.camera);
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
    easingFunction: Easing.QUADRATIC_IN_OUT,
    complete: () => {
      console.info("[CESIUM|ANIMATION] FlytoBoundingSphere Complete", center);
      options.onComplete && options.onComplete();
    },
  });
};

// =============================================================================
// MAIN SELECTION FUNCTION
// =============================================================================
export const cesiumHandleSelection = async (
  markerData: any, // TODO: MarkerPrimitiveData when marker imports are fixed
  setMarkerData: (data: any) => void, // TODO: proper type when marker imports are fixed
  { pos, zoom, polygon }: DerivedGeometries,
  options: HitTriggerOptions
) => {
  const {
    markerAsset,
    markerAnchorHeight,
    classificationType = ClassificationType.BOTH,
    duration,
    durationFactor = 0.2,
  } = options;

  const idSelected = options.selectedPolygonId ?? "selected-polygon";
  const idInverted =
    options.invertedSelectedPolygonId ?? "inverted-selected-polygon";

  const skipMarkerUpdate = Boolean(options.skipMarkerUpdate);

  return async (terrainProvider, surfaceProvider, scene) => {
    // cleanup previous selection - use scene primitives only

    if (!skipMarkerUpdate) {
      // MARKER CLEANUP DISABLED - restore when marker system is ready
      // if (markerData) removeCesiumMarker(scene, markerData);
      tryWithValidScene(scene, () => {
        removeGroundPrimitiveById(scene, idSelected);
        removeGroundPrimitiveById(scene, idInverted);
        sceneRequestRender(scene);
      });
    }

    const posCarto = Cartographic.fromDegrees(pos.lon, pos.lat, 0);

    let posResult;
    try {
      [posResult] = await getElevationAsync(surfaceProvider, terrainProvider, [
        posCarto,
      ]);
    } catch (error) {
      console.warn("failed to get elevation for marker", error);
      return;
    }

    const { terrain: terrainPosition, surface: surfacePositionRaw } = posResult;
    const surfacePosition = surfacePositionRaw ?? terrainPosition;

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
      terrainPosition,
      surfacePosition
    );

    const skipFlyTo = Boolean(options.skipFlyTo);

    if (polygon) {
      if (!skipMarkerUpdate) {
        // POLYGON HANDLING DISABLED - restore when geometry system is ready
        // handlePolygonSelection(
        //   scene,
        //   surfacePosition, // fly to surface elevation
        //   polygon,
        //   idSelected,
        //   idInverted,
        //   duration,
        //   classificationType,
        //   skipFlyTo
        // );
      }

      if (!skipFlyTo) {
        cesiumLookAtPoint(
          scene,
          surfacePosition,
          zoom,
          {},
          {
            onComplete: () => {
              console.debug(
                "GAZETTEER: [2D3D|CESIUM|CAMERA] flyTo Point complete"
              );
            },
            durationFactor,
            maxDuration: duration,
            useCameraHeight: options.useCameraHeight,
          }
        );
        console.debug(
          "GAZETTEER: [2D3D|CESIUM|CAMERA] look at Marker (Surface Elevation)"
        );
      }
    } else if (defined(posResult)) {
      // MARKER HANDLING DISABLED - restore when marker system is ready
      // if (markerData?.model?.isDestroyed()) {
      //   console.debug(
      //     "marker model destroyed (likely scene transition), will reinitialize"
      //   );
      // }

      if (markerAsset && !skipMarkerUpdate) {
        updateMarkerPosition(
          scene,
          surfacePosition,
          markerData,
          setMarkerData,
          {
            markerAnchorHeight,
          }
        );
        console.debug(
          "GAZETTEER: [2D3D|CESIUM|CAMERA] look at Marker (Terrain Elevation)"
        );
      }
    } else {
      console.warn("no ground position found");
    }
  };
};
