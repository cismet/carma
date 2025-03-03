import { ObliqueImageRecord } from "../types";
import RBush from "rbush";
import knn from "rbush-knn";

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

export function getSpatialIndex(
  records: ObliqueImageRecord[]
): RBush<RBushItem> {
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
 * @param targetCoord in CRS used for Spatial Index
 * @returns The nearest image record or null if no records provided
 */
export function findNearestObliqueImage(
  records: ObliqueImageRecord[],
  targetCoord: [number, number]
): ObliqueImageRecord | null {
  return findNearestKObliqueImages(records, targetCoord, 1)[0]?.record || null;
}

/**
 * Find the nearest N oblique images to a given coordinate using RBush-KNN
 * Uses efficient k-nearest neighbors algorithm
 *
 * @param records Array of oblique image records
 * @param targetCoord in CRS used for Spatial Index
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
