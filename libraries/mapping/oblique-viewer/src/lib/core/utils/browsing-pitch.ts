import {
  degToRadNumeric,
  radToDegNumeric,
  type Degrees,
  type Radians,
  PI_OVER_TWO,
} from "@carma-units";
import type {
  CardinalDirection,
  ObliqueDataset,
  ObliquePitchSummary,
  ObliqueSelectionData,
} from "../types";
import { CARDINALS_CLOCKWISE, getCardinalDirectionFromHeading } from "./orientation";

type PitchData = Pick<
  ObliqueSelectionData,
  "obliquePitchBySeries" | "obliquePitchByDirectionBySeries"
>;

/** Use calibrated direction totals; startup can use the same totals in the manifest. */
export const getBrowsingPitchDeg = (
  data: PitchData | null | undefined,
  enabledSeries: readonly ObliqueDataset[],
  bearingDeg: number,
  fallbackPitchDeg: number
): Degrees => {
  const direction = getCardinalDirectionFromHeading(degToRadNumeric(bearingDeg));
  let sum = 0;
  let count = 0;
  const add = (total?: { pitchSumRad: number; imageCount: number }) => {
    if (
      !total ||
      !Number.isFinite(total.pitchSumRad) ||
      total.pitchSumRad <= 0 ||
      !Number.isSafeInteger(total.imageCount) ||
      total.imageCount <= 0 ||
      total.pitchSumRad >= total.imageCount * PI_OVER_TWO
    )
      return;
    sum += total.pitchSumRad;
    count += total.imageCount;
  };
  for (const series of enabledSeries)
    add(data?.obliquePitchByDirectionBySeries?.get(series.id)?.get(direction));
  if (count > 0) return radToDegNumeric(sum / count) as Degrees;

  // The index manifest supplies complete group totals before its image slice arrives.
  for (const series of enabledSeries)
    add(summarizeDirectionalCatalogPitch(series).byDirection.get(direction));
  if (count > 0) return radToDegNumeric(sum / count) as Degrees;

  // Legacy catalogs without directional summaries keep their measured series mean.
  for (const series of enabledSeries) add(data?.obliquePitchBySeries?.get(series.id));
  return (count > 0 ? radToDegNumeric(sum / count) : fallbackPitchDeg) as Degrees;
};

/** Full-group summaries replace matching partial slices, never add to them. */
export const summarizeDirectionalCatalogPitch = (
  dataset: ObliqueDataset
): {
  total?: ObliquePitchSummary;
  byDirection: Map<CardinalDirection, ObliquePitchSummary>;
} => {
  const groups = (dataset.directionalCatalogs ?? []).filter(
    (group) => group.sector !== "nadir"
  );
  const byDirection = new Map<CardinalDirection, ObliquePitchSummary>();
  const incompleteDirections = new Set<CardinalDirection>();
  let complete = groups.length > 0;
  let pitchSumRad = 0;
  let imageCount = 0;
  for (const group of groups) {
    const direction = Number.isFinite(group.meanHeadingRad)
      ? getCardinalDirectionFromHeading(group.meanHeadingRad)
      : undefined;
    const total = group.obliquePitch;
    const valid =
      total &&
      Number.isFinite(total.pitchSumRad) &&
      Number.isSafeInteger(total.imageCount) &&
      total.imageCount >= 0 &&
      (total.imageCount === 0
        ? total.pitchSumRad === 0
        : total.pitchSumRad > 0 &&
          total.pitchSumRad < total.imageCount * PI_OVER_TWO);
    if (!valid) {
      complete = false;
      if (direction !== undefined) incompleteDirections.add(direction);
      // An unknown bearing could belong to any sector; no directional replacement is safe.
      else for (const sector of CARDINALS_CLOCKWISE)
        incompleteDirections.add(sector);
      continue;
    }
    pitchSumRad += total.pitchSumRad;
    imageCount += total.imageCount;
    if (direction === undefined) {
      for (const sector of CARDINALS_CLOCKWISE)
        incompleteDirections.add(sector);
      continue;
    }
    const previous = byDirection.get(direction);
    byDirection.set(direction, {
      pitchSumRad: ((previous?.pitchSumRad ?? 0) + total.pitchSumRad) as Radians,
      imageCount: (previous?.imageCount ?? 0) + total.imageCount,
    });
  }
  for (const direction of incompleteDirections) byDirection.delete(direction);
  return {
    total: complete
      ? { pitchSumRad: pitchSumRad as Radians, imageCount }
      : undefined,
    byDirection,
  };
};

