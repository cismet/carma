import { useState, useEffect, useRef } from "react";
import type {
  ExteriorOrientationRecord,
  NearestObliqueImageRecord,
} from "../types";
import { mapExtOriArrToRecord } from "../utils/obliqueImageRecord";
import { useObliqueDataContext } from "./useObliqueDataContext";
import {
  computeDerivedExteriorOrientation,
  DerivedExteriorOrientation,
} from "../utils/transformExteriorOrientation";

export const useExteriorOrientation = (
  nearestImage: NearestObliqueImageRecord
) => {
  // Exterior orientation record

  const { exteriorOrientations, converter } = useObliqueDataContext();

  const [extOriInputRecord, setExtOriInputRecord] =
    useState<ExteriorOrientationRecord | null>(null);

  const derivedExteriorOrientationRef =
    useRef<DerivedExteriorOrientation | null>(null);

  useEffect(() => {
    // Reset the orientation record if no image is selected or no orientations are available
    if (!nearestImage || !exteriorOrientations) {
      setExtOriInputRecord(null);
      return;
    }
    const id = nearestImage.record.id;
    // Check if we have exterior orientation data for this image
    if (id && exteriorOrientations && exteriorOrientations[id]) {
      const matchingExtOriData = exteriorOrientations[id];
      const mappedRecord = mapExtOriArrToRecord(id, matchingExtOriData);
      setExtOriInputRecord(mappedRecord);
      derivedExteriorOrientationRef.current = computeDerivedExteriorOrientation(
        mappedRecord,
        converter
      );
    } else {
      setExtOriInputRecord(null);
      derivedExteriorOrientationRef.current = null;
    }
  }, [nearestImage, exteriorOrientations, converter]);

  return {
    // Exterior orientation record
    exteriorOrientation: extOriInputRecord,
    // Camera vector states
    // Rotation angle state
    derivedExteriorOrientationRef,
  };
};

export default useExteriorOrientation;
