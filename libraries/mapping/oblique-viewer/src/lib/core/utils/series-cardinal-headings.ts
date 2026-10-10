import { degToRadNumeric, zeroToTwoPi, type Radians } from "@carma-units";
import type { ObliqueDataset } from "../types";
import { CardinalDirectionEnum, getCardinalHeadings } from "./orientation";

/** Measured optical headings indexed by declared world sector, independent of filenames and loaded poses. */
export const getSeriesCardinalHeadings = (
  dataset: Pick<ObliqueDataset, "directionalCatalogs" | "headingOffsetDeg">
): Radians[] => {
  const fallback = getCardinalHeadings(
    degToRadNumeric(
      Number.isFinite(dataset.headingOffsetDeg) ? dataset.headingOffsetDeg : 0
    )
  ) as Radians[];
  const sectors = {
    N: CardinalDirectionEnum.North,
    E: CardinalDirectionEnum.East,
    S: CardinalDirectionEnum.South,
    W: CardinalDirectionEnum.West,
  } as const;
  for (const [sector, index] of Object.entries(sectors)) {
    const groups = (dataset.directionalCatalogs ?? [])
      .filter(
        (group) =>
          group.sector === sector &&
          group.imageCount > 0 &&
          Number.isFinite(group.imageCount) &&
          Number.isFinite(group.meanHeadingRad)
      )
      .sort(
        (a, b) =>
          a.meanHeadingRad - b.meanHeadingRad || a.imageCount - b.imageCount
      );
    // Rescaling weights preserves their ratio without overflowing finite counts.
    const maxCount = groups.reduce(
      (maximum, group) => Math.max(maximum, group.imageCount),
      0
    );
    let x = 0,
      y = 0,
      total = 0;
    for (const group of groups) {
      const weight = group.imageCount / maxCount;
      x += Math.sin(group.meanHeadingRad) * weight;
      y += Math.cos(group.meanHeadingRad) * weight;
      total += weight;
    }
    // Opposite bearings have no meaningful mean; retain the configured fallback.
    if (total > 0 && Math.hypot(x, y) > total * 1e-12)
      fallback[index] = zeroToTwoPi(Math.atan2(x, y) as Radians);
  }
  return fallback;
};

/** Next measured alignment in the requested camera-bearing direction, including off-axis starts. */
export const nextSeriesCardinalHeading = (
  currentHeading: Radians,
  headings: readonly Radians[],
  clockwise: boolean
): Radians => {
  const current = zeroToTwoPi(currentHeading);
  const tolerance = 1e-6;
  let next = current,
    smallestDelta = Infinity;
  for (const heading of headings) {
    if (!Number.isFinite(heading)) continue;
    const normalized = zeroToTwoPi(heading);
    const delta = zeroToTwoPi(
      ((clockwise ? 1 : -1) * (normalized - current)) as Radians
    );
    // Treat either side of a just-reached alignment identically. Strictly
    // smaller deltas preserve input/cardinal order for duplicate alignments.
    if (delta <= tolerance || Math.PI * 2 - delta <= tolerance) continue;
    if (delta < smallestDelta) {
      smallestDelta = delta;
      next = normalized;
    }
  }
  return next;
};
