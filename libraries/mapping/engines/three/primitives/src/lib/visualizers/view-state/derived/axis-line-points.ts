import { Vector3 } from "three";

export const buildAxisLinePoints = ({
  origin,
  direction,
  length,
}: {
  origin: Vector3;
  direction: Vector3;
  length: number;
}): [Vector3, Vector3] => [
  origin.clone(),
  origin.clone().add(direction.clone().normalize().multiplyScalar(length)),
];
