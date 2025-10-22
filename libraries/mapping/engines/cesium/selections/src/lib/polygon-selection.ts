import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  // TODO: Add these types to cesium/api package to follow architecture rules
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
  type Scene,
} from "cesium";

import {
  addCesiumMarker,
  removeCesiumMarker,
  type MarkerPrimitiveData,
} from "./markers";

import {
  distanceFromZoomLevel,
  polygonHierarchyFromPolygonCoords,
  invertedPolygonHierarchy,
  getElevationAsync,
  tryWithValidScene,
  sceneRequestRender,
} from "@carma-mapping/engines/cesium/core";

const DEFAULT_BOUNDING_SPHERE_ELEVATION = 200; // meters, default elevation for bounding sphere in GeoJSON Polygon
const DEFAULT_BOUNDING_SPHERE_VIEW_MARGIN = 0.2; // 20% margin
const DEFAULT_CESIUM_MARKER_ANCHOR_HEIGHT = 10; // in METERS
const DEFAULT_CESIUM_PITCH_ADJUST_HEIGHT = 1500; // meters
const MAX_FLYTO_DURATION = 10; // seconds
const MIN_GROUND_HEIGHT = -200; // meters
const MAX_GROUND_HEIGHT = 10000; // meters

/**
 * Polygon selection utilities for Cesium scenes
 * Moved from portals package to selections package
 */

export type HitTriggerOptions = {
  classificationType?: ClassificationType;
  markerAsset?: MarkerModelAsset;
  markerAnchorHeight?: number;
  useCameraHeight?: boolean;
  duration: number;
  durationFactor?: number;
  selectedPolygonId?: string;
  invertedSelectedPolygonId?: string;
  skipFlyTo?: boolean;
  skipMarkerUpdate?: boolean;
};

export type MarkerModelAsset = {
  url?: string;
  uri?: string;
  scale?: number;
  heading?: number;
  pitch?: number;
  roll?: number;
  animationSpeed?: number;
  anchorOffset?: { x?: number; y?: number; z?: number };
  fixedScale?: boolean;
  rotation?: boolean | number;
  isCameraFacing?: boolean;
};

export type DerivedGeometries = {
  pos: { lon: number; lat: number };
  zoom: number;
  polygon?: number[][][];
};

export type MarkerPrimitiveData = {
  id: string;
  modelMatrix: any;
  animatedModelMatrix: any;
  animationSpeed: number;
  modelConfig: any;
  model: any;
  stemline: any;
  onPreUpdate?: () => void;
  cleanup?: () => void;
  lastRenderTime?: number;
  selectionKey?: string | number | null;
  selectionTimestamp?: number | null;
};

const getBoundingSphereFromCoordinatesAndHeight = (
  coordinates: number[][],
  height?: number
): BoundingSphere => {
  const positions = coordinates.map(([lng, lat]) =>
    Cartesian3.fromDegrees(lng, lat, height || 0)
  );

  const center = positions.reduce(
    (acc, pos) => Cartesian3.add(acc, pos, new Cartesian3()),
    new Cartesian3()
  );
  Cartesian3.divideByScalar(center, positions.length, center);

  const radius = Math.max(
    ...positions.map((pos) => Cartesian3.distance(center, pos))
  );

  return new BoundingSphere(center, radius);
};

const getFullViewDistance = (
  scene: Scene,
  boundingSphere: BoundingSphere
): number => {
  const camera = scene.camera;
  const frustum = camera.frustum as PerspectiveFrustum;

  if (!frustum.fov) return boundingSphere.radius * 3;

  // Calculate distance to fit bounding sphere in view
  const fovRadians = frustum.fov;
  const aspectRatio = scene.canvas.clientWidth / scene.canvas.clientHeight;
  const verticalFov = aspectRatio < 1 ? fovRadians : fovRadians / aspectRatio;

  return (boundingSphere.radius / Math.sin(verticalFov / 2)) * 1.5;
};

const cesiumLookAtPoint = (
  scene: Scene,
  position: Cartographic,
  zoom: number,
  positionOffset: { height?: number } = {},
  options: {
    durationFactor?: number;
    maxDuration?: number;
    onComplete?: () => void;
    useCameraHeight?: boolean;
  } = {}
) => {
  const { durationFactor = 0.2, maxDuration = 3000, onComplete } = options;

  const heightAboveGround = positionOffset.height || 0;
  const targetHeight = position.height + heightAboveGround;
  const distance = distanceFromZoomLevel(zoom);

  const destination = Cartesian3.fromDegrees(
    position.longitude,
    position.latitude,
    targetHeight
  );

  const range = options.useCameraHeight
    ? scene.camera.positionCartographic.height * 0.8
    : distance;

  tryWithValidScene(scene, () => {
    scene.camera.flyTo({
      destination,
      orientation: {
        heading: scene.camera.heading,
        pitch: -0.5, // Look down at 30 degrees
        roll: 0,
      },
      duration: Math.min(range * durationFactor, maxDuration),
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
      complete: () => {
        console.info("[CESIUM|ANIMATION] Flyto Complete", destination);
        options.onComplete && options.onComplete();
      },
    });
  });
};

const removeGroundPrimitiveById = (scene: Scene, id: string) => {
  tryWithValidScene(scene, () => {
    const primitives = scene.groundPrimitives;
    for (let i = 0; i < primitives.length; i++) {
      const primitive = primitives.get(i);
      if (primitive.id === id) {
        primitives.remove(primitive);
        console.debug("[CESIUM|SELECTION] Removed ground primitive", id);
        break;
      }
    }
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
