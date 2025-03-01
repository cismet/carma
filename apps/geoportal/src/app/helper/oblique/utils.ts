import { BasicObliqueImageRecord, ObliqueImageRecord } from "./types";
import proj4 from "proj4";
import RBush from "rbush";
import knn from "rbush-knn";
import { calculateAccurateHeadingFromOrientation, getSectorFromHeading } from "./orientationUtils";

// Define the UTM32 projection (EPSG:25832)
const WGS84 = "EPSG:4326";
const UTM32 = "EPSG:25832";

export enum OBLIQUE_PREVIEW_QUALITY {
  LEVEL_0 = "0",
  LEVEL_1 = "1",
  LEVEL_2 = "2",
  LEVEL_3 = "3",
  LEVEL_1_HQ = "1-hq",
  LEVEL_2_HQ = "2-hq",
  LEVEL_3_HQ = "3-hq",
  LEVEL_1_HQ_AVIF = "1-hq-avif-10bit",
  LEVEL_2_HQ_AVIF = "2-hq-avif-10bit",
  LEVEL_3_HQ_AVIF = "3-hq-avif-10bit",
}

export const AVIF_LEVELS = [
  OBLIQUE_PREVIEW_QUALITY.LEVEL_1_HQ_AVIF,
  OBLIQUE_PREVIEW_QUALITY.LEVEL_2_HQ_AVIF,
  OBLIQUE_PREVIEW_QUALITY.LEVEL_3_HQ_AVIF,
];

export const isAvifLevel = (
  level: string
): level is OBLIQUE_PREVIEW_QUALITY => {
  return AVIF_LEVELS.includes(level as OBLIQUE_PREVIEW_QUALITY);
};

export const extendObliqueImageRecord = (
  image: BasicObliqueImageRecord,
  converter: any
): ObliqueImageRecord => {

  const { x, y, z } = image.perspectiveCenter;

  // Parse ID to extract waypoint ID and camera ID
  const parts = image.id.split("_");
  // Format is like: 039_168_170004735
  // Waypoint ID is everything before the second underscore (e.g., 039_168)
  // Camera ID is the first three characters after the second underscore (e.g., 170)

  let waypointId = "unknown";
  let cameraId: string | null = null;

  if (parts.length >= 3) {
    waypointId = `${parts[0]}_${parts[1]}`;
    const cameraIdPart = parts[2];
    if (cameraIdPart.length >= 3) {
      cameraId = cameraIdPart.substring(0, 3);
    }
  }

  // Use the provided converter directly instead of creating a new one
  const wgs84Coords = converter.forward([x, y, z]);

  // Calculate heading and sector if orientation data is available
  let calculatedHeading: number | undefined;
  let sector: string | undefined;

  if (image.orientation) {
    calculatedHeading = calculateAccurateHeadingFromOrientation(
      image.orientation.omega,
      image.orientation.phi,
      image.orientation.kappa
    );
    sector = getSectorFromHeading(calculatedHeading);
  }

  const record: ObliqueImageRecord = {
    ...image,
    centerWGS84: wgs84Coords as [number, number, number],
    waypointId,
    cameraId,
    calculatedHeading,
    sector,
  };
  return record;
};

// Interface for RBush items with bbox
interface RBushItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  index: number;
}

// Session-level storage for spatial index
interface SpatialIndexStorage {
  tree: RBush<RBushItem> | null;
  recordsHash: string | null; // To detect when records change
}

// Module-level variable to store the spatial index for the session
const spatialIndexStorage: SpatialIndexStorage = {
  tree: null,
  recordsHash: null,
};

/**
 * Generate a simple hash for the records array to check if it has changed
 * This is a very basic hash just to detect changes in the records set
 */
function generateRecordsHash(records: ObliqueImageRecord[]): string {
  if (!records || records.length === 0) return "";

  // Use the first, last, and middle record IDs and the total count as a simple hash
  const firstId = records[0].id;
  const lastId = records[records.length - 1].id;
  const middleId = records[Math.floor(records.length / 2)]?.id || "";

  return `${records.length}:${firstId}:${middleId}:${lastId}`;
}

/**
 * Build or retrieve a spatial index from oblique image records
 */
export function getSpatialIndex(
  records: ObliqueImageRecord[]
): RBush<RBushItem> {
  // Generate a hash to check if the records have changed
  const currentHash = generateRecordsHash(records);

  // If we already have a tree with the same records, return it
  if (
    spatialIndexStorage.tree &&
    spatialIndexStorage.recordsHash === currentHash
  ) {
    return spatialIndexStorage.tree;
  }

  // Otherwise, build a new tree
  const tree = new RBush<RBushItem>();
  const items: RBushItem[] = [];

  // Create items for bulk insertion
  records.forEach((record, index) => {
    // Safety check for perspectiveCenter
    if (
      !record.perspectiveCenter ||
      typeof record.perspectiveCenter.x === "undefined" ||
      typeof record.perspectiveCenter.y === "undefined"
    ) {
      console.warn("Invalid perspectiveCenter in spatial index:", record.id);
      return; // Skip this record
    }

    const { x, y } = record.perspectiveCenter;
    items.push({
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
      index,
    });
  });

  // Bulk load the items into the tree
  tree.load(items);

  // Store the tree and hash for future use
  spatialIndexStorage.tree = tree;
  spatialIndexStorage.recordsHash = currentHash;

  return tree;
}

/**
 * Find the nearest oblique image to a given coordinate using RBush spatial indexing
 * Distances are calculated in UTM32 projection
 *
 * @param records Array of oblique image records
 * @param targetCoord Coordinate [lon, lat] in WGS84
 * @returns The nearest image record or null if no records provided
 */
export function findNearestObliqueImage(
  records: ObliqueImageRecord[],
  targetCoord: [number, number]
): ObliqueImageRecord | null {
  return findNearestKObliqueImages(records, targetCoord, 1)[0]?.record || null;
}

/**
 * Calculate distances between a target point and all oblique images
 * Returns the records sorted by distance (closest first)
 * Distances are calculated in UTM32 projection (in meters)
 *
 * @param records Array of oblique image records
 * @param targetCoord Coordinate [lon, lat] in WGS84
 * @param limit Optional number of results to return
 * @returns Array of records with distance information, sorted by distance
 */
export function getImagesByDistance(
  records: ObliqueImageRecord[],
  targetCoord: [number, number],
  limit?: number
): Array<{ record: ObliqueImageRecord; distance: number }> {
  if (!records || records.length === 0) {
    return [];
  }

  // Convert target coordinate from WGS84 to UTM32
  const targetUtm32 = proj4(WGS84, UTM32, targetCoord) as [number, number];

  // Calculate distances directly using the perspective center (already in UTM32)
  const recordsWithDistance = records.map((record) => {
    // Safety check for perspectiveCenter
    if (
      !record.perspectiveCenter ||
      typeof record.perspectiveCenter.x === "undefined" ||
      typeof record.perspectiveCenter.y === "undefined"
    ) {
      console.warn(
        "Invalid perspectiveCenter in distance calculation:",
        record.id
      );
      return { record, distance: Number.MAX_VALUE }; // Use MAX_VALUE to sort to the end
    }

    const { x, y } = record.perspectiveCenter;
    const dx = targetUtm32[0] - x;
    const dy = targetUtm32[1] - y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return {
      record,
      distance,
    };
  });

  // Sort by distance (closest first)
  const sorted = recordsWithDistance.sort((a, b) => a.distance - b.distance);

  // Return all or limited results
  return limit && limit > 0 ? sorted.slice(0, limit) : sorted;
}

/**
 * Find the nearest N oblique images to a given coordinate using RBush-KNN
 * Uses efficient k-nearest neighbors algorithm
 *
 * @param records Array of oblique image records
 * @param targetCoord Coordinate [lon, lat] in WGS84
 * @param k Number of nearest neighbors to return
 * @returns Array of records with distance information, sorted by distance
 */
export function findNearestKObliqueImages(
  records: ObliqueImageRecord[],
  targetCoord: [number, number],
  k: number = 1,
  filter?: (item: RBushItem) => boolean
): Array<{ record: ObliqueImageRecord; distance: number }> {
  if (!records || records.length === 0 || k <= 0) {
    return [];
  }

  // Build or get the spatial index
  const spatialIndex = getSpatialIndex(records);

  // Use knn to find the nearest k neighbors
  const nearestItems = knn(
    spatialIndex,
    targetCoord[0],
    targetCoord[1],
    k,
    filter
  );

  // Map the results to records with distances in meters (UTM32 units)
  return nearestItems.map((item) => {
    const record = records[item.index];

    const dx = targetCoord[0] - record.perspectiveCenter.x;
    const dy = targetCoord[1] - record.perspectiveCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return { record, distance };
  });
}

/**
 * Clear the spatial index storage
 * Call this when you no longer need the spatial index or want to free memory
 */
export function clearSpatialIndex(): void {
  spatialIndexStorage.tree = null;
  spatialIndexStorage.recordsHash = null;
}

export function getPreviewImageUrl(
  previewPath: string,
  level: OBLIQUE_PREVIEW_QUALITY,
  imageId: string
): string {
  return `${previewPath}/${level}/${imageId}.${
    isAvifLevel(level) ? "avif" : "jpg"
  }`;
}
