import { clamp } from "@carma-commons/math";
import * as THREE from "three";

const MIN_GRID_AXIS = 4;
const MAX_GRID_AXIS = 64;
const CELLS_PER_SOURCE = 2;
const DEPTH_EPSILON = 1e-6;

export interface ShadowReceiverMask {
  readonly sourceCount: number;
  accepts: (candidate: THREE.Box3) => boolean;
}

const isFiniteBox = (box: THREE.Box3) =>
  !box.isEmpty() &&
  Number.isFinite(box.min.x) &&
  Number.isFinite(box.min.y) &&
  Number.isFinite(box.min.z) &&
  Number.isFinite(box.max.x) &&
  Number.isFinite(box.max.y) &&
  Number.isFinite(box.max.z);

const cellRange = (
  minimum: number,
  maximum: number,
  origin: number,
  cellSize: number,
  cellCount: number
): readonly [number, number] => [
  clamp(Math.floor((minimum - origin) / cellSize), 0, cellCount - 1),
  clamp(Math.floor((maximum - origin) / cellSize), 0, cellCount - 1),
];

/**
 * Builds a light-space depth mask from the main-camera tile frontier. Each
 * covered grid cell stores the first source volume hit from the sun. A
 * shadow-only branch may traverse through that volume, but not beyond it.
 */
export const createShadowReceiverMask = (
  sourceBoxes: readonly THREE.Box3[],
  tilesToShadowView: THREE.Matrix4
): ShadowReceiverMask | null => {
  const projectedSources = sourceBoxes
    .map((box) => box.clone().applyMatrix4(tilesToShadowView))
    .filter(isFiniteBox);
  if (projectedSources.length === 0) return null;

  const footprint = projectedSources.reduce(
    (result, box) => result.union(box),
    new THREE.Box3().makeEmpty()
  );
  const width = Math.max(DEPTH_EPSILON, footprint.max.x - footprint.min.x);
  const height = Math.max(DEPTH_EPSILON, footprint.max.y - footprint.min.y);
  const targetCells = Math.max(
    MIN_GRID_AXIS ** 2,
    projectedSources.length * CELLS_PER_SOURCE
  );
  const aspect = width / height;
  const columns = clamp(
    Math.round(Math.sqrt(targetCells * aspect)),
    MIN_GRID_AXIS,
    MAX_GRID_AXIS
  );
  const rows = clamp(
    Math.round(Math.sqrt(targetCells / aspect)),
    MIN_GRID_AXIS,
    MAX_GRID_AXIS
  );
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const nearestReceiverEntry = new Float64Array(columns * rows);
  const nearestReceiverExit = new Float64Array(columns * rows);
  nearestReceiverEntry.fill(Number.NEGATIVE_INFINITY);
  nearestReceiverExit.fill(Number.NEGATIVE_INFINITY);

  for (const box of projectedSources) {
    const [minimumColumn, maximumColumn] = cellRange(
      box.min.x,
      box.max.x,
      footprint.min.x,
      cellWidth,
      columns
    );
    const [minimumRow, maximumRow] = cellRange(
      box.min.y,
      box.max.y,
      footprint.min.y,
      cellHeight,
      rows
    );
    for (let row = minimumRow; row <= maximumRow; row += 1) {
      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        const index = row * columns + column;
        if (box.max.z > nearestReceiverEntry[index]) {
          nearestReceiverEntry[index] = box.max.z;
          nearestReceiverExit[index] = box.min.z;
        }
      }
    }
  }

  const projectedCandidate = new THREE.Box3();
  return {
    sourceCount: projectedSources.length,
    accepts(candidate) {
      projectedCandidate.copy(candidate).applyMatrix4(tilesToShadowView);
      if (!isFiniteBox(projectedCandidate)) return true;
      if (
        projectedCandidate.max.x < footprint.min.x ||
        projectedCandidate.min.x > footprint.max.x ||
        projectedCandidate.max.y < footprint.min.y ||
        projectedCandidate.min.y > footprint.max.y
      ) {
        return false;
      }

      const [minimumColumn, maximumColumn] = cellRange(
        projectedCandidate.min.x,
        projectedCandidate.max.x,
        footprint.min.x,
        cellWidth,
        columns
      );
      const [minimumRow, maximumRow] = cellRange(
        projectedCandidate.min.y,
        projectedCandidate.max.y,
        footprint.min.y,
        cellHeight,
        rows
      );
      for (let row = minimumRow; row <= maximumRow; row += 1) {
        for (let column = minimumColumn; column <= maximumColumn; column += 1) {
          const receiverDepth = nearestReceiverExit[row * columns + column];
          if (
            receiverDepth !== Number.NEGATIVE_INFINITY &&
            projectedCandidate.max.z + DEPTH_EPSILON >= receiverDepth
          ) {
            return true;
          }
        }
      }
      return false;
    },
  };
};
