import { useMemo } from "react";

import { useOblique } from "./useOblique";
import type { ObliqueImageRecord } from "../types";
import { CardinalDirectionEnum } from "../utils/orientationUtils";
import { computeSiblingsByCardinal } from "../utils/siblings";

export function useSiblingsByCardinal(): Record<
  CardinalDirectionEnum,
  ObliqueImageRecord | null
> {
  const { selectedImage, imageRecords } = useOblique();

  const siblingsByCardinal = useMemo(() => {
    const current = selectedImage?.record;
    if (!current || !imageRecords || imageRecords.size === 0) {
      return {
        [CardinalDirectionEnum.North]: null,
        [CardinalDirectionEnum.East]: null,
        [CardinalDirectionEnum.South]: null,
        [CardinalDirectionEnum.West]: null,
      } as Record<CardinalDirectionEnum, ObliqueImageRecord | null>;
    }
    return computeSiblingsByCardinal(current, imageRecords);
  }, [selectedImage, imageRecords]);

  return siblingsByCardinal;
}
