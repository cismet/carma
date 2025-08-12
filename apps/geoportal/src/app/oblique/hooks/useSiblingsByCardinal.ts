import { useMemo } from "react";
import { Math as CesiumMath } from "cesium";

import { useOblique } from "./useOblique";
import type { ObliqueImageRecord } from "../types";
import {
  CardinalDirectionEnum,
  getCardinalDirectionFromHeading,
} from "../utils/orientationUtils";

const MAX_CARTESIAN_DISTANCE_M = 350;

export function useSiblingsByCardinal(): Record<
  CardinalDirectionEnum,
  ObliqueImageRecord | null
> {
  const { nearestImage, imageRecords } = useOblique();

  const index = useMemo(() => {
    const byLine = new Map<number, Map<number, ObliqueImageRecord[]>>();
    if (!imageRecords || imageRecords.size === 0) {
      return { byLine };
    }
    imageRecords.forEach((rec) => {
      let inner = byLine.get(rec.lineIndex);
      if (!inner) {
        inner = new Map<number, ObliqueImageRecord[]>();
        byLine.set(rec.lineIndex, inner);
      }
      const list = inner.get(rec.waypointIndex);
      if (list) {
        list.push(rec);
      } else {
        inner.set(rec.waypointIndex, [rec]);
      }
    });
    return { byLine };
  }, [imageRecords]);

  const siblingsByCardinal = useMemo(() => {
    const map: Record<CardinalDirectionEnum, ObliqueImageRecord | null> = {
      [CardinalDirectionEnum.North]: null,
      [CardinalDirectionEnum.East]: null,
      [CardinalDirectionEnum.South]: null,
      [CardinalDirectionEnum.West]: null,
    };
    const distByCardinal: Record<CardinalDirectionEnum, number> = {
      [CardinalDirectionEnum.North]: Number.POSITIVE_INFINITY,
      [CardinalDirectionEnum.East]: Number.POSITIVE_INFINITY,
      [CardinalDirectionEnum.South]: Number.POSITIVE_INFINITY,
      [CardinalDirectionEnum.West]: Number.POSITIVE_INFINITY,
    };

    const current = nearestImage?.record;
    if (!current || index.byLine.size === 0) return map;

    const chooseCardinal = (dx: number, dy: number): CardinalDirectionEnum => {
      const heading = CesiumMath.zeroToTwoPi(Math.atan2(-dx, dy));
      return getCardinalDirectionFromHeading(heading);
    };

    const setIfCloser = (
      rec: ObliqueImageRecord | null,
      forceKey?: CardinalDirectionEnum
    ) => {
      if (!rec) return;
      const dx = rec.x - current.x;
      const dy = rec.y - current.y;
      const dist = Math.hypot(dx, dy);
      if (dist > MAX_CARTESIAN_DISTANCE_M) return;
      const key =
        typeof forceKey === "number" ? forceKey : chooseCardinal(dx, dy);
      if (dist < distByCardinal[key]) {
        map[key] = rec;
        distByCardinal[key] = dist;
      }
    };

    const findBestOnCurrentLine = (
      isForward: boolean
    ): ObliqueImageRecord | null => {
      const inner = index.byLine.get(current.lineIndex);
      if (!inner) return null;
      let best: ObliqueImageRecord | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      inner.forEach((list, wpIdx) => {
        if (
          isForward
            ? wpIdx <= current.waypointIndex
            : wpIdx >= current.waypointIndex
        )
          return;
        for (const rec of list) {
          if (rec.sector !== current.sector) continue;
          const dx = rec.x - current.x;
          const dy = rec.y - current.y;
          const dist = Math.hypot(dx, dy);
          if (dist > MAX_CARTESIAN_DISTANCE_M) continue;
          if (dist < bestDist) {
            best = rec;
            bestDist = dist;
          }
        }
      });
      return best;
    };
    setIfCloser(findBestOnCurrentLine(true));
    setIfCloser(findBestOnCurrentLine(false));

    const findBestOnAdjacent = (
      isNorth: boolean
    ): ObliqueImageRecord | null => {
      if (!imageRecords || imageRecords.size === 0) return null;
      let best: ObliqueImageRecord | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      imageRecords.forEach((rec) => {
        if (rec.lineIndex === current.lineIndex) return;
        if (Math.abs(rec.lineIndex - current.lineIndex) !== 1) return;
        if (rec.sector !== current.sector) return;
        const dy = rec.y - current.y;
        const dist = Math.hypot(rec.x - current.x, dy);
        if (dist > MAX_CARTESIAN_DISTANCE_M) return;
        if (isNorth ? dy >= 0 : dy < 0) return;
        if (dist < bestDist) {
          best = rec;
          bestDist = dist;
        }
      });
      return best;
    };
    setIfCloser(findBestOnAdjacent(true), CardinalDirectionEnum.North);
    setIfCloser(findBestOnAdjacent(false), CardinalDirectionEnum.South);

    return map;
  }, [nearestImage, index, imageRecords]);

  return siblingsByCardinal;
}
