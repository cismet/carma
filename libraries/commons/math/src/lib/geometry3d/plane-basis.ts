import { Vector3 } from "three";
import { VECTOR3_NUMERIC_EPSILON } from "./constants";

export const createPlaneBasisFromNormal = (
  normal: Vector3,
  epsilon: number = VECTOR3_NUMERIC_EPSILON
): { xAxis: Vector3; yAxis: Vector3 } => {
  const up =
    normal.lengthSq() > epsilon
      ? normal.clone().normalize()
      : new Vector3(0, 0, 1);
  const reference =
    Math.abs(up.dot(new Vector3(0, 0, 1))) > 0.9
      ? new Vector3(1, 0, 0)
      : new Vector3(0, 0, 1);

  const xAxis = up.clone().cross(reference);
  if (xAxis.lengthSq() > epsilon) {
    xAxis.normalize();
  } else {
    xAxis.set(1, 0, 0);
  }

  const yAxis = xAxis.clone().cross(up);
  if (yAxis.lengthSq() > epsilon) {
    yAxis.normalize();
  } else {
    yAxis.set(0, 1, 0);
  }

  return { xAxis, yAxis };
};
