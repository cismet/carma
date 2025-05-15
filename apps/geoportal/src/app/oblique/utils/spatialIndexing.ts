import {
  ObliqueImageRecord,
  ObliqueImageRecordMap,
  PointWithSector,
} from "../types";
import RBush from "rbush";
import knn from "rbush-knn";
import { CardinalDirectionEnum } from "./orientationUtils";

export interface RBushItem extends PointWithSector {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type RBushBySectorBlocks = Map<CardinalDirectionEnum, RBush<RBushItem>>;

// Session-level storage for spatial index
interface SpatialIndexStorage {
  tree: RBush<RBushItem> | null;
  crs: string | null; // To detect when records change
}

interface SpatialIndexByCardinalStorage {
  sectors: RBushBySectorBlocks;
  crs: string | null; // To detect when records change
}

// Module-level variable to store the spatial index for the session

// TODO: Unify the format to per Sector do hash check when dowloading and store to localforage.
const spatialIndexStorage: SpatialIndexStorage = {
  tree: null,
  crs: null,
};

// Storage for spatial indices by cardinal direction
export const spatialIndexByCardinalStorage: SpatialIndexByCardinalStorage = {
  sectors: null,
  crs: null,
};

export function getSpatialIndex(
  records: ObliqueImageRecordMap,
  crs: string
): RBush<RBushItem> {
  // If we already have a tree with the same records, return it
  if (spatialIndexStorage.tree && spatialIndexStorage.crs === crs) {
    return spatialIndexStorage.tree;
  }

  // Otherwise, build a new tree
  const tree = new RBush<RBushItem>();

  // Create items for bulk insertion - only do this once per dataset
  const validRecords = Array.from(records.values()).filter((record) => {
    const { x, y } = record;
    return typeof x !== "undefined" && typeof y !== "undefined";
  });

  // Map records to RBush items in a single pass
  const items = validRecords.map((record) => {
    const { id, x, y } = record;
    return {
      x,
      y,
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
      id,
    };
  });

  // Bulk load the items into the tree
  if (items.length > 0) {
    tree.load(items);
  }

  // Store the tree and hash for future use
  spatialIndexStorage.tree = tree;
  spatialIndexStorage.crs = crs;

  return tree;
}

/**
 * Find the nearest oblique image to a given coordinate using RBush spatial indexing
 * Distances are calculated in CRS used for Spatial Index
 *
 * @param records Array of oblique image records
 * @param targetCoord in CRS used for Spatial Index
 * @returns The nearest image record or null if no records provided
 */
export function findNearestObliqueImage(
  records: ObliqueImageRecordMap,
  crs: string,
  targetCoord: [number, number]
): ObliqueImageRecord | null {
  return (
    findNearestKObliqueImages(records, crs, targetCoord, 1)[0]?.record || null
  );
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
  records: ObliqueImageRecordMap,
  crs: string,
  targetCoord: [number, number],
  k: number = 1,
  filter?: (item: RBushItem) => boolean
): Array<{ record: ObliqueImageRecord; distance: number }> {
  if (!records || records.size === 0 || k <= 0) {
    return [];
  }

  // Build or get the spatial index
  const spatialIndex = getSpatialIndex(records, crs);

  // Use knn to find the nearest k neighbors
  const nearestItems = knn(
    spatialIndex,
    targetCoord[0],
    targetCoord[1],
    k,
    filter
  );

  // Create a map for faster lookups instead of using find() repeatedly
  const resultRecordMap = new Map();
  if (!nearestItems.length) return [];

  // Only create the map if we have items to process
  if (nearestItems.length > 0) {
    records.forEach((record) => {
      resultRecordMap.set(record.id, record);
    });
  }

  // Map the results to records with distances in CRS used for Spatial Index
  return nearestItems
    .map((item: ObliqueImageRecord) => {
      const record = resultRecordMap.get(item.id);
      const { x, y } = record.record;

      if (Number.isNaN(x) || Number.isNaN(y)) {
        return null;
      }
      const dx = targetCoord[0] - x;
      const dy = targetCoord[1] - y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      return { record, distance };
    })
    .filter(Boolean);
}

export function createRBushByCardinal(
  pointWithSector: PointWithSector[]
): RBushBySectorBlocks {
  // Create a Map to hold the RBush trees for each cardinal direction
  const result: RBushBySectorBlocks = new Map([
    [CardinalDirectionEnum.North, new RBush<RBushItem>()],
    [CardinalDirectionEnum.East, new RBush<RBushItem>()],
    [CardinalDirectionEnum.South, new RBush<RBushItem>()],
    [CardinalDirectionEnum.West, new RBush<RBushItem>()],
  ]);

  // Group items by cardinal direction for bulk loading
  const itemsByCardinal = new Map([
    [CardinalDirectionEnum.North, [] as RBushItem[]],
    [CardinalDirectionEnum.East, [] as RBushItem[]],
    [CardinalDirectionEnum.South, [] as RBushItem[]],
    [CardinalDirectionEnum.West, [] as RBushItem[]],
  ]);

  // Process all points in a single pass
  for (const { x, y, cardinal, ...rest } of pointWithSector) {
    if (typeof x === "undefined" || typeof y === "undefined") continue;

    const item: RBushItem = {
      minX: x,
      minY: y,
      maxX: x,
      maxY: y,
      x,
      y,
      cardinal,
      ...rest,
    };

    const items = itemsByCardinal.get(cardinal);
    if (items) items.push(item);
  }

  // Bulk load each spatial index only once
  for (const [cardinal, items] of itemsByCardinal.entries()) {
    if (items.length === 0) continue;

    const tree = result.get(cardinal);
    if (tree) {
      tree.load(items);
    }
  }

  return result;
}
