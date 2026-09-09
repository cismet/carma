import RBush from "rbush";
import knn from "rbush-knn";

import type { CardinalDirection, PointWithSector } from "../types";
import { CardinalDirectionEnum } from "./orientation";

/**
 * One R-tree of footprint centres per sector, so the nearest search only
 * ranks images that looked the way the camera looks now.
 *
 * rbush and rbush-knn ship no typings; the shapes used here are declared
 * locally and the library values cast to them.
 */

export type RBushItem = PointWithSector & {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type SectorTree = {
  load(items: readonly RBushItem[]): void;
};

type KnnSearch = (
  tree: SectorTree,
  x: number,
  y: number,
  k: number,
  predicate?: (item: RBushItem) => boolean
) => RBushItem[];

export type RBushBySectorBlocks = Map<CardinalDirection, SectorTree>;

const newTree = (): SectorTree => new RBush() as unknown as SectorTree;

export const createRBushByCardinal = (
  points: readonly PointWithSector[]
): RBushBySectorBlocks => {
  const result: RBushBySectorBlocks = new Map([
    [CardinalDirectionEnum.North, newTree()],
    [CardinalDirectionEnum.East, newTree()],
    [CardinalDirectionEnum.South, newTree()],
    [CardinalDirectionEnum.West, newTree()],
  ]);
  const itemsByCardinal = new Map<CardinalDirection, RBushItem[]>([
    [CardinalDirectionEnum.North, []],
    [CardinalDirectionEnum.East, []],
    [CardinalDirectionEnum.South, []],
    [CardinalDirectionEnum.West, []],
  ]);

  for (const point of points) {
    const { x, y, cardinal } = point;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    itemsByCardinal
      .get(cardinal)
      ?.push({ ...point, minX: x, minY: y, maxX: x, maxY: y });
  }

  for (const [cardinal, items] of itemsByCardinal) {
    if (items.length > 0) {
      result.get(cardinal)?.load(items);
    }
  }

  return result;
};

/** the `k` footprint centres of one sector nearest to a point, nearest first */
export const nearestInSector = (
  trees: RBushBySectorBlocks,
  sector: CardinalDirection,
  x: number,
  y: number,
  k: number
): RBushItem[] => {
  const tree = trees.get(sector);
  if (!tree) return [];
  return (knn as unknown as KnnSearch)(tree, x, y, k);
};
