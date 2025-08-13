import { useEffect, useState } from "react";

import type {
  NearestObliqueImageRecord,
  ObliqueImageRecordMap,
} from "../types";
import type { CardinalDirectionEnum } from "../utils/orientationUtils";
import { computeSiblingsByCardinal } from "../utils/siblings";

/**
 * Tracks and caches known sibling IDs per visited image.
 * Computes siblings when nearest image changes and merges results into a map.
 */
export const useKnownSiblings = (
  imageRecords: ObliqueImageRecordMap | null,
  selectedImage: NearestObliqueImageRecord | null
) => {
  const [knownSiblingIds, setKnownSiblingIds] = useState<
    Record<string, Partial<Record<CardinalDirectionEnum, string>>>
  >({});

  useEffect(() => {
    if (!selectedImage || !imageRecords) return;
    const rec = selectedImage.record;
    const siblings = computeSiblingsByCardinal(rec, imageRecords);
    const idMap: Partial<Record<CardinalDirectionEnum, string>> = {};

    (Object.keys(siblings) as unknown as CardinalDirectionEnum[]).forEach(
      (dir) => {
        const sib = siblings[dir];
        if (sib) idMap[dir] = sib.id;
      }
    );

    setKnownSiblingIds((prev) => ({
      ...prev,
      [rec.id]: { ...(prev[rec.id] || {}), ...idMap },
    }));
  }, [selectedImage, imageRecords]);

  return knownSiblingIds;
};
