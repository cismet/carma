import { useMemo } from "react";
import { Math as CesiumMath } from "cesium";

import { useOblique } from "./useOblique";
import type { ObliqueImageRecord } from "../types";
import {
  CardinalDirectionEnum,
  getCardinalDirectionFromHeading,
} from "../utils/orientationUtils";

const MAX_CARTESIAN_DISTANCE_M = 350;

// Temporary debugging for line-jump issues
const DEBUG_SIBLINGS = true;
const dbg = (...args: unknown[]) => {
  if (!DEBUG_SIBLINGS) return;
  // eslint-disable-next-line no-console
  console.log("[Siblings]", ...args);
};

export function useSiblingsByCardinal(): Record<
  CardinalDirectionEnum,
  ObliqueImageRecord | null
> {
  const { nearestImage, imageRecords } = useOblique();

  // Cache sparse 2D index by line and waypoint for fast lookup; rebuild only when imageRecords changes
  const index = useMemo(() => {
    const byLine = new Map<number, Map<number, ObliqueImageRecord[]>>();
    const boundsByLine = new Map<
      number,
      { minWaypoint: number; maxWaypoint: number }
    >();
    if (!imageRecords || imageRecords.size === 0) {
      return { byLine, boundsByLine };
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
      const b = boundsByLine.get(rec.lineIndex);
      if (!b) {
        boundsByLine.set(rec.lineIndex, {
          minWaypoint: rec.waypointIndex,
          maxWaypoint: rec.waypointIndex,
        });
      } else {
        if (rec.waypointIndex < b.minWaypoint)
          b.minWaypoint = rec.waypointIndex;
        if (rec.waypointIndex > b.maxWaypoint)
          b.maxWaypoint = rec.waypointIndex;
      }
    });
    return { byLine, boundsByLine };
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

    if (DEBUG_SIBLINGS) {
      const lines = Array.from(index.byLine.keys()).sort((a, b) => a - b);
      const overview = lines.map((li) => {
        const inner = index.byLine.get(li)!;
        return {
          lineIndex: li,
          waypoints: Array.from(inner.keys()).sort((a, b) => a - b),
          count: Array.from(inner.values()).reduce(
            (acc, arr) => acc + arr.length,
            0
          ),
        };
      });
      dbg("current", {
        id: current.id,
        lineIndex: current.lineIndex,
        waypointIndex: current.waypointIndex,
        sector: current.sector,
        x: current.x,
        y: current.y,
      });
      dbg("byLine overview", overview);
      dbg("adjacent lines", {
        left: current.lineIndex - 1,
        right: current.lineIndex + 1,
        presentLeft: index.byLine.has(current.lineIndex - 1),
        presentRight: index.byLine.has(current.lineIndex + 1),
      });
    }

    const chooseCardinal = (dx: number, dy: number): CardinalDirectionEnum => {
      // Convert delta vector to heading where North=0 and clockwise positive.
      // In this project, +x points to West (see obliqueReferenceUtils),
      // so we invert dx to align East/West correctly.
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
        dbg("setIfCloser", {
          key,
          id: rec.id,
          lineIndex: rec.lineIndex,
          waypointIndex: rec.waypointIndex,
          dist,
        });
      }
    };

    // Forward/backward: search all waypoints on current line in the respective direction; pick minimum distance under threshold (sector filter required)
    const innerCurrent = index.byLine.get(current.lineIndex);
    if (innerCurrent) {
      // forward: waypointIndex > current
      let bestF: ObliqueImageRecord | null = null;
      let bestFD = Number.POSITIVE_INFINITY;
      innerCurrent.forEach((list, wpIdx) => {
        if (wpIdx <= current.waypointIndex) return;
        for (const rec of list) {
          if (rec.sector !== current.sector) continue;
          const dx = rec.x - current.x;
          const dy = rec.y - current.y;
          const dist = Math.hypot(dx, dy);
          if (dist > MAX_CARTESIAN_DISTANCE_M) continue;
          if (dist < bestFD) {
            bestF = rec;
            bestFD = dist;
          }
        }
      });
      setIfCloser(bestF);

      // backward: waypointIndex < current
      let bestB: ObliqueImageRecord | null = null;
      let bestBD = Number.POSITIVE_INFINITY;
      innerCurrent.forEach((list, wpIdx) => {
        if (wpIdx >= current.waypointIndex) return;
        for (const rec of list) {
          if (rec.sector !== current.sector) continue;
          const dx = rec.x - current.x;
          const dy = rec.y - current.y;
          const dist = Math.hypot(dx, dy);
          if (dist > MAX_CARTESIAN_DISTANCE_M) continue;
          if (dist < bestBD) {
            bestB = rec;
            bestBD = dist;
          }
        }
      });
      setIfCloser(bestB);
    }

    // Adjacent lines: dynamic filter over imageRecords for ADJACENT lines only (±1); sector filter; keep min under threshold; bucket to North/South only
    if (imageRecords && imageRecords.size > 0) {
      let scanned = 0;
      imageRecords.forEach((rec) => {
        if (rec.lineIndex === current.lineIndex) return;
        if (Math.abs(rec.lineIndex - current.lineIndex) !== 1) return;
        if (rec.sector !== current.sector) return;
        const dx = rec.x - current.x;
        const dy = rec.y - current.y;
        const dist = Math.hypot(dx, dy);
        if (dist > MAX_CARTESIAN_DISTANCE_M) return;
        // dy>=0 -> South, dy<0 -> North
        const forcedKey =
          dy >= 0 ? CardinalDirectionEnum.South : CardinalDirectionEnum.North;
        setIfCloser(rec, forcedKey);
        scanned++;
      });
      dbg("dynamic adjacent scan done", { scanned });
    }

    if (DEBUG_SIBLINGS) {
      const summarize = (c: CardinalDirectionEnum) => {
        const r = map[c];
        return r
          ? {
              id: r.id,
              lineIndex: r.lineIndex,
              waypointIndex: r.waypointIndex,
              dist: distByCardinal[c],
            }
          : null;
      };
      dbg("final", {
        East: summarize(CardinalDirectionEnum.East),
        West: summarize(CardinalDirectionEnum.West),
        North: summarize(CardinalDirectionEnum.North),
        South: summarize(CardinalDirectionEnum.South),
      });
    }

    return map;
  }, [nearestImage, index, imageRecords]);

  return siblingsByCardinal;
}
