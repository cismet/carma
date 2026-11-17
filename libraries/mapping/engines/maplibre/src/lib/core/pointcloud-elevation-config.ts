/**
 * A symbol layer whose icons follow a point cloud's heights instead of the
 * terrain: `metadata.carmaConf.pointcloudElevation` on the layer.
 *
 * MapLibre places every symbol on the terrain surface; it has no per-feature
 * height. Where a point cloud shows a bridge, icons of a path driven over it
 * then dip under the deck. While a point cloud is drawn, a layer carrying this
 * block is drawn in the shared three.js scene at the height its features
 * carry, and the 2D layer only stays on the map, faded, to answer clicks.
 * Without a visible point cloud the layer is the plain 2D layer again.
 *
 *   "pointcloudElevation": {
 *     "property": "altitude",        // feature property holding the height
 *     "offset": -2.0,                // meters added to it, e.g. camera height
 *     "verticalDatum": "ellipsoidal", // or "dhhn2016"; the cloud's is ellipsoidal
 *     "occlude": false               // true: the cloud may hide the icons
 *   }
 */

export const POINTCLOUD_ELEVATION_KEY = "pointcloudElevation";

export type PointCloudElevationVerticalDatum = "ellipsoidal" | "dhhn2016";

export type PointCloudElevationConfig = {
  property: string;
  offset: number;
  verticalDatum: PointCloudElevationVerticalDatum;
  occlude: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The elevation a symbol layer asks for, or null when it asks for none or the
 * block is unusable (no property name). Other layer types are ignored: only
 * icons are drawn in 3D.
 */
export const readPointCloudElevationConfig = (
  layer: unknown
): PointCloudElevationConfig | null => {
  if (!isRecord(layer) || layer.type !== "symbol") {
    return null;
  }
  const metadata = isRecord(layer.metadata) ? layer.metadata : undefined;
  const carmaConf = isRecord(metadata?.carmaConf)
    ? metadata.carmaConf
    : undefined;
  const block = carmaConf?.[POINTCLOUD_ELEVATION_KEY];
  if (
    !isRecord(block) ||
    typeof block.property !== "string" ||
    block.property.length === 0
  ) {
    return null;
  }
  return {
    property: block.property,
    offset:
      typeof block.offset === "number" && Number.isFinite(block.offset)
        ? block.offset
        : 0,
    verticalDatum:
      block.verticalDatum === "dhhn2016" ? "dhhn2016" : "ellipsoidal",
    occlude: block.occlude === true,
  };
};

const EARTH_CIRCUMFERENCE_M = 40075016.686;

/**
 * Ground meters per CSS pixel of a map-aligned icon at this zoom and latitude,
 * MapLibre's 512 px tiles. Matches how big the 2D icon is on the ground.
 */
export const metersPerPixelAt = (zoom: number, latitude: number): number =>
  (EARTH_CIRCUMFERENCE_M * Math.cos((latitude * Math.PI) / 180)) /
  (512 * 2 ** zoom);
