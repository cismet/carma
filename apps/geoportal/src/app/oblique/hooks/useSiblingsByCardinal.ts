import { useMemo } from "react";

import { useOblique } from "./useOblique";
import type { ObliqueImageRecord } from "../types";
import { CardinalDirectionEnum } from "../utils/orientationUtils";
import { computeSiblingsByCardinal } from "../utils/siblings";

export function useSiblingsByCardinal(): Record<
  CardinalDirectionEnum,
  ObliqueImageRecord | null
> {
  const { nearestImage, imageRecords } = useOblique();

  const siblingsByCardinal = useMemo(() => {
    const current = nearestImage?.record;
    if (!current || !imageRecords || imageRecords.size === 0) {
      return {
        [CardinalDirectionEnum.North]: null,
        [CardinalDirectionEnum.East]: null,
        [CardinalDirectionEnum.South]: null,
        [CardinalDirectionEnum.West]: null,
      } as Record<CardinalDirectionEnum, ObliqueImageRecord | null>;
    }
    return computeSiblingsByCardinal(current, imageRecords);
  }, [nearestImage, imageRecords]);

  return siblingsByCardinal;
}
