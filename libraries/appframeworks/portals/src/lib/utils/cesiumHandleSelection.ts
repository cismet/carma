import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  defined,
  EasingFunction,
  GeometryInstance,
  GroundPrimitive,
  HeadingPitchRange,
  PerspectiveFrustum,
  PolygonGeometry,
  type Model,
  Scene,
} from "cesium";

import {
  addCesiumMarker,
  distanceFromZoomLevel,
  getElevationAsync,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
  invertedPolygonHierarchy,
  pickSceneCenter,
  polygonHierarchyFromPolygonCoords,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  type MarkerPrimitiveData,
} from "@carma-mapping/engines/cesium";

import { HitTriggerOptions } from "./cesiumHitTrigger";
import { DerivedGeometries } from "./getDerivedGeometries";
import {
  tryWithValidScene,
  sceneRequestRender,
  isValidScene,
} from "@carma-mapping/engines/cesium";

const DEFAULT_BOUNDING_SPHERE_ELEVATION = 200; // meters, default elevation for bounding sphere in GeoJSON Polygon
const DEFAULT_BOUNDING_SPHERE_VIEW_MARGIN = 0.2; // 20% margin
const DEFAULT_CESIUM_MARKER_ANCHOR_HEIGHT = 10; // in METERS
const DEFAULT_CESIUM_PITCH_ADJUST_HEIGHT = 1500; // meters
const MAX_FLYTO_DURATION = 10; // seconds
const MIN_GROUND_HEIGHT = -200; // meters
const MAX_GROUND_HEIGHT = 10000; // meters

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
  markerData: MarkerPrimitiveData | null,
  setMarkerData: (data: MarkerPrimitiveData | null) => void | null,
  { markerAsset, markerAnchorHeight }
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
  });
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
    easingFunction: EasingFunction.QUADRATIC_IN_OUT,
    complete: () => {
      console.info("[CESIUM|ANIMATION] FlytoBoundingSphere Complete", center);
      options.onComplete && options.onComplete();
    },
  });
};

const handlePolygonSelection = (
  scene: Scene,
  groundPosition: Cartographic | null,
  polygon: number[][][],
  idSelected: string,
  idInverted: string,
  duration: number,
  classificationType: ClassificationType,
  skipFlyTo: boolean
) => {
  // Convert polygon to GroundPrimitive instead of Entity
  const selectedPolygonGeometry = new PolygonGeometry({
    polygonHierarchy: polygonHierarchyFromPolygonCoords(polygon),
    extrudedHeight: 1,
    height: 0,
  });

  const selectedGeometryInstance = new GeometryInstance({
    geometry: selectedPolygonGeometry,
    id: idSelected,
    attributes: {
      color: ColorGeometryInstanceAttribute.fromColor(
        Color.WHITE.withAlpha(0.01)
      ),
    },
  });

  const selectedGroundPrimitive = new GroundPrimitive({
    geometryInstances: selectedGeometryInstance,
    allowPicking: false,
    releaseGeometryInstances: false,
    classificationType,
  });
  // For the inverted polygon
  const invertedPolygonGeometry = new PolygonGeometry({
    polygonHierarchy: invertedPolygonHierarchy(polygon),
    //height: 0,
  });

  const invertedGeometryInstance = new GeometryInstance({
    geometry: invertedPolygonGeometry,
    id: idInverted,
    attributes: {
      color: ColorGeometryInstanceAttribute.fromColor(
        Color.GRAY.withAlpha(0.66)
      ),
    },
  });

  const invertedGroundPrimitive = new GroundPrimitive({
    geometryInstances: invertedGeometryInstance,
    allowPicking: false,
    releaseGeometryInstances: false, // needed to get ID
    classificationType,
  });

  tryWithValidScene(scene, () => {
    scene.groundPrimitives.add(selectedGroundPrimitive);
    scene.groundPrimitives.add(invertedGroundPrimitive);
  });

  if (!skipFlyTo) {
    const boundingSphere = getBoundingSphereFromCoordinatesAndHeight(
      polygon[0],
      groundPosition?.height
    );

    const fullViewDistance = getFullViewDistance(scene, boundingSphere);
    console.debug(
      "GAZETTEER: [2D3D|CESIUM|CAMERA] flyTo BoundingSphere",
      boundingSphere.radius,
      boundingSphere.center,
      groundPosition?.height,
      fullViewDistance,
      (scene.camera.frustum as PerspectiveFrustum).fov
    );

    tryWithValidScene(scene, () => {
      scene.camera.flyToBoundingSphere(boundingSphere, {
        duration,
        offset: new HeadingPitchRange(0, scene.camera.pitch, fullViewDistance),
        complete: () => {
          console.debug(
            "GAZETTEER: [2D3D|CESIUM|CAMERA] flyToBoundingSphere completed"
          );
        },
      });
    });
  }
};
export const cesiumHandleSelection = async (
  markerData: null | MarkerPrimitiveData,
  setMarkerData: (data: MarkerPrimitiveData | null) => void,
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

  async (terrainProvider, surfaceProvider, scene) => {
    // cleanup previous selection - use scene primitives only

    if (!skipMarkerUpdate) {
      if (markerData) removeCesiumMarker(scene, markerData);
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
        handlePolygonSelection(
          scene,
          surfacePosition, // fly to surface elevation
          polygon,
          idSelected,
          idInverted,
          duration,
          classificationType,
          skipFlyTo
        );
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
      if (markerData?.model?.isDestroyed()) {
        console.debug(
          "marker model destroyed (likely scene transition), will reinitialize"
        );
      }

      if (markerAsset && !skipMarkerUpdate) {
        updateMarkerPosition(
          scene,
          surfacePosition,
          markerData,
          setMarkerData,
          {
            markerAsset,
            markerAnchorHeight,
          }
        );
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
          "GAZETTEER: [2D3D|CESIUM|CAMERA] look at Marker (Terrain Elevation)"
        );
      }
    } else {
      console.warn("no ground position found");
    }
  };
};
