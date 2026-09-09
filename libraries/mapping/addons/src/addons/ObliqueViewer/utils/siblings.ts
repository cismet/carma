import type {
  CardinalDirection,
  ObliqueImageRecord,
  ObliqueImageRecordMap,
} from "../types";
import {
  CardinalDirectionEnum,
  getCardinalDirectionFromHeading,
  zeroToTwoPi,
} from "./orientation";

/**
 * The neighbours of an image in its own sector: the next and previous
 * waypoint on the same flight line, and the nearest image on each adjacent
 * line. Keyed by the compass direction they lie in, so the arrows can offer
 * "the image ahead" rather than "waypoint plus one".
 */

const MAX_CARTESIAN_DISTANCE_M = 350;

export type SiblingsByCardinal = Record<
  CardinalDirection,
  ObliqueImageRecord | null
>;

const emptySiblings = (): SiblingsByCardinal => ({
  [CardinalDirectionEnum.North]: null,
  [CardinalDirectionEnum.East]: null,
  [CardinalDirectionEnum.South]: null,
  [CardinalDirectionEnum.West]: null,
});

const chooseCardinal = (dx: number, dy: number): CardinalDirection =>
  getCardinalDirectionFromHeading(zeroToTwoPi(Math.atan2(-dx, dy)));

const considerCandidate = (
  current: ObliqueImageRecord,
  map: SiblingsByCardinal,
  distByCardinal: Record<CardinalDirection, number>,
  rec: ObliqueImageRecord | null,
  threshold: number,
  forcedKey?: CardinalDirection,
  skipThreshold = false
) => {
  if (!rec) return;
  const dx = rec.x - current.x;
  const dy = rec.y - current.y;
  const dist = Math.hypot(dx, dy);
  if (!skipThreshold && dist > threshold) return;
  const key =
    typeof forcedKey === "number" ? forcedKey : chooseCardinal(dx, dy);
  if (dist < distByCardinal[key]) {
    map[key] = rec;
    distByCardinal[key] = dist;
  }
};

const findSameLineNeighbors = (
  current: ObliqueImageRecord,
  imageRecords: ObliqueImageRecordMap,
  threshold: number
) => {
  const targetWpF = current.waypointIndex + 1;
  const targetWpB = current.waypointIndex - 1;
  let forward: ObliqueImageRecord | null = null;
  let backward: ObliqueImageRecord | null = null;
  let forwardExact = false;
  let backwardExact = false;
  for (const rec of imageRecords.values()) {
    if (rec.sector !== current.sector) continue;
    if (rec.lineIndex !== current.lineIndex) continue;
    if (!forward && rec.waypointIndex === targetWpF) {
      forward = rec;
      forwardExact = true;
    }
    if (!backward && rec.waypointIndex === targetWpB) {
      backward = rec;
      backwardExact = true;
    }
    if (forward && backward) break;
  }
  if (forward && backward) {
    return { forward, backward, forwardExact, backwardExact };
  }
  let bestF: ObliqueImageRecord | null = forward;
  let bestFD = bestF ? 0 : Number.POSITIVE_INFINITY;
  let bestB: ObliqueImageRecord | null = backward;
  let bestBD = bestB ? 0 : Number.POSITIVE_INFINITY;
  for (const rec of imageRecords.values()) {
    if (rec.sector !== current.sector) continue;
    if (rec.lineIndex !== current.lineIndex) continue;
    const dist = Math.hypot(rec.x - current.x, rec.y - current.y);
    if (dist > threshold) continue;
    if (!forward && rec.waypointIndex > current.waypointIndex && dist < bestFD) {
      bestF = rec;
      bestFD = dist;
    }
    if (!backward && rec.waypointIndex < current.waypointIndex && dist < bestBD) {
      bestB = rec;
      bestBD = dist;
    }
  }
  return { forward: bestF, backward: bestB, forwardExact, backwardExact };
};

const findAdjacentLineNeighbors = (
  current: ObliqueImageRecord,
  imageRecords: ObliqueImageRecordMap,
  threshold: number
) => {
  let bestN: ObliqueImageRecord | null = null;
  let bestND = Number.POSITIVE_INFINITY;
  let bestS: ObliqueImageRecord | null = null;
  let bestSD = Number.POSITIVE_INFINITY;
  for (const rec of imageRecords.values()) {
    if (rec.sector !== current.sector) continue;
    if (Math.abs(rec.lineIndex - current.lineIndex) !== 1) continue;
    const dy = rec.y - current.y;
    const dist = Math.hypot(rec.x - current.x, dy);
    if (dist > threshold) continue;
    if (dy < 0) {
      if (dist < bestND) {
        bestN = rec;
        bestND = dist;
      }
    } else if (dist < bestSD) {
      bestS = rec;
      bestSD = dist;
    }
  }
  return { north: bestN, south: bestS };
};

export const computeSiblingsByCardinal = (
  current: ObliqueImageRecord,
  imageRecords: ObliqueImageRecordMap
): SiblingsByCardinal => {
  const map = emptySiblings();
  const distByCardinal: Record<CardinalDirection, number> = {
    [CardinalDirectionEnum.North]: Number.POSITIVE_INFINITY,
    [CardinalDirectionEnum.East]: Number.POSITIVE_INFINITY,
    [CardinalDirectionEnum.South]: Number.POSITIVE_INFINITY,
    [CardinalDirectionEnum.West]: Number.POSITIVE_INFINITY,
  };

  const { forward, backward, forwardExact, backwardExact } =
    findSameLineNeighbors(current, imageRecords, MAX_CARTESIAN_DISTANCE_M);
  considerCandidate(
    current,
    map,
    distByCardinal,
    forward,
    MAX_CARTESIAN_DISTANCE_M,
    undefined,
    forwardExact
  );
  considerCandidate(
    current,
    map,
    distByCardinal,
    backward,
    MAX_CARTESIAN_DISTANCE_M,
    undefined,
    backwardExact
  );

  const { north, south } = findAdjacentLineNeighbors(
    current,
    imageRecords,
    MAX_CARTESIAN_DISTANCE_M
  );
  considerCandidate(
    current,
    map,
    distByCardinal,
    north,
    MAX_CARTESIAN_DISTANCE_M,
    CardinalDirectionEnum.North
  );
  considerCandidate(
    current,
    map,
    distByCardinal,
    south,
    MAX_CARTESIAN_DISTANCE_M,
    CardinalDirectionEnum.South
  );

  return map;
};

export const emptySiblingsByCardinal = emptySiblings;
