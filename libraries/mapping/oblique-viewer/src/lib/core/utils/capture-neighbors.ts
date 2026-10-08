import { degToRadNumeric, type Radians } from "@carma-units";
import type { ObliqueDataset, ObliqueImageRecord, ObliqueViewQuery } from "../types";
import { getCardinalDirectionFromHeading } from "./orientation";

/** Unspecified legacy catalogs retain their established capture-neighbor behavior. */
export const usesFlightStripTopology = (dataset: ObliqueDataset): boolean =>
  dataset.captureNavigationTopology === "flight-strip" ||
  (dataset.captureNavigationTopology === undefined &&
    dataset.metadataFormat === "legacy-array-map");

/** Flight-strip neighbors, over the spatial index's nearby candidates. */
export const captureNeighbor = (
  current: ObliqueImageRecord,
  dataset: ObliqueDataset,
  candidates: readonly ObliqueImageRecord[],
  arrow: NonNullable<ObliqueViewQuery["navigationArrow"]>,
  headingRad: Radians
): ObliqueImageRecord | null | undefined => {
  if (!usesFlightStripTopology(dataset) ||
      current.lineIndex === undefined || current.waypointIndex === undefined)
    return undefined;
  const sectorOf = (record: ObliqueImageRecord) => {
    const parity = (record.lineIndex ?? 0) % 2 === 1 ? "ODD" : "EVEN";
    return dataset.cameraIdToDirection?.[parity]?.[record.cameraId];
  };
  const sector = sectorOf(current);
  if (sector === undefined) return undefined;
  let next: ObliqueImageRecord | null = null;
  let previous: ObliqueImageRecord | null = null;
  let fartherNext: ObliqueImageRecord | null = null;
  let fartherPrevious: ObliqueImageRecord | null = null;
  let north: ObliqueImageRecord | null = null;
  let south: ObliqueImageRecord | null = null;
  const distance = (record: ObliqueImageRecord) =>
    Math.hypot(record.x - current.x, record.y - current.y);
  const nearer = (best: ObliqueImageRecord | null, candidate: ObliqueImageRecord) =>
    !best || distance(candidate) < distance(best) ? candidate : best;
  for (const record of candidates) {
    if (record.id === current.id || record.seriesId !== current.seriesId ||
        sectorOf(record) !== sector) continue;
    if (record.lineIndex === current.lineIndex) {
      if (record.waypointIndex === current.waypointIndex + 1) next ??= record;
      if (record.waypointIndex === current.waypointIndex - 1) previous ??= record;
      if (distance(record) > 350 || record.waypointIndex === undefined) continue;
      // Cesium's missing-waypoint fallback keeps the first delivered record
      // within range. Preserve source order rather than choosing a closer one.
      if (record.waypointIndex > current.waypointIndex)
        fartherNext ??= record;
      if (record.waypointIndex < current.waypointIndex)
        fartherPrevious ??= record;
    } else if (record.lineIndex !== undefined &&
        Math.abs(record.lineIndex - current.lineIndex) === 1 && distance(record) <= 350) {
      if (record.y < current.y) north = nearer(north, record);
      else south = nearer(south, record);
    }
  }
  const slots = new Map<number, ObliqueImageRecord>();
  const add = (record: ObliqueImageRecord | null, forced?: number) => {
    if (!record) return;
    // The legacy labels invert x; keyboard/control slots invert them back.
    const key = forced ?? getCardinalDirectionFromHeading(
      Math.atan2(current.x - record.x, record.y - current.y)
    );
    const existing = slots.get(key);
    if (!existing || distance(record) < distance(existing)) slots.set(key, record);
  };
  add(next ?? fartherNext);
  add(previous ?? fartherPrevious);
  add(north, 0);
  add(south, 2);
  const active = getCardinalDirectionFromHeading(
    headingRad - degToRadNumeric(dataset.headingOffsetDeg)
  );
  const offset = { up: 2, left: 1, down: 0, right: 3 }[arrow];
  return slots.get((active + offset) % 4) ?? null;
};
