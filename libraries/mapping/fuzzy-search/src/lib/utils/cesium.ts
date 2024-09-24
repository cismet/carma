import {
  HeadingPitchRange,
  Math as CMath,
  Scene,
  Cartographic,
  Cartesian3,
  GroundPrimitive,
  PolygonHierarchy,
  Viewer,
  Model,
  sampleTerrainMostDetailed,
} from "cesium";

export const distanceFromZoomLevel = (zoom: number) => {
  return 40000000 / Math.pow(2, zoom);
};

export const getHeadingPitchRangeFromZoom = (
  zoom: number,
  headingDeg = 0,
  pitchDeg = 60,
) => {
  const range = distanceFromZoomLevel(zoom);
  const heading = CMath.toRadians(headingDeg);
  const pitch = CMath.toRadians(pitchDeg);
  return new HeadingPitchRange(heading, pitch, range);
};

export const getPositionWithHeightAsync = async (
  scene: Scene,
  position: Cartographic,
) => {
  const terrainProvider = scene.globe.terrainProvider;
  console.log("[CESIUM|TERRAIN] terrainProvider", terrainProvider, position);
  return sampleTerrainMostDetailed(terrainProvider, [position]).then(
    (updatedPositions: Cartographic[]) => {
      const cartoPos = updatedPositions[0];
      if (cartoPos instanceof Cartographic) {
        console.info("[CESIUM|TERRAIN] sampledTerrain for position", position, cartoPos);
        return cartoPos;
      } else {
        console.warn(
          "[CESIUM|TERRAIN] could not get elevation for position",
          position,
          cartoPos,
        );
        return position;
      }
    },
  );
};

export const polygonHierarchyFromPolygonCoords = (
  polygonCoords: number[][][],
) => {
  // [positions, hole1, hole2, ...]
  const [positions, ...holes] = polygonCoords;

  const hierarchy = new PolygonHierarchy(
    Cartesian3.fromDegreesArray(positions.flat()),
    holes.map(
      (hole: number[][]) =>
        new PolygonHierarchy(Cartesian3.fromDegreesArray(hole.flat())),
    ),
  );
  return hierarchy;
};

// WUPPERTAL EXTENT PLUS SOME PADDING
const LAT_PADDING = 8;
const LON_PADDING = 5;
const LAT_MIN = 51.16 - LAT_PADDING;
const LAT_MAX = 51.33 + LAT_PADDING;
const LON_MIN = 7.0 - LON_PADDING;
const LON_MAX = 7.32 + LON_PADDING;

export const invertedPolygonHierarchy = (
  [polygon]: number[][][],
  outerPolygon = [
    [LON_MIN, LAT_MIN],
    [LON_MIN, LAT_MAX],
    [LON_MAX, LAT_MAX],
    [LON_MAX, LAT_MIN],
    [LON_MIN, LAT_MIN],
  ],
) => polygonHierarchyFromPolygonCoords([outerPolygon, polygon]);

export const removeCesiumMarker = (
  viewer: Viewer,
  markerModel?: Model | null,
) => {
  if (markerModel) {
    viewer.scene.primitives.remove(markerModel);
    markerModel = null;
  } else {
    console.info("no Marker found to remove");
  }

  //removePreRenderListener(viewer);
};

export function getGroundPrimitiveById(
  viewer: Viewer,
  id: string,
): GroundPrimitive | null {
  const groundPrimitives = viewer.scene.groundPrimitives;

  for (let i = 0; i < groundPrimitives.length; ++i) {
    const primitive = groundPrimitives.get(i);
    if (primitive instanceof GroundPrimitive) {
      // Check if the primitive's geometryInstances has the matching id
      // needs that
      // releaseGeometryInstances: false
      // on the primitive constructor, not other obvious way to get the id of it otherwise.
      if (Array.isArray(primitive.geometryInstances)) {
        for (const instance of primitive.geometryInstances) {
          if (instance.id === id) {
            return primitive;
          }
        }
      } else if (primitive.geometryInstances?.id === id) {
        return primitive;
      }
    }
  }
  return null;
}

export function removeGroundPrimitiveById(viewer: Viewer, id: string): boolean {
  const primitive = getGroundPrimitiveById(viewer, id);
  primitive && viewer.scene.groundPrimitives.remove(primitive);
  return false;
}
