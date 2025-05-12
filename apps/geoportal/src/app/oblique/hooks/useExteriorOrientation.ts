import { useState, useEffect, useRef } from "react";
import type {
  ExteriorOrientationRecord,
  NearestObliqueImageRecord,
} from "../types";
import { mapExtOriArrToRecord } from "../utils/obliqueImageRecord";
import { useOblique } from "./useOblique";
import {
  computeDerivedExteriorOrientation,
  DerivedExteriorOrientation,
} from "../utils/transformExteriorOrientation";
import { CAMERA_ID_TO_UP_VECTOR_MATRIX_MAPPING } from "../config";

export const useExteriorOrientation = (
  nearestImage: NearestObliqueImageRecord
) => {
  // Exterior orientation record

  const { exteriorOrientations, converter } = useOblique();

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

      const upMapping =
        CAMERA_ID_TO_UP_VECTOR_MATRIX_MAPPING[nearestImage.record.cameraId];

      derivedExteriorOrientationRef.current = computeDerivedExteriorOrientation(
        mappedRecord,
        converter,
        upMapping
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
