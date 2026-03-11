import { useMemo } from "react";

import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma/cesium";
import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  type AnnotationEntry,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

export const useCandidatePreviewAnnotation = (
  activeToolType: AnnotationToolType,
  activeCandidateNodeECEF: Cartesian3 | null
): AnnotationEntry | null =>
  useMemo<AnnotationEntry | null>(() => {
    const isPointCandidateMode = activeToolType === ANNOTATION_TYPE_POINT;
    const isDistanceCandidateMode = activeToolType === ANNOTATION_TYPE_DISTANCE;

    if (!isPointCandidateMode && !isDistanceCandidateMode) {
      return null;
    }
    if (!activeCandidateNodeECEF) {
      return null;
    }

    const previewPoint = getDegreesFromCartesian(activeCandidateNodeECEF);
    if (
      !Number.isFinite(previewPoint.latitude) ||
      !Number.isFinite(previewPoint.longitude)
    ) {
      return null;
    }

    const previewMeasurementType = isDistanceCandidateMode
      ? ANNOTATION_TYPE_DISTANCE
      : ANNOTATION_TYPE_POINT;

    return {
      id: "__candidate-measurement__",
      type: previewMeasurementType,
      timestamp: -1,
      isCandidate: true,
      geometryECEF: Cartesian3.clone(activeCandidateNodeECEF),
      geometryWGS84: {
        latitude: previewPoint.latitude,
        longitude: previewPoint.longitude,
        altitude: getEllipsoidalAltitudeOrZero(previewPoint.altitude),
      },
    };
  }, [activeCandidateNodeECEF, activeToolType]);
