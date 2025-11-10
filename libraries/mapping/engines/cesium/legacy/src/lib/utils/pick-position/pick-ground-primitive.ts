import { Cartesian2, defined, GroundPrimitive, Scene } from "@carma/cesium";

const GEOJSON_DRILL_LIMIT = 10;

/**
 * Get last ground primitive from picked objects
 * Needed since default picker fails with ground primitives created from GeoJson
 */
function getLastGroundPrimitive(
  pickedObjects: { primitive: unknown; id?: unknown }[]
): GroundPrimitive | null {
  let lastGroundPrimitive: GroundPrimitive | null = null;

  pickedObjects.reverse().some((pickedObject) => {
    if (defined(pickedObject)) {
      if (pickedObject.primitive instanceof GroundPrimitive) {
        lastGroundPrimitive = pickedObject.primitive;
        return true;
      }
    }
    return false;
  });

  return lastGroundPrimitive;
}

/**
 * Pick ground primitive from clamped GeoJSON
 * Only used in playground
 */
export function pickFromClampedGeojson(
  scene: Scene,
  position: Cartesian2,
  limit: number = GEOJSON_DRILL_LIMIT
): GroundPrimitive | null {
  const pickedObjects = scene.drillPick(position, limit);
  console.debug("SCENE DRILL PICK:", pickedObjects);
  return getLastGroundPrimitive(pickedObjects);
}
