import { useEffect, useRef } from "react";
import type { NearestObliqueImageRecord } from "../types";
import { useOblique } from "./useOblique";
import {
  computeDerivedExteriorOrientation,
  DerivedExteriorOrientation,
} from "../utils/transformExteriorOrientation";
import { CAMERA_ID_TO_UP_VECTOR_MATRIX_MAPPING } from "../config";

export const useExteriorOrientation = (
  nearestImage: NearestObliqueImageRecord
) => {
  // Computer Exterior orientation record on demand

  const { exteriorOrientations, converter } = useOblique();

  const derivedExteriorOrientationRef =
    useRef<DerivedExteriorOrientation | null>(null);

  useEffect(() => {
    // Reset the orientation record if no image is selected or no orientations are available
    if (!nearestImage) {
      derivedExteriorOrientationRef.current = null;
      return;
    }
    // Check if we have exterior orientation data for this image
    if (nearestImage.record.derivedExtOri === undefined) {
      const upMapping =
        CAMERA_ID_TO_UP_VECTOR_MATRIX_MAPPING[nearestImage.record.cameraId];

      const extOri = computeDerivedExteriorOrientation(
        nearestImage.record,
        converter,
        upMapping
      );
      nearestImage.record.derivedExtOri = extOri;

      // Set the derived exterior orientation
      derivedExteriorOrientationRef.current = extOri;
    }
    derivedExteriorOrientationRef.current = nearestImage.record.derivedExtOri;
  }, [nearestImage, exteriorOrientations, converter]);

  return {
    nearestImage,
    derivedExteriorOrientationRef,
  };
};

export default useExteriorOrientation;
