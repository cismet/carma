import { Vector3 } from "three";

export const buildCrosshairLinePoints = ({
  center,
  horizontalDirection,
  verticalDirection,
  halfExtent,
}: {
  center: Vector3;
  horizontalDirection: Vector3;
  verticalDirection: Vector3;
  halfExtent: number;
}): {
  horizontal: [Vector3, Vector3];
  vertical: [Vector3, Vector3];
} => ({
  horizontal: [
    center
      .clone()
      .add(horizontalDirection.clone().normalize().multiplyScalar(-halfExtent)),
    center
      .clone()
      .add(horizontalDirection.clone().normalize().multiplyScalar(halfExtent)),
  ],
  vertical: [
    center
      .clone()
      .add(verticalDirection.clone().normalize().multiplyScalar(-halfExtent)),
    center
      .clone()
      .add(verticalDirection.clone().normalize().multiplyScalar(halfExtent)),
  ],
});
