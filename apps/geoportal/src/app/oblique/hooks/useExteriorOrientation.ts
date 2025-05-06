import { useState, useEffect, useRef } from "react";
import type {
  ExteriorOrientationRecord,
  NearestObliqueImageRecord,
} from "../types";
import { mapExtOriArrToRecord } from "../utils/obliqueImageRecord";
import { useObliqueDataContext } from "./useObliqueDataContext";
import {
  computeDerivedExteriorOrientation,
  DEFAULT_UTM_GRID_CONVERGENCE_ANGLE,
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

  // State for rotation angle
  const [convergenceRotationAngle, setConvergenceRotationAngle] =
    useState<number>(DEFAULT_UTM_GRID_CONVERGENCE_ANGLE);

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
    rotationAngle: convergenceRotationAngle,
    setRotationAngle: setConvergenceRotationAngle,
  };
};

export default useExteriorOrientation;
