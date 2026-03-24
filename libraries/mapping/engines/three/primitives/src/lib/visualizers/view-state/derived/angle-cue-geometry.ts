import { Vector3 } from "three";
import {
  buildCirclePoints,
  buildPlanarArcPoints,
  PLANAR_CURVE_AXES,
} from "../../../common/planar-curve-points";

const WORLD_UP = new Vector3(0, 1, 0);
const WORLD_EAST = new Vector3(1, 0, 0);
const WORLD_NORTH = new Vector3(0, 0, -1);

export const pointOnBearingCircle = ({
  bearing,
  radius,
  y = 0,
}: {
  bearing: number;
  radius: number;
  y?: number;
}): Vector3 =>
  new Vector3(Math.sin(bearing) * radius, y, -Math.cos(bearing) * radius);

export const buildHorizontalArcPoints = ({
  radius,
  startAngle,
  endAngle,
  y = 0,
  sampleCount,
}: {
  radius: number;
  startAngle: number;
  endAngle: number;
  y?: number;
  sampleCount: number;
}): Vector3[] =>
  buildPlanarArcPoints({
    center: new Vector3(0, y, 0),
    tangentU: WORLD_NORTH,
    tangentV: WORLD_EAST,
    radiusU: radius,
    startAngle,
    endAngle,
    sampleCount,
  });

export const buildPitchArcPoints = ({
  bearing,
  elevation,
  radius,
  sampleCount,
}: {
  bearing: number;
  elevation: number;
  radius: number;
  sampleCount: number;
}): Vector3[] => {
  const meridianStart = pointOnBearingCircle({
    bearing,
    radius: 1,
  });
  return buildPlanarArcPoints({
    tangentU: meridianStart,
    tangentV: WORLD_UP,
    radiusU: radius,
    startAngle: 0,
    endAngle: elevation,
    sampleCount,
  });
};

export const buildMaxPitchRingPoints = ({
  maxPitch,
  hemisphereRadius,
  sampleCount,
}: {
  maxPitch: number | null;
  hemisphereRadius: number;
  sampleCount: number;
}): Vector3[] | null =>
  maxPitch === null
    ? null
    : buildCirclePoints({
        radius: Math.sin(maxPitch) * hemisphereRadius,
        axis: PLANAR_CURVE_AXES.XZ,
        offset: new Vector3(0, Math.cos(maxPitch) * hemisphereRadius, 0),
        closeLoop: true,
        sampleCount,
      });

export { buildCirclePoints, PLANAR_CURVE_AXES };
