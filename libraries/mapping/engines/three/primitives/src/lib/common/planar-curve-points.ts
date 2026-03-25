import { PI, TWO_PI } from "@carma/math";
import { Vector3 } from "three";

const WORLD_UP = new Vector3(0, 1, 0);
const WORLD_EAST = new Vector3(1, 0, 0);
const WORLD_FORWARD = new Vector3(0, 0, 1);

export const PLANAR_CURVE_AXES = {
  XZ: "xz",
  XY: "xy",
  YZ: "yz",
} as const;

export type PlanarCurveAxis =
  (typeof PLANAR_CURVE_AXES)[keyof typeof PLANAR_CURVE_AXES];

export type UpperSemicircleAxis =
  | typeof PLANAR_CURVE_AXES.XY
  | typeof PLANAR_CURVE_AXES.YZ;

const readPlanarCurveBasis = (
  axis: PlanarCurveAxis
): { tangentU: Vector3; tangentV: Vector3 } => {
  if (axis === PLANAR_CURVE_AXES.XZ) {
    return {
      tangentU: WORLD_FORWARD,
      tangentV: WORLD_EAST,
    };
  }

  if (axis === PLANAR_CURVE_AXES.XY) {
    return {
      tangentU: WORLD_EAST,
      tangentV: WORLD_UP,
    };
  }

  return {
    tangentU: WORLD_FORWARD,
    tangentV: WORLD_UP,
  };
};

export const buildPlanarArcPoints = ({
  center = new Vector3(0, 0, 0),
  tangentU,
  tangentV,
  radiusU,
  radiusV = radiusU,
  startAngle = 0,
  endAngle = TWO_PI,
  sampleCount,
  closeLoop = false,
}: {
  center?: Vector3;
  tangentU: Vector3;
  tangentV: Vector3;
  radiusU: number;
  radiusV?: number;
  startAngle?: number;
  endAngle?: number;
  sampleCount: number;
  closeLoop?: boolean;
}): Vector3[] => {
  const basisU = tangentU.clone().normalize();
  const basisV = tangentV.clone().normalize();

  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const sampleIndex = closeLoop && index === sampleCount ? 0 : index;
    const t = sampleIndex / sampleCount;
    const angle = startAngle + (endAngle - startAngle) * t;

    return center
      .clone()
      .add(basisU.clone().multiplyScalar(Math.cos(angle) * radiusU))
      .add(basisV.clone().multiplyScalar(Math.sin(angle) * radiusV));
  });
};

export const buildCirclePoints = ({
  radius,
  axis,
  offset = new Vector3(0, 0, 0),
  sampleCount,
  closeLoop = true,
}: {
  radius: number;
  axis: PlanarCurveAxis;
  offset?: Vector3;
  sampleCount: number;
  closeLoop?: boolean;
}): Vector3[] => {
  const { tangentU, tangentV } = readPlanarCurveBasis(axis);
  return buildPlanarArcPoints({
    center: offset,
    tangentU,
    tangentV,
    radiusU: radius,
    startAngle: 0,
    endAngle: TWO_PI,
    sampleCount,
    closeLoop,
  });
};

export const buildUpperSemicirclePoints = ({
  radius,
  axis,
  sampleCount,
}: {
  radius: number;
  axis: UpperSemicircleAxis;
  sampleCount: number;
}): Vector3[] => {
  const { tangentU, tangentV } = readPlanarCurveBasis(axis);
  return buildPlanarArcPoints({
    tangentU,
    tangentV,
    radiusU: radius,
    startAngle: 0,
    endAngle: PI,
    sampleCount,
  });
};
