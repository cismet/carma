import { degToRadNumeric as degToRad, type Radians } from "@carma-units";
import { useEffect } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

import type { CardinalDirection } from "../../core/types";
import {
  findClosestCardinalIndex,
  getCardinalHeadings,
} from "../../core/utils/orientation";

/**
 * The sector the camera looks into, from its bearing against the four strip
 * headings. Reported on every turn, except while a flight is under way,
 * when the engine already knows where it is going.
 */
export const useActiveDirection = ({
  map,
  enabled,
  headingOffsetDeg,
  cardinalHeadings,
  busy,
  onChange,
}: {
  map: MaplibreMap | null;
  enabled: boolean;
  headingOffsetDeg: number;
  cardinalHeadings?: readonly Radians[];
  busy: boolean;
  onChange: (direction: CardinalDirection | null) => void;
}): void => {
  useEffect(() => {
    if (!map || !enabled) {
      onChange(null);
      return undefined;
    }
    const headings =
      cardinalHeadings ?? getCardinalHeadings(degToRad(headingOffsetDeg));
    const report = () => {
      if (busy) return;
      onChange(findClosestCardinalIndex(degToRad(map.getBearing()), headings));
    };
    report();
    map.on("rotate", report);
    map.on("moveend", report);
    return () => {
      map.off("rotate", report);
      map.off("moveend", report);
    };
  }, [map, enabled, headingOffsetDeg, cardinalHeadings, busy, onChange]);
};
