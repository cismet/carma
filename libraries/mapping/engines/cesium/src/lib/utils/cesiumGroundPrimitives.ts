import {
  Cartesian3,
  GroundPrimitive,
  PolygonHierarchy,
  Viewer,
  Model,
} from "cesium";

export const polygonHierarchyFromPolygonCoords = (
  polygonCoords: number[][][]
) => {
  // [positions, hole1, hole2, ...]
  const [positions, ...holes] = polygonCoords;

  const hierarchy = new PolygonHierarchy(
    Cartesian3.fromDegreesArray(positions.flat()),
    holes.map(
      (hole: number[][]) =>
        new PolygonHierarchy(Cartesian3.fromDegreesArray(hole.flat()))
    )
  );
  return hierarchy;
};

// TODO: move to config of find global way to define outer polygons

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
  ]
) => polygonHierarchyFromPolygonCoords([outerPolygon, polygon]);

export function getGroundPrimitiveById(
  viewer: Viewer,
  id: string
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
