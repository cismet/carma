import { Vector3 } from "three";

import { clamp, isFiniteNumber } from "@carma-commons/math";
export type ViewStateVisualizerAltitudeStemGeometry = {
  stemSegments: [Vector3, Vector3][];
  overflowScaleBreakMarkers: [upper: Vector3[], lower: Vector3[]] | null;
};

export const readGroundDistance = ({
  altitudeMeters,
  rangeMeters,
  hemisphereRadius,
}: {
  altitudeMeters: number;
  rangeMeters: number;
  hemisphereRadius: number;
}): { groundDistance: number; overflow: boolean } => {
  if (!isFiniteNumber(altitudeMeters) || altitudeMeters <= 0) {
    return {
      groundDistance: 0,
      overflow: false,
    };
  }

  if (!isFiniteNumber(rangeMeters) || rangeMeters <= 0) {
    return {
      groundDistance: hemisphereRadius,
      overflow: true,
    };
  }

  const relativeAltitude = altitudeMeters / rangeMeters;
  return {
    groundDistance: clamp(relativeAltitude, 0, hemisphereRadius),
    overflow: relativeAltitude > hemisphereRadius,
  };
};

export const buildAltitudeStemGeometry = ({
  planeDiscY,
  overflow,
  showScaleBreak,
  overflowGapHalfHeight,
  scaleBreakHalfHeight,
  scaleBreakHalfWidth,
}: {
  planeDiscY: number;
  overflow: boolean;
  showScaleBreak: boolean;
  overflowGapHalfHeight: number;
  scaleBreakHalfHeight: number;
  scaleBreakHalfWidth: number;
}): ViewStateVisualizerAltitudeStemGeometry => {
  if (!overflow || !showScaleBreak) {
    return {
      stemSegments: [[new Vector3(0, planeDiscY, 0), new Vector3(0, 0, 0)]],
      overflowScaleBreakMarkers: null,
    };
  }

  const midpointY = planeDiscY * 0.5;
  const gapUpperY = midpointY + overflowGapHalfHeight;
  const gapLowerY = midpointY - overflowGapHalfHeight;
  const buildScaleBreakMarker = (centerY: number): Vector3[] => [
    new Vector3(0, centerY + scaleBreakHalfHeight * 1.5, 0),
    new Vector3(scaleBreakHalfWidth, centerY + scaleBreakHalfHeight * 0.5, 0),
    new Vector3(-scaleBreakHalfWidth, centerY - scaleBreakHalfHeight * 0.5, 0),
    new Vector3(0, centerY - scaleBreakHalfHeight * 1.5, 0),
  ];

  return {
    stemSegments: [
      [new Vector3(0, planeDiscY, 0), new Vector3(0, gapUpperY, 0)],
      [new Vector3(0, gapLowerY, 0), new Vector3(0, 0, 0)],
    ],
    overflowScaleBreakMarkers: [
      buildScaleBreakMarker(gapUpperY),
      buildScaleBreakMarker(gapLowerY),
    ],
  };
};
