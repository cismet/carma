import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  defined,
  EasingFunction,
  Entity,
  GeometryInstance,
  GroundPrimitive,
  HeadingPitchRange,
  HeightReference,
  PerspectiveFrustum,
  PolygonGeometry,
  sampleTerrainMostDetailed,
  Scene,
  Viewer,
} from "cesium";

import {
  addCesiumMarker,
  distanceFromZoomLevel,
  getHeadingPitchRangeFromHeight,
  getHeadingPitchRangeFromZoom,
  invertedPolygonHierarchy,
  pickViewerCanvasCenter,
  polygonHierarchyFromPolygonCoords,
  removeCesiumMarker,
  removeGroundPrimitiveById,
  type CesiumOptions,
  type EntityData,
} from "@carma-mapping/cesium-engine";
import { HitTriggerOptions } from "./cesiumHitTrigger";
import { MutableRefObject } from "react";
import { DerivedGeometries } from "./getDerivedGeometries";
import { map } from "leaflet";

const DEFAULT_BOUNDINGSPHERE_ELEVATION = 200; // meters, default elevation for bounding sphere in GeoJSON Polygon
const DEFAULT_BOUNDINGSPHERE_VIEW_MARGIN = 0.2; // 20% margin
const DEFAULT_CESIUM_MARKER_ANCHOR_HEIGHT = 10; // in METERS
const DEFAULT_CESIUM_PITCH_ADJUST_HEIGHT = 1500; // meters
const MAX_FLYTO_DURATION = 10; // seconds

const getFullViewDistance = (
  viewer: Viewer,
  boundingSphere: BoundingSphere,
  margin: number = DEFAULT_BOUNDINGSPHERE_VIEW_MARGIN
): number => {
  const fovY =
    viewer.camera.frustum instanceof PerspectiveFrustum
      ? viewer.camera.frustum.fov ?? 1
      : 1;

  const aspectRatio = viewer.canvas.clientWidth / viewer.canvas.clientHeight;

  const tanHalfFovY = Math.tan(fovY / 2.0);
  const tanHalfFovX = tanHalfFovY / aspectRatio;

  // The narrowest dimension corresponds to the smaller FOV angle.
  // the smaller angle will have the smaller tangent.
  const tanHalfNarrowestFov = Math.min(tanHalfFovX, tanHalfFovY);

  // To add a margin, make the sphere larger.
  const effectiveRadius = boundingSphere.radius * (1 + margin);

  const distance = effectiveRadius / tanHalfNarrowestFov;

  return distance;
};

const getBoundingSphereFromCoordinatesAndHeight = (
  coordinates: number[][],
  height: number = DEFAULT_BOUNDINGSPHERE_ELEVATION
): BoundingSphere => {
  const points = coordinates.map((coord) =>
    Cartesian3.fromDegrees(coord[0], coord[1], coord[2] ?? height)
  );
  return BoundingSphere.fromPoints(points);
};

const updateMarkerPosition = async (
  viewer: Viewer,
  groundPosition: Cartographic,
  entityData: EntityData | null,
  setEntityData: (data: EntityData | null) => void | null,
  { markerAsset, markerAnchorHeight }
) => {
  if (!viewer || viewer.isDestroyed()) {
    console.warn("updateMarkerPosition: viewer is not ready or destroyed");
    return;
  }
  const { scene } = viewer;
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
    viewer.scene.terrainProvider
  );
  const model = entityData?.model;
  entityData && removeCesiumMarker(viewer, entityData);
  scene.requestRender(); // explicit render for requestRenderMode;
  if (markerAsset) {
    const data = await addCesiumMarker(
      viewer,
      anchorPosition,
      groundPosition,
      markerAsset,
      model
    );
    setEntityData && setEntityData(data);
  }
};

const cesiumLookAtPoint = async (
  viewer: Viewer,
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
  const { scene } = viewer;
  if (scene) {
    const currentCenterPos = pickViewerCanvasCenter(viewer).scenePosition;
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
        "[CESIUM|ANIMATION] FlytoBoundingSphere duration too long, clamped to",
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
  }
};

const handlePolygonSelection = (
  viewer: Viewer,
  shouldFlyToRef: MutableRefObject<boolean>,
  groundPosition: Cartographic | null,
  polygon: number[][][],
  idSelected: string,
  idInverted: string,
  duration: number,
  { isPrimaryStyle }: CesiumOptions
) => {
  const { scene } = viewer;

  const polygonEntity = new Entity({
    id: idSelected,
    polygon: {
      hierarchy: polygonHierarchyFromPolygonCoords(polygon),
      material: Color.WHITE.withAlpha(0.01),
      outline: false,
      closeBottom: false,
      closeTop: false,
      // needs some Geometry for proper fly to and centering in correct elevation
      extrudedHeight: 1, // falls jemand die Absicht hat eine Mauer zu errichten, kann dies hier getan werden.
      extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
      height: 0, // height reference needs top compensate for some terrain variation minus the mount point of the polygon to ground
      heightReference: HeightReference.RELATIVE_TO_GROUND,
    },
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
    classificationType: isPrimaryStyle
      ? ClassificationType.CESIUM_3D_TILE
      : ClassificationType.BOTH,
  });

  scene.groundPrimitives.add(invertedGroundPrimitive);
  viewer.entities.add(polygonEntity);
  //viewer.entities.add(invertedPolygonEntity);

  const boundingSphere = getBoundingSphereFromCoordinatesAndHeight(
    polygon[0],
    groundPosition?.height
  );

  const fullViewDistance = getFullViewDistance(viewer, boundingSphere);
  console.debug(
    "GAZETTEER: [2D3D|CESIUM|CAMERA] flyTo BoundingSphere",
    boundingSphere.radius,
    boundingSphere.center,
    groundPosition?.height,
    fullViewDistance,
    (viewer.camera.frustum as any).fov
  );

  viewer.camera.flyToBoundingSphere(boundingSphere, {
    duration,
    offset: new HeadingPitchRange(0, viewer.camera.pitch, fullViewDistance),
    complete: () => {
      shouldFlyToRef.current = false;
      console.debug(
        "GAZETTEER: [2D3D|CESIUM|CAMERA] flyToBoundingSphere completed"
      );
    },
  });
};
export const cesiumHandleSelection = async (
  viewer: Viewer,
  shouldFlyToRef: MutableRefObject<boolean>,
  entityData: null | EntityData,
  setEntityData: (data: EntityData | null) => void,
  { pos, zoom, polygon }: DerivedGeometries,
  options: HitTriggerOptions
) => {
  if (!viewer || viewer.isDestroyed()) {
    console.warn("cesiumLookAt: viewer is not ready or destroyed");
    return;
  }

  const { scene } = viewer;
  const { mapOptions, duration, durationFactor = 0.2 } = options;

  const idSelected = options.selectedPolygonId ?? "selected-polygon";
  const idInverted =
    options.invertedSelectedPolygonId ?? "inverted-selected-polygon";

  const {
    surfaceProviderRef,
    terrainProviderRef,
    markerAsset,
    markerAnchorHeight,
  } = mapOptions;

  // cleanup previous selection
  // todo only remove polygons, try to update existing entities for marker and polylines
  entityData && removeCesiumMarker(viewer, entityData);
  viewer.entities.removeById(idSelected);
  //viewer.entities.removeById(INVERTED_SELECTED_POLYGON_ID);
  removeGroundPrimitiveById(viewer, idInverted);
  scene.requestRender(); // explicit render for requestRenderMode;

  const posCarto = Cartographic.fromDegrees(pos.lon, pos.lat, 0);

  const terrainProvider =
    surfaceProviderRef.current ?? terrainProviderRef.current;

  if (!terrainProvider) {
    console.warn(
      "no terrain provider found, cant place marker without elevation"
    );
    return;
  }

  const [groundPosition] = await sampleTerrainMostDetailed(
    terrainProvider,
    [posCarto],
    true
  );

  if (polygon) {
    handlePolygonSelection(
      viewer,
      shouldFlyToRef,
      groundPosition,
      polygon,
      idSelected,
      idInverted,
      duration,
      mapOptions
    );
  } else if (defined(groundPosition)) {
    if (markerAsset) {
      updateMarkerPosition(viewer, groundPosition, entityData, setEntityData, {
        markerAsset,
        markerAnchorHeight,
      });
    }

    shouldFlyToRef.current &&
      cesiumLookAtPoint(viewer, groundPosition, zoom, mapOptions, {
        onComplete: () => {
          shouldFlyToRef.current = false;
          console.debug("GAZETTEER: [2D3D|CESIUM|CAMERA] flyTo Point complete");
        },
        //onComplete: delayedMarker,
        durationFactor,
        maxDuration: duration,
        useCameraHeight: options.useCameraHeight,
      });
    console.debug(
      "GAZETTEER: [2D3D|CESIUM|CAMERA] look at Marker (Terrain Elevation)"
    );
  } else {
    console.warn("no ground position found");
  }
};
