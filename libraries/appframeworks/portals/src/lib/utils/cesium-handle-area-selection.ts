import {
  BoundingSphere,
  Cartesian3,
  Cartographic,
  CesiumTerrainProvider,
  ClassificationType,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  GroundPrimitive,
  HeadingPitchRange,
  PerspectiveFrustum,
  PolygonGeometry,
  Scene,
} from "cesium";

import {
  getElevationAsync,
  invertedPolygonHierarchy,
  polygonHierarchyFromPolygonCoords,
  removeGroundPrimitiveById,
  type CesiumOptions,
} from "@carma-mapping/engines/cesium";

import type { HitTriggerOptions } from "./cesium-selection-types";
import { DerivedGeometries } from "./getDerivedGeometries";

const DEFAULT_BOUNDING_SPHERE_ELEVATION = 200; // meters, default elevation for bounding sphere in GeoJSON Polygon
const DEFAULT_BOUNDING_SPHERE_VIEW_MARGIN = 0.2; // 20% margin
const MIN_GROUND_HEIGHT = -200; // meters
const MAX_GROUND_HEIGHT = 10000; // meters

const getFullViewDistance = (
  scene: Scene,
  boundingSphere: BoundingSphere,
  margin: number = DEFAULT_BOUNDING_SPHERE_VIEW_MARGIN
): number => {
  let distance = 0;
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

const handlePolygonSelection = (
  scene: Scene,
  groundPosition: Cartographic | null,
  polygon: number[][][],
  idSelected: string,
  idInverted: string,
  duration: number,
  { isPrimaryStyle }: CesiumOptions,
  skipFlyTo: boolean,
  skipMarkerUpdate: boolean
) => {
  // Add/update polygon geometry only if not skipping marker update
  if (!skipMarkerUpdate) {
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
      classificationType: isPrimaryStyle
        ? ClassificationType.CESIUM_3D_TILE
        : ClassificationType.BOTH,
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

    scene.groundPrimitives.add(selectedGroundPrimitive);
    scene.groundPrimitives.add(invertedGroundPrimitive);
  }

  // Always handle flyTo logic (independent of marker update)
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
      (scene.camera.frustum as { fov: number }).fov
    );

    scene.camera.flyToBoundingSphere(boundingSphere, {
      duration,
      offset: new HeadingPitchRange(0, scene.camera.pitch, fullViewDistance),
      complete: () => {
        console.debug(
          "GAZETTEER: [2D3D|CESIUM|CAMERA] flyToBoundingSphere completed"
        );
      },
    });
  }
};

export const cesiumHandleAreaSelection = async (
  scene: Scene,
  terrainProvider: CesiumTerrainProvider,
  surfaceProvider: CesiumTerrainProvider,
  { pos, polygon }: DerivedGeometries,
  options: HitTriggerOptions
) => {
  const { mapOptions, duration } = options;

  const idSelected = options.selectedPolygonId ?? "selected-polygon";
  const idInverted =
    options.invertedSelectedPolygonId ?? "inverted-selected-polygon";

  const skipMarkerUpdate = Boolean(options.skipMarkerUpdate);
  const skipFlyTo = Boolean(options.skipFlyTo);

  // cleanup previous selection - use scene primitives only
  if (!skipMarkerUpdate) {
    removeGroundPrimitiveById(scene, idSelected);
    removeGroundPrimitiveById(scene, idInverted);
    scene.requestRender();
  }

  const posCarto = Cartographic.fromDegrees(pos.lon, pos.lat, 0);

  const [posResult] = await getElevationAsync(
    terrainProvider,
    surfaceProvider,
    [posCarto]
  );

  if (!posResult) {
    console.warn("no ground position found for area");
    return;
  }

  const { terrain, surface: surfacePosition } = posResult;

  if (
    !surfacePosition ||
    surfacePosition.height < MIN_GROUND_HEIGHT ||
    surfacePosition.height > MAX_GROUND_HEIGHT
  ) {
    console.warn("invalid ground position found for area", surfacePosition);
    return;
  }

  console.debug(
    "GAZETTEER: [2D3D|CESIUM|AREA] ground position",
    terrain,
    surfacePosition
  );

  if (polygon) {
    handlePolygonSelection(
      scene,
      surfacePosition,
      polygon,
      idSelected,
      idInverted,
      duration,
      mapOptions,
      skipFlyTo,
      skipMarkerUpdate
    );
  }
};
